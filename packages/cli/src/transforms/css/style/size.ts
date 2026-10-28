// Width, height and their min/max bounds (specs#691).
import { dimensionValueOrUnset } from '../values/dimensions.js';
import { hasAspectRatio } from './aspectRatio.js';

const DIMENSION_KEYS: Array<[string, string]> = [
  ['width', 'width'],
  ['height', 'height'],
  ['minWidth', 'min-width'],
  ['minHeight', 'min-height'],
  ['maxWidth', 'max-width'],
  ['maxHeight', 'max-height'],
];

/**
 * An element that declares an aspect ratio has its height determined by its
 * width, and the authored height is that same value at the authored width —
 * the two are redundant. Only the ratio survives composition: a fixed height
 * beats `aspect-ratio` in the cascade, so once the component is placed in a
 * narrower box the element keeps its full authored height and its background
 * is scaled to cover a box the design never had.
 */
export function sizeDecls(styles: Record<string, unknown>, tokensFormat: string): string[] {
  const decls: string[] = [];
  const ratioStated = hasAspectRatio(styles);

  for (const [key, cssProp] of DIMENSION_KEYS) {
    if (key in styles) {
      if (key === 'height' && ratioStated) continue;
      const d = dimensionValueOrUnset((styles as Record<string, unknown>)[key], tokensFormat);
      if (d && d !== '0') decls.push(`${cssProp}: ${d}`);
    }
  }

  return decls;
}
