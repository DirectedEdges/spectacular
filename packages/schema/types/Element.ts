import { Children } from "./Children.js";
import { ContentStyles, Styles } from "./Styles.js";
import { PropConfigurations } from "./PropConfigurations.js";
import { PropBinding } from "./PropBinding.js";
import { SubcomponentRef } from "./Anatomy.js";
import { SlotContentRef } from "./SlotContentRef.js";

/**
 * Represents elements within a component.
 */
export type Elements = Record<string, Element>;

/**
 * Represents a single element within a component.
 */
export type Element = {
  children?: Children;
  parent?: string | null;
  styles?: Styles;
  /**
   * Styles applied to primitive content filling this element, as distinct from `styles`,
   * which are the element's own.
   *
   * Keyed by primitive (`$text`, `$glyph`) using the same reserved markers this slot's
   * `anyOf` carries, because default content may hold more than one kind. Each entry is
   * captured from the first top-level primitive of that kind in the slot's default
   * content, per variant, and is overridden per variant through `variants[].elements`
   * exactly as `styles` is.
   *
   * A component fill is formatted by the component it instantiates, so a consumer
   * rendering one applies `styles` and discards `contentStyles` rather than cascading it
   * onto the instance.
   *
   * Meaningful only on a slot element, and its keys should agree with that slot's `anyOf`
   * markers — both authoring/generator contracts, neither schema-enforced (ADR-102).
   * @since 0.39.0
   */
  contentStyles?: ContentStyles;
  propConfigurations?: PropConfigurations;
  /** The component or component set name, a prop binding for instance swaps, or a subcomponent reference. */
  instanceOf?: string | PropBinding | SubcomponentRef;
  /** The content for content-bearing elements: text string for text elements, glyph name for glyph elements, or a PropBinding reference. */
  content?: string | PropBinding;
  /** Platform extensions; `com.figma` carries capture provenance. @since 0.32.0 */
  $extensions?: ElementExtensions;
};

/**
 * Figma capture provenance for an element.
 *
 * Written when a primitive layer in composed example content is promoted to an instance
 * of a design system component (ADR-074). Both members are optional and independent: a
 * promotion that consumed no styles records the flag alone.
 *
 * @since 0.32.0
 */
export interface FigmaElementExtension {
  /**
   * This element was a primitive layer promoted to a component instance, rather than an
   * instance the designer placed.
   *
   * Declared rather than inferred from the presence of `styles`: a promotion may consume
   * nothing — a glyph whose name maps to a prop while no style rule resolves — and an
   * absent residue would then read as a placed instance.
   */
  promotedPrimitive?: boolean;
  /**
   * More than one `conventions.primitives` entry resolved against this element, and the
   * highest-scoring one was chosen.
   *
   * A durable record rather than a warning that scrolls past. Two components claiming
   * one layer may be a legitimate description of a design system, or it may be a
   * conventions file that has drifted — either way the ambiguity is a property of this
   * element, and something a reader or a lint pass can act on later.
   *
   * Absent means exactly one entry resolved.
   */
  multipleMatches?: boolean;
  /**
   * The content the promotion consumed — a text layer's string or a glyph's name.
   *
   * Recorded beside `styles` rather than among them, because content is not a style.
   * Its value survives in `propConfigurations`, but only under whichever prop the
   * conventions table named; recording it here is what lets a promoted layer be
   * restored without consulting that table.
   */
  content?: string | PropBinding;
  /**
   * The styles the promotion consumed, recorded verbatim as captured.
   *
   * A prop value cannot be inverted back to the style that produced it, because two
   * sources may map to one value. Recording the original is what lets a promoted layer be
   * rendered back as a layer rather than as an instance.
   */
  styles?: Styles;
  /**
   * The hoisted slot fill of a promoted container — the subtree the frame held,
   * moved into `slotContentExamples` when the frame became an instance (ADR-076).
   *
   * The container analogue of `content`, recorded for the same reason: the pointer
   * survives in `propConfigurations`, but only under whichever prop the conventions
   * table named — recording it here is what lets a promoted frame be restored, with
   * its children back in place, without consulting that table (ADR-090).
   *
   * @since 0.33.0
   */
  children?: SlotContentRef;
}

/**
 * DTCG-style platform extensions for an element.
 *
 * @since 0.32.0
 */
export interface ElementExtensions {
  'com.figma'?: FigmaElementExtension;
}

/**
 * Element types derived from Figma node analysis
 */
export type ElementType =
  | 'text'
  | 'glyph'
  | 'vector'
  | 'container'
  | 'slot'
  | 'instance'
  | 'line'
  | 'ellipse'
  | 'rectangle'
  | 'polygon'
  | 'star';
