// What a caller tells the style mapping about the element it is emitting for
// (specs#691).
//
// Each flag is a fact the declarations alone cannot carry: whether another layer
// of the same element strokes with a gradient, whether this is the element's
// default block, how its parent is laid out. A variant restating one property
// has no way to know any of them.

export interface StyleToCSSOptions {
  /**
   * Whether coordinates without an explicit position imply absolute placement.
   * True for children of non-auto-layout parents (Figma places them
   * absolutely); false inside auto-layout flow, where stray coordinates are
   * layout metadata, not offsets.
   */
  inferAbsolute?: boolean;
  /**
   * Whether any layer of this element strokes with a gradient. A gradient ring
   * is painted with a transparent border carrying its thickness, so a variant
   * restating only the weight has to put it on the border rather than the
   * outline a solid stroke uses.
   */
  gradientStroke?: boolean;
  /**
   * Emit `border-image: none` alongside solid stroke colors. Set when another
   * layer of the same element uses a gradient stroke (border-image) — without
   * the reset, an earlier variant's border-image outranks a later border-color.
   */
  resetBorderImage?: boolean;
  /**
   * Whether these declarations are the element's default block.
   *
   * Only there does "strokes with no weight" mean the element has no border.
   * A variant block that restates `strokes` is changing the stroke's colour
   * and inheriting its width from the default rule, so giving it a width of
   * its own would erase a border the design keeps.
   */
  isDefaultBlock?: boolean;
}
