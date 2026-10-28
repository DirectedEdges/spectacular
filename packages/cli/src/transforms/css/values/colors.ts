// Colour values (specs#691).
import { cssVar, isTokenRef, resolveTokenVar } from './tokens.js';

/** Render a color-style value. null → transparent, token → var(), string → as-is. */
export function colorValue(v: unknown, tokensFormat = 'TOKEN'): string | null {
  if (v === null) return 'transparent';
  if (v === undefined) return null;
  if (isTokenRef(v) || (typeof v === 'object' && v !== null)) {
    const resolved = resolveTokenVar(v, tokensFormat);
    if (resolved) return resolved;
  }
  if (typeof v === 'string') {
    if (v.startsWith('--')) return cssVar(v); // bare CSS var string (FIGMA_SYNTAX_WEB)
    return v;
  }
  if (typeof v === 'object' && v !== null && 'colorSpace' in (v as object)) {
    const co = v as { hex?: string };
    return co.hex ?? 'currentColor';
  }
  // GradientValue is not a color — callers map gradients per property via gradientValue()
  return null;
}
