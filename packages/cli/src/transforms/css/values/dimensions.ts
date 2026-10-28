// Lengths and bare numbers, and what to do when the token behind one is dead
// (specs#691).
import { UNRESOLVED_RAW_WARNING, UNRESOLVED_WARNING, recordNameWarning } from './nameWarnings.js';
import { extensionsRawValue, isTokenRef, isUnresolvedTokenPath, resolveTokenVar, tokenVar } from './tokens.js';

/** Render a dimension-style value (number → px, token → var(), string → as-is). */
export function dimensionValue(v: unknown, tokensFormat = 'TOKEN'): string | null {
  if (v === null || v === undefined) return null;
  if (isTokenRef(v) || (typeof v === 'object' && v !== null)) {
    const resolved = resolveTokenVar(v, tokensFormat);
    if (resolved) return resolved;
  }
  // resolveTokenVar returning null for a token ref means it withheld the
  // reference deliberately (an unresolved variable) — the legacy path must not
  // re-emit what it just refused. The captured raw value, where the engine
  // carried one, is the honest rung between that and nothing.
  if (isTokenRef(v)) {
    if (!isUnresolvedTokenPath(v.$token)) return tokenVar(v);
    const raw = extensionsRawValue(v);
    if (raw !== undefined) {
      const literal = dimensionValue(raw, tokensFormat);
      if (literal !== null) {
        recordNameWarning(UNRESOLVED_RAW_WARNING, v.$token);
        return literal;
      }
    }
    return null;
  }
  if (typeof v === 'number') return v === 0 ? '0' : `${v}px`;
  if (typeof v === 'string') return v;
  return null;
}

/**
 * A single property whose token could not be resolved must still be written.
 *
 * Omitting it lets a base rule's value for the same property win, which is not
 * what the design says: the variant overrode that property, with a value we
 * cannot read. `unset` states exactly that, and matches what the browser did
 * with the old dead `var()` reference — a var() that resolves to nothing is
 * invalid at computed-value time, which makes the property take its inherited
 * or initial value.
 *
 * Only for a declaration written from one value. A value composed into a
 * shorthand (padding's four sides, a shadow's offsets) must keep returning
 * null, so the composite falls back to its own zero rather than embedding a
 * keyword where a length belongs.
 */
export function dimensionValueOrUnset(v: unknown, tokensFormat = 'TOKEN'): string | null {
  if (isTokenRef(v) && isUnresolvedTokenPath(v.$token)) {
    // Degrade to the captured raw value where the engine carried one — the
    // real number the node had at capture time — before falling to `unset`.
    const raw = extensionsRawValue(v);
    const literal = raw !== undefined ? dimensionValue(raw, tokensFormat) : null;
    if (literal !== null) {
      recordNameWarning(UNRESOLVED_RAW_WARNING, v.$token);
      return literal;
    }
    recordNameWarning(UNRESOLVED_WARNING, v.$token);
    return 'unset';
  }
  return dimensionValue(v, tokensFormat);
}
