// Reading what formatting a slot's primitive fills take on (ADR-102).
//
// `contentStyles` lives on the slot ELEMENT, keyed by the same reserved markers
// the slot prop's `anyOf` carries (`$text`, `$glyph`): the default block carries
// the base entry per primitive, and `variants[].elements` overlays it per
// variant exactly as `styles` is.
//
// A local mirror of the shared core's `contentStyles.ts`
// (specs-transforms `packages/from-specs/src/contentStyles.ts`). That package is
// private and bundled into each emitter at build time — the CLI's own bundle
// marks all packages external, so it cannot consume the module directly. The
// same pattern this directory already uses for the slot-direction read: keep
// the two in step when either changes.
import type { PrimitiveSlotContent } from '@directededges/specs-schema';
import { configurationSatisfies } from './slotDirection.js';

/** The reserved markers a slot's `anyOf` (and so `contentStyles`) may carry. */
const PRIMITIVE_SLOT_MARKERS: readonly PrimitiveSlotContent[] = ['$text', '$glyph'];

/**
 * One block of per-primitive formatting: each entry is the style record the spec
 * carries for that kind of fill — `fillColor`, typography, a glyph's box. Values
 * stay the spec's own (token references included); interpreting them is the
 * consumer's job.
 */
export type PrimitiveContentStyles = Partial<Record<PrimitiveSlotContent, Record<string, unknown>>>;

/** A slot element's contentStyles, read whole: the default block plus every variant overlay. */
export interface SlotContentStyles {
  /** The default block's entry per primitive. Empty object when the element carries none. */
  default: PrimitiveContentStyles;
  /**
   * Variant overlays, in spec order — the order the stylesheet's own cascade
   * applies them. Only variants that both name a configuration and carry a
   * contentStyles entry for this element appear. `configuration` keeps the
   * parsed document's own object, so a caller holding the same document can
   * match an overlay to its variant by identity.
   */
  variants: Array<{ configuration: Record<string, unknown>; contentStyles: PrimitiveContentStyles }>;
}

/**
 * Read one slot element's `contentStyles` from a parsed variants.yaml: the
 * default block's entry plus every variant's overlay for that element.
 */
export function slotContentStylesOf(
  variantsYaml: Record<string, unknown> | undefined,
  elementKey: string,
): SlotContentStyles {
  const defaultBlock = (variantsYaml?.default ?? {}) as Record<string, unknown>;
  const defaultElements = (defaultBlock.elements ?? {}) as Record<string, Record<string, unknown>>;

  const rawVariants = (variantsYaml?.variants ?? []) as Array<Record<string, unknown>>;
  const variants = rawVariants
    .map(variant => ({
      configuration: (variant.configuration ?? {}) as Record<string, unknown>,
      contentStyles: contentStylesIn(
        ((variant.elements ?? {}) as Record<string, Record<string, unknown>>)[elementKey],
      ),
    }))
    // A variant carrying an empty contentStyles block (or none) for this element
    // is dropped — it overlays nothing, consistent with the slot-direction filter.
    .filter(entry =>
      Object.keys(entry.configuration).length > 0 && Object.keys(entry.contentStyles).length > 0,
    );

  return { default: contentStylesIn(defaultElements[elementKey]), variants };
}

/**
 * The formatting one configuration's primitive fills take on: the default block,
 * overlaid by every variant the configuration satisfies, later variants winning
 * per style property — exactly as the element's own `styles` cascade.
 */
export function resolveContentStyles(
  read: SlotContentStyles,
  propConfigurations: Record<string, unknown>,
): PrimitiveContentStyles {
  const resolved: PrimitiveContentStyles = {};
  for (const [key, block] of Object.entries(read.default)) {
    resolved[key as PrimitiveSlotContent] = { ...(block as Record<string, unknown>) };
  }
  for (const variant of read.variants) {
    if (!configurationSatisfies(variant.configuration, propConfigurations)) continue;
    for (const [key, block] of Object.entries(variant.contentStyles)) {
      const marker = key as PrimitiveSlotContent;
      const overlaid = { ...(resolved[marker] ?? {}) };
      // An explicitly-undefined property says nothing and must not erase the
      // default's value — same per-property guard as the slot-direction overlay.
      for (const [prop, value] of Object.entries(block as Record<string, unknown>)) {
        if (value !== undefined) overlaid[prop] = value;
      }
      resolved[marker] = overlaid;
    }
  }
  return resolved;
}

/** The marker-keyed entries an element declares, ignoring anything that is not a reserved marker. */
function contentStylesIn(element: Record<string, unknown> | undefined): PrimitiveContentStyles {
  const raw = element?.contentStyles;
  if (!raw || typeof raw !== 'object') return {};
  const out: PrimitiveContentStyles = {};
  for (const marker of PRIMITIVE_SLOT_MARKERS) {
    const entry = (raw as Record<string, unknown>)[marker];
    if (entry && typeof entry === 'object') {
      out[marker] = entry as Record<string, unknown>;
    }
  }
  return out;
}
