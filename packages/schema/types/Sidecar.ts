/**
 * The vocabulary the two authored sidecar documents share (ADR-118).
 *
 * A sidecar sits beside a spec and carries what the spec cannot. There are two,
 * split by who reads them: `supplemental.yaml` for whoever builds a component,
 * `guidelines.yaml` for whoever uses one. Both are authored by hand — no run
 * writes either — which is why neither carries `metadata.source` the way a
 * generated document does, and why `SidecarMeta` records authorship and review
 * status instead of Figma provenance.
 *
 * The concern, platform, verification and pointer vocabularies live here rather
 * than in either document, because both documents read all of them.
 */

/** Where a sidecar document sits in its review cycle. @since 0.40.0 */
export type SidecarStatus =
  /** Drafted and awaiting a ratifier; its statements are not yet the system's position. */
  | 'proposed'
  /** Reviewed and adopted; its statements are the system's position. */
  | 'ratified'
  /** Superseded or withdrawn; kept for the record and not to be followed. */
  | 'deprecated';

/**
 * The header a sidecar document opens with.
 *
 * Every member is optional: a document with no header is valid, and the three
 * scope paths already name the subject. `status` is the member that earns the
 * block — nothing else distinguishes a proposal from ratified guidance.
 * @since 0.40.0
 */
export type SidecarMeta = {
  /** The concern this document covers, restating what the containing directory names. */
  concern?: string;
  /** Where the document sits in its review cycle. */
  status?: SidecarStatus;
  /** Who authored it. Duplicates git history, and is here for a reader who will not consult git. */
  author?: string;
  /** When it was last revised, as `YYYY-MM-DD`. Hand-maintained, so it can go stale. */
  updated?: string;
  /** The generated reports this document was synthesized from, as workspace-relative paths. */
  sources?: string[];
};

/**
 * The concern a sidecar section covers.
 *
 * The nine the sidecar shipped with, plus `overrides` and `naming`. The names
 * match the spec's own concern vocabulary — `props` because `api.yaml` carries
 * props, `styles` because `styling.yaml` carries styles — so one vocabulary
 * spans the spec and its sidecars rather than two.
 * @since 0.40.0
 */
export type ComponentConcern =
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
 * The foundation a sidecar document covers, when its scope is a foundation
 * rather than a component.
 *
 * `layout` and `motion` appear here and in `ComponentConcern`; the two sets are
 * deliberately separate types, because a foundation-level motion statement and
 * a component-level one are about different subjects.
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
 * How a statement is checked.
 *
 * `checks` names what does the checking, and the schema requires it whenever
 * this is `automated`.
 * @since 0.40.0
 */
export type CheckedBy =
  /** A test or lint rule decides it, with no human reading required. */
  | 'automated'
  /** A tool surfaces candidates and a human judges them. */
  | 'assisted'
  /** A human decides it, with no tool involved. */
  | 'manual';

/**
 * A reference to one thing, either inside this workspace or outside it.
 *
 * Exactly one member is present; the schema rejects both and neither. `to` names
 * something the workspace holds — a token in `analysis/foundations.yaml`, a
 * component, or an item within one — and `href` names something it does not.
 * @since 0.40.0
 */
export type Pointer = {
  /** What this points at inside the workspace. Resolution is DSPEC-57. */
  to?: string;
  /** What this points at outside the workspace, as an absolute URL. */
  href?: string;
};

/** What a `Ref` says its target is to the thing carrying it. @since 0.40.0 */
export type RefRelationship =
  /** The target states the same thing at another scope, and the duplication is deliberate. */
  | 'same-as'
  /** The target is an issue or document bearing on this, without restating it. */
  | 'relates-to'
  /** The target is the code or package this comes from. */
  | 'source'
  /** The target is the design file or frame this comes from. */
  | 'design'
  /** The target is a running example of this. */
  | 'demo';

/**
 * A pointer that states its relationship explicitly, for the relationships that
 * have no field of their own.
 * @since 0.40.0
 */
export type Ref = Pointer & {
  /** What the target is to the thing carrying this ref. */
  rel: RefRelationship;
};
