import type { FoundationConcern } from './SupplementalDocument.js';

/**
 * What whoever uses a component or a foundation must observe, authored beside
 * the spec as `guidelines.yaml` (ADR-118).
 *
 * The audience is a consumer, not a builder — what a builder must implement is
 * `SupplementalDocument`'s subject. An entry here carries an obligation level
 * and no schema gap, which is the reverse of a supplemental entry and the reason
 * the two are separate documents rather than one shape with everything optional.
 *
 * This document carries **rules only**. At a foundation's scope that means how
 * tokens, themes and raw values are applied across the catalogue — never a
 * per-token registry of what each token is for. A rule binds a reader; a
 * token's purpose merely describes a thing, and the two were conflated while
 * they shared one document. Where that description belongs is not settled: no
 * document kind carries it, and this schema's position is only that this one
 * does not (ADR-118, D11).
 *
 * An entry is a guideline item as the Design System Documentation Specification
 * (DSDS) 0.23.1 defines one: `statement`, `level`, `checkedBy`, `checks`,
 * `evidence`, `alternatives` and `refines` are its field names, used as it
 * defines them. The *document* is not a DSDS document — DSDS requires `kind` and
 * `for` on every section and this carries neither — so an exporter wraps a
 * concern's entries in a DSDS section rather than emitting this file as-is.
 *
 * Two members depart from DSDS deliberately: `may`, which is RFC 2119's fifth
 * level and absent from DSDS's four, and `instead`, which carries a remedy no
 * pointer can hold. An exporter appends `instead` to `statement` rather than
 * dropping it (DSPEC-59), so no consumer receives a prohibition without its fix.
 *
 * This file is self-contained, declaring its own header, verification and
 * pointer types rather than sharing them with its sibling documents.
 */

/** Where a guidelines document sits in its review cycle. @since 0.40.0 */
export type GuidelinesStatus =
  /** Drafted and awaiting a ratifier; its rules are not yet the system's position. */
  | 'proposed'
  /** Reviewed and adopted; its rules are the system's position. */
  | 'ratified'
  /** Superseded or withdrawn; kept for the record and not to be followed. */
  | 'deprecated';

/**
 * The header a guidelines document opens with.
 *
 * Every member is optional. `status` is the member that earns the block — it is
 * how a ratifier knows whether they are reading a proposal or settled guidance.
 * @since 0.40.0
 */
export type GuidelinesMeta = {
  /** The subject this document covers, restating what the containing directory names. */
  concern?: string;
  /** Where the document sits in its review cycle. */
  status?: GuidelinesStatus;
  /** Who authored it. Duplicates git history, and is here for a reader who will not consult git. */
  author?: string;
  /** When it was last revised, as `YYYY-MM-DD`. Hand-maintained, so it can go stale. */
  updated?: string;
  /** The generated reports this document was synthesized from, as workspace-relative paths. */
  sources?: string[];
};

/**
 * The concern a guidelines section covers. The same eleven the supplemental
 * document uses, so one vocabulary spans both and the spec they sit beside.
 * @since 0.40.0
 */
export type GuidelinesConcern =
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
 * How strongly a guideline binds, with RFC 2119 semantics.
 *
 * DSDS 0.23.1 defines the first four. `may` is RFC 2119's fifth and is added
 * here, because a permission recorded as `should` asserts an obligation the
 * system does not hold. Each description names the colloquial words an author
 * reaches for, because the authored files already use them: the level is what
 * those words mean, not a vocabulary competing with them.
 * @since 0.40.0
 */
export type ObligationLevel =
  /** An absolute requirement; a usage that disregards it is wrong. Often written instead as required, or always. */
  | 'must'
  /** A strong recommendation; disregard it only with a considered reason. Often written instead as recommended, or prefer. */
  | 'should'
  /** A strong recommendation against; do it only with a considered reason. Often written instead as avoid. */
  | 'should-not'
  /** An absolute prohibition; a usage that does it is wrong. Often written instead as never. */
  | 'must-not'
  /** A permission the system grants, and neither requires nor discourages. Often written instead as optional, or could. */
  | 'may';

/**
 * How a guideline is checked.
 *
 * `checks` names what does the checking, and the schema requires it whenever
 * this is `automated`.
 * @since 0.40.0
 */
export type GuidelinesCheckedBy =
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
 * something the workspace holds — a component, a token, or an item within one —
 * and `href` names something it does not.
 * @since 0.40.0
 */
export type GuidelineReference = {
  /** What this points at inside the workspace. Resolution is DSPEC-57. */
  to?: string;
  /** What this points at outside the workspace, as an absolute URL. */
  href?: string;
};

/**
 * One rule a consumer must observe.
 * @since 0.40.0
 */
export type GuidelineEntry = {
  /** The rule itself, as a sentence a reader can act on. */
  statement: string;
  /** How strongly it binds. */
  level: ObligationLevel;
  /**
   * What to use instead, when the remedy is a thing this can point at. Preferred
   * over `instead` whenever the remedy can be named, because a pointer resolves
   * and a sentence does not.
   */
  alternatives?: GuidelineReference[];
  /**
   * What to do instead, when the remedy is a rule rather than a thing — "style
   * from the semantic layer" names no single token. An exporter folds this into
   * `statement` rather than dropping it (DSPEC-59).
   */
  instead?: string;
  /** A broader guideline this one elaborates. */
  refines?: GuidelineReference;
  /** Source material supporting the rule. */
  evidence?: GuidelineReference[];
  /** How this is checked. */
  checkedBy?: GuidelinesCheckedBy;
  /** What does the checking. Required when `checkedBy` is `automated`. */
  checks?: GuidelineReference[];
};

/**
 * A `guidelines.yaml` document beside a component or composition: a header, and
 * one list of rules per component concern.
 *
 * No concern key is required, and a document carrying only a header is valid.
 * @since 0.40.0
 */
export type GuidelinesDocument = {
  /** Authorship and review status for the document as a whole. */
  meta?: GuidelinesMeta;
} & {
  [concern in GuidelinesConcern]?: GuidelineEntry[];
};

/**
 * A `guidelines.yaml` document in a foundation's directory, keyed by the
 * foundation concerns rather than the component ones.
 *
 * A foundation's sections are a different shape, not a subset. `color`,
 * `typography`, `space`, `shape`, `elevation` and `brand` have no component
 * counterpart, and `anatomy`, `props`, `slotComposition`, `events`, `overrides`
 * and `naming` are meaningless about a foundation. Only `layout` and `motion`
 * appear in both vocabularies.
 *
 * The two were one shape until a migration proved it wrong: a rule about
 * assembling an elevation shadow had no section to go in, because
 * `GuidelinesConcern` has no `elevation` — so it was filed under `styles`,
 * where nobody looking for elevation guidance would find it (ADR-118, amended).
 *
 * The entry shape is identical. Only the key set differs, which is why these
 * are two document types rather than one with a widened key set: a component
 * document carrying `color:` and a foundation document carrying `props:` are
 * both errors, and a union would accept both.
 * @since 0.40.0
 */
export type FoundationGuidelinesDocument = {
  /** Authorship and review status for the document as a whole. */
  meta?: GuidelinesMeta;
} & {
  [concern in FoundationConcern]?: GuidelineEntry[];
};
