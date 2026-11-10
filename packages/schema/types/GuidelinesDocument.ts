import { CheckedBy, ComponentConcern, Pointer, Ref, SidecarMeta } from './Sidecar.js';

/**
 * What whoever uses a component must observe when arranging it, authored beside
 * the spec as `guidelines.yaml` (ADR-118).
 *
 * The audience is a consumer, not a builder — what a builder must implement is
 * `SupplementalDocument`'s subject. An entry here carries an obligation level
 * and no schema gap, which is the reverse of a supplemental entry and the reason
 * the two are separate documents rather than one shape with everything optional.
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
 * Three scopes write this document, as with the supplemental sidecar, and
 * entries across scopes are additive rather than overriding (DSPEC-56).
 */

/**
 * How strongly a guideline binds, with RFC 2119 semantics.
 *
 * DSDS 0.23.1 defines the first four. `may` is RFC 2119's fifth and is added
 * here, because a permission recorded as `should` asserts an obligation the
 * system does not hold.
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
  alternatives?: Pointer[];
  /**
   * What to do instead, when the remedy is a rule rather than a thing — "style
   * from the semantic layer" names no single token. An exporter folds this into
   * `statement` rather than dropping it (DSPEC-59).
   */
  instead?: string;
  /** A broader guideline this one elaborates. */
  refines?: Pointer;
  /** Source material supporting the rule. */
  evidence?: Pointer[];
  /** How this is checked. */
  checkedBy?: CheckedBy;
  /** What does the checking. Required when `checkedBy` is `automated`. */
  checks?: Pointer[];
};

/**
 * One thing in a set, and what it is for.
 *
 * Exactly one of `$token` or `$name` is present; the schema rejects both and
 * neither. `$token` identifies a token by the path the rest of the system
 * spells it with, spaces and capitals included — a DSDS-legal identifier is
 * derived at export (DSPEC-60), never authored here.
 * @since 0.40.0
 */
export type SelectionSubject = {
  /** The token this is about, as a `<collection>/<group>/<name>` path. */
  $token?: string;
  /** The prop, variant or slot fill this is about. */
  $name?: string;
  /** What it is for, or why it is off-limits. */
  $description: string;
  /**
   * What to reach for instead of this one. Meaningful under `dontUseWhen`, where
   * its absence says something true: nothing replaces this subject.
   */
  alternatives?: Pointer[];
  /** Related references, including `same-as` when this restates a subject at another scope. */
  refs?: Ref[];
};

/**
 * Subjects grouped by what kind of thing they are.
 *
 * A set of thirty tokens is a table a reader scans, not thirty rules a reader
 * works through, which is why selection guidance is its own shape rather than
 * one `should` entry per subject.
 * @since 0.40.0
 */
export type SelectionGuidance = {
  /** Tokens, identified by path. */
  tokens?: SelectionSubject[];
  /** Props, identified by name. */
  props?: SelectionSubject[];
  /** Variants, identified by name. */
  variants?: SelectionSubject[];
  /** Slot fills, identified by name. */
  slotFills?: SelectionSubject[];
};

/**
 * A `guidelines.yaml` document: a header, selection guidance, and one list of
 * rules per concern.
 *
 * No member is required, and a document carrying only a header is valid.
 * @since 0.40.0
 */
export type GuidelinesDocument = {
  /** Authorship and review status for the document as a whole. */
  meta?: SidecarMeta;
  /** What each subject in a set is for. */
  useWhen?: SelectionGuidance;
  /** Which subjects are off-limits, why, and what replaces them. */
  dontUseWhen?: SelectionGuidance;
} & {
  [concern in ComponentConcern]?: GuidelineEntry[];
};
