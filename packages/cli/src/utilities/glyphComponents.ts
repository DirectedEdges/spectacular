/**
 * Glyph component discovery from a fetched file document.
 *
 * Shared by `fetch` (which downloads an SVG per glyph) and the cache builder
 * (which records each glyph's node id and published key), so both read the
 * same names out of the same conventions.
 *
 * @packageDocumentation
 */

import { glyphConventionName, type GlyphsConvention, type RawNodeLike } from './glyphConvention.js';

/**
 * Walk the file document for components the `glyphs` convention identifies (ADR-103) —
 * by name pattern (`match`, `{i}` captures the icon name) and/or by child structure
 * (`structure`, named from the component name). A glyph cannot have properties, so a
 * component set — property-bearing by construction — is never a glyph and is not
 * descended into; a matched component's internals are not descended into either.
 * Duplicate slugs keep the first occurrence and suffix later ones with the node id so
 * nothing is silently dropped.
 */
export function collectGlyphComponents(document: unknown, glyphs: GlyphsConvention | undefined): Array<{ id: string; name: string; slug: string }> {
  const found: Array<{ id: string; name: string; slug: string }> = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as RawNodeLike & { id?: string };
    if (n.type === 'COMPONENT' && typeof n.name === 'string' && typeof n.id === 'string') {
      const glyphName = glyphConventionName(n.name, n, glyphs);
      if (glyphName) found.push({ id: n.id, name: glyphName, slug: '' });
      return; // a component's internals hold no further glyph components
    }
    if (n.type === 'COMPONENT_SET') {
      return; // a glyph cannot have properties; a set's variants are not independent glyphs
    }
    for (const child of n.children ?? []) walk(child);
  };
  walk(document);

  const seen = new Set<string>();
  for (const glyph of found) {
    // Kebabize camelCase too, matching the scaffold's glyphUrl slugging. A
    // separator never survives before a digit run: the spec stores the camel
    // key, which cannot carry one ("Brightness 1" → brightness1), so the file
    // on disk must not either — or fetch and emit name different files.
    const base = glyph.name
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/-(?=\d)/g, '')
      .toLowerCase();
    glyph.slug = seen.has(base) ? `${base}-${glyph.id.replace(':', '-')}` : base;
    seen.add(base);
  }
  return found;
}
