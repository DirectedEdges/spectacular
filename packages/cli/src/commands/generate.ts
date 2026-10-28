/**
 * Generate Command - Unified component specification generation
 *
 * Auto-detects source type:
 * - JSON file → file mode (single component with -c)
 * - Markdown manifest → manifest mode (multiple components from checkboxes)
 * - --from-bridge → bridge mode (current Figma selection via CLI bridge)
 *
 * File/manifest modes use Components.fromRestApi() batch API. Bridge mode
 * gets an already-generated spec from the plugin over the bridge — no REST fetch.
 */

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import { Components } from '@directededges/specs-from-figma';
import type { ProgressEvent, RestLicenseInput } from '@directededges/specs-from-figma';
import { ConfigLoader } from '../config/ConfigLoader.js';
import type { CLIConfig } from '../config/types.js';
import { loadFoundations } from '../utilities/loadFoundations.js';
import { resolveFileSourceAlias } from '../generate/fileSourceAlias.js';
import { ManifestParser } from '../generate/manifestParser.js';
import { ManifestParserV2 } from '../utilities/manifestParserV2.js';
import { writeLayout, type SpecKind } from '../utilities/specsLayout.js';
import { resolveKindScope, describeKindScope, KindScopeConflict } from '../utilities/kindScope.js';
import { assertPayloadReadable, readJsonPayload } from '../utilities/payloadRead.js';
import { SectionedFile, shadowIngestEnabled, shadowCompare } from '../utilities/sectionedFile.js';
import { LicenseStatus } from '../generate/licenseStatus.js';
import { StepError } from '../pipeline/StepError.js';
import { TRANSIENT_FAILURES, transientFailureLines } from '../generate/licenseGuidance.js';
import { FileManifest } from '../writers/FileManifest.js';
import { RunMetadataFile } from '../writers/RunMetadataFile.js';
import { SingleFileWriter } from '../writers/SingleFileWriter.js';
import { ComponentFileWriter } from '../writers/ComponentFileWriter.js';
import { ConcernFileWriter } from '../writers/ConcernFileWriter.js';
import { CombinedFileWriter } from '../writers/CombinedFileWriter.js';
import type { FileWriter, WriteResult } from '../writers/FileWriter.js';
import type { OutputFormat } from '../writers/outputConfig.js';
import { ImageFillsResolver, IMAGES_DIR_NAME } from '../generate/imageFills.js';
import { postGenerateFromSelection } from '../bridge/client.js';
import { formatKey } from '../utilities/formatKey.js';
import { resolveFileKey } from '../bridge/pickConnection.js';
import { figmaOf } from '../config/PlatformConventions.js';
import { ERROR_CODES } from '../utilities/errorCodes.js';

declare const __SPECS_CLI_VERSION__: string;

const CLI_GENERATOR = {
  name: '@directededges/specs-cli',
  version: typeof __SPECS_CLI_VERSION__ !== 'undefined' ? __SPECS_CLI_VERSION__ : 'unknown',
  url: 'https://www.npmjs.com/package/@directededges/specs-cli',
};

// Re-export for backward compatibility
export { ManifestParser } from '../generate/manifestParser.js';
export type { ManifestComponent, ManifestMetadata } from '../generate/manifestParser.js';
export { LicenseStatus } from '../generate/licenseStatus.js';

interface GenerateOptions {
  component?: string;
  license?: string;
  format?: string;
  output?: string;
  dataDir?: string;
  variables?: string;
  styles?: string;
  verbose: boolean;
  config?: string;
  combineAsLibrary?: boolean;
  combineConcerns?: boolean;
  /** Commander sets this false only when --no-subfolders is passed. */
  subfolders?: boolean;
  getImages?: boolean;
  fromBridge?: boolean;
  file?: string;
  node?: string;
  remove?: boolean;
}

/**
 * The Figma file key to pull image fills from: whichever file the specs being written
 * were generated from. For a configured source that is its `key`; for a source fetched
 * by `specs fetch --source` — a branch, typically — it is the sidecar written beside the
 * payload, since nothing in config knows that key. Falling back to the configured source
 * would download the main file's images for specs generated from a branch.
 */
function resolveImageFileKey(
  config: CLIConfig,
  sourceDir: string,
  payloadPath: string | undefined
): { key: string } | { error: string } {
  const alias = payloadPath && payloadPath.endsWith('.file.json')
    ? path.basename(payloadPath, '.file.json')
    : payloadPath && payloadPath.endsWith('.file')
      ? path.basename(payloadPath, '.file')
      : resolveFileSourceAlias(config.settings.data?.sources);

  if (!alias) {
    return { error: 'Error: --get-images requires a configured source file key (data.sources.<alias>.key in the workspace settings)' };
  }

  const configured = config.settings.data?.sources?.[alias]?.key;
  if (configured) return { key: configured };

  const sidecar = path.join(sourceDir, `${alias}.source.json`);
  if (fs.existsSync(sidecar)) {
    const recorded = JSON.parse(fs.readFileSync(sidecar, 'utf-8')) as { key?: string };
    if (recorded.key) return { key: recorded.key };
  }

  return {
    error: [
      `Error: --get-images cannot resolve the Figma file key for "${alias}"`,
      `  "${alias}" is not in data.sources, and ${path.relative(process.cwd(), sidecar)} is missing or has no key.`,
      `  Re-fetch it (\`specs fetch --source ${alias}=<url>\`), or generate without --get-images.`
    ].join('\n')
  };
}

/**
 * Which kind a produced spec is, and so which directory it belongs in (ADR-096).
 *
 * The manifest classifies a selection by node type and is the answer whenever the run came
 * from one. A bridge run given an explicit node has no manifest row to consult, so the
 * spec's own `metadata.source.nodeType` answers instead — the marker that states what a
 * spec describes, independent of where its file sits. Without this a composition
 * round-tripped through the bridge was written as a component, which is the kind being lost
 * at the other end of the same trip.
 */
function kindOf(
  name: string,
  spec: Record<string, unknown>,
  compositionIds: Set<string>
): SpecKind {
  if (compositionIds.has(name)) return 'composition';
  const source = (spec.metadata as { source?: { nodeType?: unknown } } | undefined)?.source;
  return source?.nodeType === 'FRAME' ? 'composition' : 'component';
}

/** Extensions a spec document can carry — what `-o` must not end in on a split run. */
const SPEC_EXTENSIONS = ['.yaml', '.yml', '.json'];

/**
 * A split run writes a tree, so `-o` names a directory. A path ending in a spec
 * extension is an authoring mistake rather than an instruction: honouring it
 * literally produced a *directory* named `button.yaml` holding the tree. Refused
 * before anything is generated, naming both ways out — a run that spent minutes on
 * a catalogue before rejecting its own argument is the worse version of this.
 */
/**
 * Stop the run with the exit code this command has always used.
 *
 * Throws rather than exiting, so `specs build` and `specs run` can call
 * generate as one step of a chain and carry on reporting (ADR-101). Every call
 * site has already written its own explanation to stderr, so the error carries
 * only the code and is marked as reported — the chain prints no second version.
 */
function stop(code: number): never {
  throw new StepError('', code, undefined, true);
}

export function assertOutputPathShape(options: GenerateOptions, config: CLIConfig): void {
  if (!options.output) return;
  const singleFile =
    (options.combineAsLibrary ? false : config.settings.spec.splitComponents) === false &&
    (options.combineConcerns ? false : config.settings.spec.splitConcerns) === false;
  if (singleFile) return;
  const ext = path.extname(options.output).toLowerCase();
  if (!SPEC_EXTENSIONS.includes(ext)) return;
  console.error(`Error: --output names a directory, but "${options.output}" ends in ${ext}.`);
  console.error(`  This run writes a spec per component, so give it a directory: -o ${path.dirname(options.output)}/`);
  console.error('  To write one document instead, add --combine-as-library --combine-concerns, which makes the filename meaningful.');
  stop(ERROR_CODES.INVALID_ARGS);
}

/**
 * Resolve a `-c` argument against a split payload's root maps, by node id first
 * and then by name. A set outranks a bare component: a variant's set is the thing
 * a person names, and it is what the monolithic path reports too.
 */
export function resolveComponentInSplitRoot(
  root: Record<string, unknown>,
  component: string
): { id: string; name: string } | null {
  const maps = [root.componentSets, root.components]
    .filter((m): m is Record<string, { name?: string }> => Boolean(m) && typeof m === 'object');
  for (const map of maps) {
    const byId = map[component];
    if (byId) return { id: component, name: byId.name ?? component };
  }
  for (const map of maps) {
    for (const [id, value] of Object.entries(map)) {
      if (value?.name === component) return { id, name: value.name };
    }
  }
  return null;
}

/**
 * Write processed components to stdout or via the config-driven output writers.
 * Shared by file/manifest mode (REST-sourced) and selection mode (bridge-sourced) —
 * once a spec exists as a plain object, output resolution/writing is identical.
 */
async function writeGeneratedOutput(
  processedComponents: Array<{ name: string; spec: Record<string, unknown>; kind?: SpecKind }>,
  errors: Array<{ component: string; error: string }>,
  isManifest: boolean,
  options: GenerateOptions,
  config: CLIConfig,
  /** The `<alias>.file.json` these specs were generated from, when there was one. */
  payloadPath?: string,
  /** The source payload's lastModified — stamps metadata.lastUpdated so an
   *  unchanged design regenerates to unchanged files (specs#568). */
  sourceLastModified?: string
): Promise<void> {
  // -------------------------------------------------------------------
  // File mode stdout (no -o)
  // -------------------------------------------------------------------
  if (!isManifest && !options.output && !config.settings.spec.directory) {
    if (options.getImages) {
      console.error('Error: --get-images requires an output directory (set spec.directory in the workspace settings or pass -o) so image files have somewhere to be written');
      stop(ERROR_CODES.INVALID_ARGS);
    }
    const componentData = processedComponents[0].spec;
    const outputFormat = options.format
      ? options.format.toLowerCase()
      : config.settings.spec.format.toLowerCase();

    const formattedOutput = outputFormat === 'yaml'
      ? yaml.stringify(componentData)
      : JSON.stringify(componentData, null, 2);

    console.log(formattedOutput);
    // Nothing further to write: the spec went to stdout. Returns rather than
    // exiting so a chained run can go on to the next step (ADR-101).
    return;
  }

  // -------------------------------------------------------------------
  // File output via manifest + writer
  // -------------------------------------------------------------------
  const resolvedFormat: OutputFormat = options.format
    ? options.format.toLowerCase() as OutputFormat
    : config.settings.spec.format.toLowerCase() as OutputFormat;

  // The split layout is the default (ADR-071). Each flag only ever turns a
  // split off, so an absent flag falls through to the configured value rather
  // than overriding it.
  const outputConfig = {
    splitComponents: options.combineAsLibrary ? false : config.settings.spec.splitComponents,
    splitConcerns: options.combineConcerns ? false : config.settings.spec.splitConcerns,
    useSubfolders: options.subfolders === false ? false : config.settings.spec.useSubfolders,
    defaultFormat: resolvedFormat
  };


  let outputPath: string;
  if (options.output) {
    outputPath = path.resolve(options.output);
  } else if (config.settings.spec.directory) {
    outputPath = path.resolve(config.settings.spec.directory);
  } else {
    // Should not reach here — handled above for file mode stdout
    stop(ERROR_CODES.INVALID_ARGS);
    return;
  }

  const isSingleFileMode = !outputConfig.splitComponents && !outputConfig.splitConcerns;

  // When in single-file mode and outputPath is an existing directory,
  // append a default filename so we don't try to open a directory as a file
  if (isSingleFileMode && fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
    outputPath = path.join(outputPath, `library.${resolvedFormat}`);
  }

  const baseDir = outputConfig.splitComponents || outputConfig.splitConcerns
    ? outputPath
    : path.dirname(outputPath);

  const outputFileName = (!outputConfig.splitComponents && !outputConfig.splitConcerns)
    ? path.basename(outputPath)
    : undefined;

  // -------------------------------------------------------------------
  // Image resolution (ADR-063): add src to unresolved registry entries —
  // files under the workspace's assets/images/, referenced relative to the
  // spec file that points at them. Runs before the manifest so writers
  // serialize the resolved registry values.
  //
  // Mapping an identity to a file already on disk is filesystem work and
  // always runs: a hash-named file is content-addressed, so its presence is
  // observation rather than the filename guessing ADR-063 removed. Only
  // fetching the bytes of a missing image needs --get-images, a token, and a
  // file key. Gating both together made a plain regenerate drop `src` that a
  // previous run had resolved, silently degrading output it could have
  // reconstructed for free.
  // -------------------------------------------------------------------
  {
    const hashes = ImageFillsResolver.collectUnresolvedHashes(processedComponents);
    if (hashes.size === 0) {
      if (options.getImages) {
        console.log(figmaOf(config.conventions).images
          ? 'Note: --get-images found no unresolved image placeholders'
          : 'Note: --get-images has no effect — images is not configured in config/conventions/figma.yaml');
      }
    } else {
      // Reuse hash-named files already present in assets/images/ — only the
      // remainder needs the token, the API call, and downloads.
      const files = await ImageFillsResolver.findExisting(hashes, baseDir);
      const missing = new Set([...hashes].filter(hash => !files.has(hash)));

      if (missing.size > 0 && options.getImages) {
        const token = process.env.FIGMA_TOKEN;
        if (!token) {
          console.error('Error: --get-images requires the FIGMA_TOKEN environment variable (same token as `specs fetch`)');
          stop(ERROR_CODES.INVALID_ARGS);
        }
        const sourceDir = options.dataDir
          ? path.resolve(options.dataDir)
          : config.settings.data?.directory
            ? path.resolve(config.settings.data.directory)
            : path.join(process.cwd(), 'data');
        const resolved = resolveImageFileKey(config, sourceDir, payloadPath);
        if ('error' in resolved) {
          console.error(resolved.error);
          stop(ERROR_CODES.INVALID_ARGS);
        }
        const fileKey = resolved.key;

        console.log(`Requesting image download URLs from Figma (${missing.size} image(s))...`);
        const urls = await ImageFillsResolver.fetchImageUrls(fileKey, token);
        process.stdout.write(`Images downloading (0/${missing.size})`);
        const downloaded = await ImageFillsResolver.downloadAndWrite(missing, urls, baseDir, (completed, total) => {
          process.stdout.write(`\rImages downloading (${completed}/${total})`);
          if (completed === total) process.stdout.write('\n');
        });
        for (const [hash, filename] of downloaded) files.set(hash, filename);
      }

      // How far a spec file sits below baseDir, which is where the images
      // directory lives: always one level for the kind directory (ADR-096), one more
      // when components get their own folders (subfolders, or the component+concern
      // combined layout). Derived from that depth rather than written out per case,
      // so adding a level cannot leave it stale.
      const inComponentFolders = !!outputConfig.splitComponents && (!!outputConfig.useSubfolders || !!outputConfig.splitConcerns);
      const depth = 1 + (inComponentFolders ? 1 : 0);
      const relativePrefix = `${'../'.repeat(depth)}${IMAGES_DIR_NAME}/`;
      const resolvedCount = ImageFillsResolver.applyResolvedSources(processedComponents, files, relativePrefix);
      const downloadedCount = options.getImages ? missing.size : 0;
      const reused = hashes.size - downloadedCount;
      if (resolvedCount > 0) {
        console.log(`✓ Resolved ${resolvedCount} image reference(s) into ${files.size} file(s) under ${IMAGES_DIR_NAME}/ (${reused} reused, ${downloadedCount} downloaded)`);
      }
      // An image with no file on disk keeps its identity and no src. Say so
      // rather than leaving a pointer to be discovered in emitted output.
      const unresolved = options.getImages ? 0 : missing.size;
      if (unresolved > 0) {
        console.log(`Note: ${unresolved} image(s) have no file under ${IMAGES_DIR_NAME}/ — re-run with --get-images to download them`);
      }
    }
  }

  // -------------------------------------------------------------------
  // Run metadata (ADR-089): a catalogue run states its facts once, in
  // `latest.metadata.<format>`, and every spec keeps only `metadata.source`.
  //
  // Manifest mode only. A single-component run produces one document, so there
  // is nothing to factor out of and a second file would only split what already
  // reads in one place. Runs before the manifest so the writers serialize the
  // reduced blocks.
  // -------------------------------------------------------------------
  if (isManifest) {
    const run = RunMetadataFile.separate(processedComponents);
    if (run) {
      const written = RunMetadataFile.write(run, baseDir, resolvedFormat);
      console.log(`\u2713 Wrote run metadata: ${path.relative(process.cwd(), written)} (specs carry metadata.source only)`);
    } else {
      console.log('Note: specs record no shared run metadata, or disagree on it \u2014 each keeps its own metadata block');
    }
  }

  const sourceTimestamp = sourceLastModified ? new Date(sourceLastModified) : undefined;
  const timestamp = sourceTimestamp && !isNaN(sourceTimestamp.getTime()) ? sourceTimestamp : undefined;

  // Select appropriate writer
  let writer: FileWriter;
  if (outputConfig.splitConcerns && !outputConfig.splitComponents) {
    writer = new ConcernFileWriter();
  } else if (outputConfig.splitComponents && !outputConfig.splitConcerns) {
    writer = new ComponentFileWriter(outputConfig.useSubfolders);
  } else if (!outputConfig.splitComponents && !outputConfig.splitConcerns) {
    writer = new SingleFileWriter();
  } else {
    writer = new CombinedFileWriter();
  }

  // -------------------------------------------------------------------
  // Output layout (ADR-096): each kind writes under its own directory —
  // `specs/components/`, `specs/compositions/` — in every layout, including the
  // collapsing ones.
  //
  // `--combine-as-library` and `--combine-concerns` collapse a catalogue into
  // documents keyed by spec key. They still do, but per kind: the collapsing happens
  // *within* a kind, and each kind's documents land in its own directory. Sharing one
  // namespace would let a composition and a component of the same name overwrite each
  // other, with write order deciding which survived — and the whole point of the
  // layout is that a shared name is a non-event.
  // -------------------------------------------------------------------
  const layout = writeLayout(baseDir);

  const kindScope = resolveKindScope();
  const scopeNotice = describeKindScope(kindScope);
  if (scopeNotice) console.log(scopeNotice);

  const byKind = new Map<SpecKind, typeof processedComponents>();
  for (const item of processedComponents) {
    const kind: SpecKind = item.kind ?? 'component';
    const group = byKind.get(kind);
    if (group) group.push(item);
    else byKind.set(kind, [item]);
  }

  const writeResult: WriteResult = { filesWritten: [], warnings: [], errors: [] };

  // Components first, so a run's output reads in the order the manifest lists it. A
  // `--compositions` / `--no-compositions` run covers one kind, and the kind it excluded
  // is one it is not authoritative over — so nothing of that kind's is written or removed.
  for (const kind of kindScope.kinds) {
    const group = byKind.get(kind);
    if (!group || group.length === 0) continue;
    const result = await writer.write(
      new FileManifest(group, outputConfig, layout.dirFor(kind), outputFileName, timestamp, kind)
    );
    writeResult.filesWritten.push(...result.filesWritten);
    writeResult.warnings.push(...result.warnings);
    writeResult.errors.push(...result.errors);
    // Say where it landed. `-o` names the specs root and the run appends the kind
    // directory beneath it (ADR-096), so the path written is never the path typed —
    // echoing it is what keeps that from being a thing to deduce.
    console.log(
      `✓ Wrote ${group.length} ${kind} spec(s) to ` +
      `${path.relative(process.cwd(), layout.dirFor(kind)) || '.'}/`
    );
  }

  if (writeResult.warnings.length > 0) {
    // Overwriting is what a deterministic generator does on every run after the
    // first, so warning about it warns about the normal case. It was printed on
    // every regenerate, which taught readers to skim `generate` warnings — and the
    // other ones matter. One live session nearly missed a real duplicate-anatomy-key
    // warning because it sat next to this.
    const isOverwriteWarning = (warning: string) => warning.includes('Overwriting existing file');
    writeResult.warnings.filter(warning => !isOverwriteWarning(warning)).forEach(warning => console.log(warning));
  }

  if (writeResult.errors.length > 0) {
    writeResult.errors.forEach(error => console.error(`Error: ${error}`));
    stop(ERROR_CODES.FILE_ERROR);
  }

  // A component renamed in Figma, renamed by a convention change, or dropped from
  // the library generates under a new folder and leaves the old one behind. Nothing
  // removes it — deliberately, since the generator cannot tell a folder you meant to
  // keep from one you forgot about, and the spec tree is authored against, not built
  // into (specs#595).
  //
  // So it is reported instead. Naming what is present but not generated costs
  // nothing and cannot lose work; what to do about it is the customer's call.
  //
  // Only a full run with no failures may judge: a `--component` run knows nothing
  // about the components it was not asked for, and every one would look stale.
  //
  // The shape it needs is a folder per spec holding an `api` document, which is what
  // `useSubfolders` OR `--split-concerns` produces — the same condition the image prefix
  // derives its depth from. Keying on `useSubfolders` alone silently excluded every
  // workspace that splits concerns without subfolders, which is where the report is most
  // useful: that is the layout a legacy directory migrates into, and its leftovers are
  // exactly what needs naming.
  if (
    isManifest &&
    !options.component &&
    errors.length === 0 &&
    !!outputConfig.splitComponents &&
    (!!outputConfig.useSubfolders || !!outputConfig.splitConcerns) &&
    !isSingleFileMode
  ) {
    await reportUngeneratedSpecs(baseDir, writeResult.filesWritten, resolvedFormat);
  }

  if (errors.length > 0) stop(ERROR_CODES.GENERAL_ERROR);
}

export interface GenerateResult {
  /** A short line for a chained run's summary. */
  detail?: string;
}

/**
 * Generate specs, without exiting the process.
 *
 * The same work `specs generate` does, as a call that returns — so `specs build`
 * and `specs run` can run it as one step and then go on to the next (ADR-101).
 * Failures throw `StepError` carrying the exit code the command has always used.
 */
export async function runGenerate(
  source: string | undefined,
  options: GenerateOptions,
): Promise<GenerateResult> {
  // Before anything is read: a run asked to both include and exclude a kind has no
  // defensible interpretation, and failing after a catalogue load wastes the wait.
  try {
    resolveKindScope();
  } catch (error) {
    if (!(error instanceof KindScopeConflict)) throw error;
    console.error(error.message);
    stop(ERROR_CODES.INVALID_ARGS);
  }
  await generateBody(source, options);
  return {};
}

export const Generate = new Command('generate')
  .description('Generate component specifications from Figma data or manifest')
  .argument('[source]', 'Path to Figma JSON file or markdown manifest (default: {data.directory}/{alias}.manifest.md from config)')
  .option('-c, --component <name|id>', 'Component name or ID (required for file mode)')
  .option('--compositions', 'Generate compositions only, no components')
  .option('--no-compositions', 'Generate components only, skipping compositions')
  .option('-l, --license <key>', 'License key for premium features (or set SPECS_LICENSE_KEY)')
  .option('-f, --format <format>', 'Output format (yaml or json) - overrides config')
  .option('-o, --output <path>', 'Output file or directory path')
  .option('-v, --variables <path>', 'External variables JSON file')
  .option('-s, --styles <path>', 'External styles JSON file')
  .option('--data-dir <dir>', 'Override data directory for loading source files')
  .option('--config <path>', 'Path to a config/ directory or legacy specs.config.yaml')
  .option('--combine-as-library', 'Write every component into one library file instead of a file per component')
  .option('--combine-concerns', 'Write API, variants, and examples into one file per component instead of separate files')
  .option('--no-subfolders', 'Write component files side by side instead of nesting each in its own subfolder')
  .option('--get-images', 'Resolve unresolved registry images into files under assets/images/ (requires processing.images in config and FIGMA_TOKEN)')
  .option('--from-bridge', 'Generate from the current selection in a connected Figma file via the CLI bridge (no REST fetch)')
  .option('--file <fileKey>', 'Target a specific connected Figma file with --from-bridge (prompts to choose if more than one is connected in an interactive terminal; required otherwise)')
  .option('--node <id>', 'With --from-bridge: generate from this node id instead of the current selection')
  .option('--remove', 'With --from-bridge: delete the node once its spec has been read (round-trip testing — leaves the Figma page as it was found)')
  .option('--verbose', 'Enable detailed logging', false)
  .action(async (source: string | undefined, options: GenerateOptions) => {
    try {
      await runGenerate(source, options);
      process.exit(ERROR_CODES.SUCCESS);
    } catch (error) {
      if (error instanceof StepError) process.exit(error.code);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(ERROR_CODES.GENERAL_ERROR);
    }
  });

/** The body of `specs generate`, shared by the command and `runGenerate`. */
async function generateBody(source: string | undefined, options: GenerateOptions): Promise<void> {
    try {
      // Load configuration (needed to resolve default source path)
      const configLoader = new ConfigLoader();
      const config = configLoader.load(options.config);

      if (options.verbose && options.config) {
        console.log(`[CLI] Using config from: ${options.config}`);
      }

      assertOutputPathShape(options, config);

      // ---------------------------------------------------------------
      // BRIDGE MODE (--from-bridge): bypass REST fetch entirely —
      // the plugin has already generated the spec from the current
      // selection; just relay it through the same output writers.
      // ---------------------------------------------------------------
      if (options.fromBridge) {
        if (source) {
          console.error('Error: --from-bridge does not take a source argument (it reads the current Figma selection).');
          stop(ERROR_CODES.INVALID_ARGS);
        }

        let result;
        try {
          const fileKey = await resolveFileKey(options.file);
          // The conventions and settings shape the spec the plugin builds, not merely where it is written.
          result = await postGenerateFromSelection({ fileKey, nodeId: options.node, conventions: config.conventions, settings: config.settings, remove: options.remove });
        } catch (e) {
          const err = e as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
          if (err.cause && err.cause.code === 'ECONNREFUSED') {
            console.error('Error: bridge is not running.');
            console.error('  Start it with: specs bridge start');
          } else {
            console.error(`Error: ${err.message}`);
          }
          stop(ERROR_CODES.GENERAL_ERROR);
        }

        if (!result.success) {
          const msg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
          console.error(`Error: ${msg}`);
          stop(ERROR_CODES.GENERAL_ERROR);
        }

        if (!result.specData) {
          console.error('Error: Bridge returned success but no spec data.');
          stop(ERROR_CODES.GENERAL_ERROR);
        }

        console.log(`✓ Generated from selection: ${result.name ?? result.nodeId}`);

        // A bridge run has no manifest row to classify the node by, so the spec's own
        // `metadata.source.nodeType` says which kind it is — otherwise a composition
        // captured this way is written as a component and the kind is lost on the way back.
        const spec = result.specData as Record<string, unknown>;
        const name = result.name ?? String(result.nodeId);
        const processedComponents = [{ name, spec, kind: kindOf(name, spec, new Set<string>()) }];
        await writeGeneratedOutput(processedComponents, [], false, options, config);
        return;
      }

      // Use data.directory for loading data files (flag > config > default)
      const sourceDir = options.dataDir
        ? path.resolve(options.dataDir)
        : config.settings.data?.directory
          ? path.resolve(config.settings.data.directory)
          : path.join(process.cwd(), 'data');

      // Resolve default source path: {data.directory}/{alias}.manifest.md
      // Alias preference: `library` if configured with `fetch: [file]`, else first source with `fetch: [file]`.
      if (!source) {
        const defaultAlias = resolveFileSourceAlias(config.settings.data?.sources);

        if (!defaultAlias) {
          console.error('Error: No source argument provided and no default manifest could be resolved');
          console.error('Tip: run `specs scan` to generate a manifest, or configure a source with `fetch: [file]` in the workspace settings');
          stop(ERROR_CODES.INVALID_ARGS);
        }

        source = path.join(sourceDir, `${defaultAlias}.manifest.md`);

        if (options.verbose) {
          console.log(`[CLI] Using default manifest: ${path.relative(process.cwd(), source)}`);
        }
      }

      const sourcePath = path.resolve(source);

      if (options.verbose) {
        console.log(`[CLI] Loading source: ${source}`);
      }

      // Validate source exists
      if (!fs.existsSync(sourcePath)) {
        console.error(`Error: Source file not found: ${source}`);
        if (source.endsWith('.manifest.md')) {
          console.error('Tip: run `specs scan` to generate the manifest');
        }
        stop(ERROR_CODES.FILE_ERROR);
      }

      // Auto-detect mode by content.
      // - v2 manifest: markdown table emitted by `specs scan` (declares **Scan format version:** 2)
      // - v1 manifest: checkbox bullet list emitted by `specs audit`
      // - JSON: raw Figma file (file mode)
      // - a directory: a page-split payload (`<alias>.file/`), which is file mode
      //   too — there is nothing to sniff, and reading it as text is an EISDIR.
      // A JSON payload argument can exceed the single-string read limit; fail it
      // with the file named rather than V8's bare message. (Manifests are tiny.)
      const sourceIsSplitDir = fs.statSync(sourcePath).isDirectory();
      let sourceContent = '';
      if (!sourceIsSplitDir) {
        assertPayloadReadable(sourcePath);
        sourceContent = await fs.readFile(sourcePath, 'utf-8');
      }
      const trimmed = sourceContent.trimStart();
      const isV2Manifest = !sourceIsSplitDir && ManifestParserV2.isV2(sourceContent);
      const isV1Manifest = !sourceIsSplitDir && trimmed.includes('- [');
      const isJson = sourceIsSplitDir || trimmed.startsWith('{');
      const isManifest = isV2Manifest || isV1Manifest;

      if (!isManifest && !isJson) {
        console.error('Error: Unrecognized source format. Expected JSON file or markdown manifest.');
        stop(ERROR_CODES.INVALID_ARGS);
      }

      if (options.verbose) {
        console.log(`[CLI] Mode: ${isManifest ? 'manifest' : 'file'}`);
      }

      // ---------------------------------------------------------------
      // Determine component IDs and Figma file JSON based on mode
      // ---------------------------------------------------------------
      let componentIds: string[];
      let componentNames: Map<string, string>; // id → display name
      // Which of those ids are compositions (ADR-095). The engine processes both
      // through one call; the kind only decides where the spec is written.
      let compositionIds = new Set<string>();
      let libraryJson: Record<string, any> | undefined;
      // Shadow mode only: the monolithic payload for a second engine run.
      let shadowJson: Record<string, any> | undefined;
      // The Figma payload these specs come from — carried to --get-images so images are
      // pulled from that file, which for an ad-hoc source is not the configured one.
      let payloadPath: string | undefined;

      if (isManifest) {
        // MANIFEST MODE
        if (!options.output && !config.settings.spec.directory) {
          console.error('Error: Specify --output or set spec.directory in the workspace settings');
          stop(ERROR_CODES.INVALID_ARGS);
        }

        const parsed = isV2Manifest
          ? ManifestParserV2.parse(sourceContent)
          : ManifestParser.parse(sourceContent);
        const { components, metadata } = parsed;
        // Compositions are curated exactly as components are (ADR-095) — the
        // checkbox decides, and an unchecked one is skipped like an unchecked
        // component.
        const compositions = ('compositions' in parsed ? parsed.compositions : []).filter(c => c.included);

        for (const warning of ('warnings' in parsed ? parsed.warnings : [])) {
          console.warn(`⚠ ${warning}`);
        }

        if (components.length === 0 && compositions.length === 0) {
          console.error('Error: No components found in manifest');
          stop(ERROR_CODES.INVALID_ARGS);
        }

        const selectedComponents = components.filter(c => c.included);

        if (selectedComponents.length === 0 && compositions.length === 0) {
          console.error('Error: No components selected in manifest (none have [x])');
          stop(ERROR_CODES.INVALID_ARGS);
        }

        console.log(`✓ Loaded manifest: ${components.length} components (${selectedComponents.length} selected)`);
        const allCompositions = 'compositions' in parsed ? parsed.compositions : [];
        if (allCompositions.length > 0) {
          console.log(`✓ Loaded manifest: ${allCompositions.length} compositions (${compositions.length} selected)`);
        }

        // Determine source file. `<alias>.manifest.md` names the source it was
        // scanned from, so with several fetched files the manifest's own payload
        // beats the first configured source.
        const manifestAlias = path.basename(sourcePath).replace(/\.manifest\.md$/, '');
        const componentSourceAlias = resolveFileSourceAlias(config.settings.data?.sources);
        // An alias's payload on disk: the monolithic file, or the split
        // directory when only that exists (post-flip fetches).
        const payloadFor = (alias: string): string | undefined => {
          const monolithic = path.join(sourceDir, `${alias}.file.json`);
          if (fs.existsSync(monolithic)) return monolithic;
          const split = path.join(sourceDir, `${alias}.file`);
          return fs.existsSync(path.join(split, 'manifest.json')) ? split : undefined;
        };

        // metadata.file may predate the payload's current shape (a manifest
        // scanned before a re-fetch switched monolithic ↔ split) — trust it
        // only when it still exists, then fall through to what's on disk.
        const sourceFile = (metadata.file && fs.existsSync(metadata.file) ? metadata.file : undefined)
          || (manifestAlias !== path.basename(sourcePath) ? payloadFor(manifestAlias) : undefined)
          || (componentSourceAlias ? payloadFor(componentSourceAlias) ?? path.join(sourceDir, `${componentSourceAlias}.file.json`) : undefined);

        if (!sourceFile) {
          console.error('Error: No component source file specified');
          console.error('Include **File:** in the manifest header (from `specs audit`) or configure a source alias with `fetch: [file]` in the workspace settings');
          stop(ERROR_CODES.INVALID_ARGS);
        }

        if (!fs.existsSync(sourceFile)) {
          console.error(`Error: Source file not found: ${sourceFile}`);
          if (componentSourceAlias) {
            console.error(`Tip: run \`specs fetch\` to download ${componentSourceAlias}.file.json, or check sources.${componentSourceAlias}.key in your config`);
          } else {
            console.error('Tip: run `specs fetch` to download the source file, or check sources.<alias>.key in your config');
          }
          stop(ERROR_CODES.FILE_ERROR);
        }

        payloadPath = sourceFile;
        // Deferred: the payload loads after component selection, so the
        // sectioned path can assemble a pruned document from just the pages
        // the selected components need (specs#562).

        // `--component` used to apply only in file mode, so asking for one component here
        // silently generated the whole catalogue — a slow surprise, and one that looks like
        // the flag worked. Match on the Figma name, the id, or the formatted key the output
        // is written under, since that is the name a caller has in front of them.
        // `--component` narrows either kind: a caller naming a composition means the
        // composition, and refusing it would make the flag lie about its scope.
        let chosen = [...selectedComponents, ...compositions];
        if (options.component) {
          const wanted = options.component;
          chosen = chosen.filter(c =>
            c.id === wanted || c.name === wanted || formatKey(c.name, config.settings.spec.keys) === wanted);
          if (chosen.length === 0) {
            console.error(`Error: no component named "${wanted}" in the manifest.`);
            const near = [...selectedComponents, ...compositions]
              .map(c => formatKey(c.name, config.settings.spec.keys))
              .filter(k => k.toLowerCase().includes(wanted.toLowerCase()))
              .slice(0, 5);
            if (near.length > 0) {
              console.error('Did you mean:');
              for (const k of near) console.error(`  ${k}`);
            } else {
              console.error(`Tip: ${selectedComponents.length + compositions.length} components and compositions are available — omit --component to generate all of them.`);
            }
            stop(ERROR_CODES.INVALID_ARGS);
          }
        }

        componentIds = chosen.map(c => c.id);
        componentNames = new Map(chosen.map(c => [c.id, c.name]));
        compositionIds = new Set(chosen.filter(c => c.type === 'FRAME').map(c => c.id));

        if (options.verbose) {
          // The payload itself loads after component selection (sectioned path).
          console.log(`[CLI] Payload source: ${path.basename(sourceFile)}`);
        }
      } else {
        // FILE MODE
        if (!options.component) {
          console.error('Error: --component is required when source is a JSON file');
          console.error('Usage: specs generate <file.json> -c <component-name|id>');
          stop(ERROR_CODES.INVALID_ARGS);
        }

        payloadPath = sourcePath;

        if (sourceIsSplitDir) {
          // A page-split payload: its root carries the component maps, which is all
          // `-c` resolution needs. Leaving `libraryJson` unset hands the document to
          // the shared sectioned loader below, which assembles only the pages this
          // component needs — the reason the split layout exists.
          const sectioned = SectionedFile.openDir(sourcePath);
          if (!sectioned) {
            console.error(`Error: ${path.basename(sourcePath)} is a directory but not a page-split payload (no manifest.json).`);
            console.error('Tip: pass a `<alias>.file/` directory written by `specs fetch`, or a single JSON payload.');
            stop(ERROR_CODES.FILE_ERROR);
          }
          const resolved = resolveComponentInSplitRoot(sectioned.root(), options.component);
          if (!resolved) {
            console.error(`Error: no component named or keyed "${options.component}" in ${path.basename(sourcePath)}.`);
            console.error('Tip: `specs scan` lists what the payload holds, with each component\'s node id.');
            stop(ERROR_CODES.INVALID_ARGS);
          }
          componentIds = [resolved.id];
          componentNames = new Map([[resolved.id, resolved.name]]);
          if (options.verbose) {
            console.log(`[CLI] Split payload: ${path.basename(sourcePath)} — ${resolved.name} (${resolved.id})`);
          }
        } else {
          libraryJson = JSON.parse(sourceContent) as Record<string, any>;
          componentIds = [options.component];
          const resolvedName =
            libraryJson.componentSets?.[options.component]?.name ||
            libraryJson.components?.[options.component]?.name ||
            options.component;
          componentNames = new Map([[options.component, resolvedName]]);

          if (options.verbose) {
            console.log(`[CLI] File loaded: ${libraryJson.name || path.basename(sourcePath)}`);
          }
        }
      }

      // ---------------------------------------------------------------
      // Load the payload (manifest mode deferred it): sectioned first —
      // a pruned document assembled from the selected components' pages plus
      // automatic cross-page fault-in — monolithic as the fallback (specs#562).
      // ---------------------------------------------------------------
      if (libraryJson === undefined && payloadPath) {
        const payloadDir = path.dirname(payloadPath);
        const base = path.basename(payloadPath);
        const payloadAlias = base.endsWith('.file.json') ? base.replace(/\.file\.json$/, '')
          : base.endsWith('.file') ? base.replace(/\.file$/, '')
          : null;
        // A directory payload is a split artifact whatever it is named; a file
        // payload may still have one beside it, found by alias.
        const payloadIsDir = fs.existsSync(payloadPath) && fs.statSync(payloadPath).isDirectory();
        const sectioned = payloadIsDir
          ? SectionedFile.openDir(payloadPath)
          : payloadAlias ? SectionedFile.open(payloadDir, payloadAlias) : null;
        if (sectioned) {
          const located = sectioned.locatePagesOfNodeIds(componentIds);
          const unlocated = componentIds.filter(id => !located.has(id));
          if (unlocated.length > 0) {
            // A manifest-selected component missing from the split artifact
            // means it is stale relative to the manifest.
            const detail = `${payloadAlias}.file/ does not contain ${unlocated.length} selected component(s) (${unlocated.slice(0, 3).join(', ')}${unlocated.length > 3 ? ', …' : ''})`;
            const monolithicExists = !payloadIsDir && fs.existsSync(payloadPath);
            if (!monolithicExists) {
              console.error(`Error: ${detail} and no single-file payload exists to fall back to.`);
              console.error('Tip: re-run `specs fetch`, then `specs scan`, so the payload and manifest agree.');
              stop(ERROR_CODES.FILE_ERROR);
            }
            console.warn(`⚠ ${detail} — falling back to the single-file payload. Re-run \`specs fetch\` to refresh the split artifact.`);
          } else {
            const seedIds = [...new Set([...located.values()].map(e => e.id))];
            const assembled = sectioned.assembleDocument(seedIds, options.verbose
              ? f => console.log(`[CLI] fault-in: page "${f.pageName}" (needed for ${f.causedBy})`)
              : undefined);
            libraryJson = assembled.json;
            const { stats } = assembled;
            console.log(`✓ Sectioned read: ${stats.pagesLoaded.length}/${stats.pagesTotal} pages (${seedIds.length} seeded, ${stats.faults.length} faulted in, ${stats.remoteIds.length} remote refs)`);
            if (shadowIngestEnabled() && fs.existsSync(payloadPath)) {
              shadowJson = readJsonPayload(payloadPath);
            }
          }
        }
        if (libraryJson === undefined) {
          libraryJson = readJsonPayload(payloadPath);
        }
      }
      if (libraryJson === undefined) {
        console.error('Error: no payload loaded'); // unreachable: every mode sets or defers
        stop(ERROR_CODES.FILE_ERROR);
        return;
      }

      // ---------------------------------------------------------------
      // Load foundations
      // ---------------------------------------------------------------
      const fileDir = isManifest ? sourceDir : path.dirname(sourcePath);
      const foundationsDir = path.basename(fileDir) === 'foundations'
        ? fileDir
        : path.join(fileDir, 'foundations');

      const variablesPaths = options.variables
        ? [path.resolve(options.variables)]
        : Object.entries(config.settings.data?.sources ?? {})
            .filter(([, s]) => Array.isArray(s.fetch) && s.fetch.includes('variables'))
            .map(([alias]) => path.join(sourceDir, `${alias}.variables.json`))
            .filter(p => p.length > 0);

      const stylesPaths = options.styles
        ? [path.resolve(options.styles)]
        : Object.entries(config.settings.data?.sources ?? {})
            .filter(([, s]) => Array.isArray(s.fetch) && s.fetch.includes('styles'))
            .map(([alias]) => path.join(sourceDir, `${alias}.styles.json`))
            .filter(p => p.length > 0);

      // Auto-discovery fallback for file mode
      const finalVariablesPaths = variablesPaths.length > 0 ? variablesPaths : (isManifest ? [] : [path.join(foundationsDir, 'variables.json')]);
      const finalStylesPaths = stylesPaths.length > 0 ? stylesPaths : (isManifest ? [] : [path.join(foundationsDir, 'styles.json')]);

      if (options.verbose) {
        for (const p of finalVariablesPaths) {
          if (fs.existsSync(p)) {
            console.log(`[CLI] Found variables: ${path.relative(process.cwd(), p)}`);
          }
        }
        for (const p of finalStylesPaths) {
          if (fs.existsSync(p)) {
            console.log(`[CLI] Found styles: ${path.relative(process.cwd(), p)}`);
          }
        }
      }

      const { styles, variables, collections } = await loadFoundations(
        finalVariablesPaths.filter(p => fs.existsSync(p)),
        finalStylesPaths.filter(p => fs.existsSync(p)),
        libraryJson
      );

      if (options.verbose) {
        console.log(`[CLI] Foundations loaded:`);
        console.log(`  Variables: ${variables.size}`);
        console.log(`  Collections: ${collections.size}`);
        console.log(`  Styles: ${styles.size}`);
      }

      // ---------------------------------------------------------------
      // Resolve license
      // ---------------------------------------------------------------
      const licenseKey = options.license || process.env.SPECS_LICENSE_KEY || process.env.ANOVA_LICENSE_KEY;
      const licenseInput: RestLicenseInput | undefined = licenseKey ? { key: licenseKey } : undefined;

      // ---------------------------------------------------------------
      // Process components via batch API
      // ---------------------------------------------------------------
      if (isManifest) {
        console.log(`⏳ Processing ${componentIds.length} components...`);
        console.log('');
      }

      const results = await Components.fromRestApi(
        componentIds,
        libraryJson,
        config.conventions,
        config.settings,
        { styles, variables, collections, author: config.settings.author, generator: CLI_GENERATOR },
        (event: ProgressEvent) => {
          if (!isManifest) {
            // File mode: quiet progress (verbose only)
            if (options.verbose) console.log(`[CLI] ${event.status}: ${event.component}`);
          } else {
            // Manifest mode: per-component progress
            const symbol = event.status === 'error' ? '✗' : event.status === 'success' ? '✓' : '…';
            process.stdout.write(`\r[${event.index + 1}/${event.total}] ${componentNames.get(event.component) || event.component}... ${symbol}`);
            if (event.status !== 'processing') process.stdout.write('\n');
          }
        },
        licenseInput,
      );

      // Shadow mode: rerun the engine on the monolithic payload and diff the
      // emitted specs against the sectioned-path results. Dev-only; deleted at
      // the dual-write flip. (Validates the license a second time.)
      if (shadowJson) {
        const shadowResults = await Components.fromRestApi(
          componentIds, shadowJson, config.conventions, config.settings,
          { styles, variables, collections, author: config.settings.author, generator: CLI_GENERATOR },
          () => {}, licenseInput,
        );
        // metadata.lastUpdated is wall-clock — the one legitimately volatile
        // field (the perf harness normalizes it the same way).
        const stripClock = (value: unknown): unknown =>
          JSON.parse(JSON.stringify(value, (key, v) => (key === 'lastUpdated' ? undefined : v)));
        shadowCompare('generate:results', stripClock(shadowResults), stripClock(results));
      }

      // ---------------------------------------------------------------
      // Hard-fail: wrong-runtime license key → AUTH_ERROR
      // ---------------------------------------------------------------
      if (results.length > 0 && results.every(r => 'error' in r)) {
        const firstError = (results[0] as { name: string; error: string }).error;
        if (firstError.includes('not valid for this runtime')) {
          console.error(`Error: ${firstError}`);
          stop(ERROR_CODES.AUTH_ERROR);
        }
      }

      // ---------------------------------------------------------------
      // Hard-fail: a *provided* key whose validation could not be completed
      // (transient proxy/network failure or rate-limit) must NOT silently fall
      // back to FREE output for a paid run. The transformer maps these states to
      // FREE and proceeds, so without this guard the run would succeed and write
      // free-tier specs under a valid key. Fail loud + retryable instead.
      // (DirectedEdges/specs#119, C1)
      // ---------------------------------------------------------------
      if (licenseKey) {
        const license = LicenseStatus.resolve(results);
        if (license?.status && TRANSIENT_FAILURES.has(license.status)) {
          for (const line of transientFailureLines(license.status)) console.error(line);
          stop(license.status === 'rate-limited' ? ERROR_CODES.RATE_LIMIT : ERROR_CODES.NETWORK_ERROR);
        }
      }

      // ---------------------------------------------------------------
      // Separate successes and errors
      // ---------------------------------------------------------------
      const processedComponents: Array<{ name: string; spec: Record<string, unknown>; kind: SpecKind }> = [];
      const errors: Array<{ component: string; error: string }> = [];

      for (const result of results) {
        if ('component' in result) {
          const displayName = componentNames.get(result.name) || result.name;
          const spec = result.component as Record<string, unknown>;
          processedComponents.push({
            name: displayName,
            spec,
            kind: kindOf(result.name, spec, compositionIds),
          });
        } else {
          const displayName = componentNames.get(result.name) || result.name;
          errors.push({ component: displayName, error: result.error });
        }
      }

      // Display summary for manifest mode
      if (isManifest) {
        console.log('');
        console.log(`✓ Generated specs`);
        console.log(`  - ${processedComponents.length} components successful`);
        if (errors.length > 0) {
          console.log(`  - ${errors.length} components failed`);
          errors.forEach(({ component, error }) => {
            console.log(`    ✗ ${component}: ${error}`);
          });
        }
      }

      // Display license status
      LicenseStatus.display(results, !!licenseKey);

      // Handle file mode errors
      if (!isManifest && errors.length > 0) {
        const msg = errors[0].error;
        if (msg.includes('Component not found') || msg.includes('not found')) {
          console.error(`Error: ${msg}`);
          console.error(`Tip: Use a component name like "DS Alert" or component ID like "123:456"`);
          stop(ERROR_CODES.COMPONENT_NOT_FOUND);
        }
        console.error(`Error: ${msg}`);
        stop(ERROR_CODES.GENERAL_ERROR);
      }

      if (processedComponents.length === 0) {
        console.error('Error: No components were successfully processed');
        stop(ERROR_CODES.GENERAL_ERROR);
      }

      await writeGeneratedOutput(
        processedComponents, errors, isManifest, options, config, payloadPath,
        typeof libraryJson.lastModified === 'string' ? libraryJson.lastModified : undefined
      );

    } catch (error) {
      // A step that already stopped deliberately keeps its own code and its
      // own message — re-reporting it here would print a blank second error.
      if (error instanceof StepError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      if (options.verbose && error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      stop(ERROR_CODES.GENERAL_ERROR);
    }
}


/**
 * Name the spec folders that exist but this run did not write.
 *
 * Reports; never deletes. A folder can be absent from a run for reasons the run
 * cannot distinguish — a component deselected in the manifest on purpose, or specs
 * generated into this directory from another source — so the decision belongs to
 * the customer, not to the generator.
 *
 * The folders this run is responsible for come from what the writer reports it
 * wrote, rather than re-deriving names from components. Those paths carry their
 * nesting, so a subcomponent folder is judged by the same rule as a top-level one.
 */
async function reportUngeneratedSpecs(
  specsDir: string,
  filesWritten: string[],
  format: string,
): Promise<void> {
  if (!(await fs.pathExists(specsDir))) return;

  // The writers report absolute paths despite what WriteResult says, so they are
  // re-based here rather than trusted as relative.
  const written = new Set<string>();
  for (const file of filesWritten) {
    const relative = path.relative(specsDir, path.resolve(file));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) continue;
    const segments = relative.split(path.sep).slice(0, -1).filter(seg => seg && seg !== '.');
    for (let i = 1; i <= segments.length; i++) written.add(segments.slice(0, i).join('/'));
  }
  // Recognising none of this run's output means no basis for judging anything else.
  if (written.size === 0) return;

  const ungenerated: string[] = [];

  const walk = async (relative: string): Promise<void> => {
    const absolute = relative ? path.join(specsDir, relative) : specsDir;
    for (const entry of await fs.readdir(absolute, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (written.has(childRelative)) {
        // Kept, but a subcomponent inside it may not have been written.
        await walk(childRelative);
        continue;
      }
      // An api file is what makes a folder a component spec rather than something
      // the customer keeps here.
      if (await fs.pathExists(path.join(specsDir, childRelative, `api.${format}`))) {
        ungenerated.push(childRelative);
      }
    }
  };
  await walk('');

  if (ungenerated.length === 0) return;

  console.log(
    `Note: ${ungenerated.length} spec ${ungenerated.length === 1 ? 'folder is' : 'folders are'} ` +
      `present but were not generated this run: ${ungenerated.join(', ')}`,
  );
  console.log('  Expected if you deselected them or generate from more than one source. Otherwise they are stale — remove them yourself.');
}
