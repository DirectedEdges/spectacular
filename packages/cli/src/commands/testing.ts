// `specs testing` — the testing suites namespace; `visual` is the first
// (specs#588). Each stage is its own subcommand because each has a different
// cost: editing a tolerance and re-scoring must cost seconds (`diff`), not a
// browser run (`shoot`) or a rate-limited capture (`baseline`).
//
//   specs testing visual init        scaffold deps package (customer installs)
//   specs testing visual manifest    payload + specs + contracts → manifest.json
//   specs testing visual status      present / missing per shootable variant
//   specs testing visual baseline    capture Figma exports (overt, never implicit)
//   specs testing visual shoot       screenshot Storybook renders
//   specs testing visual diff        score pairs, write the report
//   specs testing visual report      regenerate report views from stored JSON
//   specs testing visual accept      promote renders → accepted/ (regression)
//   specs testing visual             shoot → diff (baseline capture NEVER implied)
//
// Every stage past the Figma baseline is per-platform and takes `--target`:
// one Storybook serves both platforms' stories, but their renders, diffs,
// accepted baselines and reports are separate. A missing `--target` means
// React, never both — a stage that quietly did both would overwrite one
// platform's results with the other's.
//
// Free and unobfuscated. Playwright, pixelmatch and pngjs are the customer's
// own install in testing/visual/ — the CLI ships no browser (ADR A).
import { Command } from 'commander';
import fs from 'fs-extra';
import { resolveVisual } from '../testing/visual/paths.js';
import { readJson } from '../testing/visual/paths.js';
import path from 'path';
import { ERROR_CODES } from '../utilities/errorCodes.js';
import { isTarget, reportNameFor, TARGETS, type DiffMode, type Target } from '../testing/visual/types.js';

interface SharedOptions {
  config?: string;
  components?: string[];
}

/**
 * Every stage below figma/ is per-platform, so a bad `--target` must stop the
 * run rather than resolve to a path nobody meant.
 */
function requireTarget(value: string): Target {
  if (!isTarget(value)) {
    console.error(`✗ Unknown --target "${value}" — expected ${TARGETS.join(' or ')}.`);
    process.exit(ERROR_CODES.INVALID_ARGS);
  }
  return value;
}

function fail(err: unknown): never {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(process.exitCode && process.exitCode !== 0 ? process.exitCode : ERROR_CODES.GENERAL_ERROR);
}

function requireManifest(vw: ReturnType<typeof resolveVisual>): void {
  if (!fs.existsSync(vw.manifestPath)) {
    console.error('✗ No manifest yet — run `specs testing visual manifest` first.');
    process.exit(ERROR_CODES.GENERAL_ERROR);
  }
}

const Visual = new Command('visual').description(
  'Visual testing over the emitted Storybook: Figma baselines (fidelity) or accepted renders (regression)',
);

Visual.command('init')
  .description('Scaffold testing/visual/ and print the one install you run — the CLI ships no browser')
  .option('--config <path>', 'Path to a config/ directory')
  .option('--force', 'Rewrite the scaffold files (never touches visual-ignore.yaml)', false)
  .action(async (options: SharedOptions & { force: boolean }) => {
    try {
      const { runInit } = await import('../testing/visual/init.js');
      runInit(resolveVisual(options.config), options);
    } catch (err) {
      fail(err);
    }
  });

Visual.command('manifest')
  .description('Build manifest.json: locate each spec in the fetched payloads, enumerate variants, precompute the story join')
  .option('--config <path>', 'Path to a config/ directory')
  .option('--components <keys...>', 'Only these spec folders (default: all, both kinds)')
  .option('--check', 'Dry run: report unmapped Figma props and write nothing', false)
  .action(async (options: SharedOptions & { check: boolean }) => {
    try {
      const { buildManifest } = await import('../testing/visual/manifest.js');
      const vw = resolveVisual(options.config);
      const { problems, totals } = buildManifest(vw, options);
      const line =
        `${totals.specs} specs, ${totals.variants} variants ` +
        `(${totals.shootable} shootable, ${totals.deferred} deferred` +
        (totals.unsupported ? `, ${totals.unsupported} unsupported` : '') +
        `)`;
      if (options.check) {
        console.log(`check: ${line}`);
        for (const p of problems) console.log(`  ! ${p}`);
        if (!problems.length) console.log('  no mapping problems');
      } else {
        console.log(`✓ manifest: ${line} → ${vw.manifestPath}`);
        if (problems.length) console.log(`  ${problems.length} problem(s) — rerun with --check for detail`);
      }
    } catch (err) {
      fail(err);
    }
  });

Visual.command('status')
  .description('Present / missing per shootable baseline — no staleness model; capture is overt')
  .option('--config <path>', 'Path to a config/ directory')
  .option('--components <keys...>', 'Only these spec folders')
  .option('--json', 'Machine-readable worklist', false)
  .action(async (options: SharedOptions & { json: boolean }) => {
    try {
      const { runStatus } = await import('../testing/visual/status.js');
      const vw = resolveVisual(options.config);
      requireManifest(vw);
      runStatus(vw, options);
    } catch (err) {
      fail(err);
    }
  });

Visual.command('baseline')
  .description('Capture Figma exports for shootable variants (REST images API). Never runs implicitly')
  .option('--config <path>', 'Path to a config/ directory')
  .option('--components <keys...>', 'Only these spec folders (default: everything missing)')
  .option('--force', 'Recapture the scope even where baselines exist', false)
  .action(async (options: SharedOptions & { force: boolean }) => {
    try {
      const { runBaseline } = await import('../testing/visual/baseline.js');
      const vw = resolveVisual(options.config);
      requireManifest(vw);
      await runBaseline(vw, options);
    } catch (err) {
      fail(err);
    }
  });

Visual.command('shoot')
  .description('Screenshot the Storybook render for every shootable variant (customer-installed Playwright)')
  .option('--config <path>', 'Path to a config/ directory')
  .option('--components <keys...>', 'Only these spec folders')
  .option('--workers <n>', 'Parallel pages (default 8)')
  .option('--port <port>', 'Storybook port (default: the scaffolded npm script\'s)')
  .option('--target <target>', 'react | webcomponents', 'react')
  .action(async (options: SharedOptions & { workers?: string; port?: string; target: string }) => {
    try {
      const { runShoot } = await import('../testing/visual/shoot.js');
      const vw = resolveVisual(options.config);
      requireManifest(vw);
      await runShoot(vw, {
        ...options,
        target: requireTarget(options.target),
        workers: options.workers ? Number(options.workers) : undefined,
        port: options.port ? Number(options.port) : undefined,
      });
    } catch (err) {
      fail(err);
    }
  });

Visual.command('diff')
  .description('Score baseline/render pairs and write the report. The only stage that reads visual-ignore.yaml')
  .option('--config <path>', 'Path to a config/ directory')
  .option('--components <keys...>', 'Only these spec folders (merges into the stored report)')
  .option('--against <baseline>', 'figma (fidelity, default) | accepted (regression)', 'figma')
  .option('--target <target>', 'react | webcomponents', 'react')
  .action(async (options: SharedOptions & { against: DiffMode; target: string }) => {
    try {
      const { runDiff } = await import('../testing/visual/diff.js');
      const vw = resolveVisual(options.config);
      requireManifest(vw);
      await runDiff(vw, { ...options, target: requireTarget(options.target) });
      process.exit(process.exitCode ?? ERROR_CODES.SUCCESS);
    } catch (err) {
      fail(err);
    }
  });

Visual.command('report')
  .description('Regenerate report views from the stored JSON — never re-scores')
  .option('--config <path>', 'Path to a config/ directory')
  .option('--format <format>', 'md (default) | json (print to stdout)', 'md')
  .action(async (options: { config?: string; format: string }) => {
    try {
      const { writeMarkdown } = await import('../testing/visual/diff.js');
      const vw = resolveVisual(options.config);
      // One report per mode and platform: fidelity (vs Figma) or regression
      // (vs accepted), for React or Web Components. Pre-split spellings are
      // still regenerated so an older workspace's report does not vanish.
      const names = [
        ...(['figma', 'accepted'] as DiffMode[]).flatMap((mode) =>
          TARGETS.map((t) => reportNameFor(mode, t)),
        ),
        'fidelity',
        'regression',
      ];
      const present = names
        .map((name) => ({ name, file: path.join(vw.reportDir, `${name}.json`) }))
        .filter(({ file }) => fs.existsSync(file));
      if (!present.length) {
        console.error('✗ No report yet — run `specs testing visual diff` first.');
        process.exit(ERROR_CODES.GENERAL_ERROR);
      }
      if (options.format === 'json') {
        console.log(
          JSON.stringify(
            Object.fromEntries(present.map(({ name, file }) => [name, readJson(file)])),
            null,
            2,
          ),
        );
      } else {
        for (const { name, file } of present) {
          console.log(`✓ ${name} → ${writeMarkdown(vw, readJson(file))}`);
        }
      }
    } catch (err) {
      fail(err);
    }
  });

Visual.command('accept')
  .description('Promote the current renders into accepted/ — the regression baseline. Explicit scope required')
  .option('--config <path>', 'Path to a config/ directory')
  .option('--components <keys...>', 'Promote only these spec folders')
  .option('--all', 'Promote every spec with renders', false)
  .option('--target <target>', 'react | webcomponents', 'react')
  .action(async (options: SharedOptions & { all: boolean; target: string }) => {
    try {
      const { runAccept } = await import('../testing/visual/accept.js');
      const vw = resolveVisual(options.config);
      requireManifest(vw);
      runAccept(vw, { ...options, target: requireTarget(options.target) });
      process.exit(process.exitCode ?? ERROR_CODES.SUCCESS);
    } catch (err) {
      fail(err);
    }
  });

// Bare `specs testing visual` = shoot → diff, via a hidden default
// subcommand — options must NOT live on the parent, where commander would
// claim `--components` away from every subcommand's own flags. Baseline
// capture is NEVER implied: it is slow, rate-limited, and spends API quota,
// so it only ever runs as `specs testing visual baseline`. Missing baselines
// surface in the diff as no-baseline rows and in `status`.
Visual.command('run', { isDefault: true, hidden: true })
  .option('--config <path>', 'Path to a config/ directory')
  .option('--components <keys...>', 'Only these spec folders')
  .option('--against <baseline>', 'figma (default) | accepted', 'figma')
  .option('--target <target>', 'react | webcomponents', 'react')
  .option('--port <port>', 'Storybook port (default: the scaffolded npm script\'s)')
  .action(async (options: SharedOptions & { against: DiffMode; target: string; port?: string }) => {
    try {
      const vw = resolveVisual(options.config);
      requireManifest(vw);
      const target = requireTarget(options.target);
      const port = options.port ? Number(options.port) : undefined;
      const { runShoot } = await import('../testing/visual/shoot.js');
      const shot = await runShoot(vw, { components: options.components, target, port });
      if (!shot) process.exit(ERROR_CODES.GENERAL_ERROR);
      const { runDiff } = await import('../testing/visual/diff.js');
      await runDiff(vw, { ...options, target });
      process.exit(process.exitCode ?? ERROR_CODES.SUCCESS);
    } catch (err) {
      fail(err);
    }
  });

export const Testing = new Command('testing')
  .description('Testing suites over the emitted output')
  .addCommand(Visual);
