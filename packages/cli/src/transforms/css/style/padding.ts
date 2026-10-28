// Padding, uniform or per-side (specs#691).
import { isTokenRef } from '../values/tokens.js';
import { dimensionValue } from '../values/dimensions.js';
import { sidesValue } from '../values/sides.js';

export function paddingDecls(styles: Record<string, unknown>, tokensFormat: string): string[] {
  if (!('padding' in styles) || styles.padding === undefined) return [];
  const v = styles.padding;
  if (v === null) return ['padding: 0'];
  if (typeof v === 'object' && !isTokenRef(v)) {
    return sidesValue(v as Record<string, unknown>, 'padding', tokensFormat);
  }
  const d = dimensionValue(v, tokensFormat);
  return d ? [`padding: ${d}`] : [];
}
