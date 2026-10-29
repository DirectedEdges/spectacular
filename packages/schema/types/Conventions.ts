import type { PropConfigurations } from './PropConfigurations.js';

/**
 * Classifies a Figma variant prop as a semantic state concept for deterministic
 * use by transformers and plugin output.
 *
 * The map key is the concept name (e.g. `hover`, `disabled`, `focus-within`).
 * `prop` names the Figma variant prop; `value` is the enum value that activates
 * the concept (defaults to `"true"` for boolean props). `contract` overrides the
 * concept's canonical browser-driven / consumer-controlled default — rarely needed.
 *
 * @since 0.24.0
 */



export interface VariantStateEntry {
  /** Figma variant prop name (e.g. `state`, `isDisabled`, `focused`). */
  prop: string;
  /**
   * Figma variant value that activates this concept (e.g. `"hover"`, `"pressed"`).
   * Omit for boolean props — defaults to `"true"`.
   */
  value?: string;
  /**
   * Contract generation behavior override.
   * - `'omit'` — browser-driven state; exclude this prop from generated Props interfaces.
   * - `'keep'` — consumer-controlled state; retain this prop in generated Props interfaces.
   * When absent, the concept's canonical default applies (omit for pseudo-class concepts,
   * keep for ARIA-attribute concepts).
   */
  contract?: 'omit' | 'keep';
}

/**
 * The spec element types that can be promoted to a design system component.
 *
 * A closed vocabulary, and a strict subset of `ElementType`: every kind's trigger is
 * the element's own declared `type`, so nothing is inferred and no kind can fail to
 * correspond to something a spec contains. A misspelled kind is a validation error
 * rather than a silently-ignored key. Widening the set later is additive.
 *
 * An image is deliberately absent — it is a paint on an element that is already
 * something else, not a kind of node, so it is bound through `images.component`
 * instead (ADR-077).
 *
 * @since 0.32.0
 */
export type PrimitiveKind = 'text' | 'glyph' | 'container';

/**
 * One rule turning something a captured layer carries into props on the component it
 * promotes to.
 *
 * `source` names what is read. The honoured set is closed per {@link PrimitiveKind} and
 * is documented rather than enumerated in the schema, so that the validation surface does
 * not track the `Styles` key set and renaming a style member does not churn a conventions
 * file:
 *
 * - `text` — `typography`, `typography.fontSize`, `typography.fontFamily`,
 *   `typography.fontStyle`, `textColor`, `content`
 * - `glyph` — `width`, `height`, `fillColor`, `content`
 * - `container` — `layoutMode`, `itemSpacing`, `padding`, `mainAxisAlignment`,
 *   `crossAxisAlignment`, `wrap`, `wrapAlignment`
 *
 * The container set follows one principle (ADR-090): a member qualifies when its
 * authored value space is **closed** — a structural enum, or a value drawn from a finite
 * scale the library authors with (a token collection, a fixed set of raw scalars) — so a
 * `values` table can enumerate it literally. A value that is genuinely continuous in a
 * library (a measured width, an arbitrary pixel gap) has no closed vocabulary, matches
 * no key, and stays styling. Whether a member is closed is a fact about the library's
 * authoring discipline, and the table author owns that judgement exactly as they own
 * every `values` key. For `layoutMode`, an absent or `null` value matches a `NONE` key —
 * a frame with no auto-layout is what `NONE` means.
 *
 * The dotted typography sources address inside the `Typography` composite.
 * `Styles.typography` is `TokenReference | Typography`, so a layer wearing a text style
 * carries the token and a layer styled ad hoc carries the composite: `typography` and the
 * `typography.*` sources can never both resolve, and declaring both is how one entry
 * serves either authoring style.
 *
 * Exactly one of `prop` and `values` is given. A source outside the honoured set, or one
 * the element does not carry, simply does not resolve — its value stays in `styles` and
 * reaches output as passed styling.
 *
 * @since 0.32.0
 */
export interface PrimitiveRule {
  /** What is read from the captured layer — a `Styles` member, a dotted path into `typography`, or `content`. */
  source: string;
  /** The prop this source's value is written to, as-is. Mutually exclusive with `values`. */
  prop?: string;
  /**
   * Literal lookup from what the source carries to the props it writes.
   *
   * A key is a full token path (`"Color/Critical"`) or a raw scalar (`16`) — never a
   * fragment, and never matched partially. The value is the props that key produces, so
   * one source may write several props at once, and a source may reach a prop whose
   * meaning differs from its own (a fill colour producing an intent enum).
   *
   * Mutually exclusive with `prop`.
   */
  values?: Record<string, PropConfigurations>;
}

/**
 * One component a captured primitive layer can be promoted to, and how its styles become
 * that component's props.
 *
 * Promotion runs during capture, over composed example content only (ADR-074). Several
 * entries may share an `elementType`: a design system with a text, a heading and a body
 * component is three entries, and selection between them is by one of two rules.
 *
 * A declared `match` selects by **name** and takes precedence: where it resolves, that
 * entry is selected immediately, no score is computed, and no rule in `map` need resolve
 * (ADR-100). Otherwise selection is by **score** — how many of an entry's rules resolve
 * against the element — and at least one must, so `elementType` alone never promotes.
 *
 * The target need not itself be a primitive. `elementType` describes the layer shape a
 * promotion starts *from*, not the component it lands on: a component with its own
 * internal anatomy is a legitimate target for a single drawn layer.
 *
 * @since 0.32.0
 */
export interface PrimitiveEntry {
  /**
   * The anatomy element type this component can be promoted from.
   *
   * Named for `ElementType`, the superset it draws from, so a reader recognises the
   * vocabulary rather than learning a second word for it.
   */
  elementType: PrimitiveKind;
  /**
   * Layer-name prefixes selecting this entry, within the entries whose `elementType`
   * matches the element.
   *
   * A name matches when the captured layer's name **starts with** one of these strings —
   * exact and case-sensitive, with no trimming or normalisation, and nothing read out of
   * the name. A prefix rather than a whole name because composed content holds many layers
   * of one kind distinguished by suffix: `Section 1`, `Section 2`, `Section 3` are all a
   * `Section`.
   *
   * An array so a library mid-rename can name both of its conventions (`DS Section` and
   * `Section`). Where several entries match, the **longest** matching prefix wins — so a
   * `Section Header` entry outranks a `Section` one — and selection never depends on the
   * authored order of a keyed map. Two entries declaring the same string is a table defect,
   * resolved to the first in authored order with a warning naming both components.
   *
   * Optional; absence means this entry is selected by score (ADR-100).
   *
   * @since 0.35.0
   */
  match?: string[];
  /**
   * The rules turning the layer's styles into this component's props, in precedence
   * order. When two rules write the same prop, the first that resolves wins.
   *
   * May be empty for an entry selected by `match` whose every prop is a default: the
   * entry still promotes, and styling no rule mapped reaches output through the
   * platform's `stylesProp` as it otherwise would.
   */
  map: PrimitiveRule[];
}

/**
 * Facts about one platform's library — how it is authored, and what it calls things.
 *
 * One shape for every platform, with every member optional. Two groups of member live
 * in it:
 *
 * - **Encoding** — `naming`, `glyphs`, `codeOnlyProps`, `subcomponents`,
 *   `instanceExamples`, `images.backgroundImage`, `images.sourceProps`,
 *   `slotConstraints`, `inferNumberProps`, `slotPrimitives`. These say how this platform
 *   expresses something the spec models explicitly. A Figma library has no first-class
 *   notion of a subcomponent, so it encodes one in a layer-name pattern.
 * - **Vocabulary** — `stylesProp`, `images.match`, `images.component`. These say which of
 *   this platform's components implements a spec concept, and how it is authored.
 *
 * Neither group belongs to a direction or to a platform: a name pattern is decoded when
 * reading a platform's artifacts and applied when writing them, and knowing which prop
 * carries passed styling is required to read a platform into a spec as much as to write
 * it out. The shape is deliberately permissive — nothing stops a code
 * platform declaring `states` — because discriminating by key would type `figma`
 * differently from every other key, which is the special case the platform map removes.
 *
 * Absence of a member means this platform declares no such convention, and the
 * capability it enables does not apply. There is no separate on-switch.
 *
 * @since 0.32.0
 */
export interface PlatformConventions {
  /**
   * Naming convention this platform uses for layer names and component property names —
   * the reversal target for `Settings.spec.keys`. A renderer reconstructs a name by
   * re-formatting the spec key into this convention.
   *
   * NONE declares no convention: the safe key grammar is not evaluated and reversal is
   * undefined, so a key is handed back unchanged as the name. `$extensions['com.figma'].name`
   * is therefore recorded wherever formatting changed the name, since nothing can
   * re-derive it. Optional; defaults to NONE inside a declared platform entry.
   */
  naming?: 'NONE' | 'SENTENCE' | 'TITLE';
  /**
   * Glyph content assets. Optional; absence means no glyph convention and glyphs are not
   * detected. A declared block must carry at least one form — `match`, `structure`, or
   * both; membership is the union (a component matching either form is a glyph).
   */
  glyphs?: {
    /**
     * Name form — membership and naming in one pattern over the component name, using the
     * `{i}` icon-name placeholder (e.g. `"DS Icon Glyph / {i}"`). Optional since 0.35.0;
     * a library may declare `structure` alone (ADR-103).
     */
    match?: string;
    /**
     * Structural form — membership from the component's child structure, naming from the
     * component name (ADR-103). For libraries whose glyph components are plainly named
     * and carry no name pattern.
     *
     * @since 0.35.0
     */
    structure?: GlyphStructure;
  };
  /** The code-only props container layer. Optional; absence means no such convention and code-only props are not extracted. */
  codeOnlyProps?: {
    /** Literal layer name identifying the container (e.g. `"Code only props"`). */
    match: string;
  };
  /** Subcomponent organization and naming. Optional; absence means no subcomponent convention. */
  subcomponents?: {
    /** Where this platform keeps subcomponents. NESTED = anatomy only (default); PAGE = also the Figma page. */
    scope?: 'NESTED' | 'PAGE';
    /** Naming patterns identifying subcomponents, using `{C}` (component name) and `{S}` (subcomponent name) placeholders. */
    match: string[];
    /** Naming patterns for matched assets this platform excludes. Same `{C}`/`{S}` syntax as `match`. */
    exclude?: string[];
  };
  /** Instance example organization and naming (ADR-050). Optional; absence means no such convention. */
  instanceExamples?: {
    /** Where this platform keeps instance examples. PAGE = current Figma page (default); FILE = all pages. */
    scope?: 'PAGE' | 'FILE';
    /** Naming patterns narrowing which instance frames qualify, using the `{C}` placeholder. Absence = every in-scope instance qualifies. */
    match?: string[];
    /** Naming patterns for frames this platform excludes. Same `{C}` syntax as `match`. */
    exclude?: string[];
    /** Immediate-parent frame or section names a candidate must sit within. Absence = no parent-name filtering. */
    parentNames?: string[];
  };
  /** How this platform expresses images (ADR-063, ADR-077). Optional; absence means no image convention. */
  images?: {
    /**
     * Encoding. This platform expresses images as container fills, emitted as
     * `Styles.backgroundImage`. A container's `backgroundImage` is always passed
     * styling and never a primitive trigger. Optional; defaults to false.
     */
    backgroundImage?: boolean;
    /**
     * Vocabulary. The Figma name of the designated image component (e.g. `"DS Image"`).
     * Requires a non-empty `sourceProps`.
     */
    match?: string;
    /**
     * Vocabulary. The same component's name on this platform (e.g. `"DsImage"`) — the
     * translation target for a `match` declared by whichever platform produced the spec.
     * It is not validated against that name; an unmatched `component` is inert.
     */
    component?: string;
    /**
     * Encoding. Code-only prop names (raw Figma names) carrying image sources. The FIRST
     * entry is the designated component's own source prop — the forwarding target.
     */
    sourceProps?: string[];
  };
  /** This platform authors slot constraints (anyOf, minChildren, maxChildren) as code-only props, to be consolidated into the slot property. Optional; defaults to false. @since 0.14.0 */
  slotConstraints?: boolean;
  /** This platform authors numeric props as Figma `TEXT` props whose default and examples parse as valid numbers, to be emitted as NumberProp rather than StringProp. Optional; defaults to false. */
  inferNumberProps?: boolean;
  /**
   * This platform's slots carry the primitives they accept in their default content. A
   * slot whose default content includes a top-level primitive of a given kind — in at
   * least one variant — is emitted with the matching `PrimitiveSlotContent` marker in its
   * `anyOf` (`'$text'`, `'$glyph'`), *where that `anyOf` already names at least one
   * component*; a slot whose detected content is primitives alone emits no `anyOf`, since
   * `anyOf` is a constraint and a marker widens one rather than creating it. The first
   * top-level primitive of each kind supplies that kind's entry in the slot element's
   * `contentStyles`, which is captured either way. Those primitives are not emitted as
   * anatomy elements.
   *
   * Optional; **defaults to true.** A slot containing a text layer does accept text
   * content on every code platform, so a false default would default to describing those
   * slots inaccurately. The failure modes are asymmetric: with the reading on, a leftover
   * placeholder gains a marker that is visible in the spec and correctable; with it off,
   * slots are silently under-described and nobody sees what is missing. Set `false` to
   * turn the reading off.
   *
   * The distinction it reads is authored: a slot holding a primitive is the composable
   * case, a `TEXT` prop on a text layer is the plain-string one (ADR-102).
   *
   * Named for its subject beside `slotConstraints`, and for the engine's
   * `SlotPrimitives` collaborator.
   * @since 0.39.0
   */
  slotPrimitives?: boolean;
  /**
   * Encoding. This platform authors object-prop members as separator-delimited flat
   * property names (e.g. `margin.compact`, `margin.expanded`), to be folded into one
   * `ObjectProp` (ADR-111). Optional; absence means no folding — a property name
   * containing the separator stays a flat prop.
   * @since 0.39.0
   */
  objectProps?: {
    /** The member-name separator in flat property names. Optional; defaults to `"."`. */
    separator?: string;
  };
  /**
   * Prop that receives styling no promotion mapped, for every promoted component on this
   * platform (e.g. `sx`, `style`, `modifier`). A **name only** — what is placed in it is
   * the generator's decision (Constitution II).
   * Optional; absence means unmapped styling has nowhere to go and is dropped.
   *
   * @since 0.32.0
   */
  stylesProp?: string;
  /**
   * Width in pixels of the container this platform places a component in when the
   * component's root resizes to fill its parent — a rendered Figma frame, a generated
   * story canvas.
   *
   * Applies **only** when the root's `layoutSizingHorizontal` is `FILL`. A root with a
   * fixed or hugging width already states its width and is unaffected, so this can never
   * override what a design declares. The number is the container's width, not the
   * instance's.
   *
   * Optional, and with no default at any level: absence means this platform declares no
   * width, and the rendering tool falls back to its own value.
   *
   * @since 0.32.0
   */
  defaultFillWidth?: number;
}

/**
 * The structural form of the `glyphs` convention (ADR-103).
 *
 * Declares the child structure a glyph component has in this library, splitting
 * membership (the structure) from naming (the component name). A component is a glyph
 * under this form when every one of its children matches some entry in `children` —
 * set-cover, exhaustive: a component containing anything besides the declared shapes
 * is not a glyph. When `fill` is declared, every leaf node matched by the structure
 * must carry a solid fill that is one of the listed values.
 *
 * ```yaml
 * glyphs:
 *   structure:
 *     fill: ['#161616']
 *     children:
 *       - type: VECTOR
 *         name: 'Vector'
 * ```
 *
 * @since 0.35.0
 */
export interface GlyphStructure {
  /**
   * Naming rule applied to the component name, using the `{i}` placeholder
   * (e.g. `"{i}Icon"`). Optional; defaults to `"{i}"` — the whole component name is
   * the glyph name.
   */
  name?: string;
  /**
   * Accepted leaf fills: a raw color (`"#RRGGBB"`) or a token/variable/style name.
   * Describes how the library **stores** its glyphs, so it is tested only on a
   * component's own structure — a placed instance is recolored by its context, and
   * membership read from an instance mirror skips the fill test. Optional; absence
   * means fills are not tested.
   */
  fill?: string[];
  /** Node matchers covering the component's children. */
  children: GlyphStructureNode[];
}

/**
 * One node matcher within a {@link GlyphStructure}.
 *
 * `type` is an open string carrying a Figma node type (e.g. `'VECTOR'`,
 * `'BOOLEAN_OPERATION'`), not a closed enum — an unknown type never matches, and the
 * schema does not chase Figma's node-type catalog (Constitution VI rule 3).
 *
 * @since 0.35.0
 */
export interface GlyphStructureNode {
  /** Figma node type this entry matches. */
  type: string;
  /** Layer name, literal with `*` wildcard. Optional; absence means any name. */
  name?: string;
  /** Matchers covering this node's own children, same set-cover semantics. Optional; absence means children are not tested. */
  children?: GlyphStructureNode[];
}

/**
 * A prop named by a convention.
 *
 * An object rather than a bare prop name so a convention can grow properties of
 * its own — pairing a label with the state that selects it, for instance — without
 * a breaking change. `VariantStateEntry` already has this shape; this is the same
 * idea for conventions that name a prop and nothing else yet.
 *
 * @since 0.32.0
 */
export interface PropReference {
  /** The prop carrying this concept. */
  prop: string;
}

/**
 * Conventions about the **spec itself** (ADR-073 amendment).
 *
 * A sibling of `platforms` rather than a member of it, for the same reason
 * `primitives` is: these are not facts about a platform. `states` names a prop and
 * an enum value that exist in `api.yaml`; a transform reading only the spec can
 * apply it and never touches Figma. Filing them under `figma` said they described
 * the design tool, which they do not.
 *
 * Scope is library-wide. The per-component equivalent is an annotation, which
 * lands in the spec itself — `anatomy.<element>.role` and `.actions`. Where both
 * describe the same thing, the annotation wins: the specific over the general.
 *
 * @since 0.32.0
 */
export interface SpecsConventions {
  /**
   * Concept-keyed map classifying variant props as semantic states.
   *
   * Unchanged from where it previously sat, including its concept vocabulary: the
   * concepts are governed, each resolving to a canonical selector, and that
   * governance is why nothing else is folded in here. Absence means all variant
   * props emit as `data-*` attribute selectors and all props are retained in
   * contracts.
   */
  states?: Record<string, VariantStateEntry>;
  /**
   * Slot-related naming conventions. Optional; absence means no such convention.
   *
   * A spec convention rather than a platform one: the thing named is a `SlotProp` the
   * spec declares, so a reader holding only the spec can apply it, and every platform
   * reads the same answer — the same reason `states` sits here.
   *
   * @since 0.35.0
   */
  slots?: {
    /** The component's designated default slot — the one slot always composed through. Optional; absence means no default-slot convention. */
    default?: {
      /** Naming patterns identifying the default slot prop. A library may name it differently across component families (e.g. `children`, `items`); any pattern matches. */
      match: string[];
    };
  };
  /** Props carrying accessibility semantics no element expresses. */
  accessibility?: {
    /**
     * The prop supplying an accessible name for a control with no text of its own —
     * an icon-only button, typically. Where a `label` part role resolves, that wins:
     * an element carrying the name is preferred to a prop.
     */
    label?: PropReference;
  };
  /**
   * The prop supplying a control's value where no element represents it — a progress
   * bar draws its progress rather than writing it. Where a `value` part role
   * resolves, that wins.
   */
  value?: ValueConvention;
}

/**
 * The props describing a control's value.
 *
 * `indeterminate` sits here rather than among the state concepts because those are a
 * governed vocabulary: each resolves to a canonical selector, and `indeterminate`
 * there means a checkbox's mixed state (`:indeterminate`, `aria-checked="mixed"`).
 * A progress bar with no known value is a different fact wearing the same word — it
 * suppresses `aria-valuenow` and has no selector at all. Folding them would widen a
 * governed vocabulary to absorb a prop binding, which is what the governance exists
 * to prevent.
 *
 * Modelling it as a property *of* the value is what it actually is: the prop that
 * says this value is unknown.
 *
 * @since 0.32.0
 */
export interface ValueConvention {
  /** The prop carrying the value. */
  prop: string;
  /**
   * A boolean prop that forces the indeterminate presentation regardless of the
   * value. Resolution order: this true suppresses the value; otherwise a resolved
   * `prop` produces the determinate form; otherwise the indeterminate form is
   * emitted with a warning.
   */
  indeterminate?: string;
}

/**
 * Conventions for the workspace Storybook, keyed by concern, each holding
 * per-feature settings. Most concerns are publish concerns — `color`,
 * `typography`, `icons`, … — naming how a page presents. `host` is the
 * exception, and names where the Storybook serves rather than what it shows.
 *
 * Both levels are deliberately open (ADR-098): the vocabulary is unstable while
 * concerns gain pages, so this contract fixes only the file, the concern
 * keying, and the openness. A concern implementation validates its own feature
 * values, and ignores an unknown concern or feature only with a warning naming
 * it — never silently. Adding a concern therefore needs no change here, which
 * is what the openness is for.
 *
 * @since 0.35.0
 */
export interface StorybookConventions {
  [concern: string]: { [feature: string]: unknown };
}

/**
 * Facts about the libraries a spec was generated from and is generated for, keyed by
 * platform.
 *
 * Every consumer reading the same libraries declares the same values. Differing values
 * produce **incorrect** output rather than merely different output: a mismatched pattern
 * leaves a whole class of assets undetected, a mismatched state entry lands a concept on
 * the wrong prop, and a mismatched primitive binding emits a component the design system
 * does not have.
 *
 * Figma is one platform key among `react`, `web-components`, `swiftui`, and whatever
 * else a workspace targets — the pipeline reads Figma to produce specs and writes specs
 * to produce Figma, so it is a peer rather than a special case. Keys name
 * *implementations*, not platform families: React and Web Components need different
 * vocabularies and get different keys.
 *
 * Absence of `platforms` means no conventions are declared at all; absence of one key
 * means that platform declares none.
 *
 * @since 0.31.0
 */
export interface Conventions {
  /** Platform-keyed conventions. The key is a free-form implementation id (`figma`, `react`, `swiftui`). */
  platforms?: Record<string, PlatformConventions>;
  /**
   * Component-keyed promotion entries, keyed by the design system's own component name.
   *
   * Platform-neutral, and deliberately not under `platforms`: a component's props are the
   * same whichever platform renders it, so the table is stated once. Optional; absence
   * means no component is described and nothing is promoted.
   *
   * @since 0.32.0
   */
  primitives?: Record<string, PrimitiveEntry>;
  /**
   * Conventions about the spec itself, rather than about any platform.
   * Loaded from `conventions/specs.yaml`. @since 0.32.0
   */
  specs?: SpecsConventions;
  /**
   * Workspace Storybook conventions — how its pages present, and where it serves.
   * Loaded from `conventions/storybook.yaml` — the third reserved basename,
   * after `figma.primitives` and `specs`; no platform may take the id.
   * Optional; absence means none are declared. @since 0.35.0
   */
  storybook?: StorybookConventions;
}

/**
 * One platform's conventions, with defaults applied **inside** any declared block.
 *
 * The blocks themselves stay optional: absence means this platform declares no such
 * convention, and nothing can supply that. What resolution guarantees is that a block,
 * once present, has every defaultable member — `scope`, `backgroundImage`,
 * `sourceProps`, a binding's concept prop names — so consumers need no null checks
 * within it.
 *
 * **A resolver produces one of these for any platform it is asked about, declared or
 * not.** `naming`, `slotConstraints`, `inferNumberProps` and `slotPrimitives` are
 * required here for that
 * reason: a consumer reading `figma` gets `NONE` whether or not a `figma.yaml` exists,
 * which is the guarantee ADR-071 gave when `figma` was a required key (ADR-073).
 *
 * @since 0.32.0
 */
export interface ResolvedPlatformConventions {
  /** Naming convention this platform uses. Defaulted to NONE inside a declared entry. */
  naming: 'NONE' | 'SENTENCE' | 'TITLE';
  /** Glyph content assets. Optional; absence means no glyph convention. At least one of `match` / `structure` is declared. */
  glyphs?: {
    /** Name form — membership and `{i}` naming capture. Optional since 0.35.0 (ADR-103). */
    match?: string;
    /** Structural form — membership from child structure, naming from the component name. @since 0.35.0 */
    structure?: GlyphStructure;
  };
  /** The code-only props container layer. Optional; absence means no such convention. */
  codeOnlyProps?: {
    match: string;
  };
  /** Subcomponent organization and naming. Optional; absence means no subcomponent convention. */
  subcomponents?: {
    scope: 'NESTED' | 'PAGE';
    match: string[];
    exclude?: string[];
  };
  /** Instance example organization and naming. Optional; absence means no such convention. */
  instanceExamples?: {
    scope: 'PAGE' | 'FILE';
    match?: string[];
    exclude?: string[];
    parentNames?: string[];
  };
  /** How this platform expresses images. Optional; absence means no image convention. */
  images?: {
    backgroundImage: boolean;
    match?: string;
    component?: string;
    sourceProps: string[];
  };
  /** Slot constraints are authored as code-only props. */
  slotConstraints: boolean;
  /** Numeric props are authored as Figma `TEXT` props. */
  inferNumberProps: boolean;
  /** Slots carry the primitives they accept in their default content. Defaulted to true. @since 0.39.0 */
  slotPrimitives: boolean;
  /** Object-prop members are authored as separator-delimited flat property names. Optional; absence means no folding. `separator` is defaulted inside a declared block. @since 0.39.0 */
  objectProps?: {
    separator: string;
  };
  /** Prop that receives styling no promotion mapped. Optional; absence means unmapped styling is dropped. */
  stylesProp?: string;
  /** Width of the container a fill-width root is placed in. Optional; no default — absence means the tool falls back to its own value. */
  defaultFillWidth?: number;
}

/**
 * Fully-resolved conventions, keyed by platform.
 *
 * `platforms` stays optional, and so does every key within it: absence is the statement
 * that nothing is declared, which no default can supply.
 *
 * @since 0.31.0
 */
export interface ResolvedConventions {
  platforms?: Record<string, ResolvedPlatformConventions>;
  /** Conventions about the spec itself. Optional; absence means none are declared. @since 0.32.0 */
  specs?: SpecsConventions;
  /** Component-keyed promotion entries. Optional; absence means nothing is promoted. @since 0.32.0 */
  primitives?: Record<string, PrimitiveEntry>;
  /** Workspace Storybook conventions — how its pages present, and where it serves. Optional; absence means none are declared. @since 0.35.0 */
  storybook?: StorybookConventions;
}

/**
 * The conventions a spec records in its metadata: the **one** platform entry that
 * produced it, and the spec conventions it was produced under.
 *
 * Structurally a subset of {@link ResolvedConventions}, with `platforms` constrained to
 * a single key, but absence means something different here. In a workspace's
 * conventions, a missing platform declares no conventions for that platform. In a
 * spec's metadata, a missing platform did not produce this spec — so recording every
 * platform a workspace happens to configure would both leak vocabulary the spec has no
 * bearing on and make a drift check fire on unrelated changes.
 *
 * `primitives` and `storybook` are deliberately absent: the promotion table is already
 * spent by the time a spec exists, and Storybook presentation bears on no reader of one.
 *
 * @since 0.32.0
 */
export interface MetadataConventions {
  /** Exactly one entry: the platform this spec was produced from. */
  platforms: Record<string, ResolvedPlatformConventions>;
  /**
   * Conventions about the spec itself, as the producing run resolved them.
   *
   * Recorded for the same reason the platform entry is: a consumer reading the spec
   * back has to recover the facts it was produced under, and a spec convention is
   * no more re-derivable from the spec's contents than a platform one. `slots.default`
   * is the field that requires it — a render resolving a nested instance's default
   * slot needs the patterns, and the instance's own component spec is not in hand.
   *
   * Optional, unlike `platforms`: a run that declared no spec conventions records
   * none, and absence states exactly that.
   *
   * @since 0.35.0
   */
  specs?: SpecsConventions;
}

/**
 * Default Conventions
 *
 * A workspace that declares nothing.
 *
 * This constant carries no members, because a platform-keyed map has no fixed key to
 * populate. That does **not** mean the defaults are gone: `naming`, `slotConstraints`,
 * `inferNumberProps` and `slotPrimitives` are still defaulted, by whoever resolves a
 * platform, and
 * {@link ResolvedPlatformConventions} requires them for exactly that reason.
 *
 * What no default can supply is a convention *block* — `glyphs`, `subcomponents`,
 * `images`. Their absence is a statement about the library, and inventing one would
 * fabricate a fact nobody declared.
 */
export const DEFAULT_CONVENTIONS: ResolvedConventions = {};
