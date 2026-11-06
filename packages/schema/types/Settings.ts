/**
 * Color value output format.
 *
 * Controls how `ColorObject` objects are serialized in the spec output.
 * `HEXA` (default) emits an 8-digit hex string carrying alpha. `HEX` emits a
 * 6-digit hex string. `OBJECT` emits the full `ColorObject` object. All other
 * values emit a formatted color string in the named notation.
 *
 * Tier 1 — Figma UI formats: `HEX`, `HEXA`, `RGB`, `RGBA`, `HSLA`, `HSB`
 * Tier 2 — Modern CSS (Level 4): `OKLCH`, `OKLAB`
 * Tier 3 — Structured object: `OBJECT`
 *
 * @since 0.20.0
 */
export type ColorFormat = 'HEX' | 'HEXA' | 'RGB' | 'RGBA' | 'HSLA' | 'HSB' | 'OKLCH' | 'OKLAB' | 'OBJECT';

/**
 * A source the workspace reads from, keyed by source name.
 *
 * @since 0.31.0
 */
export interface SourceEntry {
  /** Figma file key the source reads from. */
  key: string;
  /** Artifacts to download for this source (e.g. `file`, `variables`, `styles`, `icons`). */
  fetch?: string[];
}

/**
 * Choices about a run rather than facts about a library.
 *
 * Changing a setting produces **different** output, never incorrect output: a
 * different team reading the same library may set every one of these differently
 * and each result is correct. Members are grouped by concern — `curation`, `data`,
 * `spec`, `assets` — and each concern that owns a location carries its own
 * `directory`.
 *
 * @since 0.31.0
 */
export interface Settings {
  /** Author recorded in generated spec metadata. */
  author?: string;
  /**
   * Which components of a library a run produces specs for (ADR-093).
   *
   * A library holds more than a team consumes. Curation is the step that decides
   * which of its components are worth a spec, recorded in a manifest a human can
   * edit. These members state how that decision is derived, how it survives a later
   * pass, and how far it reaches.
   *
   * @since 0.35.0
   */
  curation?: {
    /**
     * The signal a first pass derives selection from.
     *
     * `READY_FOR_DEV` selects the components the library marks ready, and selects
     * every component set and standalone component when the library marks none —
     * a library that does not use the signal is not curated down to nothing. `ALL`
     * selects every component regardless of marking. Optional; defaults to
     * `READY_FOR_DEV`.
     */
    defaultSelection?: 'READY_FOR_DEV' | 'ALL';
    /**
     * Whether a hand-edited selection outranks a later change to the library's signal.
     *
     * A selection is recorded so a human can correct it, and the library keeps moving
     * underneath that record. When false, a component whose signal changed takes the
     * new signal, overriding an edit. When true, the edit stands. A component whose
     * signal did not change keeps its recorded selection either way. Optional;
     * defaults to true.
     */
    preserveManualSelections?: boolean;
    /**
     * Whether the components a selected component is built from are selected too,
     * transitively.
     *
     * Derived selection is incomplete on its own: a component marked ready is built
     * from others that carry no marking, because a part is not separately consumed.
     * Selecting only what is marked therefore omits what the selection needs, and
     * produces specs referencing specs that were never written.
     *
     * What counts as being built from something is a convention, not a setting — a
     * component specced inside its parent is unaffected either way. Optional;
     * defaults to true.
     */
    includeDependencies?: boolean;
  };
  /** Source acquisition: what to fetch, and where fetched artifacts, computed caches, and extracted assets are kept. */
  data?: {
    /** Directory holding fetched downloads, computed caches, extracted assets, and authored inputs. */
    directory?: string;
    /** Sources the workspace reads from, keyed by source name. */
    sources?: Record<string, SourceEntry>;
  };
  /** The generated spec: where it lands, how it is split, what it contains, and how values are serialized. */
  spec?: {
    /** Directory the generated spec is written to. */
    directory?: string;
    /** Serialization format. Optional; defaults to YAML. */
    format?: 'JSON' | 'YAML';
    /**
     * Key naming convention applied to anatomy keys, prop keys, and every reference
     * to them. Every value other than SAFE is a lossy projection of the Figma name;
     * names outside the safe key grammar are preserved in `$extensions['com.figma'].name`.
     * Optional; defaults to CAMEL.
     */
    keys?: 'SAFE' | 'CAMEL' | 'SNAKE' | 'KEBAB' | 'PASCAL' | 'TRAIN';
    /** Layout representation format. Optional; defaults to LAYOUT. */
    layout?: 'LAYOUT' | 'PARENT_CHILDREN' | 'BOTH';
    /**
     * Read Figma Dev Mode annotations and emit `anatomy.<element>.role` (ADR-067).
     * The on-switch for the role feature: when false, annotations are not read and
     * no role is emitted, so generation behaves exactly as it does today.
     * Optional; defaults to false.
     * @since 0.32.0
     */
    roles?: boolean;
    /**
     * Severity for unmet required role obligations — most commonly a control with
     * no source for its accessible name (ADR-067).
     *
     * A setting rather than a convention: it describes how strict a run should be,
     * which is a fact about neither the design tool nor the target. It sits beside
     * `roles` because it tunes the same feature — with `roles` off there is nothing
     * to validate. `warn` emits a diagnostic and continues; `error` fails the
     * transform. Optional; defaults to `warn`. Conflicts — two elements claiming one
     * part, two value-bearing controls — are errors regardless.
     * @since 0.32.0
     */
    roleValidation?: 'warn' | 'error';
    /**
     * Token reference serialization profile. Optional; defaults to TOKEN.
     * `FIGMA_SYNTAX_WEB`, `FIGMA_SYNTAX_IOS`, and `FIGMA_SYNTAX_ANDROID` emit the
     * token's Figma `codeSyntax` for that platform, falling back to the `TOKEN`
     * profile's output when no code syntax is defined for the platform. @since 0.21.0
     */
    tokens?: 'TOKEN' | 'TOKEN_NAME' | 'TOKEN_FIGMA_EXTENSIONS' | 'FIGMA_NAME' | 'CUSTOM' | 'FIGMA_SYNTAX_WEB' | 'FIGMA_SYNTAX_IOS' | 'FIGMA_SYNTAX_ANDROID';
    /** Color value output format. Optional; defaults to HEXA. @since 0.20.0 */
    color?: ColorFormat;
    /** Depth of variant expansion: 1-3 or 9999 for unlimited. Optional; defaults to 9999. */
    variantDepth?: 1 | 2 | 3 | 9999;
    /** Level of detail in output. Optional; defaults to LAYERED. */
    details?: 'FULL' | 'LAYERED';
    /**
     * When true, a root container that only wraps one child is collapsed away, and the
     * child becomes the spec root. Two shapes qualify, and they are tested differently
     * because they lose different things:
     *
     * - **A `text` or `glyph` leaf** (ADR-058). A container is merged into a leaf, where
     *   container styles have nowhere to go, so the wrapper must carry none that matter:
     *   `clipContent`, `cornerRadius`, `strokes`, `strokeAlign`, `strokeWeight`,
     *   `itemSpacing`, `padding`, `effects`, `backgroundColor`, `cornerSmoothing`.
     * - **A `slot`** (ADR-083). Both nodes are containers with the same style signature,
     *   so the merge discards nothing and no style is tested. Where both carry a key, the
     *   slot's value wins — it is the box the children sit in — and the slot binding moves
     *   onto the root.
     *
     * All-or-nothing across variants: if any variant fails eligibility, no collapse
     * occurs. Defaults to true.
     *
     * @since 0.26.0
     */
    collapsePrimitiveWrapper?: boolean;
    /**
     * Primitive layers in composed example content are promoted to instances of the
     * design system's own components, using `Conventions.primitives` (ADR-074).
     *
     * A component's own anatomy is never promoted — someone who put a text layer there
     * chose a text layer. Only `slotContentExamples` and `instanceExamples` are affected.
     *
     * Opt-in: promotion restructures composed content, so a workspace elects it rather
     * than receiving it on upgrade. Optional; defaults to false.
     *
     * @since 0.32.0
     */
    promotePrimitives?: boolean;
    /** Include invalid variants. Optional; defaults to false. */
    invalidVariants?: boolean;
    /** Include invalid combinations. Optional; defaults to true. */
    invalidCombinations?: boolean;
    /** Include layered variants that contain no elements. Optional; defaults to false. */
    emptyVariants?: boolean;
    /** Include slot content examples in output (ADR-050). Optional; defaults to false. @since 0.21.0 */
    defaultSlotContent?: boolean;
    /** Write one file per component rather than a single combined library file. Optional; defaults to true. */
    splitComponents?: boolean;
    /** Write one file per concern (api, styling, variants) rather than a single component file. Optional; defaults to true. */
    splitConcerns?: boolean;
    /** Nest each component's files in a subfolder named for the component. Optional; defaults to true. */
    useSubfolders?: boolean;
  };
  /** Shared resources every code output points at, whatever the platform: icons, images, generated CSS, fonts. */
  assets?: {
    /** Directory holding shared assets. */
    directory?: string;
  };
}

/**
 * Fully-resolved settings with every defaultable property guaranteed present.
 * Produced by merging a partial `Settings` with `DEFAULT_SETTINGS`.
 *
 * Rule: every property with a default in `DEFAULT_SETTINGS` is required here.
 * Members with no schema-level default — directories, sources, author, and the
 * split flags — remain optional, because the value is supplied by the consumer
 * rather than by this package.
 *
 * @since 0.31.0
 */
export interface ResolvedSettings {
  /** Author recorded in generated spec metadata. */
  author?: string;
  /** Which components of a library a run produces specs for. */
  curation: {
    /** The signal a first pass derives selection from. */
    defaultSelection: 'READY_FOR_DEV' | 'ALL';
    /** A hand-edited selection outranks a later change to the library's signal. */
    preserveManualSelections: boolean;
    /** The components a selected component is built from are selected too, transitively. */
    includeDependencies: boolean;
  };
  /** Source acquisition settings. */
  data?: {
    directory?: string;
    sources?: Record<string, SourceEntry>;
  };
  /** The generated spec. */
  spec: {
    directory?: string;
    /** Serialization format. */
    format: 'JSON' | 'YAML';
    /** Key naming convention. */
    keys: 'SAFE' | 'CAMEL' | 'SNAKE' | 'KEBAB' | 'PASCAL' | 'TRAIN';
    /** Layout representation format. */
    layout: 'LAYOUT' | 'PARENT_CHILDREN' | 'BOTH';
    /** Token reference serialization profile. */
    tokens: 'TOKEN' | 'TOKEN_NAME' | 'TOKEN_FIGMA_EXTENSIONS' | 'FIGMA_NAME' | 'CUSTOM' | 'FIGMA_SYNTAX_WEB' | 'FIGMA_SYNTAX_IOS' | 'FIGMA_SYNTAX_ANDROID';
    /** Color value output format. */
    color: ColorFormat;
    /** Depth of variant expansion. */
    variantDepth: 1 | 2 | 3 | 9999;
    /** Level of detail in output. */
    details: 'FULL' | 'LAYERED';
    /** Plain container wrappers around a single text, glyph or slot child are stripped. */
    collapsePrimitiveWrapper: boolean;
    /** Primitive layers in composed example content are promoted to design system component instances. */
    promotePrimitives: boolean;
    /** Dev Mode annotations are read and emitted as `anatomy.<element>.role`. */
    roles: boolean;
    /** Severity for unmet required role obligations. */
    roleValidation: 'warn' | 'error';
    /** Include invalid variants. */
    invalidVariants: boolean;
    /** Include invalid combinations. */
    invalidCombinations: boolean;
    /** Include layered variants that contain no elements. */
    emptyVariants: boolean;
    /** Include slot content examples in output. */
    defaultSlotContent: boolean;
    /** Write one file per component rather than a single combined library file. */
    splitComponents: boolean;
    /** Write one file per concern (api, styling, variants) rather than a single component file. */
    splitConcerns: boolean;
    /** Nest each component's files in a subfolder named for the component. */
    useSubfolders: boolean;
  };
  /** Shared resources every code output points at. */
  assets?: {
    directory?: string;
  };
}

/**
 * Default Settings
 *
 * Used by both CLI and Plugin to ensure identical behavior with same settings.
 *
 * Rationale for defaults:
 * - spec.format: YAML is the format a spec is read and hand-edited in (ADR-112)
 * - spec.keys: CAMEL is the casing every code consumer of a spec already uses (ADR-112)
 * - spec.layout: LAYOUT provides tree structure with layout properties
 * - spec.tokens: TOKEN provides platform-neutral token references with $token path and $type
 * - spec.color: HEXA carries alpha, so a translucent color survives the round trip (ADR-112)
 * - spec.variantDepth: 9999 (no limit) allows full variant combination exploration
 * - spec.details: LAYERED reduces output size by only showing differences from default
 * - spec.collapsePrimitiveWrapper: true — a wrapper around one child is noise in every
 *   consumer, and eligibility already withholds the collapse where it would lose a style
 *   (ADR-112)
 * - spec.promotePrimitives: false — opt-in; promotion restructures composed content
 * - spec.invalidVariants: false excludes variants that can't be instantiated
 * - spec.invalidCombinations: true helps designers identify property conflicts
 * - spec.emptyVariants: false reduces output size by excluding semantically empty layered variants
 * - spec.defaultSlotContent: false — opt-in (ADR-050); off by default so unannotated components are unchanged
 * - curation.defaultSelection: READY_FOR_DEV — a library that marks readiness is stating what it
 *   wants consumed; one that marks nothing falls back to every set and standalone component
 * - curation.preserveManualSelections: true — a selection is recorded so a human can correct it,
 *   and a correction the next pass discards was not worth recording (ADR-112)
 * - curation.includeDependencies: true — a selection that omits what it is built from produces
 *   specs referencing specs that were never written
 *
 * Directories, sources, author, and the split flags carry no default here: the
 * consumer supplies them, and this package has no basis for choosing one.
 */
export const DEFAULT_SETTINGS: ResolvedSettings = {
  curation: {
    defaultSelection: 'READY_FOR_DEV',
    preserveManualSelections: true,
    includeDependencies: true,
  },
  spec: {
    format: 'YAML',
    keys: 'CAMEL',
    layout: 'LAYOUT',
    tokens: 'TOKEN',
    color: 'HEXA',
    variantDepth: 9999,
    details: 'LAYERED',
    collapsePrimitiveWrapper: true,
    promotePrimitives: false,
    roles: false,
    roleValidation: 'warn',
    invalidVariants: false,
    invalidCombinations: true,
    emptyVariants: false,
    defaultSlotContent: false,
    splitComponents: true,
    splitConcerns: true,
    useSubfolders: true,
  },
};
