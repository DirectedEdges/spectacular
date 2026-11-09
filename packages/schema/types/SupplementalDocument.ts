import { CheckedBy, ComponentConcern, Platform, Pointer, SidecarMeta } from './Sidecar.js';

/**
 * What a component needs beyond what the spec can carry, authored beside it as
 * `supplemental.yaml` (ADR-118).
 *
 * The audience is whoever builds the component. Every entry names the schema
 * path that cannot carry it, which is what keeps the document small: anything
 * the schema *can* carry belongs in the spec, and an entry that cannot name its
 * gap is an entry in the wrong file.
 *
 * What a component's *user* must observe is the other sidecar's subject —
 * `GuidelinesDocument`, written as `guidelines.yaml`. The two were one document
 * and were split because the fields differ, not merely the readers: a guideline
 * carries an obligation level and no gap, and a supplemental entry the reverse.
 *
 * Three scopes write this document, all with the same shape: one component
 * (`components/<component>/supplemental.yaml`), every component
 * (`components/supplemental.yaml`), and one foundation
 * (`foundations/<concern>/supplemental.yaml`). An entry at a broader scope and
 * one at a narrower scope both apply; neither overrides the other (DSPEC-56).
 */

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
  checkedBy?: CheckedBy;
  /** What does the checking. Required when `checkedBy` is `automated`. */
  checks?: Pointer[];
};

/**
 * A `supplemental.yaml` document: a header, and one list of entries per concern.
 *
 * No concern key is required, and a document carrying only a header is valid.
 * @since 0.40.0
 */
export type SupplementalDocument = {
  /** Authorship and review status for the document as a whole. */
  meta?: SidecarMeta;
} & {
  [concern in ComponentConcern]?: SupplementalEntry[];
};
