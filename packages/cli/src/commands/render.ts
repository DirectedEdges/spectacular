/**
 * Render Command
 *
 * Sends a spec to the local CLI bridge, which relays it to a connected
 * Spectacular Figma plugin to create or update the matching component live in
 * Figma. See `specs bridge` to start/stop the bridge.
 */

import type { ResolvedConventions, ResolvedSettings } from '@directededges/specs-schema';
import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { createInterface } from 'readline';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { postRender, getBridgeStatus, type RenderResponse } from '../bridge/client.js';
import { resolveFileKey } from '../bridge/pickConnection.js';
import { findComponentFolders, isComponentFolder, loadSpec } from '../render/SpecLoader.js';
import { startSpinner } from '../utilities/spinner.js';
import { refreshCache } from '../cache/cache.js';
import { reportCache } from '../cache/report.js';
import { figmaOf } from '../config/PlatformConventions.js';
import { loadDevStatusByNodeId, devStatusForSpec, type WritableDevStatus } from '../render/manifestDevStatus.js';
import { StepError } from '../pipeline/StepError.js';
import { ERROR_CODES } from '../utilities/errorCodes.js';
import { watchLoop } from '../utilities/watchLoop.js';

export const Render = new Command('render')
  .description('Render a spec into Figma via the local CLI bridge')
  .argument('[specPath]', 'Path to a spec YAML file, a component folder, or a directory of component folders (default: {spec.directory} from the workspace settings)')
  .option('--config <path>', 'Path to a config/ directory or legacy specs.config.yaml')
  .option('--file <fileKey>', 'Target a specific connected Figma file (prompts to choose if more than one is connected in an interactive terminal; required otherwise)')
  .option('--page <id>', 'Render onto this page id instead of the plugin\'s current page (recommended for scripted runs — immune to page drift)')
  .option('--overwrite', 'Delete any existing page component with the same title before rendering (without this, a title collision is an error)')
  .option('--watch', 'Watch the spec path and re-render on every change (implies --overwrite)')
  .option('--strict', 'Fail the render when an instance element cannot be resolved, instead of rendering a component with missing content')
  .option('--timing', 'Print a phase-by-phase timing report for the render (bridge manifests, then plugin render phases)')
  .option('--refresh-cache', 'Rebuild the render lookup caches from fetched data before rendering (see `specs cache`)')
  .action(async (specPath: string | undefined, options: { config?: string; file?: string; page?: string; overwrite?: boolean; watch?: boolean; strict?: boolean; timing?: boolean; refreshCache?: boolean; verbose?: boolean }) => {
    // Ahead of everything else: a stale cache is a hard failure on the bridge, and this
    // is the flag that fixes it without a separate command.
    if (options.refreshCache) {
      const config = new ConfigLoader().load(options.config);
      const dataDirectory = config.settings.data?.directory;
      if (!dataDirectory) {
        console.error('Error: --refresh-cache needs data.directory set in the workspace settings.');
        process.exit(ERROR_CODES.INVALID_ARGS);
      }
      reportCache(refreshCache({
        dataDir: dataDirectory,
        aliases: Object.keys(config.settings.data?.sources ?? {}),
        glyphs: figmaOf(config.conventions).glyphs,
      }));
    }
    if (options.watch) {
      if (!specPath) {
        console.error('Error: --watch requires a spec path.');
        process.exit(ERROR_CODES.INVALID_ARGS);
      }
      await watchAndRender(specPath, options);
      return;
    }

    // Zero-arg resolution: the configured spec directory, as a batch of
    // component folders.
    if (!specPath) {
      const configLoader = new ConfigLoader();
      const config = configLoader.load(options.config);

      const specDirectory = config.settings.spec.directory;
      if (specDirectory && fs.existsSync(path.resolve(specDirectory))) {
        specPath = path.resolve(specDirectory);
        console.log(`Using output directory: ${path.relative(process.cwd(), specPath) || '.'}`);
      } else {
        console.error('Error: provide a spec path.');
        console.error('Tip: no spec.directory to fall back to — set one in the workspace settings.');
        process.exit(ERROR_CODES.INVALID_ARGS);
      }
    }

    try {
      const absSpecPath = path.resolve(specPath);
      if (!fs.existsSync(absSpecPath)) {
        console.error(`Error: Spec path not found: ${absSpecPath}`);
        process.exit(ERROR_CODES.INVALID_ARGS);
      }

      // A spec records the conventions and settings it was produced under, and render
      // reverses that record — so the spec's own `metadata.conventions`/`metadata.settings`
      // govern. This is the fallback for a spec carrying none, such as a hand-authored one.
      // A workspace without a config file is fine: the spec is then the only source there is.
      //
      // The same load supplies the Dev Mode status index: `specs scan` recorded each
      // component's status in the workspace manifest, and render stamps it back onto
      // the node it writes. Indexed once for the whole run — a batch renders hundreds
      // of specs against the one manifest, which does not change mid-run.
      let workspaceConventions: ResolvedConventions | undefined;
      let workspaceSettings: ResolvedSettings | undefined;
      let devStatusByNodeId: Map<string, WritableDevStatus> | undefined;
      try {
        const workspace = new ConfigLoader().load(options.config);
        workspaceConventions = workspace.conventions;
        workspaceSettings = workspace.settings;
        devStatusByNodeId = loadDevStatusByNodeId(workspace);
      } catch {
        workspaceConventions = undefined;
        workspaceSettings = undefined;
        devStatusByNodeId = undefined;
      }

      const withConfig = { ...options, workspaceConventions, workspaceSettings, devStatusByNodeId };

      const isBatchDir = fs.statSync(absSpecPath).isDirectory() && !isComponentFolder(absSpecPath);
      if (isBatchDir) {
        await renderBatchDirectory(absSpecPath, withConfig);
      } else {
        await renderSpecPath(absSpecPath, withConfig);
      }
    } catch (e) {
      const err = e as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
      if (err.cause && err.cause.code === 'ECONNREFUSED') {
        console.error('Error: bridge is not running.');
        console.error('  Start it with: specs bridge start');
      } else {
        console.error(`Error: ${err.message}`);
      }
      process.exit(ERROR_CODES.GENERAL_ERROR);
    }
  });

/**
 * Which Figma file the chain's render step should target, or why it cannot.
 *
 * Three ways there is no answer, and none of them is a fault in the workspace:
 * the bridge is not running, it is running with nothing connected, or two or
 * more files are connected and nothing says which was meant. Each returns a
 * reason to report rather than an error to fail on.
 *
 * The ambiguous case is the one that must not reach `resolveFileKey`: in an
 * interactive terminal it prompts on stdin, so a watch loop would stop dead
 * waiting for a keystroke — and under `specs run` the prompt can arrive in the
 * middle of a pass, long after anyone is looking.
 */
export async function bridgeTarget(
  explicit: string | undefined,
  getStatus: typeof getBridgeStatus = getBridgeStatus,
): Promise<{ fileKey?: string } | { skip: string }> {
  if (explicit) return { fileKey: explicit };

  let status: Awaited<ReturnType<typeof getBridgeStatus>>;
  try {
    status = await getStatus();
  } catch {
    return { skip: 'the bridge is not running — start it with `specs bridge start`, then open the plugin' };
  }

  const connections = status.connections ?? [];
  if (connections.length === 0) {
    return { skip: 'no Figma file is connected — open the plugin in the file you want to render into' };
  }
  if (connections.length > 1) {
    const names = connections.map(c => `${c.fileName ?? c.fileKey} (${c.fileKey})`).join(', ');
    return {
      skip: `${connections.length} Figma files are connected, so it is not clear which to render into — ` +
        `pass --file <fileKey> to choose. Connected: ${names}`,
    };
  }

  return { fileKey: connections[0].fileKey };
}

/**
 * Render specs into the connected Figma file, without exiting the process.
 *
 * The chain's `render` step (ADR-101). Reuses the same two paths the command
 * body uses, so there is one implementation of what rendering means — the only
 * differences are that this never prompts and never exits.
 *
 * `overwrite` is the caller's to decide and is deliberately not defaulted here:
 * it deletes an existing same-titled page component before re-rendering, which
 * is right for a watch loop and wrong for a one-shot build.
 */
export async function runRender(options: {
  config?: string;
  /** Component folder keys to render. Empty or absent renders the whole specs directory. */
  components?: string[];
  file?: string;
  page?: string;
  overwrite?: boolean;
  strict?: boolean;
}): Promise<{ rendered: number; skipped?: string }> {
  // Before reading a single spec: rendering needs something on the other end,
  // and not having it is a fact about the environment rather than a fault in
  // the workspace. Reported and skipped, never thrown — see `bridgeTarget`.
  const target = await bridgeTarget(options.file);
  if ('skip' in target) return { rendered: 0, skipped: target.skip };

  const config = new ConfigLoader().load(options.config);
  const specDirectory = config.settings.spec.directory;
  if (!specDirectory) {
    throw new StepError(
      'no spec.directory in the workspace settings, so there is nothing to render',
      ERROR_CODES.INVALID_ARGS,
    );
  }
  const specsRoot = path.resolve(specDirectory);
  if (!fs.existsSync(specsRoot)) {
    throw new StepError(`specs directory not found: ${specsRoot}`, ERROR_CODES.INVALID_ARGS);
  }

  // A spec carries the conventions it was produced under and render reverses
  // that record; this is the fallback for one carrying none. Same load supplies
  // the Dev Mode status index, read once for the whole run.
  const withConfig = {
    ...options,
    // Resolved once, above, and passed down explicitly. `resolveFileKey` lets
    // an explicit key through untouched, which is what keeps the interactive
    // picker out of a chain: a `specs run` watch loop stopping on a readline
    // prompt looks like a hang, with nothing on screen saying why.
    file: target.fileKey,
    workspaceConventions: config.conventions,
    workspaceSettings: config.settings,
    devStatusByNodeId: loadDevStatusByNodeId(config),
  };

  const wanted = new Set(options.components ?? []);
  if (wanted.size > 0) {
    // Scoped: render exactly the named folders. Going through
    // `findComponentFolders` rather than joining paths keeps one definition of
    // what counts as a component folder.
    const folders = findComponentFolders(specsRoot).filter(folder => wanted.has(path.basename(folder)));
    const missing = [...wanted].filter(key => !folders.some(f => path.basename(f) === key));
    for (const key of missing) console.warn(`Warning: no spec folder named "${key}" — skipping`);

    // Every name missed. Reporting success here would mean a typo in a CI
    // invocation passes green having rendered nothing, which is the one outcome
    // a scoped run must not produce.
    if (folders.length === 0) {
      throw new StepError(
        `none of the named components exist in ${path.relative(process.cwd(), specsRoot) || '.'}: ${[...wanted].join(', ')}`,
        ERROR_CODES.INVALID_ARGS,
      );
    }

    for (const folder of folders) await renderSpecPath(folder, withConfig);
    return { rendered: folders.length };
  }

  const folders = findComponentFolders(specsRoot);
  if (folders.length === 0) {
    throw new StepError(`no component folders found in ${specsRoot}`, ERROR_CODES.INVALID_ARGS);
  }
  await renderBatchDirectory(specsRoot, withConfig, { watch: true }); // never prompts, never exits
  return { rendered: folders.length };
}

// Shared by the one-shot render path and each watch-triggered re-render.
// Throws on failure; caller decides whether that's fatal (one-shot) or just
// logged and retried on the next change (watch).
async function renderSpecPath(
  specPath: string,
  options: { file?: string; page?: string; overwrite?: boolean; strict?: boolean; timing?: boolean; workspaceConventions?: ResolvedConventions; workspaceSettings?: ResolvedSettings; devStatusByNodeId?: Map<string, WritableDevStatus> }
): Promise<number> {
  const { spec, resolvePath } = loadSpec(specPath);
  // The component, not the path it came from: the full path is noise on every line of a
  // batch, and the name is what identifies the render in progress. `resolvePath` is a
  // component folder or a spec file, so the extension comes off either way.
  const name = path.basename(resolvePath, path.extname(resolvePath));
  const fileKey = await resolveFileKey(options.file);

  // The spinner holds one line while Figma works, and is erased when it stops — the
  // outcome prints over it rather than under it, so a batch reads as one line per
  // component instead of two.
  const stopSpinner = startSpinner(`Rendering: ${name}`);
  const startedAt = Date.now();
  let result: RenderResponse;
  try {
    result = await postRender({ specPath: resolvePath, spec, fileKey, pageId: options.page, overwrite: options.overwrite, conventions: options.workspaceConventions, settings: options.workspaceSettings, devStatus: devStatusForSpec(spec, options.devStatusByNodeId) });
  } finally {
    stopSpinner();
  }
  const elapsed = Date.now() - startedAt;

  if (!result.success) {
    const msg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
    throw new Error(`Render failed: ${msg}`);
  }

  // Success is the whole contract — reading the produced component's spec is
  // an explicit second call (`specs generate --from-bridge`), not a side effect.
  // Render warnings are withheld for now. They are dominated by known, tracked defects
  // (see the sub-issues of #281) and by degradations a user cannot act on, so printing a
  // wall of them per render buries the outcome rather than informing it. The INCOMPLETE
  // count below still reports the one case that means content is actually missing.
  // `SPECS_RENDER_WARNINGS=1` prints them anyway. Withheld by default for the reason
  // above, but a render that silently did nothing is otherwise impossible to tell from one
  // that worked — so verifying a render-side fix needed an escape rather than a rebuild
  // with the constant flipped.
  const SHOW_RENDER_WARNINGS = process.env.SPECS_RENDER_WARNINGS === '1';
  if (SHOW_RENDER_WARNINGS) for (const w of result.warnings ?? []) console.warn(`  ⚠ ${w}`);

  // A render that could not place an instance produced a component missing
  // content, so "✓ Rendered" on its own overstates what happened. Say it plainly
  // — a per-warning line scrolls past in a batch, a count does not.
  const dropped = countDroppedInstances(result.warnings);
  if (dropped > 0) {
    console.warn(
      `  ⚠ INCOMPLETE: ${dropped} instance element(s) could not be resolved and were not rendered. ` +
      'The component exists in Figma but is missing content.'
    );
    if (options.strict) {
      throw new Error(
        `Render incomplete: ${dropped} instance element(s) not rendered (--strict). ` +
        'Drop --strict to accept an incomplete render.'
      );
    }
  }

  // Matches the shape fetch sets for per-item work: `✓ Verb: subject (detail)`.
  console.log(`✓ Rendered: ${name} (${(elapsed / 1000).toFixed(1)}s, nodeId: ${result.nodeId})`);
  if (options.timing) printTimingReport(result, elapsed);
  return dropped;
}

/**
 * Warnings that mean content is missing from the rendered component, as opposed to
 * cosmetic degradations (font fallbacks, skipped style keys) which leave it complete.
 * Matched on render's own message text — see `Elements.createChild`.
 */
/**
 * Attribute a render's wall-clock time to bridge phases (manifest builds, which
 * parse the fetched file data) and plugin render phases. Plugin phases that run
 * concurrently — one row per variant, say — sum above the render's own total;
 * the count column is what makes that readable.
 */
function printTimingReport(result: RenderResponse, elapsed: number): void {
  const row = (label: string, ms: number, count?: number): void => {
    const share = elapsed > 0 ? `${Math.round((ms / elapsed) * 100)}%`.padStart(4) : '   -';
    const times = count !== undefined && count > 1 ? `  ×${count}` : '';
    console.log(`    ${label.padEnd(24)} ${String(ms).padStart(6)}ms ${share}${times}`);
  };

  console.log('\n  Timing');
  const bridge = [...(result.bridgeTimings ?? [])].sort((a, b) => b.ms - a.ms);
  if (bridge.length > 0) {
    console.log('  Bridge:');
    for (const t of bridge) row(t.label, t.ms);
  }
  if (result.payloadKB !== undefined) {
    console.log(`    ${'payload'.padEnd(24)} ${String(result.payloadKB).padStart(6)}KB`);
  }
  const phases = [...(result.timings?.phases ?? [])].sort((a, b) => b.ms - a.ms);
  if (phases.length > 0) {
    console.log(`  Plugin (${result.timings?.total}ms total):`);
    for (const p of phases) row(p.label, p.ms, p.count);
  }
  console.log(`    ${'TOTAL'.padEnd(24)} ${String(elapsed).padStart(6)}ms`);
}

function countDroppedInstances(warnings?: string[]): number {
  // Matched on the message an unresolved *instance element* produces. `VariableResolver`
  // says "no manifest entry for" too, about a token — counting those reports missing
  // content where only a binding was lost, which reads as a far more broken render.
  return (warnings ?? []).filter((w) => w.includes('instance element') && w.includes('no manifest entry for')).length;
}

function confirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} [y/N]: `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

/**
 * Render every component folder found beneath a directory, sequentially and in
 * path order. One failure doesn't abort the run; the exit code reflects the total.
 */
async function renderBatchDirectory(
  absDir: string,
  options: { file?: string; page?: string; overwrite?: boolean; strict?: boolean; timing?: boolean; workspaceConventions?: ResolvedConventions; workspaceSettings?: ResolvedSettings; devStatusByNodeId?: Map<string, WritableDevStatus> },
  // In watch mode a batch is re-run on every change: don't re-confirm, and
  // don't exit the process on a failure the next save might fix.
  { watch = false }: { watch?: boolean } = {}
): Promise<void> {
  const folders = findComponentFolders(absDir);

  if (folders.length === 0) {
    const msg = `no component folders found in ${absDir}\nTip: a component folder holds api.(yaml|json) and variants.(yaml|json), at most two levels deep.`;
    if (watch) throw new Error(msg);
    console.error(`Error: ${msg}`);
    process.exit(ERROR_CODES.INVALID_ARGS);
  }

  console.log(`Found ${folders.length} component${folders.length === 1 ? '' : 's'} in ${path.relative(process.cwd(), absDir) || '.'}:`);
  for (const folder of folders) console.log(`  - ${path.relative(absDir, folder)}`);

  // --overwrite deletes each existing same-titled component before re-rendering,
  // so a multi-component sweep is worth confirming when someone is there to ask.
  if (!watch && options.overwrite && folders.length > 1 && process.stdin.isTTY && process.stdout.isTTY) {
    const ok = await confirm(`\nOverwrite ${folders.length} components in the connected Figma file?`);
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  // Resolve the target file once, so an ambiguous bridge doesn't prompt per component.
  const resolved = { ...options, file: (await resolveFileKey(options.file)) ?? options.file };

  let written = 0;
  const incomplete: string[] = [];
  const failures: string[] = [];

  for (const folder of folders) {
    try {
      const dropped = await renderSpecPath(folder, resolved);
      written++;
      if (dropped > 0) incomplete.push(`${path.relative(absDir, folder)} (${dropped})`);
    } catch (e) {
      const name = path.relative(absDir, folder);
      failures.push(name);
      console.error(`  ✗ ${name}: ${(e as Error).message}`);
    }
  }

  console.log(`\nDone: ${written} rendered in Figma, ${failures.length} failed.`);
  // Incomplete renders succeeded, so they are not failures — but a sweep that
  // silently produced components missing content is exactly what this reports.
  if (incomplete.length > 0) {
    console.warn(`⚠ ${incomplete.length} rendered with missing content: ${incomplete.join(', ')}`);
  }
  if (failures.length > 0 && !watch) process.exit(ERROR_CODES.GENERAL_ERROR);
}

// Shorter than the emitters' debounce because a render is one spec's round trip
// to Figma, not a re-emit of the whole catalogue — the save burst to coalesce is
// a single file's, and a longer wait is felt as lag in the Figma canvas.
const WATCH_DEBOUNCE_MS = 300;

async function watchAndRender(
  specPath: string,
  options: { config?: string; file?: string; workspaceConventions?: ResolvedConventions; workspaceSettings?: ResolvedSettings }
): Promise<void> {
  const absSpecPath = path.resolve(specPath);
  if (!fs.existsSync(absSpecPath)) {
    console.error(`Error: Spec path not found: ${absSpecPath}`);
    process.exit(ERROR_CODES.INVALID_ARGS);
  }
  const isDir = fs.statSync(absSpecPath).isDirectory();
  const watchTarget = isDir ? absSpecPath : path.dirname(absSpecPath);
  const isBatchDir = isDir && !isComponentFolder(absSpecPath);

  // Read once rather than per re-render: the manifest is curation output, not something
  // a spec edit changes, and a watcher that re-parsed it on every save would pay for it
  // on every keystroke.
  let devStatusByNodeId: Map<string, WritableDevStatus> | undefined;
  try {
    devStatusByNodeId = loadDevStatusByNodeId(new ConfigLoader().load(options.config));
  } catch {
    devStatusByNodeId = undefined;
  }
  const watchOptions = { ...options, devStatusByNodeId, overwrite: true };

  await watchLoop({
    targets: [watchTarget],
    debounceMs: WATCH_DEBOUNCE_MS,
    runOnStart: true,
    run: async () => {
      if (isBatchDir) {
        await renderBatchDirectory(absSpecPath, watchOptions, { watch: true });
      } else {
        await renderSpecPath(absSpecPath, watchOptions);
      }
    },
  });
}
