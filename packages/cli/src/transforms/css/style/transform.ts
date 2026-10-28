// Rotation (specs#691).
import { resolveTokenVar } from '../values/tokens.js';

export function transformDecls(styles: Record<string, unknown>, tokensFormat: string): string[] {
  if (!('rotation' in styles) || styles.rotation === undefined) return [];
  const v = styles.rotation;
  const r = resolveTokenVar(v, tokensFormat);
  if (r) return [`transform: rotate(${r})`];
  // Zero rotation is the default, so emitting it would only add a transform —
  // and a transform creates a containing block for absolute descendants.
  if (typeof v === 'number' && v !== 0) return [`transform: rotate(${v}deg)`];
  return [];
}
