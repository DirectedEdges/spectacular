// Opacity (specs#691).
import { resolveTokenVar } from '../values/tokens.js';

/**
 * An unbound opacity arrives as the ratio Figma stores (0.36). An opacity
 * VARIABLE is authored on a percentage scale (36), because that is what reads
 * naturally across platforms — so a token reference is multiplied into a CSS
 * percentage. Emitting the variable bare gives `opacity: 36`, which clamps to
 * 1 and silently discards the state.
 */
export function opacityDecls(styles: Record<string, unknown>, tokensFormat: string): string[] {
  if (!('opacity' in styles) || styles.opacity === undefined) return [];
  const v = styles.opacity;
  const resolved = resolveTokenVar(v, tokensFormat);
  if (resolved) return [`opacity: calc(${resolved} * 1%)`];
  if (typeof v === 'number') return [`opacity: ${v}`];
  return [];
}
