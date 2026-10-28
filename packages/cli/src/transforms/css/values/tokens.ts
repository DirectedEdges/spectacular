// Turning a spec token reference into a CSS custom property (specs#691).
//
// Two things make this more than a name transform. The custom-property name is
// derived from the whole token path, so any character CSS will not accept has to
// be dropped and reported. And a variable Figma could not resolve at capture time
// arrives with a perfectly ordinary-looking name that is defined nowhere — a
// reference that is dead on arrival, and worse than emitting nothing where it
// lands on a size.
import { UNRESOLVED_WARNING, recordNameWarning } from './nameWarnings.js';

export function isTokenRef(v: unknown): v is { $token: string; $type: string } {
  return typeof v === 'object' && v !== null && '$token' in v;
}

/**
 * Anything CSS will not accept in a dashed-ident: not a letter, digit, "-", "_",
 * or non-ASCII. Built from a string so the codepoint range reads as an escape
 * rather than as two literal control characters in the source.
 */
const INVALID_IDENT_CHARS = new RegExp('[^a-z0-9_\\-\\u0080-\\uFFFF]', 'g');

/**
 * Kebabize a token path to a CSS custom property name.
 * Applied for TOKEN, TOKEN_FIGMA_EXTENSIONS, TOKEN_NAME, FIGMA_NAME, and as
 * the final fallback in all other formats.
 *
 * Transform steps (in order):
 *   ", " → "-"     ("Body/M, Emphasized" → "Body/M-Emphasized")
 *   "/"  → "-"
 *   " +" → "-"
 *   "_+" → "-"
 *   "-+" → "-"     (dedupe)
 *   lowercase
 *   strip leading "-"
 *
 * Invalid characters are dropped afterwards; each drop is recorded for the
 * end-of-run warning summary.
 */
export function kebabizePath(path: string): string {
  const kebabized = path
    .replace(/,\s*/g, '-')
    .replace(/\//g, '-')
    .replace(/\s+/g, '-')
    .replace(/_+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .replace(/^-/, '');
  const sanitized = kebabized
    .replace(INVALID_IDENT_CHARS, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (sanitized !== kebabized) {
    recordNameWarning('invalid characters dropped from CSS custom property name', path);
  }
  return sanitized;
}

/**
 * The captured raw value the engine carries for an unresolvable token
 * (`$extensions['com.figma'].rawValue`) — the degrade rung between a dead
 * var() reference and no declaration at all.
 */
export function extensionsRawValue(v: unknown): unknown {
  if (!v || typeof v !== 'object') return undefined;
  const ext = (v as Record<string, unknown>).$extensions as Record<string, unknown> | undefined;
  const figma = ext?.['com.figma'] as Record<string, unknown> | undefined;
  return figma?.rawValue;
}

/**
 * Names the engine writes when part of a variable or style could not be read:
 * a bracketed `[…unresolved…]` segment where the collection name should be,
 * and a sentinel variable name when the lookup itself came back empty.
 *
 * A missing collection is not survivable either. Custom-property names are
 * derived from the whole path, collection included, so a path carrying the
 * sentinel derives a name no stylesheet defines — the reference is dead
 * whichever half of it failed to resolve.
 */
const UNRESOLVED_SEGMENT = /\[[^\]]*unresolved[^\]]*\]/i;
const UNRESOLVED_NAMES = new Set(['Unavailable variable', 'Variable (no loader)']);

/**
 * A variable Figma could not resolve at capture time. Its sentinel name
 * kebabizes into a perfectly ordinary custom-property name that is defined
 * nowhere, so the reference is dead on arrival.
 *
 * Emitting it is worse than emitting nothing: where the declaration lands on a
 * size or spacing property, the element collapses to zero. Only a colour
 * carries a raw value in the spec to degrade to, so the remaining rungs of the
 * ladder are that raw value, or no declaration at all.
 */
export function isUnresolvedTokenPath(path: string): boolean {
  const trimmed = path.trim();
  if (UNRESOLVED_SEGMENT.test(trimmed)) return true;
  return UNRESOLVED_NAMES.has(trimmed.slice(trimmed.lastIndexOf('/') + 1));
}

/** Wrap a CSS variable name in var(), with an optional fallback value. */
export function cssVar(name: string, fallback?: string): string {
  const n = name.replace(/^--/, '');
  return fallback ? `var(--${n}, ${fallback})` : `var(--${n})`;
}

/**
 * The value a token reference falls back to when its variable has no definition.
 *
 * `cssvars` skips a variable whose value aliases one outside the fetched
 * payload, but the stylesheets still reference it by name — so the declaration
 * resolves to nothing and the surface renders transparent or inherited. The
 * spec carries what Figma last read for that token, so the reference degrades
 * to it rather than to nothing.
 *
 * A bare number needs a unit, and the reference already declares one: `$type`
 * says whether the token is a length or a bare quantity. Read it rather than
 * inferring from the number, which cannot distinguish `8` the length from `8`
 * the font weight. A `$type` that settles no unit contributes no fallback —
 * the value is carried, not invented.
 */
function rawValueFallback(v: unknown): string | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const raw = extensionsRawValue(v);
  if (raw === undefined || raw === null) return undefined;

  // A colour is unambiguous whatever the reference declares.
  if (typeof raw === 'object') {
    const hex = (raw as Record<string, unknown>).hex;
    return typeof hex === 'string' ? hex : undefined;
  }
  if (typeof raw !== 'number') return undefined;

  switch ((v as Record<string, unknown>).$type) {
    case 'dimension':
      return raw === 0 ? '0' : `${raw}px`;
    case 'number':
      return String(raw);
    default:
      return undefined;
  }
}

/**
 * Resolve a spec token reference to a CSS var() string.
 *
 * Resolution is format-aware:
 *
 *   FIGMA_SYNTAX_WEB
 *     - String starting with "--" → var(that string)
 *     - { $token } fallback (no web syntax set) → path derivation
 *
 *   CUSTOM
 *     1. $cssVar field on the custom object → var($cssVar)
 *     2. Variables file reverse lookup (deferred — requires --variables flag, not yet wired)
 *     3. Path derivation fallback
 *
 *   Everything else (TOKEN, TOKEN_FIGMA_EXTENSIONS, TOKEN_NAME, FIGMA_NAME, …)
 *     - { $token } object → kebabize path
 *     - plain string     → kebabize string
 */
export function resolveTokenVar(v: unknown, tokensFormat: string): string | null {
  if (v === null || v === undefined) return null;

  // ── FIGMA_SYNTAX_WEB ────────────────────────────────────────────────────────
  if (tokensFormat === 'FIGMA_SYNTAX_WEB') {
    if (typeof v === 'string') {
      // Designer set a web code syntax — already the CSS var name
      if (v.startsWith('--')) return cssVar(v);
      // Non-"--" string: no web syntax was set; fall through to path derivation below
    }
    // { $token } fallback shape (FIGMA_SYNTAX_WEB falls back to TOKEN when unset)
    if (isTokenRef(v)) {
      if (isUnresolvedTokenPath(v.$token)) {
        recordNameWarning(UNRESOLVED_WARNING, v.$token);
        return rawValueFallback(v) ?? null;
      }
      return cssVar(kebabizePath(v.$token));
    }
    return null;
  }

  // ── CUSTOM ──────────────────────────────────────────────────────────────────
  if (tokensFormat === 'CUSTOM') {
    if (typeof v === 'object' && v !== null) {
      const obj = v as Record<string, unknown>;

      // Step 1: $cssVar explicitly set in the custom object
      if (typeof obj.$cssVar === 'string') return cssVar(obj.$cssVar);

      // Step 2: variables file reverse lookup — deferred (requires --variables flag)
      // When implemented: build reverse index JSON.stringify($custom) → codeSyntax.WEB

      // Step 3: path derivation — try $token if present in the custom object
      if (typeof obj.$token === 'string') {
        if (isUnresolvedTokenPath(obj.$token)) {
          recordNameWarning(UNRESOLVED_WARNING, obj.$token);
          return rawValueFallback(v) ?? null;
        }
        return cssVar(kebabizePath(obj.$token));
      }
    }
    return null;
  }

  // ── TOKEN / TOKEN_FIGMA_EXTENSIONS / TOKEN_NAME / FIGMA_NAME / others ───────
  if (isTokenRef(v)) {
    const fallback = rawValueFallback(v);
    if (isUnresolvedTokenPath(v.$token)) {
      recordNameWarning(UNRESOLVED_WARNING, v.$token);
      return fallback ?? null;
    }
    return cssVar(kebabizePath(v.$token), fallback);
  }
  if (typeof v === 'string') return cssVar(kebabizePath(v));
  return null;
}

/**
 * @deprecated Use {@link resolveTokenVar} with a `tokensFormat` instead.
 *
 * Kept for callers that do not yet pass one; behaves as TOKEN format.
 */
export function tokenVar(v: { $token: string }): string {
  return cssVar(kebabizePath(v.$token));
}
