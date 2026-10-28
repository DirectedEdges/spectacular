// Corner radius, uniform or per-corner (specs#691).
import { isTokenRef, resolveTokenVar } from '../values/tokens.js';
import { dimensionValue, dimensionValueOrUnset } from '../values/dimensions.js';

export function cornerRadiusDecls(styles: Record<string, unknown>, tokensFormat: string): string[] {
  if (!('cornerRadius' in styles) || styles.cornerRadius === undefined) return [];
  const v = styles.cornerRadius;

  const resolved = resolveTokenVar(v, tokensFormat);
  if (resolved) return [`border-radius: ${resolved}`];

  if (isTokenRef(v)) {
    // A token reference resolveTokenVar declined is a withheld unresolved
    // variable. Degrade to the captured raw value where the engine carried
    // one; otherwise `unset` says the variant overrode the radius with
    // something unreadable, so a base rule's radius does not win here.
    return [`border-radius: ${dimensionValueOrUnset(v, tokensFormat) ?? 'unset'}`];
  }

  if (typeof v === 'object' && v !== null) {
    // Corners object: topStart topEnd bottomEnd bottomStart
    const c = v as Record<string, unknown>;
    const vals = [c.topStart, c.topEnd, c.bottomEnd, c.bottomStart]
      .map(x => dimensionValue(x, tokensFormat));
    return [`border-radius: ${vals.map(x => x ?? '0').join(' ')}`];
  }

  const d = dimensionValue(v, tokensFormat);
  return d ? [`border-radius: ${d}`] : [];
}
