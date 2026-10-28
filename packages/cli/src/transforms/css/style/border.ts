// Strokes, as borders or outlines (specs#691).
//
// strokes + strokeWeight together form a border. `border-style` must be emitted
// whenever strokes is present and non-null — CSS borders are invisible without it.
//
// strokeAlign mapping — every alignment is an outline:
//   INSIDE  → outline pulled in by its own width (outline-offset: -W)
//   CENTER  → outline (renders centered on the element edge)
//   OUTSIDE → outline (renders outside element bounds)
//   null    → remove border (border-width: 0; border-color: transparent)
//
// A Figma stroke costs no space at any alignment: the frame stays the size it
// was and the stroke is drawn relative to its edge. A CSS border cannot do
// that — it is only "inside" when the element has an explicit size, and
// `box-sizing: border-box` does nothing for a hugging element, where the
// border adds its width to the box and pushes the content in. A badge hugging
// its content came out 2px taller than the design for exactly that reason.
//
// An outline affects no layout and follows border-radius, so a negative
// offset of its own width lands an inside stroke where Figma draws it. The
// one thing an outline cannot express is a per-side weight, which keeps the
// border mapping — the design strokes some sides and not others, and four
// widths need four properties.
import { isTokenRef } from '../values/tokens.js';
import { dimensionValue } from '../values/dimensions.js';
import { colorValue } from '../values/colors.js';
import { sidesValue } from '../values/sides.js';
import { isGradient, isGradientToken } from '../values/gradients.js';
import type { StyleToCSSOptions } from './options.js';

/**
 * A length as its negative.
 *
 * A plain length just takes a minus sign. Anything else — a `var()`, a `calc()`
 * — cannot: `-var(--x)` is not a value, and the whole declaration is dropped as
 * invalid. Every token-valued stroke width hit exactly that, which read as the
 * stroke sitting in the wrong place rather than as broken CSS.
 */
function negate(length: string): string {
  if (/^[\d.]+(px|rem|em|%)$/.test(length)) return `-${length}`;
  return `calc(-1 * ${length})`;
}

/**
 * Whether a stroke is drawn as an outline rather than a border.
 *
 * Everything but a per-side weight, which an outline has no way to express.
 * `strokeAlign` does not enter into it: no alignment should cost layout space,
 * and undefined reads as INSIDE, Figma's own default when none is recorded.
 */
function asOutline(strokeWeight: unknown): boolean {
  return !(typeof strokeWeight === 'object' && strokeWeight !== null && !isTokenRef(strokeWeight));
}

export function borderDecls(
  styles: Record<string, unknown>,
  tokensFormat: string,
  options: StyleToCSSOptions,
): string[] {
  const decls: string[] = [];

  const hasStrokes = 'strokes' in styles;
  const hasStrokeWeight = 'strokeWeight' in styles;
  const strokeAlign = styles.strokeAlign as string | null | undefined;
  // A gradient stroke paints a ring whose thickness is a transparent border, so
  // its width belongs to the border even though a solid stroke's width goes to
  // the outline. A variant restating only `strokeWeight` cannot tell from its
  // own declarations, so the caller reports whether any layer of this element
  // strokes with a gradient.
  const gradientStroke =
    isGradient(styles.strokes) || isGradientToken(styles.strokes) || options.gradientStroke === true;

  if (hasStrokes) {
    const strokesVal = styles.strokes;
    if (strokesVal === null) {
      // Clears both mechanisms. A variant that drops its stroke has to cancel
      // whatever the default block drew, and since a solid stroke is an outline
      // and a gradient one is a border-image, resetting only the border leaves
      // the default's outline painting on a variant that has no stroke.
      decls.push('border-color: transparent');
      decls.push('outline-style: none');
      if (options.resetBorderImage) decls.push('border-image: none');
    } else if (isGradient(strokesVal) || isGradientToken(strokesVal)) {
      // A gradient stroke is painted on a ::before ring by the caller, not
      // declared here — see gradientRingRule. Nothing on the element itself:
      // an outline cannot take a gradient, `border-image` is the only border
      // property that can and it ignores `border-radius`, and painting into
      // the element's own `background` destroys whatever fill it declares.
      //
      // The element must still cancel the mechanisms a sibling layer may have
      // drawn with, so a variant switching between a solid and a gradient
      // stroke does not show both at once.
      decls.push('outline-style: none');
      decls.push('border-color: transparent');
      if (options.resetBorderImage) decls.push('border-image: none');
    } else {
      const v = colorValue(strokesVal, tokensFormat);
      if (v) {
        if (asOutline(styles.strokeWeight)) {
          decls.push(`outline-color: ${v}`);
          decls.push('outline-style: solid');
          // A gradient stroke still paints through border-image, so a solid
          // stroke on another variant of the same element has to cancel it —
          // the outline it emits instead cannot override a border property.
          if (options.resetBorderImage) decls.push('border-image: none');
        } else {
          decls.push(`border-color: ${v}`);
          decls.push('border-style: solid');
          if (options.resetBorderImage) decls.push('border-image: none');
        }
      }
    }
  }

  if (hasStrokeWeight) {
    const v = styles.strokeWeight;
    if (v === null) {
      decls.push('border-width: 0');
      decls.push('outline-width: 0');
    } else if (typeof v === 'object' && v !== null && !isTokenRef(v)) {
      decls.push(...sidesValue(v as Record<string, unknown>, 'border-width', tokensFormat));
    } else {
      const d = dimensionValue(v, tokensFormat);
      if (d) {
        if (gradientStroke) {
          // The ring's thickness lives on the ::before rule; the host draws
          // no stroke of its own, and giving it a border would cost layout
          // that a Figma stroke never costs.
        } else if (asOutline(v)) {
          decls.push(`outline-width: ${d}`);
          // Centre and outside sit where the outline naturally falls; only an
          // inside stroke is pulled back over the element's own edge.
          if (strokeAlign !== 'OUTSIDE' && strokeAlign !== 'CENTER') {
            decls.push(`outline-offset: ${negate(d)}`);
          }
        } else {
          decls.push(`border-width: ${d}`);
        }
      }
    }
  }

  // A stroke paint with no weight is not a border. Emitting `border-style`
  // without a width lets CSS fall back to the initial `medium` — about 3px of
  // border the design does not have. Figma reports `strokeWeight: 0` for these,
  // and the spec carries the paint without the zero, so the width has to be
  // stated here.
  //
  // Keyed on this declaration set having no width of its own, so a rule that
  // emits a transparent border at a variant's width is untouched — it always
  // emits one. A gradient stroke is deliberately excluded: it emits
  // `border-image` and relies on the same missing width, but zeroing it removes
  // the gradient border entirely rather than removing a border that should not
  // be there. That case needs its own weight and is tracked separately.
  const emittedStyle = (kind: 'border' | 'outline'): boolean =>
    decls.some(d => d.startsWith(`${kind}-style:`)) && !decls.some(d => d.startsWith('border-image:'));
  const emittedWidth = (kind: 'border' | 'outline'): boolean =>
    decls.some(d => /^border-(?:[a-z]+-)*width:/.test(d) || d.startsWith(`${kind}-width:`));

  if (options.isDefaultBlock) {
    for (const kind of ['border', 'outline'] as const) {
      if (emittedStyle(kind) && !emittedWidth(kind)) decls.push(`${kind}-width: 0`);
    }
  }

  return decls;
}
