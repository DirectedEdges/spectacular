import type { ResolvedPlatformConventions, SpecsConventions } from '@directededges/specs-schema';
import type { ProcessingStates } from '../transforms/states.js';
import type { SpecKind } from '../utilities/specsLayout.js';

export interface TransformerContext {
  /**
   * Absolute path to the component's **spec** folder — where `api.yaml`,
   * `variants.yaml` and `examples.yaml` are read from, and where subcomponent
   * spec folders nest. Read-only input.
   */
  specDir: string;
  /**
   * Absolute path this transformer writes this component's output to.
   *
   * Equal to `specDir` for a transformer that emits beside the spec. A
   * transformer declaring an `outputTree` is given a path inside that tree
   * instead, so its output is separable from the spec that produced it
   * (project 024).
   */
  outputDir: string;
  /** Absolute path to the workspace root — the parent of `specs/`. */
  workspaceDir: string;
  /**
   * Absolute path to the `specs/` directory this run read from (ADR-096).
   *
   * Handed over rather than climbed to. An emitter used to find it by walking up a
   * fixed number of levels from its own output directory, which is correct for
   * exactly one output depth — and compositions emit at a second.
   */
  specsRoot: string;
  /**
   * What the spec being emitted describes (ADR-096): a reusable `component`, or a
   * `composition` that arranges components. Decides the emitted directory, the
   * Storybook nav group, and whether a sticker sheet is emitted at all.
   */
  kind: SpecKind;
  /** camelCase component folder name (e.g. `dsButton`). */
  componentKey: string;
  /** Token format from config.format.tokens. Drives CSS variable resolution. */
  tokensFormat: string;
  /** Output format from config.format.output. Drives file extension and serialization for analyzers. */
  outputFormat: 'JSON' | 'YAML';
  /**
   * The full token universe from the fetched variables/styles data, when those
   * files exist. The same maps `finalize` receives — handed to `run` as well
   * because under a name-shaped `tokensFormat` a style value carries only the
   * token's name, and the universe is the only thing that distinguishes such a
   * reference from a literal like `CENTER`.
   */
  foundations?: AnalyzerFoundations;
  /** Semantic state concept map from `conventions.specs.states`. */
  processingStates?: ProcessingStates;
  /**
   * The prop conventions from `config/conventions/specs.yaml` that role emission
   * consumes (ADR-067; located by ADR-073 Decision 4): which prop supplies an
   * accessible name (`accessibility.label`) and which props describe a value
   * (`value`). They name props the *spec* declares, so they are handed to every
   * transform rather than arriving on the target platform's own conventions.
   * The file's `states` member arrives as `processingStates`, not here.
   */
  specs?: Pick<SpecsConventions, 'accessibility' | 'value'>;
  /** Raw options from the matching config.transformers entry (everything except `name`). */
  transformerOptions?: Record<string, unknown>;
  /** Absolute path to the workspace data directory (fetched library JSON), when configured. */
  dataDirectory?: string;
  /**
   * True when the run was narrowed with `--components`. Library-level
   * transforms use this to skip whole-library work that a scoped run cannot
   * have invalidated.
   */
  scoped?: boolean;
  /**
   * The conventions of the platform this transformer emits for (ADR-073), from
   * `config/conventions/<platform>.yaml`. Carries `primitives` — which component
   * means text, glyph or container here.
   *
   * Absent, or absent of `primitives`, means this platform declares no bindings and
   * elements emit as host elements exactly as before.
   */
  platform?: ResolvedPlatformConventions;
}

/**
 * Structural subset of the foundations maps produced by loadFoundations().
 * Gives analyzers the full token universe (variables, collections, styles)
 * without depending on @directededges/specs-from-figma types.
 */
export interface AnalyzerFoundations {
  variables: Map<string, { name: string; variableCollectionId: string; resolvedType?: string }>;
  collections: Map<string, { name: string }>;
  styles: Map<string, { id: string; name: string; type: string }>;
}

export interface Transformer {
  readonly name: string;
  /**
   * The `conventions.platforms` key this transformer reads (ADR-073 Decision 3).
   * Fixed by the transformer, not configured: React and Web Components are peer
   * implementations with different vocabularies, so each names its own key.
   */
  readonly platformId?: string;
  /**
   * The workspace tree this transformer writes into — `react`, `webcomponents`,
   * `assets`. Absent means it emits beside the spec, which is where everything
   * wrote before project 024.
   *
   * Fixed by the transformer, not configured, for the same reason `platformId`
   * is: where a transformer's output belongs is a property of what it emits.
   */
  readonly outputTree?: string;
  /**
   * Which kinds of spec this reads (ADR-096). Absent means components only, which is
   * the conservative default — a transform that has not considered compositions does
   * not silently receive them.
   *
   * What a composition can contribute differs per analysis: it composes components
   * and it carries styling, but it declares no props and no variants. So the two
   * dependency and styling analyses read both kinds, and the prop and key analyses
   * stay component-only rather than being padded with rows that are empty by
   * construction.
   */
  readonly readsKinds?: readonly SpecKind[];
  /**
   * Basename of the file this transformer writes into **each component's own
   * folder**, without extension — the extension follows the run's output format.
   *
   * Declared so the command can name these files in its completion output.
   * A transformer whose only output is an aggregate report leaves this unset;
   * one that writes beside every component sets it, because a file appearing in
   * a component folder that no command mentioned reads as corruption.
   */
  readonly perComponentOutput?: string;

  run(apiYaml: Record<string, unknown>, context: TransformerContext): Promise<void>;
  /** Called once after all components have been processed. Use for cross-component aggregate output. */
  finalize?(outputDir: string, analysisDir?: string, foundations?: AnalyzerFoundations): Promise<void>;
}
