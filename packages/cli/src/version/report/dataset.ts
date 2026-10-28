/**
 * Change-dataset builders — one dataset shape (report.ts), three sources:
 * two spec trees (pre-merge), a bump plan (release-time report), and the
 * ledgers (pre-release report + changelog over time).
 */

import * as fs from 'fs';
import * as path from 'path';
import { assembleAll, resolveWorkspace, slugify } from '../assemble.js';
import type { CutPlan } from '../ledger/cut.js';
import { diffComponent } from '../diff/compare.js';
import {
  ledgeredComponents,
  readComponentLedger,
  readLibraryLedger,
} from '../ledger/store.js';
import { componentRename, emptyRenameMap, loadRenames } from '../diff/renames.js';
import { grade, type RuleSet } from '../rules/grade.js';
import type { ChangeDataset, ChangelogRelease, ComponentChange, RenameRecord } from './render.js';
import type { AssembledComponent, DiffEntry, RenameMap } from '../types.js';

const today = () => new Date().toISOString().slice(0, 10);

/** A scan-manifest row: the component exists in Figma; `checked` says whether it qualifies to be written out. */
export interface ManifestRow {
  title: string;
  checked: boolean;
  devStatus: string;
}

/**
 * The scan manifest, keyed by spec folder name (ported from the specs-testing
 * premerge tooling). A component the manifest lists but leaves unchecked
 * exists in Figma and is deliberately not written out as a spec — most often
 * because its dev status is not Ready for dev.
 */
export function loadManifest(filePath: string | undefined): Map<string, ManifestRow> | null {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const rows = new Map<string, ManifestRow>();
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    if (!/^\|\s*\[[x ]\]/.test(line)) continue;
    const cells = line.split('|').map(c => c.trim());
    const [, checkbox, title, , , devStatus] = cells;
    if (!title) continue;
    rows.set(slugify(title), { title, checked: checkbox === '[x]', devStatus: devStatus || 'NONE' });
  }
  return rows;
}

const nodeIdOf = (component: AssembledComponent | undefined): string | undefined => {
  const source = (component?.concerns.api?.metadata as Record<string, any> | undefined)?.source;
  return source?.nodeId !== undefined ? String(source.nodeId) : undefined;
};

function presenceEntry(
  ruleSet: RuleSet,
  operation: 'added' | 'removed',
  title: string,
  extras: Partial<DiffEntry> = {},
): DiffEntry {
  const entry: DiffEntry = {
    path: '', concernFile: 'component', operation, impact: 'unclassified',
    ...(operation === 'added' ? { newValue: title } : { oldValue: title }),
    ...extras,
  };
  return grade(ruleSet, entry);
}

// ---------------------------------------------------------------- premerge

export interface PremergeOptions {
  baseDir: string;
  currentDir: string;
  ruleSet: RuleSet;
  rulesLabel: string;
  targetLabel?: string;
  sourceLabel?: string;
  /** Scan manifests; with them, a component that vanished because its dev status changed is told apart from one that was deleted. */
  baseManifest?: string;
  currentManifest?: string;
  /** Explicit rename map; defaults to the current tree's workspace renames.yaml when resolvable. */
  renames?: RenameMap;
  /** Extra rows for the closing provenance table. */
  provenance?: Array<[string, string]>;
  /** Who ran it — `settings.author` from the workspace config. */
  author?: string;
}

/**
 * Pre-merge: two spec trees supplied as paths, diffed directly — no ledger.
 * Rename mappings come from the current tree's workspace (versions/renames.yaml
 * beside its specs/, when that layout exists). Untracked pairs with matching
 * source.nodeId are reported as inferred renames but still graded remove+add:
 * renames are explicit, never heuristic.
 */
export function buildPremergeDataset(options: PremergeOptions): ChangeDataset {
  const { baseDir, currentDir, ruleSet } = options;
  let renames: RenameMap = options.renames ?? emptyRenameMap();
  if (!options.renames) {
    try {
      const workspace = resolveWorkspace(currentDir);
      renames = loadRenames(workspace.versionsDir);
    } catch {
      // A bare spec tree with no workspace around it: no recorded renames.
    }
  }
  const baseManifest = loadManifest(options.baseManifest);
  const currentManifest = loadManifest(options.currentManifest);

  const base = assembleAll(baseDir);
  const current = assembleAll(currentDir);
  const renameRecords: RenameRecord[] = [];
  const components: ComponentChange[] = [];

  const removed = [...base.keys()].filter(n => !current.has(n));
  const added = [...current.keys()].filter(n => !base.has(n));
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
      if (!event) continue;
      claimedOld.add(oldName);
      claimedNew.add(newName);
      renameRecords.push({ from: oldComponent.title, to: newComponent.title, provenance: 'recorded', reason: event.reason });
      const { entries, warnings } = diffComponent(oldComponent, newComponent, { ruleSet, renames });
      const renameEntry: DiffEntry = grade(ruleSet, {
        path: '', concernFile: 'component', operation: 'renamed',
        oldValue: oldComponent.title, newValue: newComponent.title, impact: 'unclassified',
      });
      components.push({
        name: newName, title: newComponent.title, previousTitle: oldComponent.title,
        presence: 'renamed',
        entries: [renameEntry, ...entries.filter(e => !(e.path === 'title' && e.concernFile === 'api.yaml'))],
        warnings,
      });
      break;
    }
  }

  for (const name of [...base.keys()].filter(n => current.has(n))) {
    const { entries, warnings } = diffComponent(base.get(name)!, current.get(name)!, { ruleSet, renames });
    components.push({
      name, title: current.get(name)!.title,
      presence: entries.length === 0 ? 'unchanged' : 'changed',
      entries, warnings,
    });
  }

  for (const name of removed) {
    if (claimedOld.has(name)) continue;
    const component = base.get(name)!;
    const warnings: string[] = [];
    const oldId = nodeIdOf(component);
    if (oldId !== undefined) {
      const match = added.find(n => !claimedNew.has(n) && nodeIdOf(current.get(n)) === oldId);
      if (match) {
        warnings.push(
          `Likely rename of \`${component.title}\` → \`${current.get(match)!.title}\` (matching source.nodeId ${oldId}); ` +
          `not recorded in versions/renames.yaml, so it is graded as a removal plus an addition. Confirm and record the event.`,
        );
        renameRecords.push({ from: component.title, to: current.get(match)!.title, provenance: 'inferred', confidence: 0.9 });
      }
    }
    // Listed in the current side's manifest but not selected: the component is
    // still in Figma, it just no longer qualifies to be written out.
    const row = currentManifest?.get(name);
    const unpublished = row !== undefined && !row.checked;
    components.push({
      name, title: component.title, presence: 'removed',
      entries: [presenceEntry(ruleSet, 'removed', component.title, unpublished
        ? { flags: ['unpublished'], newValue: `dev status ${row!.devStatus}` }
        : {})],
      warnings,
    });
  }

  for (const name of added) {
    if (claimedNew.has(name)) continue;
    const component = current.get(name)!;
    const row = baseManifest?.get(name);
    const published = row !== undefined && !row.checked;
    components.push({
      name, title: component.title, presence: 'added',
      entries: [presenceEntry(ruleSet, 'added', component.title, published ? { flags: ['published'] } : {})],
      warnings: [],
    });
  }

  components.sort((a, b) => a.title.localeCompare(b.title));

  return {
    title: 'Premerge Diff Report',
    date: today(),
    ...(options.author ? { author: options.author } : {}),
    target: { label: options.targetLabel ?? path.basename(path.resolve(baseDir)) },
    source: { label: options.sourceLabel ?? path.basename(path.resolve(currentDir)) },
    components,
    // Premerge compares two spec trees for contract impact. A composition has no
    // contract, so there is nothing here for this report to weigh.
    compositions: [],
    assetEntries: [],
    runEntries: [],
    renames: renameRecords,
    provenance: [
      ...(options.provenance ?? []),
      ['Specs compared', `main \`${path.resolve(baseDir)}\`, branch \`${path.resolve(currentDir)}\``],
      ['Components', `${base.size} on main, ${current.size} on the branch, same curation rules on both sides`],
      ['Concern files', 'every concern file per component (`api.yaml`, `variants.yaml`, examples concerns)'],
      ['Severity rules', options.rulesLabel],
    ],
  };
}

// ---------------------------------------------------------------- cut-time

/** The release report/changelog dataset for a just-planned cut. */
export function buildCutDataset(plan: CutPlan, rulesLabel: string): ChangeDataset {
  const components: ComponentChange[] = plan.components
    .map(c => ({
      name: c.name,
      title: c.title,
      previousTitle: c.previousTitle,
      presence: c.presence,
      entries: c.entries,
      warnings: c.warnings,
      from: c.from,
      to: c.to,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    title: plan.initialized
      ? `Release ${plan.libraryVersion} — initial version baseline`
      : `Release Report — ${plan.libraryVersion}`,
    date: today(),
    target: { label: plan.libraryFrom ? `v${plan.libraryFrom}` : 'unversioned' },
    source: { label: `v${plan.libraryVersion}` },
    components,
    compositions: plan.compositions.map(c => ({
      name: c.name, title: c.title, presence: c.presence, entries: c.entries,
    })),
    assetEntries: plan.assetEntries,
    runEntries: plan.runEntries,
    renames: plan.renames,
    provenance: [
      ['Basis', plan.initialized
        ? 'First cut on an unledgered workspace: every component initialized at 0.1.0; nothing was diffed'
        : 'Workspace `specs/` diffed against `versions/latest/specs/` (the last versioned state)'],
      ['Run facts', `generator ${plan.run.generatorVersion ?? 'unknown'}, schema ${plan.run.schemaVersion ?? 'unknown'} (from latest.metadata.yaml, ADR-089)`],
      ['Git', `${plan.git.branch ?? 'no branch'} @ ${plan.git.commit?.slice(0, 12) ?? 'no commit'}`],
      ['Severity rules', rulesLabel],
      ['Change data', '`versions/ledgers/` — per-component and library ledgers'],
    ],
  };
}

export function buildCutChangelog(plan: CutPlan): ChangelogRelease[] {
  return [{
    libraryVersion: plan.libraryVersion,
    components: plan.components
      .filter(c => c.entries.length > 0 || plan.initialized)
      .map(c => ({
        name: c.name, title: c.title, previousTitle: c.previousTitle, presence: c.presence,
        entries: c.entries, warnings: c.warnings, from: c.from, to: c.to,
      })),
    compositions: plan.compositions.map(c => ({
      name: c.name, title: c.title, presence: c.presence, entries: c.entries,
    })),
    assetEntries: plan.assetEntries,
    runEntries: plan.runEntries,
  }];
}

// ---------------------------------------------------------------- from ledgers

export interface LedgerReportOptions {
  versionsDir: string;
  ruleSet: RuleSet;
  rulesLabel: string;
  /** Report changes in library versions strictly after this one. Default: since the previous library version. */
  since?: string;
}

export interface LedgerReport {
  dataset: ChangeDataset;
  releases: ChangelogRelease[];
  since: string | null;
  latest: string | null;
}

/**
 * Pre-release: ledger diffs accumulated since a library version, as one dataset
 * (the glance layer) plus per-release groupings (the itemized changelog layer).
 */
export function buildLedgerReport(options: LedgerReportOptions): LedgerReport {
  const library = readLibraryLedger(options.versionsDir);
  if (!library || library.versions.length === 0) {
    throw new Error('No library ledger — run `specs version cut` first.');
  }
  const versions = library.versions;
  const latest = versions[versions.length - 1].version;
  const since = options.since
    ?? (versions.length > 1 ? versions[versions.length - 2].version : null);

  const included = versions.filter(v => since === null || afterVersion(v.version, since));
  if (included.length === 0) {
    throw new Error(`No library versions after ${since}.`);
  }
  const includedSet = new Set(included.map(v => v.version));

  const releases: ChangelogRelease[] = included.map(release => ({
    libraryVersion: release.version,
    components: [],
    // Rebuilt from ledgers, and compositions are not ledgered — they have no
    // version to record an entry against. The cut's own report and changelog are
    // where a composition's movement is written down.
    compositions: [],
    assetEntries: release.assetDiff ?? [],
    runEntries: release.runDiff ?? [],
  }));
  const releaseByVersion = new Map(releases.map(r => [r.libraryVersion, r]));

  const cumulative = new Map<string, ComponentChange>();
  for (const name of ledgeredComponents(options.versionsDir)) {
    const ledger = readComponentLedger(options.versionsDir, name);
    if (!ledger) continue;
    for (const entry of ledger.versions) {
      if (!includedSet.has(entry.libraryVersion)) continue;
      const release = releaseByVersion.get(entry.libraryVersion)!;
      release.components.push({
        name,
        title: ledger.component.title,
        presence: entry.changeType === 'removed' ? 'removed' : entry.changeType === 'initial' ? 'added' : 'changed',
        entries: entry.diff,
        warnings: [],
        from: previousVersionInLedger(ledger.versions, entry.version),
        to: entry.version,
      });

      const existing = cumulative.get(name);
      if (existing) {
        existing.entries = [...existing.entries, ...entry.diff];
        existing.to = entry.version;
      } else {
        cumulative.set(name, {
          name,
          title: ledger.component.title,
          presence: entry.changeType === 'removed' ? 'removed' : entry.changeType === 'initial' ? 'added' : 'changed',
          entries: [...entry.diff],
          warnings: [],
          from: previousVersionInLedger(ledger.versions, entry.version),
          to: entry.version,
        });
      }
    }
  }

  const assetEntries = included.flatMap(v => v.assetDiff ?? []);
  const runEntries = included.flatMap(v => v.runDiff ?? []);

  const dataset: ChangeDataset = {
    title: `Release Report — ${latest}`,
    date: today(),
    target: { label: since ? `v${since}` : 'unversioned' },
    source: { label: `v${latest}` },
    components: [...cumulative.values()].sort((a, b) => a.title.localeCompare(b.title)),
    compositions: [],
    assetEntries,
    runEntries,
    renames: [],
    provenance: [
      ['Basis', `Version ledger diffs accumulated over ${included.length} release(s): ${included.map(v => v.version).join(', ')}`],
      ['Ledgers', '`versions/ledgers/` — per-component and library ledgers'],
      ['Severity rules', options.rulesLabel],
    ],
  };

  return { dataset, releases: releases.reverse(), since, latest };
}

function previousVersionInLedger(
  versions: Array<{ version: string }>,
  version: string,
): string | null {
  const index = versions.findIndex(v => v.version === version);
  return index > 0 ? versions[index - 1].version : null;
}

function afterVersion(a: string, b: string): boolean {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}
