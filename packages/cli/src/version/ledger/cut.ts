/**
 * Cut engine — classify the workspace's current specs against the last
 * versioned state (`versions/latest/specs/`), plan per-component and library
 * version movement, and commit the plan: ledger entries, a new
 * `versions/<libraryVersion>/` folder, and a refreshed `latest/`.
 *
 * Identity per the decision tree: title (folder) is primary; renames are always
 * explicit via versions/renames.yaml, never heuristic. An untracked title change
 * whose source.nodeId matches a vanished component is surfaced as a likely
 * rename needing confirmation — the cut fails so history is never written on
 * a guess.
 */

import * as fs from 'fs';
import { assembleAll, assembleCompositions, readRunMetadata, type Workspace } from '../assemble.js';
import { assetManifest, diffAssets, referencedStrings } from './assets.js';
import { diffComponent, diffRun } from '../diff/compare.js';
import { captureGit, gitAuthor } from './git.js';
import {
  latestFolder,
  latestLibraryVersion,
  latestVersionOf,
  readComponentLedger,
  readLibraryLedger,
  renameComponentLedger,
  writeComponentLedger,
  writeLibraryLedger,
  writeVersionFolder,
} from './store.js';
import { componentRename, loadRenames } from '../diff/renames.js';
import { applyBump, bumpOf, grade, maxBump, type RuleSet } from '../rules/grade.js';
import type { RenameRecord } from '../report/render.js';
import type {
  AssembledComponent,
  Bump,
  ComponentLedger,
  DiffEntry,
  LedgerGit,
  LedgerOverride,
  LedgerRun,
  RenameMap,
} from '../types.js';
import * as path from 'path';

export interface PlannedComponent {
  name: string;
  /** Folder name on the base side, when it differs (tracked rename). */
  oldName?: string;
  title: string;
  previousTitle?: string;
  presence: 'changed' | 'added' | 'removed' | 'renamed' | 'unchanged';
  entries: DiffEntry[];
  warnings: string[];
  from: string | null;
  to: string | null;
  changeType: 'initial' | 'major' | 'minor' | 'patch' | 'removed';
}

export interface CutPlan {
  initialized: boolean;
  libraryFrom: string | null;
  libraryVersion: string;
  libraryBump: Bump;
  components: PlannedComponent[];
  /**
   * Compositions that moved (ADR-096/097). They carry no version of their own: a
   * composition declares no contract, so there is nothing for a consumer to depend on
   * and nothing for a semver rule to grade. Any change to one is patch-class for the
   * library, and is listed here so the report shows what moved.
   */
  compositions: PlannedComposition[];
  assetEntries: DiffEntry[];
  runEntries: DiffEntry[];
  renames: RenameRecord[];
  warnings: string[];
  /** MAJOR-class defects that fail the run rather than merely bump. */
  fatal: string[];
  noChanges: boolean;
  run: LedgerRun;
  author: string;
  git: LedgerGit;
  assets: Record<string, string>;
  override: LedgerOverride | null;
}

/** A composition that moved. No `from`/`to` — compositions are not versioned. */
export interface PlannedComposition {
  name: string;
  title: string;
  presence: 'added' | 'removed' | 'changed';
  entries: DiffEntry[];
}

const nodeIdOf = (component: AssembledComponent | undefined): string | undefined => {
  const source = (component?.concerns.api?.metadata as Record<string, any> | undefined)?.source;
  return source?.nodeId !== undefined ? String(source.nodeId) : undefined;
};

export function planCut(
  workspace: Workspace,
  ruleSet: RuleSet,
  override: LedgerOverride | null = null,
): CutPlan {
  const renames = loadRenames(workspace.versionsDir);
  const current = assembleAll(workspace.specsDir);
  const runMeta = readRunMetadata(workspace.specsDir);
  const git = captureGit(workspace.root);
  const author = gitAuthor(workspace.root) ?? runMeta.author ?? 'unknown';
  const libraryLedger = readLibraryLedger(workspace.versionsDir);
  const assets = assetManifest(workspace.assetsDir);

  const plan: CutPlan = {
    initialized: libraryLedger === null,
    libraryFrom: null,
    libraryVersion: '0.1.0',
    libraryBump: 'none',
    components: [],
    compositions: [],
    assetEntries: [],
    runEntries: [],
    renames: [],
    warnings: [],
    fatal: [],
    noChanges: false,
    run: runMeta.run,
    author,
    git,
    assets,
    override,
  };

  // First cut on an unledgered workspace: everything starts at 0.1.0.
  if (libraryLedger === null) {
    for (const [name, component] of current) {
      plan.components.push({
        name, title: component.title, presence: 'added',
        entries: [], warnings: [], from: null, to: '0.1.0', changeType: 'initial',
      });
    }
    plan.libraryBump = 'none';
    return plan;
  }

  const previousLibrary = latestLibraryVersion(libraryLedger);
  plan.libraryFrom = previousLibrary?.version ?? null;

  const baseSpecsDir = path.join(latestFolder(workspace.versionsDir), 'specs');
  if (!fs.existsSync(baseSpecsDir)) {
    throw new Error(`versions/latest/specs is missing under ${workspace.versionsDir} — the versions/ store is incomplete`);
  }
  const base = assembleAll(baseSpecsDir);

  const baseNames = [...base.keys()];
  const currentNames = [...current.keys()];
  const removed = baseNames.filter(n => !current.has(n));
  const added = currentNames.filter(n => !base.has(n));

  // Tracked renames: explicit events only.
  const pairs: Array<{ oldName: string; newName: string; renamed: boolean }> = [];
  const claimedOld = new Set<string>();
  const claimedNew = new Set<string>();
  for (const oldName of removed) {
    const oldComponent = base.get(oldName)!;
    for (const newName of added) {
      if (claimedNew.has(newName)) continue;
      const newComponent = current.get(newName)!;
      const event = componentRename(
        renames,
        { name: oldName, title: oldComponent.title },
        { name: newName, title: newComponent.title },
      );
      if (event) {
        pairs.push({ oldName, newName, renamed: true });
        claimedOld.add(oldName);
        claimedNew.add(newName);
        plan.renames.push({
          from: oldComponent.title, to: newComponent.title,
          provenance: 'recorded', reason: event.reason,
        });
        break;
      }
    }
  }

  // Untracked title change with a matching nodeId: likely rename, needs
  // confirmation. Never auto-recorded — the cut fails so history is not
  // written on a guess; a --force-* override proceeds as removal + addition.
  for (const oldName of removed) {
    if (claimedOld.has(oldName)) continue;
    const oldId = nodeIdOf(base.get(oldName));
    if (oldId === undefined) continue;
    for (const newName of added) {
      if (claimedNew.has(newName)) continue;
      if (nodeIdOf(current.get(newName)) === oldId) {
        const message =
          `Likely rename: \`${base.get(oldName)!.title}\` → \`${current.get(newName)!.title}\` ` +
          `(matching source.nodeId ${oldId}), but versions/renames.yaml has no event for it. ` +
          `Record the rename and run cut again, or pass a --force-* override to record it as a removal plus an addition.`;
        if (override) plan.warnings.push(message);
        else plan.fatal.push(message);
        plan.renames.push({
          from: base.get(oldName)!.title, to: current.get(newName)!.title,
          provenance: 'inferred', confidence: 0.9,
        });
        break;
      }
    }
  }

  for (const name of baseNames.filter(n => current.has(n))) {
    pairs.push({ oldName: name, newName: name, renamed: false });
  }

  const diffOptions = { ruleSet, renames };

  for (const { oldName, newName, renamed } of pairs) {
    const baseComponent = base.get(oldName)!;
    const currentComponent = current.get(newName)!;
    const { entries, warnings } = diffComponent(baseComponent, currentComponent, diffOptions);
    const ledger = readComponentLedger(workspace.versionsDir, oldName);
    const from = ledger ? latestVersionOf(ledger)?.version ?? null : null;
    const bump = bumpOf(entries);
    const effectiveBump: Bump = bump !== 'none' && override ? override.class : bump;
    const to = from && effectiveBump !== 'none' ? applyBump(from, effectiveBump) : from;
    // Entries graded ignore (or unclassified) alone never move a version — the
    // component rides along unbumped, its entries still visible in the report.
    plan.components.push({
      name: newName,
      oldName: renamed ? oldName : undefined,
      title: currentComponent.title,
      previousTitle: renamed ? baseComponent.title : undefined,
      presence: effectiveBump === 'none' ? 'unchanged' : renamed ? 'renamed' : 'changed',
      entries, warnings, from, to,
      changeType: effectiveBump === 'none' ? 'patch' : effectiveBump,
    });
  }

  for (const name of removed) {
    if (claimedOld.has(name)) continue;
    const component = base.get(name)!;
    const ledger = readComponentLedger(workspace.versionsDir, name);
    const from = ledger ? latestVersionOf(ledger)?.version ?? null : null;
    const entry: DiffEntry = { path: '', concernFile: 'component', operation: 'removed', oldValue: component.title, impact: 'unclassified' };
    grade(ruleSet, entry);
    plan.components.push({
      name, title: component.title, presence: 'removed',
      entries: [entry], warnings: [], from, to: from, changeType: 'removed',
    });
  }

  for (const name of added) {
    if (claimedNew.has(name)) continue;
    const component = current.get(name)!;
    const entry: DiffEntry = { path: '', concernFile: 'component', operation: 'added', newValue: component.title, impact: 'unclassified' };
    grade(ruleSet, entry);
    plan.components.push({
      name, title: component.title, presence: 'added',
      entries: [entry], warnings: [], from: null, to: '0.1.0', changeType: 'initial',
    });
  }

  // Run facts: diffed once per run, from latest.metadata.yaml (ADR-089).
  plan.runEntries = diffRun(previousLibrary?.run ?? {}, runMeta.run, ruleSet);

  // Assets: previous state is versions/latest/assets — the only place kept.
  const previousAssets = previousLibrary?.assets
    ?? assetManifest(path.join(latestFolder(workspace.versionsDir), 'assets'));
  plan.assetEntries = diffAssets(previousAssets, assets, referencedStrings(current.values()), ruleSet);
  for (const entry of plan.assetEntries) {
    if (entry.operation === 'removed' && entry.flags?.includes('referenced')) {
      const message = `Asset removed while referenced: \`${entry.path}\` — a spec still references it.`;
      if (override) plan.warnings.push(`${message} Proceeding under --force-${override.class} "${override.reason}".`);
      else plan.fatal.push(message);
    }
  }

  // Compositions (ADR-096). Diffed with the same machinery, then every entry is set
  // to patch impact — not re-graded. A composition has no contract, so a rule that
  // says "a removed prop is breaking" has nothing to say about it, and leaving the
  // graded impact in place would show a BREAKING entry contributing a patch bump. One
  // impact, stated once, so the report and the roll-up cannot disagree.
  {
    const currentCompositions = assembleCompositions(workspace.specsDir);
    const baseCompositions = assembleCompositions(baseSpecsDir);

    const asPatch = (entries: DiffEntry[]): DiffEntry[] =>
      entries.map(entry => ({ ...entry, impact: 'patch' as const }));

    for (const [name, composition] of currentCompositions) {
      const previous = baseCompositions.get(name);
      if (!previous) {
        plan.compositions.push({
          name, title: composition.title, presence: 'added',
          entries: [{ path: '', concernFile: 'component', operation: 'added', newValue: composition.title, impact: 'patch' }],
        });
        continue;
      }
      const { entries, warnings } = diffComponent(previous, composition, diffOptions);
      plan.warnings.push(...warnings.map(w => `${composition.title}: ${w}`));
      if (entries.length === 0) continue;
      plan.compositions.push({
        name, title: composition.title, presence: 'changed', entries: asPatch(entries),
      });
    }

    for (const [name, composition] of baseCompositions) {
      if (currentCompositions.has(name)) continue;
      plan.compositions.push({
        name, title: composition.title, presence: 'removed',
        entries: [{ path: '', concernFile: 'component', operation: 'removed', oldValue: composition.title, impact: 'patch' }],
      });
    }
  }

  for (const component of plan.components) plan.warnings.push(...component.warnings.map(w => `${component.title}: ${w}`));

  const changed = plan.components.filter(c => c.presence !== 'unchanged' && c.entries.length > 0);
  const componentBumps: Bump[] = changed.map(c =>
    c.changeType === 'removed' ? 'major' : c.changeType === 'initial' ? 'minor' : (c.changeType as Bump));
  const compositionBump: Bump[] = plan.compositions.length > 0 ? ['patch'] : [];
  const computed = maxBump([
    ...componentBumps, ...compositionBump,
    bumpOf(plan.assetEntries), bumpOf(plan.runEntries),
  ]);
  plan.libraryBump = override && computed !== 'none' ? override.class : computed;

  if (plan.libraryBump === 'none') {
    plan.noChanges = true;
    plan.libraryVersion = plan.libraryFrom ?? '0.1.0';
    return plan;
  }
  plan.libraryVersion = applyBump(plan.libraryFrom ?? '0.1.0', plan.libraryBump);
  return plan;
}

/** Write the plan: ledger entries, the version folder, refreshed latest/. */
export function commitCut(
  workspace: Workspace,
  plan: CutPlan,
  rendered: { reportMd: string; changelogMd: string },
): void {
  const timestamp = new Date().toISOString();

  for (const component of plan.components) {
    if (!plan.initialized && component.presence === 'unchanged') continue;

    if (component.oldName && component.oldName !== component.name) {
      renameComponentLedger(workspace.versionsDir, component.oldName, component.name);
    }

    let ledger: ComponentLedger | null = readComponentLedger(workspace.versionsDir, component.name);
    if (!ledger) {
      ledger = { component: { title: component.title, createdAt: timestamp }, versions: [] };
    }
    ledger.component.title = component.title;
    ledger.versions.push({
      version: component.to ?? component.from ?? '0.1.0',
      libraryVersion: plan.libraryVersion,
      timestamp,
      author: plan.author,
      git: plan.git,
      run: plan.run,
      diff: component.entries,
      changeType: component.changeType,
      reason: reasonFor(component),
      override: component.entries.length > 0 ? plan.override : null,
    });
    writeComponentLedger(workspace.versionsDir, component.name, ledger);
  }

  const libraryLedger = readLibraryLedger(workspace.versionsDir)
    ?? { library: { createdAt: timestamp }, versions: [] };
  const rollup: Record<string, { from: string | null; to: string | null; changeType: string }> = {};
  for (const component of plan.components) {
    if (!plan.initialized && component.presence === 'unchanged') continue;
    rollup[component.name] = { from: component.from, to: component.to, changeType: component.changeType };
  }
  libraryLedger.versions.push({
    version: plan.libraryVersion,
    timestamp,
    author: plan.author,
    git: plan.git,
    run: plan.run,
    components: rollup,
    assets: plan.assets,
    assetDiff: plan.assetEntries,
    runDiff: plan.runEntries,
    changeType: plan.initialized ? 'initial' : (plan.libraryBump === 'none' ? 'patch' : plan.libraryBump),
    reason: plan.initialized
      ? 'Initial version baseline'
      : `${Object.keys(rollup).length} component(s) changed`,
    override: plan.override,
  });
  writeLibraryLedger(workspace.versionsDir, libraryLedger);

  writeVersionFolder({
    versionsDir: workspace.versionsDir,
    libraryVersion: plan.libraryVersion,
    specsDir: workspace.specsDir,
    assetsDir: workspace.assetsDir,
    reportMd: rendered.reportMd,
    changelogMd: rendered.changelogMd,
  });
}

function reasonFor(component: PlannedComponent): string {
  if (component.presence === 'added') return component.changeType === 'initial' && component.from === null
    ? (component.entries.length === 0 ? 'Initial version baseline' : 'New component')
    : 'New component';
  if (component.presence === 'removed') return 'Component removed from the library';
  if (component.presence === 'renamed') return `Renamed from ${component.previousTitle}`;
  const majors = component.entries.filter(e => e.impact === 'major').length;
  const minors = component.entries.filter(e => e.impact === 'minor').length;
  const patches = component.entries.filter(e => e.impact === 'patch').length;
  const parts: string[] = [];
  if (majors) parts.push(`${majors} breaking`);
  if (minors) parts.push(`${minors} additive`);
  if (patches) parts.push(`${patches} patch`);
  return parts.length ? `${parts.join(', ')} change(s)` : 'No classified changes';
}

