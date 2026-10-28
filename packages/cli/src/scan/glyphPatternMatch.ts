/**
 * Match a name against a glyph pattern containing {i} placeholder.
 * Returns the extracted portion if matched, or null if no match.
 *
 * Source of truth: specs-transforms/packages/specs-from-figma/src/Utilities/Utilities.ts → glyphPatternMatch.
 * Duplicated here so scan can partition components without pulling the engine
 * into a code path that doesn't need it. Keep in sync if the engine version changes.
 */
export function glyphPatternMatch(name: string, pattern: string): string | null {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{i\\}', '(.+)');
  const regex = new RegExp(`^${escaped}$`);
  const normalized = name.replace(/\s+/g, ' ').trim();
  const match = normalized.match(regex);
  if (!match?.[1]) return null;
  const extracted = match[1].trim();
  return extracted.length > 0 ? extracted : null;
}
