/**
 * config v1 → v2 (ADR-071)
 *
 * v1 is the single `specs.config.yaml` with `dataDirectory`, `outputDirectory`,
 * `author`, `sources`, `output` and a `config` block. v2 is the three files
 * under `config/`: conventions and settings.
 *
 * This runs from `specs migrate config`, never from the loader. Config loading
 * happens inside read-only commands and in CI, and a read path must not write
 * to a workspace.
 */

import type { SourceEntry } from '@directededges/specs-schema';

/** The split shapes, as authored — unresolved, with absent members omitted. */
export interface MigratedConfig {
  conventions: unknown;
  /** Conventions about the spec itself, written to `config/conventions/specs.yaml` (ADR-073 Decision 4). */
  specsConventions: unknown;
  settings: unknown;
}

/**
 * Map a pre-split config file into the three split shapes, in memory.
 */
export function migrateConfigV1(parsed: unknown): MigratedConfig {
  const raw = (parsed ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const figma: Record<string, any> = {};
  const specsConventions: Record<string, any> = {};
  const spec: Record<string, any> = {};
  const data: Record<string, any> = {};
  const settings: Record<string, any> = {};
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Support deprecated 'sourceDirectory' with warning (predates the split)
  let dataDirectory = raw.dataDirectory;
  if (!dataDirectory && raw.sourceDirectory) {
    console.warn("Warning: 'sourceDirectory' is deprecated, use 'dataDirectory' instead");
    dataDirectory = raw.sourceDirectory;
  }
  if (dataDirectory !== undefined) {
    data.directory = dataDirectory;
  }
  if (raw.outputDirectory !== undefined) {
    spec.directory = raw.outputDirectory;
  }
  if (raw.author !== undefined) {
    settings.author = raw.author;
  }

  // sources -> settings.data.sources, renaming each source's `data` to `fetch`
  if (raw.sources && typeof raw.sources === 'object') {
    const sources: Record<string, SourceEntry> = {};
    for (const [name, entry] of Object.entries(raw.sources as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      const src = entry as Record<string, unknown>;
      const fetch = Array.isArray(src.data) ? src.data : (Array.isArray(src.fetch) ? src.fetch : undefined);
      sources[name] = {
        key: src.key as string,
        ...(fetch && { fetch: fetch as string[] }),
      };
    }
    data.sources = sources;
  }

  // output.{splitComponents,splitConcerns,useSubfolders} -> settings.spec
  //
  // These defaulted to false in v1 and default to true in v2, so an omitted
  // flag meant "off" in the source and would mean "on" in the target. A
  // migration changes where configuration lives, not what a workspace emits,
  // so an omitted flag is written out explicitly as false. Deleting those
  // three lines is how a migrated workspace opts in to the new default.
  const v1Output = (raw.output && typeof raw.output === 'object' ? raw.output : {}) as Record<string, unknown>;
  for (const flag of ['splitComponents', 'splitConcerns', 'useSubfolders'] as const) {
    spec[flag] = v1Output[flag] !== undefined ? v1Output[flag] : false;
  }

  const cfg = (raw.config && typeof raw.config === 'object' ? raw.config : {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  // config.format -> settings.spec (output->format) + conventions.figma.naming
  if (cfg.format && typeof cfg.format === 'object') {
    if (cfg.format.output !== undefined) spec.format = cfg.format.output;
    for (const key of ['keys', 'layout', 'tokens', 'color'] as const) {
      if (cfg.format[key] !== undefined) spec[key] = cfg.format[key];
    }
    if (cfg.format.figmaKeys !== undefined) figma.naming = cfg.format.figmaKeys;
  }

  // config.processing -> settings.spec + conventions.figma
  if (cfg.processing && typeof cfg.processing === 'object') {
    const proc = cfg.processing;
    for (const key of ['variantDepth', 'details', 'collapsePrimitiveWrapper'] as const) {
      if (proc[key] !== undefined) spec[key] = proc[key];
    }
    for (const key of ['subcomponents', 'instanceExamples', 'slotConstraints', 'inferNumberProps'] as const) {
      if (proc[key] !== undefined) figma[key] = proc[key];
    }
    // states classifies props the spec declares, not Figma facts, so it lands in
    // conventions/specs.yaml (ADR-073 Decision 4)
    if (proc.states !== undefined) specsConventions.states = proc.states;
    if (proc.glyphNamePattern !== undefined) {
      figma.glyphs = { match: proc.glyphNamePattern };
    }
    if (proc.codeOnlyPropsPattern !== undefined) {
      figma.codeOnlyProps = { match: proc.codeOnlyPropsPattern };
    }
    if (proc.images && typeof proc.images === 'object') {
      figma.images = {
        ...(proc.images.imageComponent !== undefined && { match: proc.images.imageComponent }),
        ...(proc.images.backgroundImage !== undefined && { backgroundImage: proc.images.backgroundImage }),
        ...(proc.images.sourceProps !== undefined && { sourceProps: proc.images.sourceProps }),
      };
    }
  }

  // config.include -> settings.spec
  if (cfg.include && typeof cfg.include === 'object') {
    for (const key of ['invalidVariants', 'invalidCombinations', 'emptyVariants', 'defaultSlotContent'] as const) {
      if (cfg.include[key] !== undefined) spec[key] = cfg.include[key];
    }
  }

  // `config.transformers` is dropped rather than carried: a transformer pipeline
  // stopped being a thing to configure once each target emitted everything it
  // needs. `specs react` and `specs webcomponents` replace it.
  if (cfg.transformers !== undefined) {
  }

  if (Object.keys(data).length > 0) settings.data = data;
  if (Object.keys(spec).length > 0) settings.spec = spec;

  return {
    // The Figma platform's entry BODY, not a `{ figma }` wrapper: it is written to
    // config/conventions/figma.yaml, where the filename is the platform id (ADR-078).
    conventions: Object.keys(figma).length > 0 ? figma : undefined,
    specsConventions: Object.keys(specsConventions).length > 0 ? specsConventions : undefined,
    settings: Object.keys(settings).length > 0 ? settings : undefined,
  };
}

