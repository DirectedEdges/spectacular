import { Anatomy } from "./Anatomy.js";
import { Elements } from "./Element.js";
import { Layout } from "./Layout.js";
import { SlotContent } from "./SlotContent.js";
import { Images } from "./Image.js";
import { Metadata } from "./Metadata.js";

/**
 * The documents a run writes for a composition when `Settings.spec.splitConcerns`
 * is on: one file per concern rather than a single composition file (ADR-109).
 *
 * `Composition` has no `props`, no `default`/`variants` layering, and no
 * `subcomponents` — a composition does not vary by prop configuration the way a
 * component does, so these documents are not a loosened form of `ComponentApiDocument`
 * / `ComponentVariantsDocument` / `ComponentExamplesDocument` (ADR-091). Each is its own
 * exact shape, requiring what that concern carries and permitting nothing else.
 *
 * `metadata.concern` is what identifies a document, exactly as it does for a
 * component's concern documents.
 */

/**
 * The `api` concern of a composition: its identity and structure.
 *
 * Written as `api.yaml`. Carries no `elements` and no `layout` — those are the
 * variants document's.
 */
export type CompositionApiDocument = {
  /** Must state `concern: 'api'`. */
  metadata: Metadata & { concern: 'api' };
  /** Human-readable label for the composition. */
  title?: string;
  /** Purpose and usage notes for documentation tooling. */
  description?: string;
  anatomy: Anatomy;
};

/**
 * The `variants` concern of a composition: how it looks.
 *
 * Written as `variants.yaml`. A composition has no `default`/`variants`
 * layering to hold — `elements` and `layout` are the whole of its one,
 * unvarying appearance.
 */
export type CompositionVariantsDocument = {
  /** Must state `concern: 'variants'`. */
  metadata: Metadata & { concern: 'variants' };
  elements: Elements;
  layout: Layout;
};

/**
 * The `examples` concern of a composition: the content it composes and the
 * image registry those elements reference.
 *
 * Written as `examples.yaml`, and only for a composition that has any named
 * slot fills or images.
 */
export type CompositionExamplesDocument = {
  /** Must state `concern: 'examples'`. */
  metadata: Metadata & { concern: 'examples' };
  /** Named slot fills bundled alongside this composition's primary content. */
  slotContent?: Record<string, SlotContent>;
  /** Registry of image data referenced by this composition's elements. */
  images?: Images;
};

/**
 * Any one of the composition concern documents, discriminated by
 * `metadata.concern`.
 */
export type CompositionConcernDocument =
  | CompositionApiDocument
  | CompositionVariantsDocument
  | CompositionExamplesDocument;
