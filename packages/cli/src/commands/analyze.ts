import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { availableAnalyzerNames, resolveAnalyzers } from '../analyze/index.js';
import { platformOf } from '../config/PlatformConventions.js';
import { loadFoundations } from '../utilities/loadFoundations.js';
import type { Transformer, TransformerContext } from '../transforms/transformer.js';
import type { ProcessingStates } from '../transforms/states.js';
import { resolveSpecsLayout, legacyLayoutNotice, specFolderNames, SPEC_KINDS, type SpecKind } from '../utilities/specsLayout.js';
import { StepError } from '../pipeline/StepError.js';
import { ERROR_CODES } from '../utilities/errorCodes.js';

export interface AnalyzeOptions {
  output?: string;
  analysis?: string;
  config?: string;
  verbose: boolean;
}

export interface AnalyzeResult {
  /** A short line for a chained run's summary. */
  detail?: string;
}

/**
 * Warnings about `spec.tokens` settings the styling analysis cannot fully read.
 *
 * The styling analyzer recognises a token reference in two shapes: the `$token`
 * object `TOKEN` and `TOKEN_FIGMA_EXTENSIONS` emit, and a bare name string
 * matched against the fetched token universe, which is what `TOKEN_NAME` and
 * `FIGMA_NAME` emit. The remaining profiles serialize a reference into a form
 * that cannot be recognised without reproducing the generator's projection —
 * a custom object under `CUSTOM`, a platform code-syntax name under the three
 * `FIGMA_SYNTAX_*` profiles.
 *
 * Those profiles produce styling reports that are empty, or — because
 * `FIGMA_SYNTAX_*` falls back to `TOKEN` for tokens with no code syntax —
 * populated and partial. Both read as "this component uses no variables"
 * rather than "the analysis could not see them", so the run says so.
 */
export function tokenProfileWarnings(
  tokensFormat: string,
  hasFoundations: boolean,
  analyzers: Transformer[],
): string[] {
  if (!analyzers.some(a => a.name === 'styling')) return [];

  if (tokensFormat === 'TOKEN_NAME' || tokensFormat === 'FIGMA_NAME') {
    // These emit the token's name and nothing else, so the fetched universe is
    // the only thing that separates a reference from a literal like `CENTER`.
    if (!hasFoundations) {
      return [
        `[analyze] spec.tokens is ${tokensFormat} but no variables/styles data files were found — ` +
        'token references cannot be matched by name and styling reports will be empty. Run `specs fetch` first.',
      ];
    }
    return [];
  }

  if (tokensFormat === 'TOKEN' || tokensFormat === 'TOKEN_FIGMA_EXTENSIONS') return [];

  return [
    `[analyze] spec.tokens is ${tokensFormat} — the styling analysis reads only object-shaped and ` +
    'name-shaped token references, so styling reports will under-report tokens. ' +
    'Use TOKEN or TOKEN_NAME for complete styling analysis.',
  ];
}

/**
 * Run the analyzers, without exiting the process.
 *
 * The same work `specs analyze` does, as a call that returns — so `specs build`
 * and `specs run` can run it as one step and then go on to the next (ADR-101).
 * Failures throw `StepError` carrying the exit code the command has always used.
 *
 * There is no component scope parameter, and that is deliberate. Each analyzer's
 * `finalize()` writes one aggregate report per concern from the specs this call
 * visited, so analysing a subset would replace a catalogue-wide report with a
 * partial one and report success. The reports are shared output even though the
 * input is read per spec, so the whole catalogue is the only correct scope.
 */
export async function runAnalyze(
  analyzerNames: string[],
  options: AnalyzeOptions,
): Promise<AnalyzeResult> {
  const configLoader = new ConfigLoader();
  const config = configLoader.load(options.config);

  const outputPath = options.output
    ? path.resolve(options.output)
    : config.settings.spec.directory
      ? path.resolve(config.settings.spec.directory)
      : path.resolve(process.cwd());

  if (!fs.existsSync(outputPath)) {
    throw new StepError(`specs directory not found: ${outputPath}`, ERROR_CODES.INVALID_ARGS);
  }

  // The layout (ADR-096) decides where specs are read from; analysis is
  // always written to `analysis/`.
  const layout = resolveSpecsLayout(outputPath);
  const notice = legacyLayoutNotice(layout);
  if (notice) console.log(notice);

  const analysisDir = options.analysis
    ? path.resolve(options.analysis)
    : layout.analysisDir();

  // No names given runs every analyzer: the whole report set is the useful
  // default, and refusing to act was only ever a way of asking again.
  const analyzers = resolveAnalyzers(analyzerNames);
  if (analyzers.length === 0) {
    throw new StepError(
      `no valid analyzers to run — available: ${availableAnalyzerNames().join(', ')}`,
      ERROR_CODES.INVALID_ARGS,
    );
  }
  if (analyzerNames.length === 0) {
    console.log(`[analyze] no analyzer named — running all: ${analyzers.map(a => a.name).join(', ')}`);
  }

  if (options.verbose) {
    console.log(`[analyze] directory: ${outputPath}`);
    console.log(`[analyze] analysis output: ${analysisDir}`);
    console.log(`[analyze] analyzers: ${analyzers.map(a => a.name).join(', ')}`);
  }

  // What each analyzer reads is the analyzer's own declaration (`readsKinds`).
  // A composition composes components and carries styling, so the dependency and
  // styling analyses take it in; it declares no props and no variants, so the
  // prop and key analyses stay component-only rather than carrying rows that are
  // empty by construction.
  const componentsDir = layout.dirFor('component');
  const specs: Array<{ kind: SpecKind; key: string; dir: string }> = SPEC_KINDS.flatMap(kind =>
    specFolderNames(layout.dirFor(kind), 'yaml').map(key => ({
      kind,
      key,
      dir: path.join(layout.dirFor(kind), key),
    })),
  );
  const componentDirs = specs.filter(s => s.kind === 'component').map(s => s.key);

  if (componentDirs.length === 0) {
    throw new StepError(
      `no component directories with api.yaml found in ${componentsDir}`,
      ERROR_CODES.FILE_ERROR,
    );
  }

  const reads = (analyzer: Transformer, kind: SpecKind): boolean =>
    (analyzer.readsKinds ?? ['component']).includes(kind);

  const compositionCount = specs.length - componentDirs.length;
  const readsCompositions = analyzers.some(a => reads(a, 'composition'));
  const scope = compositionCount > 0 && readsCompositions
    ? `${componentDirs.length} components and ${compositionCount} composition${compositionCount === 1 ? '' : 's'}`
    : `${componentDirs.length} components`;
  console.log(`⏳ Analyzing ${scope} (${analyzers.map(a => a.name).join(', ')})…`);
  console.log('');

  // Load the full token universe (variables, styles) from fetched data files.
  // Read before the per-spec loop, not after it: analyzers need the universe to
  // recognise name-shaped token references while they walk a spec, and
  // `finalize` needs it to report tokens no spec referenced.
  const dataDirectory = config.settings.data?.directory;
  const dataDir = dataDirectory ? path.resolve(dataDirectory) : path.resolve(process.cwd());
  const foundationsPathsFor = (kind: 'variables' | 'styles'): string[] =>
    Object.entries(config.settings.data?.sources ?? {})
      .filter(([, s]) => Array.isArray(s.fetch) && s.fetch.includes(kind))
      .map(([alias]) => path.join(dataDir, `${alias}.${kind}.json`))
      .filter(p => fs.existsSync(p));

  const variablesPaths = foundationsPathsFor('variables');
  const stylesPaths = foundationsPathsFor('styles');
  const foundations = variablesPaths.length > 0 || stylesPaths.length > 0
    ? await loadFoundations(variablesPaths, stylesPaths)
    : undefined;

  if (options.verbose) {
    if (foundations) {
      console.log(`[analyze] foundations: ${foundations.variables.size} variables, ${foundations.styles.size} styles`);
    } else {
      console.log('[analyze] foundations: no data files found — skipping unused-token analysis');
    }
  }

  for (const warning of tokenProfileWarnings(config.settings.spec.tokens, Boolean(foundations), analyzers)) {
    console.warn(warning);
  }

  let succeeded = 0;
  let failed = 0;

  for (const { kind, key: componentKey, dir: componentDir } of specs) {
    const forThisKind = analyzers.filter(a => reads(a, kind));
    if (forThisKind.length === 0) continue;
    const apiPath = path.join(componentDir, 'api.yaml');

    try {
      const raw = await fs.readFile(apiPath, 'utf-8');
      const apiYaml = yaml.parse(raw) as Record<string, unknown>;

      for (const analyzer of forThisKind) {
        const context: TransformerContext = {
          specDir: componentDir,
          outputDir: componentDir,
          // The workspace root is the parent of the specs directory.
          workspaceDir: path.dirname(outputPath),
          specsRoot: layout.root,
          kind,
          componentKey,
          tokensFormat: config.settings.spec.tokens,
          outputFormat: config.settings.spec.format,
          foundations,
          processingStates: config.conventions.specs?.states as ProcessingStates | undefined,
          specs: config.conventions.specs,
          // The conventions of the platform this analyzer reads (ADR-073), the
          // same way runEmitters hands them to a transformer.
          platform: analyzer.platformId
            ? platformOf(config.conventions, analyzer.platformId)
            : undefined,
        };
        await analyzer.run(apiYaml, context);
      }

      if (options.verbose) {
        console.log(`  ✓ ${componentKey}`);
      }
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${componentKey}: ${msg}`);
      failed++;
    }
  }

  for (const analyzer of analyzers) {
    if (analyzer.finalize) {
      await analyzer.finalize(outputPath, analysisDir, foundations);
    }
  }

  console.log('');
  console.log(`✓ Analysis complete → ${path.relative(process.cwd(), analysisDir)}/`);

  // Analyzers that also write beside every component name those files here.
  // Without this the files appear unannounced in each spec folder and read
  // as leftovers from some earlier run.
  const ext = config.settings.spec.format === 'YAML' ? 'yaml' : 'json';
  const perComponent = analyzers
    .map(a => a.perComponentOutput)
    .filter((b): b is string => Boolean(b))
    .map(b => `${b}.${ext}`);
  if (perComponent.length > 0) {
    const specDirLabel = path.relative(process.cwd(), outputPath) || '.';
    console.log(`  also wrote ${perComponent.join(', ')} into each component folder under ${specDirLabel}/`);
  }

  console.log(`  ${succeeded} succeeded${failed > 0 ? `, ${failed} failed` : ''}`);

  // A spec that could not be analysed has already said so, by name, on the line
  // above — so the chain must not print a second, vaguer version of it.
  if (failed > 0) {
    throw new StepError(
      `${failed} spec${failed === 1 ? '' : 's'} failed to analyse`,
      ERROR_CODES.GENERAL_ERROR,
      undefined,
      true,
    );
  }

  const analysed = succeeded;
  return { detail: `${analysed} spec${analysed === 1 ? '' : 's'}` };
}

export const Analyze = new Command('analyze')
  .description('Run analysis passes over component specs and write aggregate reports to analysis/. With no analyzer named, every analyzer runs.')
  // Derived from the registry rather than restated, so adding an analyzer cannot leave
  // the help text naming a set that no longer matches what runs.
  .argument('[analyzers...]', `Analyzer names to run (${availableAnalyzerNames().join(', ')}). Omit to run all of them.`)
  .option('-o, --output <path>', 'Path to the specs directory (input)')
  .option('--analysis <path>', 'Path to write analysis output (default: <specs-dir>/analysis)')
  .option('--config <path>', 'Path to a config/ directory or legacy specs.config.yaml')
  .option('--verbose', 'Enable detailed logging', false)
  .action(async (analyzerNames: string[], options: AnalyzeOptions) => {
    try {
      await runAnalyze(analyzerNames, options);
      process.exit(ERROR_CODES.SUCCESS);
    } catch (error) {
      if (error instanceof StepError) {
        if (!error.reported) console.error(`Error: ${error.message}`);
        process.exit(error.code);
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(ERROR_CODES.GENERAL_ERROR);
    }
  });
