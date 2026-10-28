// What paints the element's surface and its text (specs#691).
//
// One spec key can land on different CSS properties depending on what the
// element is: a glyph tints through a mask, a shape paints a background, and an
// untyped element keeps the legacy SVG `fill`.
import { colorValue } from '../values/colors.js';
import { gradientValue } from '../values/gradients.js';

export function fillDecls(
  styles: Record<string, unknown>,
  tokensFormat: string,
  elemType: string | undefined,
): string[] {
  const decls: string[] = [];

  if ('backgroundColor' in styles) {
    const g = gradientValue(styles.backgroundColor, tokensFormat);
    if (g) {
      decls.push(`background: ${g}`);
    } else {
      const v = colorValue(styles.backgroundColor, tokensFormat);
      if (v) decls.push(`background: ${v}`);
    }
  }

  if ('textColor' in styles) {
    const g = gradientValue(styles.textColor, tokensFormat);
    if (g) {
      // Gradient text: paint the gradient as a background clipped to the glyphs.
      decls.push(`background: ${g}`);
      decls.push('-webkit-background-clip: text');
      decls.push('background-clip: text');
      decls.push('color: transparent');
    } else {
      const v = colorValue(styles.textColor, tokensFormat);
      if (v) decls.push(`color: ${v}`);
    }
  }

  if ('fillColor' in styles) {
    const g = gradientValue(styles.fillColor, tokensFormat);
    if (g) {
      // Gradient fills paint as background-image — through the mask for
      // glyphs/vectors, directly for shapes. Untyped legacy `fill` (SVG paint)
      // has no inline-gradient equivalent and is skipped.
      if (elemType !== undefined) decls.push(`background: ${g}`);
    } else {
      const v = colorValue(styles.fillColor, tokensFormat);
      if (v) {
        // Anatomy type decides the paint target: glyphs/vectors render as
        // mask-tinted boxes (background-color shows through the mask shape);
        // shape elements render as plain boxes; untyped keeps legacy fill.
        if (elemType === 'glyph' || elemType === 'vector') decls.push(`background-color: ${v}`);
        else if (elemType === undefined) decls.push(`fill: ${v}`);
        else decls.push(`background: ${v}`);
      }
    }
  }

  return decls;
}
