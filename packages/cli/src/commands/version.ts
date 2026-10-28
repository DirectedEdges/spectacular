/**
 * Version Command
 *
 * `specs version …` — spec-workspace versioning: automated semantic versioning
 * of the generated spec payload, with append-only ledgers, version folders
 * under `<workspace>/versions/`, and fully scripted reports and changelogs.
 * Free tier — no license gating.
 *
 * Subcommands: diff · history · cut · tag · restore · figmapremerge · report.
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { assemble, resolveWorkspace, slugify, type Workspace } from '../version/assemble.js';
import { commitCut, planCut } from '../version/ledger/cut.js';
import {
  buildCutChangelog,
  buildCutDataset,
  buildLedgerReport,
  buildPremergeDataset,
} from '../version/report/dataset.js';
import { diffComponent } from '../version/diff/compare.js';
import { createAnnotatedTag, tagExists } from '../version/ledger/git.js';
import {
  ledgeredComponents,
  readComponentLedger,
  readLibraryLedger,
  specPathAtVersion,
  tagMessageFor,
} from '../version/ledger/store.js';
import { loadRenames } from '../version/diff/renames.js';
import {
  cleanupRun,
  formatBytes,
  pastRuns,
  removePastRuns,
  runFigmaPremerge,
  workspaceRelativePath,
  type PremergeSteps,
} from '../version/figmaPremerge.js';
import { execFile } from 'child_process';
import { formatElapsed, isInteractive, startSpinner } from '../utilities/spinner.js';
import { chooseOption } from '../version/chooseOption.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { loadRules, type RuleSet } from '../version/rules/grade.js';
import { gradeOf, renderChangelog, renderReport } from '../version/report/render.js';
import type { ComponentLedger, LedgerOverride } from '../version/types.js';
import { ERROR_CODES } from '../utilities/errorCodes.js';

const fail = (message: string, code: number = ERROR_CODES.GENERAL_ERROR): never => {
  console.error(`Error: ${message}`);
  process.exit(code);
  throw new Error(message); // unreachable; satisfies control flow
};

const normalizeVersion = (v: string): string => v.replace(/^v/, '');

function workspaceOf(options: { workspace?: string }): Workspace {
  try {
    return resolveWorkspace(options.workspace ?? process.cwd());
  } catch (e) {
    return fail((e as Error).message, ERROR_CODES.INVALID_ARGS);
  }
}

function rulesOf(options: { rules?: string }): { ruleSet: RuleSet; label: string } {
  const ruleSet = loadRules(options.rules);
  return { ruleSet, label: options.rules ? `\`${path.resolve(options.rules)}\`` : 'built-in (compiled from semver-rules.md)' };
}

/** Resolve a component argument (folder name, title, or slug) to its ledger. */
function findLedger(versionsDir: string, componentArg: string): { name: string; ledger: ComponentLedger } {
  const direct = readComponentLedger(versionsDir, componentArg);
  if (direct) return { name: componentArg, ledger: direct };
  for (const name of ledgeredComponents(versionsDir)) {
    const ledger = readComponentLedger(versionsDir, name)!;
    if (ledger.component.title === componentArg || slugify(componentArg) === name) return { name, ledger };
  }
  return fail(
    `No ledger for component "${componentArg}" under ${versionsDir} — ` +
    `known: ${ledgeredComponents(versionsDir).join(', ') || 'none (run specs version cut first)'}`,
    ERROR_CODES.INVALID_ARGS,
  );
}

function overrideOf(options: { forceMajor?: string; forceMinor?: string; forcePatch?: string }): LedgerOverride | null {
  const given = [
    options.forceMajor && { class: 'major' as const, reason: options.forceMajor },
    options.forceMinor && { class: 'minor' as const, reason: options.forceMinor },
    options.forcePatch && { class: 'patch' as const, reason: options.forcePatch },
  ].filter(Boolean) as LedgerOverride[];
  if (given.length > 1) fail('Pass at most one of --force-major / --force-minor / --force-patch.', ERROR_CODES.INVALID_ARGS);
  return given[0] ?? null;
}

// ---------------------------------------------------------------- diff

const Diff = new Command('diff')
  .description('Jump comparison: what changed for a component between two versions')
  .argument('<component>', 'Component (spec folder name or title)')
  .requiredOption('--from <version>', 'Base component version (from the ledger)')
  .option('--to <version>', 'Target component version; defaults to the current working spec', 'current')
  .option('--workspace <dir>', 'Workspace directory (contains specs/ and versions/)')
  .option('--rules <path>', 'Override the built-in severity rules with an external YAML file')
  .action((componentArg: string, options: { from: string; to: string; workspace?: string; rules?: string }) => {
    try {
      const workspace = workspaceOf(options);
      const { ruleSet, label } = rulesOf(options);
      const { name, ledger } = findLedger(workspace.versionsDir, componentArg);
      const renames = loadRenames(workspace.versionsDir);

      const from = normalizeVersion(options.from);
      const base = specPathAtVersion(workspace.versionsDir, ledger, name, from);
      const baseComponent = assemble(path.dirname(base.dir), name);

      let currentComponent;
      let toLabel: string;
      if (options.to === 'current') {
        if (!fs.existsSync(path.join(workspace.specsDir, name))) {
          fail(`Component ${name} is not in the current specs/ tree; pass --to <version> instead.`, ERROR_CODES.INVALID_ARGS);
        }
        currentComponent = assemble(workspace.specsDir, name);
        toLabel = 'current';
      } else {
        const to = normalizeVersion(options.to);
        const target = specPathAtVersion(workspace.versionsDir, ledger, name, to);
        currentComponent = assemble(path.dirname(target.dir), name);
        toLabel = `v${to}`;
      }

      const { entries, warnings } = diffComponent(baseComponent, currentComponent, { ruleSet, renames });
      const dataset = {
        title: `Diff — ${ledger.component.title} v${from} → ${toLabel}`,
        date: new Date().toISOString().slice(0, 10),
        target: { label: `${name} v${from}` },
        source: { label: `${name} ${toLabel}` },
        components: [{
          name, title: currentComponent.title, presence: 'changed' as const, entries, warnings,
        }],
        // One component's own diff; a composition is never its subject.
        compositions: [],
        assetEntries: [],
        runEntries: [],
        renames: [],
        provenance: [
          ['Base', `\`versions/${base.entry.libraryVersion}/specs/${name}\` (component v${from})`],
          ['Target', toLabel === 'current' ? '`specs/` (the live working tree)' : `the versions/ folder for component ${toLabel}`],
          ['Severity rules', label],
        ] as Array<[string, string]>,
      };
      console.log(renderReport(dataset));
    } catch (e) {
      fail((e as Error).message);
    }
  });

// ---------------------------------------------------------------- history

const History = new Command('history')
  .description('Layered replay listing: every ledgered version of a component')
  .argument('<component>', 'Component (spec folder name or title)')
  .argument('[range]', 'Version range, e.g. 1.0.0..2.0.0 (inclusive)')
  .option('--workspace <dir>', 'Workspace directory (contains specs/ and versions/)')
  .action((componentArg: string, range: string | undefined, options: { workspace?: string }) => {
    try {
      const workspace = workspaceOf(options);
      const { ledger } = findLedger(workspace.versionsDir, componentArg);

      let from: string | undefined;
      let to: string | undefined;
      if (range) {
        const match = range.match(/^(.+?)\.\.(.+)$/);
        if (!match) fail(`Range must look like 1.0.0..2.0.0 (got "${range}")`, ERROR_CODES.INVALID_ARGS);
        from = normalizeVersion(match![1]);
        to = normalizeVersion(match![2]);
      }

      const rows = ledger.versions.filter(v =>
        (!from || compare(v.version, from) >= 0) && (!to || compare(v.version, to) <= 0));
      if (rows.length === 0) fail(`No versions${range ? ` in ${range}` : ''} for ${ledger.component.title}.`, ERROR_CODES.INVALID_ARGS);

      console.log(`${ledger.component.title} — ${rows.length} version(s)\n`);
      console.log('| Version | Library | Date | Change | Reason |');
      console.log('|---|---|---|---|---|');
      for (const v of rows) {
        const overrideNote = v.override ? ` (override: ${v.override.class} — ${v.override.reason})` : '';
        console.log(`| ${v.version} | ${v.libraryVersion} | ${v.timestamp.slice(0, 10)} | ${v.changeType} | ${v.reason}${overrideNote} |`);
      }
    } catch (e) {
      fail((e as Error).message);
    }
  });

const compare = (a: string, b: string): number => {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

// ---------------------------------------------------------------- cut

const Cut = new Command('cut')
  .description('Cut the next version: classify the workspace diff since the last one, write ledger entries and a new version folder')
  .option('--force-major <reason>', 'Override the computed class to MAJOR (reason required, recorded in the ledger)')
  .option('--force-minor <reason>', 'Override the computed class to MINOR (reason required, recorded in the ledger)')
  .option('--force-patch <reason>', 'Override the computed class to PATCH (reason required, recorded in the ledger)')
  .option('--workspace <dir>', 'Workspace directory (contains specs/ and versions/)')
  .option('--rules <path>', 'Override the built-in severity rules with an external YAML file')
  .action((options: {
    forceMajor?: string; forceMinor?: string; forcePatch?: string;
    workspace?: string; rules?: string;
  }) => {
    try {
      const workspace = workspaceOf(options);
      const { ruleSet, label } = rulesOf(options);
      const override = overrideOf(options);

      const plan = planCut(workspace, ruleSet, override);

      if (plan.fatal.length > 0) {
        for (const message of plan.fatal) console.error(`✗ ${message}`);
        console.error('The cut was not written. Restore the asset or remove the reference; a --force-* override (with reason) records the defect and proceeds.');
        process.exit(ERROR_CODES.GENERAL_ERROR);
      }

      for (const warning of plan.warnings) console.warn(`Warning: ${warning}`);

      if (!plan.initialized && plan.noChanges) {
        console.log(`No changes since v${plan.libraryFrom}. Nothing to cut.`);
        return;
      }

      const dataset = buildCutDataset(plan, label);
      const reportMd = renderReport(dataset);
      const changelogMd = renderChangelog(buildCutChangelog(plan));
      commitCut(workspace, plan, { reportMd, changelogMd });

      if (plan.initialized) {
        console.log(`✓ Initialized: ${plan.components.length} components at 0.1.0, library at 0.1.0.`);
      } else {
        const moved = plan.components.filter(c => c.presence !== 'unchanged');
        console.log(`✓ Library ${plan.libraryFrom} → ${plan.libraryVersion} (${plan.libraryBump}${override ? `, forced: ${override.reason}` : ''})`);
        for (const c of moved) {
          console.log(`  ${c.title}: ${c.from ?? 'new'} → ${c.to} (${c.changeType})`);
        }
        // Compositions carry no version, so they are named and their movement stated
        // rather than shown as a version transition (ADR-096).
        for (const c of plan.compositions) {
          console.log(`  ${c.title}: ${c.presence} (composition — patch)`);
        }
      }
      console.log(`  versions/${plan.libraryVersion}/ written (report.md, changelog.md, specs/); latest/ refreshed.`);
      console.log(`  Tag it when ready: specs version tag ${plan.libraryVersion}`);
    } catch (e) {
      fail((e as Error).message);
    }
  });

// ---------------------------------------------------------------- tag

const Tag = new Command('tag')
  .description('Create the annotated library git tag v<version> from ledger-recorded data (never pushed)')
  .argument('[version]', 'Library version to tag; defaults to the newest ledgered version')
  .option('--workspace <dir>', 'Workspace directory (contains specs/ and versions/)')
  .action((versionArg: string | undefined, options: { workspace?: string }) => {
    try {
      const workspace = workspaceOf(options);
      const library = readLibraryLedger(workspace.versionsDir);
      if (!library || library.versions.length === 0) {
        fail('No library ledger — run `specs version cut` first.', ERROR_CODES.INVALID_ARGS);
      }
      const version = versionArg
        ? normalizeVersion(versionArg)
        : library!.versions[library!.versions.length - 1].version;
      const entry = library!.versions.find(v => v.version === version);
      if (!entry) {
        fail(
          `Library version ${version} is not in the ledger ` +
          `(has: ${library!.versions.map(v => v.version).join(', ')}).`,
          ERROR_CODES.INVALID_ARGS,
        );
      }
      if (tagExists(workspace.root, version)) {
        fail(`Tag v${version} already exists.`, ERROR_CODES.INVALID_ARGS);
      }
      createAnnotatedTag(workspace.root, version, tagMessageFor(workspace.versionsDir, entry!));
      console.log(`✓ Tagged v${version} (annotated, not pushed).`);
    } catch (e) {
      fail((e as Error).message);
    }
  });

// ---------------------------------------------------------------- restore

const Restore = new Command('restore')
  .description('Reconstruct a component spec at a version — to stdout or --out, never over the live spec')
  .argument('<component>', 'Component (spec folder name or title)')
  .argument('<version>', 'Component version to restore (from the ledger)')
  .option('--out <path>', 'Directory to write the concern files into')
  .option('--workspace <dir>', 'Workspace directory (contains specs/ and versions/)')
  .action((componentArg: string, versionArg: string, options: { out?: string; workspace?: string }) => {
    try {
      const workspace = workspaceOf(options);
      const { name, ledger } = findLedger(workspace.versionsDir, componentArg);
      const version = normalizeVersion(versionArg);
      const { dir, entry } = specPathAtVersion(workspace.versionsDir, ledger, name, version);

      const files = fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).sort();
      if (options.out) {
        const out = path.resolve(options.out);
        const live = path.resolve(workspace.specsDir, name);
        if (out === live || out.startsWith(`${live}${path.sep}`)) {
          fail('Refusing to overwrite the live spec in place — pass a different --out directory.', ERROR_CODES.INVALID_ARGS);
        }
        fs.mkdirSync(out, { recursive: true });
        for (const file of files) fs.copyFileSync(path.join(dir, file), path.join(out, file));
        console.log(`✓ ${ledger.component.title} v${version} (from library v${entry.libraryVersion}) → ${out} (${files.join(', ')})`);
      } else {
        for (const file of files) {
          console.log(`# --- ${file} (${name} v${version}, library v${entry.libraryVersion}) ---`);
          console.log(fs.readFileSync(path.join(dir, file), 'utf8'));
        }
      }
    } catch (e) {
      fail((e as Error).message);
    }
  });

// ---------------------------------------------------------------- figmapremerge

/**
 * Real pipeline steps: the CLI invokes itself (dist/specs.js) per step, from
 * the workspace root so `.env` (FIGMA_TOKEN) and `config/` resolve the way
 * every other command resolves them. Icons are deliberately not fetched: the
 * diff never reads them and they land in the workspace's own spec directory.
 */
function cliSteps(workspaceRoot: string): PremergeSteps {
  const configDir = path.join(workspaceRoot, 'config');
  const invoke = (args: string[]): Promise<void> => new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [process.argv[1], ...args],
      { cwd: workspaceRoot, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) return resolve();
        const output = [stdout, stderr].filter(Boolean).join('\n');
        reject(new Error(output || error.message));
      },
    );
  });
  return {
    fetch: (_side, sourceArg, dataDir) =>
      invoke(['fetch', '--config', configDir, '--data-dir', dataDir, '--source', sourceArg, '--only', 'file,variables']),
    scan: (_side, filePath, manifestPath) =>
      invoke(['scan', filePath, '--config', configDir, '-o', manifestPath]),
    generate: (_side, manifestPath, specsDir, variablesPath, stylesPath) =>
      invoke(['generate', manifestPath, '--config', configDir, '-o', specsDir, '-v', variablesPath, '-s', stylesPath]),
  };
}

/**
 * The in-flight state for one phase, in the fetch style: a spinner holding one
 * line in a TTY, a single "⏳ …" line otherwise; either way the caller prints
 * the ✓ outcome line when the phase resolves.
 */
function phaseSpinner(text: string): () => string {
  if (isInteractive()) return startSpinner(`${text}…`);
  console.log(`⏳ ${text}…`);
  const start = Date.now();
  return () => formatElapsed(Date.now() - start);
}

const FigmaPremerge = new Command('figmapremerge')
  .description('Pre-merge report for a Figma branch: fetch both sides, generate both spec trees, diff, and report (target ← branch)')
  .argument('<url>', 'Figma branch URL (…/design/<mainKey>/branch/<branchKey>/…)')
  .option('--workspace <dir>', 'Workspace directory (contains config/ and versions/)')
  .option('--keep-data', 'Keep everything in the run folder: main/, all of branch/, and the fetched payloads (default: only the report and the impacted components\' specs survive)')
  .option('--rules <path>', 'Override the built-in severity rules with an external YAML file')
  .action(async (url: string, options: { workspace?: string; keepData?: boolean; rules?: string }) => {
    try {
      const workspace = workspaceOf(options);
      const config = path.join(workspace.root, 'config');
      if (!fs.existsSync(config)) {
        fail(`No config/ directory under ${workspace.root} — figmapremerge fetches and generates, so it needs the workspace config.`, ERROR_CODES.INVALID_ARGS);
      }
      const { ruleSet, label } = rulesOf(options);

      // Past runs accumulate, and several similarly-named folders make it easy
      // to send a lead last week's report. Keeping is first because it is the
      // answer that cannot lose anything — and the only one a non-interactive
      // run can be given.
      const past = pastRuns(path.join(workspace.versionsDir, 'diffs'));
      if (past.folders.length > 0 && isInteractive()) {
        console.log('↑↓ to choose, enter to confirm');
        const choice = await chooseOption([
          'Keep past diffs',
          `Remove past diffs (${past.folders.length}, ${formatBytes(past.bytes)})`,
        ]);
        if (choice === -1) fail('Cancelled.', ERROR_CODES.INVALID_ARGS);
        if (choice === 1) {
          removePastRuns(past.folders);
          console.log(`✓ Removed ${past.folders.length} past run${past.folders.length === 1 ? '' : 's'}`);
        }
        console.log('');
      }

      const run = await runFigmaPremerge({
        url,
        workspaceRoot: workspace.root,
        versionsDir: workspace.versionsDir,
        steps: cliSteps(workspace.root),
        log: line => console.log(line),
        spinner: phaseSpinner,
      });

      const dataset = buildPremergeDataset({
        baseDir: run.baseSpecsDir,
        currentDir: run.currentSpecsDir,
        ruleSet,
        rulesLabel: label,
        targetLabel: run.targetLabel,
        sourceLabel: run.sourceLabel,
        baseManifest: run.baseManifest,
        currentManifest: run.currentManifest,
        renames: loadRenames(workspace.versionsDir),
        author: new ConfigLoader().load(config).settings.author,
        provenance: [
          ['Branch', `\`${run.branchKey}\` — ${run.branchName}`],
          ['Main', `\`${run.mainKey}\`${run.targetLabel !== 'main' ? ` — ${run.targetLabel}` : ''}`],
        ],
      });
      const report = renderReport(dataset);
      const reportPath = path.join(run.runDir, 'report.md');
      fs.writeFileSync(reportPath, report);
      fs.writeFileSync(
        path.join(run.runDir, 'diff.json'),
        `${JSON.stringify({ components: dataset.components, renames: dataset.renames }, null, 2)}\n`,
      );

      // The same predicate the report's Impact table uses: a component whose
      // only entries are ignored did not change as far as a reader is concerned.
      const impacted = dataset.components
        .filter(c => c.presence !== 'removed' && c.entries.some(e => gradeOf(e) !== 'ignored'))
        .map(c => c.name);
      cleanupRun(run.runDir, impacted, options.keepData ?? false);
      if (!options.keepData) {
        console.log('✓ Remove temporary files from diff folder');
      }

      console.log(`✓ Wrote report: ${workspaceRelativePath(workspace.root, reportPath)}`);
    } catch (e) {
      fail((e as Error).message);
    }
  });

// ---------------------------------------------------------------- report

const Report = new Command('report')
  .description('Pre-release report and itemized changelog from ledger diffs since the last release')
  .option('--since <version>', 'Report library versions strictly after this one (default: the previous library version)')
  .option('--out <dir>', 'Write report.md and changelog.md into a directory instead of stdout')
  .option('--workspace <dir>', 'Workspace directory (contains specs/ and versions/)')
  .option('--rules <path>', 'Override the built-in severity rules with an external YAML file')
  .action((options: { since?: string; out?: string; workspace?: string; rules?: string }) => {
    try {
      const workspace = workspaceOf(options);
      const { label } = rulesOf(options);
      const { dataset, releases } = buildLedgerReport({
        versionsDir: workspace.versionsDir,
        ruleSet: loadRules(options.rules),
        rulesLabel: label,
        since: options.since ? normalizeVersion(options.since) : undefined,
      });
      const report = renderReport(dataset);
      const changelog = renderChangelog(releases);
      if (options.out) {
        const out = path.resolve(options.out);
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(path.join(out, 'report.md'), report);
        fs.writeFileSync(path.join(out, 'changelog.md'), changelog);
        console.log(`✓ wrote ${path.join(out, 'report.md')} and ${path.join(out, 'changelog.md')}`);
      } else {
        console.log(report);
        console.log('\n---\n');
        console.log(changelog);
      }
    } catch (e) {
      fail((e as Error).message);
    }
  });

// ---------------------------------------------------------------- root

export const Version = new Command('version')
  .description('Spec workspace versioning: diffs, version cuts, tags, ledgers, reports, changelogs')
  .addCommand(Diff)
  .addCommand(History)
  .addCommand(Cut)
  .addCommand(Tag)
  .addCommand(Restore)
  .addCommand(FigmaPremerge)
  .addCommand(Report);
