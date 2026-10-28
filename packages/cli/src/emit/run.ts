// Walking a workspace's components and running a set of transformers over each.
//
// Shared by `specs react` and `specs webcomponents`, so the two cannot drift
// on how components are discovered, how `--components` narrows them, how a
// failure is reported, or when `finalize` runs.
//
// What differs between the callers is only *which* transformers run and what the
// run is called in its output — which is the whole of the difference between them.
import fs from 'fs-extra';
import { reportExternalWrites } from '../transforms/externalWrites.js';
import path from 'path';
import yaml from 'yaml';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { toPascalCase } from '../transforms/naming.js';
import type { Transformer, TransformerContext } from '../transforms/transformer.js';
import type { ProcessingStates } from '../transforms/states.js';
import { platformOf } from '../config/PlatformConventions.js';
import {
  resolveSpecsLayout, legacyLayoutNotice, dirNameFor, SPEC_KINDS, type SpecKind,
} from '../utilities/specsLayout.js';
import { resolveKindScope, describeKindScope, KindScopeConflict } from '../utilities/kindScope.js';
import { ERROR_CODES } from '../utilities/errorCodes.js';
import { watchLoop } from '../utilities/watchLoop.js';
import { pruneOrphans } from './prune.js';

// Editors commonly write a file two or three times per save, and a config edit
// re-emits the whole catalogue — so a short debounce turns one Cmd-S into
// overlapping full emits. Long enough to coalesce a save burst, short enough to
// stay imperceptible between saving a spec and seeing the story update.
const WATCH_DEBOUNCE_MS = 800;

export interface EmitOptions {
  output?: string;
  config?: string;
  components?: string[];
  verbose?: boolean;
  watch?: boolean;
}

export interface EmitRun {
  /** What this run is called in its own output — `react`, `transform`. */
  label: string;
  /**
   * The transformers to run, or a function given the loaded config that returns
   * them. `transform` resolves its list from arguments and config; the target
   * commands know theirs.
   */
  transformers: Transformer[] | ((config: ReturnType<ConfigLoader['load']>) => Transformer[]);
  /** Per-transformer options, keyed by name. Only `transform` has any. */
  transformerOptions?: Map<string, Record<string, unknown>>;
  /**
   * Whether this run is entitled to Pro output, which decides whether
   * compositions are emitted at all (ADR-097).
   *
   * Supplied by the caller rather than resolved here, so the answer comes from the
   * emitter package's own already-bound entitlement: resolving it here would mean a
   * second license call and a dev-tier warning labelled for the wrong transform.
   * Absent means unentitled, which is the safe direction — a run that cannot say it
   * is Pro is not.
   */
  proEntitled?: () => Promise<boolean>;
}

export interface EmitResult {
  /** The resolved specs directory this run read from. */
  specsPath: string;
  /** The `config/` directory this run read conventions from, if there was one. */
  configPath: string | null;
  succeeded: number;
  failed: number;
}

/**
 * A condition that stops the run before any component is emitted — a missing
 * specs directory, an empty transformer list. Carries the exit code the one-shot
 * path exits with; the watch path reports it and waits for the next change.
 */
class EmitSetupError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly tip?: string,
  ) {
    super(message);
  }
}

/**
 * Run a set of transformers over every component in a workspace, once.
 *
 * Does not exit: a per-component failure is counted, and a condition that stops
 * the run before emitting throws `EmitSetupError`. Config and component discovery
 * are resolved here rather than by the caller, so a watch-triggered re-run picks
 * up a component directory added since the last one.
 */
export async function emitOnce(run: EmitRun, options: EmitOptions): Promise<EmitResult> {
  const configLoader = new ConfigLoader();
  const config = configLoader.load(options.config);

  // Resolve the specs directory: flag → config → cwd.
  const specsPath = options.output
    ? path.resolve(options.output)
    : config.settings.spec.directory
      ? path.resolve(config.settings.spec.directory)
      : path.resolve(process.cwd());

  if (!fs.existsSync(specsPath)) {
    throw new EmitSetupError(
      `specs directory not found: ${specsPath}`,
      ERROR_CODES.INVALID_ARGS,
      'run `specs generate` first — it writes this layout by default',
    );
  }

  const transformers =
    typeof run.transformers === 'function' ? run.transformers(config) : run.transformers;
  if (transformers.length === 0) {
    throw new EmitSetupError('no valid transformers to run', ERROR_CODES.INVALID_ARGS);
  }

  if (options.verbose) {
    console.log(`[${run.label}] directory: ${specsPath}`);
    console.log(`[${run.label}] transformers: ${transformers.map(t => t.name).join(', ')}`);
  }

  // The workspace root is the parent of the specs directory. Platform trees are
  // siblings of it, so every transformer's output root derives from here.
  const workspaceDir = path.dirname(specsPath);

  // Where each kind's specs live is the layout resolver's answer (ADR-096), which
  // also reads a pre-`components/` directory as a flat set of components.
  const layout = resolveSpecsLayout(specsPath);
  const legacy = legacyLayoutNotice(layout);
  if (legacy) console.log(legacy);

  // One flat list of (kind, key) pairs: everything downstream — the emit loop,
  // `--components`, pruning — treats a composition as a spec with a different
  // output directory, not as a separate pass.
  // `--compositions` / `--no-compositions` narrow the run to one kind. Resolved before
  // discovery so an excluded kind is never walked, and recorded so pruning knows this run
  // is not authoritative over it.
  const kindScope = resolveKindScope();
  let specs: Array<{ kind: SpecKind; key: string }> = SPEC_KINDS
    .filter(kind => kindScope.kinds.includes(kind))
    .flatMap(kind => layout.folderNames(kind, 'yaml').map(key => ({ kind, key })));

  if (options.components && options.components.length > 0) {
    const requested = new Set(options.components);
    const present = new Set(specs.map(s => s.key));
    for (const missing of options.components.filter(c => !present.has(c))) {
      console.warn(`Warning: component "${missing}" not found in ${specsPath} — skipping`);
    }
    specs = specs.filter(s => requested.has(s.key));
  }

  if (specs.length === 0) {
    // Name the kind that was asked for, not "component": a `--compositions` run against a
    // workspace with none would otherwise be told to look in the components directory.
    const asked = kindScope.kinds;
    throw new EmitSetupError(
      `no ${asked.join(' or ')} directories with api.yaml found in ${asked.map(k => layout.dirFor(k)).join(' or ')}`,
      ERROR_CODES.FILE_ERROR,
      'run `specs generate` first — it writes this layout by default',
    );
  }

  // A narrowed run must not read as a full one.
  const scopeNotice = describeKindScope(kindScope);
  if (scopeNotice) console.log(scopeNotice);

  // Compositions are Pro (ADR-097). On free they are skipped rather than degraded:
  // a composition with its components stripped out is a styled empty box named
  // after a screen, which reads as a bug. Said once, because the entitlement is the
  // finding and the list is not.
  const compositionCount = specs.filter(s => s.kind === 'composition').length;
  // A kind this run did not emit is a kind it is not authoritative over, so its
  // emitted directory is left alone — the same rule a `--components` run and a
  // license-aborted run already obey. Without this, a free run following a Pro one
  // deletes the composition output the Pro run wrote and reports it as having no
  // matching spec, when the spec is right there and only the entitlement was missing.
  const skippedKinds = new Set<SpecKind>(kindScope.excluded);
  if (compositionCount > 0 && !(await run.proEntitled?.())) {
    specs = specs.filter(s => s.kind !== 'composition');
    skippedKinds.add('composition');
    console.log(
      `⚠ ${compositionCount} composition${compositionCount === 1 ? '' : 's'} skipped — Pro required. ` +
      `Components emitted as normal.`,
    );
  }

  const componentDirs = specs.map(s => s.key);

  console.log(`⏳ ${specs.length} components (${transformers.map(t => t.name).join(', ')})…`);
  console.log('');

  let succeeded = 0;
  let failed = 0;
  let licenseAborted = false;

  for (const { kind, key: componentKey } of specs) {
    const componentDir = layout.folderFor(kind, componentKey);

    try {
      const apiYaml = yaml.parse(
        await fs.readFile(path.join(componentDir, 'api.yaml'), 'utf-8'),
      ) as Record<string, unknown>;

      for (const transformer of transformers) {
        // Where a transformer writes is its own declaration (project 024). Absent
        // an `outputTree` it emits beside the spec.
        const outputDir = transformer.outputTree
          ? path.join(workspaceDir, transformer.outputTree, 'src', dirNameFor(kind), toPascalCase(componentKey))
          : componentDir;

        const context: TransformerContext = {
          specDir: componentDir,
          outputDir,
          workspaceDir,
          // The specs root, handed over rather than climbed to (ADR-096): the old
          // walk up a fixed number of levels was correct for one output depth,
          // and compositions introduce a second.
          specsRoot: layout.root,
          kind,
          componentKey,
          tokensFormat: config.settings.spec.tokens,
          outputFormat: config.settings.spec.format,
          processingStates: config.conventions.specs?.states as ProcessingStates | undefined,
          specs: config.conventions.specs,
          // The conventions of the platform this transformer emits for (ADR-073).
          platform: transformer.platformId
            ? platformOf(config.conventions, transformer.platformId)
            : undefined,
          transformerOptions: run.transformerOptions?.get(transformer.name),
          dataDirectory: config.settings.data?.directory
            ? path.resolve(config.settings.data.directory)
            : undefined,
          scoped: (options.components?.length ?? 0) > 0,
        };
        await transformer.run(apiYaml, context);
      }

      if (options.verbose) console.log(`  ✓ ${componentKey}`);
      succeeded++;
    } catch (err) {
      console.error(`  ✗ ${componentKey}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;

      // A provided key that could not be validated fails identically for every
      // component, and each per-component retry is another request into the
      // very rate limit that caused the failure — a full catalogue run can keep
      // the window saturated for its whole duration. One unchecked key is one
      // failure: stop the run at the first.
      if (err instanceof Error && (err as Error & { code?: string }).code === 'LICENSE_NOT_VALIDATED') {
        const remaining = componentDirs.length - succeeded - failed;
        if (remaining > 0) {
          console.error('');
          console.error(`Stopping: the license check failed and would fail identically for the remaining ${remaining} components.`);
          console.error('Nothing more will contact the license server this run.');
          failed += remaining;
        }
        licenseAborted = true;
        break;
      }
    }
  }

  // A full run is authoritative over the trees it emits into: a component
  // renamed in Figma, or a naming convention changed in config, produces output
  // under a new directory and leaves the old one behind. Nothing else deletes
  // it, so it keeps appearing in Storybook as a component that no longer exists.
  //
  // Only a full run may do this. A `--components` run knows nothing about the
  // components it was not asked to emit, and every one of them would look
  // orphaned. A license-aborted run stopped mid-catalogue, so it is not
  // authoritative over anything either — pruning and derived output would be
  // rebuilt from a partial pass.
  if (!options.components?.length && !licenseAborted) {
    await pruneOrphans(transformers, specs, workspaceDir, skippedKinds);
  }

  // Stylesheets and index output are derived from the whole set, so they are
  // rebuilt after every pass — including a watch-triggered one, which would
  // otherwise leave them stale against the component that just changed.
  if (!licenseAborted) {
    for (const transformer of transformers) {
      if (transformer.finalize) await transformer.finalize(specsPath);
    }
  }

  console.log('');
  // Anything a transform wrote beside the emitted package, named once, so a
  // customer is not left to discover it from an import path.
  await reportExternalWrites();
  console.log(`✓ ${run.label} complete`);
  console.log(`  ${succeeded} succeeded${failed > 0 ? `, ${failed} failed` : ''}`);

  return { specsPath, configPath: configLoader.resolveDirectory(options.config), succeeded, failed };
}

function reportSetupError(error: unknown): void {
  // Already a complete, actionable message naming both flags — printing it through the
  // generic path would prefix a second "Error:".
  if (error instanceof KindScopeConflict) {
    console.error(error.message);
    return;
  }
  if (error instanceof EmitSetupError) {
    console.error(`Error: ${error.message}`);
    if (error.tip) console.error(`Tip: ${error.tip}`);
    return;
  }
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
}

/**
 * Watch the specs directory — and the workspace's `config/` — and re-emit the
 * whole set on every change.
 *
 * Config is watched because a convention decides what the emitted code looks
 * like just as directly as the spec does. Only these two are watched, not the
 * workspace root: the emitted platform trees are siblings of the specs
 * directory, and a recursive watch over their parent would re-trigger on this
 * run's own output.
 *
 * The whole set, not the changed component: a spec edit can change what one
 * component imports from another, and a partial re-emit would leave the emitted
 * tree internally inconsistent — which HMR serves without complaint.
 *
 * Only the first pass can exit. After that a failure is reported and the watcher
 * keeps running, so a mid-edit spec that fails to parse does not end the session.
 */
async function watchAndEmit(run: EmitRun, options: EmitOptions): Promise<never> {
  let first: EmitResult;
  try {
    first = await emitOnce(run, options);
  } catch (error) {
    reportSetupError(error);
    process.exit(error instanceof EmitSetupError ? error.code : ERROR_CODES.GENERAL_ERROR);
  }

  console.log('');

  // The spec watcher and the config watcher share one debounce, so a config edit
  // and a spec edit are the same event as far as the re-emit is concerned.
  return watchLoop({
    targets: [first.specsPath, ...(first.configPath ? [first.configPath] : [])],
    debounceMs: WATCH_DEBOUNCE_MS,
    runOnStart: false, // the first pass above already emitted — and named the targets
    run: async () => {
      try {
        await emitOnce(run, options);
      } catch (error) {
        reportSetupError(error);
      }
    },
  });
}

/**
 * Run a set of transformers over every component in a workspace.
 *
 * Exits the process: these are command bodies, and a failed component is a
 * non-zero exit rather than a thrown error the caller has to re-report. With
 * `--watch` the process stays alive instead, re-emitting on every spec change.
 */
export async function runEmitters(run: EmitRun, options: EmitOptions): Promise<never> {
  if (options.watch) return watchAndEmit(run, options);

  try {
    const { failed } = await emitOnce(run, options);
    process.exit(failed > 0 ? ERROR_CODES.GENERAL_ERROR : ERROR_CODES.SUCCESS);
  } catch (error) {
    reportSetupError(error);
    process.exit(error instanceof EmitSetupError ? error.code : ERROR_CODES.GENERAL_ERROR);
  }
}
