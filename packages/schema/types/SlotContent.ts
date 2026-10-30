import { Anatomy } from "./Anatomy.js";
import { Elements } from "./Element.js";
import { Layout } from "./Layout.js";

/**
 * The anonymous structural triplet — anatomy, elements, layout — used as a
 * named slot fill. Carries no metadata of its own; identity lives at the
 * key under which it is stored (`Component.slotContentExamples` or
 * `Composition.slotContent`).
 */
export interface SlotContent {
  anatomy: Anatomy;
  elements: Elements;
  layout: Layout;
}

/**
 * Named `SlotContent` entries, keyed by a name of letters, digits, underscore
 * or hyphen.
 *
 * The one shape behind `Component.slotContentExamples`,
 * `Composition.slotContent` and their concern-document counterparts.
 * @since 0.39.0
 */
export type SlotContentMap = Record<string, SlotContent>;
