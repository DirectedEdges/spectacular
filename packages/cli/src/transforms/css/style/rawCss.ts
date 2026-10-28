// Declarations a rule pre-pass injected (specs#691).
//
// A `CssRule` rewrites the structured variants data before any mapping runs, and
// `_rawCss` is how it hands through declarations it wrote itself. Emitted
// verbatim and last among the style keys, so a rule can override what the
// mapping derived.

export function rawCssDecls(styles: Record<string, unknown>): string[] {
  if (!('_rawCss' in styles) || !Array.isArray(styles._rawCss)) return [];
  return [...(styles._rawCss as string[])];
}
