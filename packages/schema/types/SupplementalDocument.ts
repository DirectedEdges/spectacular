/**
 * What a component needs beyond what the spec can carry, authored beside it as
 * `supplemental.yaml` (ADR-118).
 *
 * The audience is whoever builds the component. Every entry names the schema
 * path that cannot carry it, which is what keeps the document small: anything
 * the schema *can* carry belongs in the spec, and an entry that cannot name its
 * gap is an entry in the wrong file.
 *
 * This file is self-contained. `GuidelinesDocument` declares its own header,
 * verification and reference types rather than sharing one with this file: the
 * two are siblings with no parent concept above them, and a little duplication
 * is the price of not inventing one.
 *
 * Three scopes write this document, all with the same shape: one component
 * (`components/<component>/supplemental.yaml`), every component
 * (`components/supplemental.yaml`), and one foundation
 * (`foundations/<concern>/supplemental.yaml`). An entry at a broader scope and
 * one at a narrower scope both apply; neither overrides the other (DSPEC-56).
 */

/** Where a supplemental document sits in its review cycle. @since 0.40.0 */
export type SupplementalStatus =
  /** Drafted and awaiting a ratifier; its statements are not yet the system's position. */
  | 'proposed'
  /** Reviewed and adopted; its statements are the system's position. */
  | 'ratified'
  /** Superseded or withdrawn; kept for the record and not to be followed. */
  | 'deprecated';

/**
 * The header a supplemental document opens with.
 *
 * Every member is optional: a document with no header is valid, and the scope
 * path already names the subject. `status` is the member that earns the block —
 * nothing else distinguishes a proposal from ratified content.
 * @since 0.40.0
 */
export type SupplementalMeta = {
  /** The subject this document covers, restating what the containing directory names. */
  concern?: string;
  /** Where the document sits in its review cycle. */
  status?: SupplementalStatus;
  /** Who authored it. Duplicates git history, and is here for a reader who will not consult git. */
  author?: string;
  /** When it was last revised, as `YYYY-MM-DD`. Hand-maintained, so it can go stale. */
  updated?: string;
  /** The generated reports this document was synthesized from, as workspace-relative paths. */
  sources?: string[];
};

/**
 * The concern a supplemental section covers.
 *
 * The nine the experimental contract shipped with, plus `overrides` and
 * `naming`. The names match the spec's own concern vocabulary — `props` because
 * `api.yaml` carries props, `styles` because `styling.yaml` carries styles — so
 * one vocabulary spans the spec and the documents beside it rather than two.
 * @since 0.40.0
 */
export type SupplementalConcern =
  /** The element tree: what parts a component has and how they nest. */
  | 'anatomy'
  /** The props a component takes, and what a caller may pass. */
  | 'props'
  /** The style values a component's parts carry. */
  | 'styles'
  /** What may fill a slot, in what quantity, and in what arrangement. */
  | 'slotComposition'
  /** What a component emits, and when. */
  | 'events'
  /** What assistive technology receives, and what a caller must supply for it. */
  | 'accessibility'
  /** What a component does in response to interaction or state. */
  | 'behavior'
  /** How a component traverses a change rather than where it ends up. */
  | 'motion'
  /** How a component's parts are arranged and sized relative to each other. */
  | 'layout'
  /** What a caller may replace or supply in place of a component's own part. */
  | 'overrides'
  /** Why a component, prop, or part carries the name it does. */
  | 'naming';

/**
 * The foundation a document covers, when its scope is a foundation rather than a
 * component. Governs the directory name under `foundations/` (DSPEC-62), which
 * no document schema can validate.
 * @since 0.40.0
 */
export type FoundationConcern =
  /** Colour: which token belongs on which property, and which families pair. */
  | 'color'
  /** Type: families, ramps, and what each step is for. */
  | 'typography'
  /** Arrangement: the grids, alignment, and structural rules a system shares. */
  | 'layout'
  /** Spacing: the scale, and which step fits which density. */
  | 'space'
  /** Shape, which in practice is mostly corner radius. */
  | 'shape'
  /** Elevation, covering shadow, z-ordering and anything else that stacks. */
  | 'elevation'
  /** Motion: durations, easings, and when a change is traversed rather than cut. */
  | 'motion'
  /** Brand: the expression a system reserves for identity rather than function. */
  | 'brand';

/**
 * A platform an entry is scoped to.
 *
 * Each value names an emission target. `react` and `webcomponents` are the two
 * web frameworks this system emits; `ios` and `android` are platforms, each with
 * exactly one sanctioned framework — Swift with SwiftUI, and Kotlin with Jetpack
 * Compose — so naming the platform names the target. `web` is a group covering
 * both web targets at once.
 *
 * Absent means the entry applies to every platform.
 * @since 0.40.0
 */
export type Platform =
  /** React, emitted by `react-from-specs`. */
  | 'react'
  /** Lit web components, emitted by `webcomponents-from-specs`. */
  | 'webcomponents'
  /**
   * Both web targets at once. Expands to `react` and `webcomponents`, and the
   * schema rejects an entry naming it beside either leaf.
   */
  | 'web'
  /** iOS, as Swift with SwiftUI. */
  | 'ios'
  /** Android, as Kotlin with Jetpack Compose. */
  | 'android';

/**
 * How a requirement is checked.
 *
 * `checks` names what does the checking, and the schema requires it whenever
 * this is `automated`.
 * @since 0.40.0
 */
export type SupplementalCheckedBy =
  /** A test or lint rule decides it, with no human reading required. */
  | 'automated'
  /** A tool surfaces candidates and a human judges them. */
  | 'assisted'
  /** A human decides it, with no tool involved. */
  | 'manual';

/**
 * A reference to what checks a requirement, inside this workspace or outside it.
 *
 * Exactly one member is present; the schema rejects both and neither.
 * @since 0.40.0
 */
export type SupplementalCheck = {
  /** What this points at inside the workspace. Resolution is DSPEC-57. */
  to?: string;
  /** What this points at outside the workspace, as an absolute URL. */
  href?: string;
};

/**
 * The schema surface that would carry a requirement, and why it cannot.
 *
 * Named rather than asserted. `path` takes a JSON Schema pointer — resolved by a
 * validator (DSPEC-58) — or any other workspace-relative target, because a gap
 * is sometimes in the library's own data rather than in the schema: a motion
 * token that does not exist is a gap in `analysis/foundations.yaml`, not in
 * `styles.schema.json`.
 * @since 0.40.0
 */
export type SchemaGap = {
  /** The schema pointer or workspace-relative target that would carry this. */
  path: string;
  /** What that target cannot express, and why it cannot. */
  need: string;
};

/**
 * One requirement the spec cannot carry.
 * @since 0.40.0
 */
export type SupplementalEntry = {
  /** A testable statement of what the component must do, written to transfer to a test criterion. No rationale prose. */
  intent: string;
  /** The surface that would carry this requirement, and why it does not. */
  schemaGap: SchemaGap;
  /** The platforms this applies to. Absent means every platform. */
  platforms?: Platform[];
  /** How this is checked. */
  checkedBy?: SupplementalCheckedBy;
  /** What does the checking. Required when `checkedBy` is `automated`. */
  checks?: SupplementalCheck[];
};

/**
 * A `supplemental.yaml` document: a header, and one list of entries per concern.
 *
 * No concern key is required, and a document carrying only a header is valid.
 * @since 0.40.0
 */
export type SupplementalDocument = {
  /** Authorship and review status for the document as a whole. */
  meta?: SupplementalMeta;
} & {
  [concern in SupplementalConcern]?: SupplementalEntry[];
};

/**
 * A `supplemental.yaml` document in a foundation's directory, keyed by the
 * foundation concerns rather than the component ones.
 *
 * A foundation's sections are a different shape, not a subset — see
 * `FoundationGuidelinesDocument` for the migration that proved it. The entry
 * shape is identical; only the key set differs.
 * @since 0.40.0
 */
export type FoundationSupplementalDocument = {
  /** Authorship and review status for the document as a whole. */
  meta?: SupplementalMeta;
} & {
  [concern in FoundationConcern]?: SupplementalEntry[];
};
