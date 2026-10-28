import { Anatomy } from "./Anatomy.js";
import { Props } from "./Props.js";
import { Variant, Variants } from "./Variant.js";
import { Metadata } from "./Metadata.js";
import { PropConfigurations } from "./PropConfigurations.js";
import { InstanceExamples } from "./InstanceExample.js";
import { SlotContent } from "./SlotContent.js";
import { Images } from "./Image.js";
import { SubcomponentSource } from "./Subcomponent.js";

/**
 * The documents a run writes when `Settings.spec.splitConcerns` is on: one file
 * per concern rather than a single component file (ADR-091).
 *
 * Each concern has its own shape, requiring what that concern carries and
 * permitting nothing else. A `variants` document cannot hold an anatomy, and an
 * `api` document cannot hold a default block — the keys belong to the other
 * file, and a type that merely made everything optional would accept both.
 *
 * `metadata.concern` is what identifies a document. It is also what keeps the
 * three shapes apart, and what keeps all three apart from `Component`: a whole
 * component states no concern.
 */

/** A subcomponent's `api` slice, as it appears inside an api document. */
export type ComponentApiSubcomponent = {
  title: string;
  anatomy: Anatomy;
  props: Props;
  /** Prop-value combinations that produce an invalid component state (ADR-092). */
  invalidPropCombinations?: PropConfigurations[];
  /** Figma source identity for this subcomponent's node. */
  source?: SubcomponentSource;
  subcomponents?: Record<string, ComponentApiSubcomponent>;
};

/** A subcomponent's `variants` slice, as it appears inside a variants document. */
export type ComponentVariantsSubcomponent = {
  default: Variant;
  variants: Variants;
  /** Figma source identity for this subcomponent's node. */
  source?: SubcomponentSource;
  subcomponents?: Record<string, ComponentVariantsSubcomponent>;
};

/** A subcomponent's `examples` slice, as it appears inside an examples document. */
export type ComponentExamplesSubcomponent = {
  slotContentExamples?: Record<string, SlotContent>;
  instanceExamples?: InstanceExamples;
  images?: Images;
  /** Figma source identity for this subcomponent's node. */
  source?: SubcomponentSource;
  subcomponents?: Record<string, ComponentExamplesSubcomponent>;
};

/**
 * The `api` concern: what a component is and what it takes.
 *
 * Written as `api.yaml`. Carries no `default` block and no variants — those are
 * the variants document's.
 */
export type ComponentApiDocument = {
  /** Must state `concern: 'api'`. */
  metadata: Metadata & { concern: 'api' };
  title: string;
  anatomy: Anatomy;
  props: Props;
  /** Prop-value combinations that produce an invalid component state (ADR-092). */
  invalidPropCombinations?: PropConfigurations[];
  subcomponents?: Record<string, ComponentApiSubcomponent>;
};

/**
 * The `variants` concern: a component's default appearance and every override.
 *
 * Written as `variants.yaml`. Carries no title and no anatomy — those are the
 * api document's.
 */
export type ComponentVariantsDocument = {
  /** Must state `concern: 'variants'`. */
  metadata: Metadata & { concern: 'variants' };
  default: Variant;
  variants: Variants;
  subcomponents?: Record<string, ComponentVariantsSubcomponent>;
};

/**
 * The `examples` concern: documented usages, the content they compose, and the
 * image registry those reference.
 *
 * Written as `examples.yaml`, and only for a component that has any. Every
 * field is optional because a component may carry one kind of example and not
 * another; the file exists at all only when at least one is present.
 */
export type ComponentExamplesDocument = {
  /** Must state `concern: 'examples'`. */
  metadata: Metadata & { concern: 'examples' };
  slotContentExamples?: Record<string, SlotContent>;
  instanceExamples?: InstanceExamples;
  images?: Images;
  subcomponents?: Record<string, ComponentExamplesSubcomponent>;
};

/**
 * Any one of the concern documents, discriminated by `metadata.concern`.
 *
 * Narrowing on `concern` gives the exact slice — the same fact the validator
 * discriminates on.
 */
export type ComponentConcernDocument =
  | ComponentApiDocument
  | ComponentVariantsDocument
  | ComponentExamplesDocument;
