/**
 * Evaluation of the `glyphs` convention's two forms (ADR-103) over raw REST file
 * nodes — the name pattern (`match`) and the structural pattern (`structure`).
 *
 * Source of truth: specs-transforms/packages/specs-from-figma/src/Component/Elements/Primitives/GlyphConvention.ts.
 * Duplicated here so scan, fetch and the cache builder can detect glyphs without
 * pulling the engine into code paths that don't need it. Keep in sync if the engine
 * version changes.
 */

import type { GlyphStructure, GlyphStructureNode, ResolvedPlatformConventions } from '@directededges/specs-schema';

export type GlyphsConvention = NonNullable<ResolvedPlatformConventions['glyphs']>;

/** The raw REST node surface the structural matcher walks. */
export interface RawNodeLike {
  type?: string;
  name?: string;
  children?: RawNodeLike[];
  fills?: Array<{ type?: string; visible?: boolean; color?: { r: number; g: number; b: number } }>;
  componentPropertyDefinitions?: Record<string, unknown>;
}

/**
 * A glyph is a static asset: a component that declares properties — variants, text,
 * swaps — is a configurable component, never a glyph (ADR-103). Sets and their
 * variants are property-bearing by construction.
 */
export function isPropertyBearing(node: RawNodeLike): boolean {
  if (node.type === 'COMPONENT_SET') return true;
  return Object.keys(node.componentPropertyDefinitions ?? {}).length > 0;
}

/** True when either form of the convention is declared — the icons capability on-switch. */
export function hasGlyphConvention(glyphs: GlyphsConvention | undefined): boolean {
  return Boolean(glyphs?.match || glyphs?.structure);
}

/**
 * Stable signature of the declared convention, for cache staleness. A config edit to
 * either form changes what icons.yaml entries mean, with no change to any fetched file.
 */
export function glyphConventionSignature(glyphs: GlyphsConvention | undefined): string | undefined {
  if (!hasGlyphConvention(glyphs)) return undefined;
  return JSON.stringify(glyphs);
}

/**
 * Evaluate both forms against a component. Membership is the union; a name matched by
 * both forms takes `match`'s capture (the more specific declaration). Returns the glyph
 * name, or null when neither form matches (or none is declared).
 *
 * `structureNode` is the node whose children carry the structural evidence — the
 * component itself, or its default variant when the component is a set.
 */
export function glyphConventionName(
  name: string,
  structureNode: RawNodeLike | null,
  glyphs: GlyphsConvention | undefined,
): string | null {
  if (!glyphs) return null;

  if (glyphs.match) {
    const fromName = nameFormMatch(name, glyphs.match);
    if (fromName) return fromName;
  }

  if (glyphs.structure && structureNode
      && !isPropertyBearing(structureNode)
      && matchesGlyphStructure(structureNode, glyphs.structure)) {
    return nameFormMatch(name, glyphs.structure.name ?? '{i}');
  }

  return null;
}

/**
 * The `{i}` name rule, as fetch has always evaluated it: every `{i}` becomes a capture,
 * and a pattern without `{i}` matches literally and yields the full name. (The engine's
 * element-detection matcher requires a capture; this tolerant form is the CLI's
 * long-standing fetch behavior, kept for literal single-icon declarations.)
 */
function nameFormMatch(name: string, pattern: string): string | null {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{i\\\}/g, '(.+)');
  const regex = new RegExp(`^${escaped}$`);
  const normalized = name.replace(/\s+/g, ' ').trim();
  const match = normalized.match(regex);
  if (!match) return null;
  const extracted = (match[1] ?? normalized).trim();
  return extracted.length > 0 ? extracted : null;
}

/**
 * Structural membership (ADR-103): every child of `node` must match some entry in
 * `structure.children` — set-cover, exhaustive, so a component containing anything
 * besides the declared shapes is not a glyph. A node with no children declares no
 * structure and never matches; the same rule applies at nested levels whose matcher
 * declares `children`. When `structure.fill` is declared, every matched leaf must carry
 * a visible solid fill whose raw color is one of the listed `#RRGGBB` values
 * (token/style names in the list require resolution this matcher does not perform, so
 * they only widen the declaration, never match here).
 */
export function matchesGlyphStructure(node: RawNodeLike, structure: GlyphStructure): boolean {
  const children = node.children;
  if (!children || children.length === 0) return false;

  const leaves: RawNodeLike[] = [];
  if (!coverChildren(children, structure.children, leaves)) return false;

  if (structure.fill && structure.fill.length > 0) {
    return leaves.every((leaf) => fillMatches(leaf, structure.fill!));
  }
  return true;
}

/** Every child matches at least one matcher (recursively); matched childless nodes collect as leaves. */
function coverChildren(children: RawNodeLike[], matchers: GlyphStructureNode[], leaves: RawNodeLike[]): boolean {
  for (const child of children) {
    if (!matchers.some((matcher) => nodeMatches(child, matcher, leaves))) return false;
  }
  return true;
}

function nodeMatches(node: RawNodeLike, matcher: GlyphStructureNode, leaves: RawNodeLike[]): boolean {
  if (node.type !== matcher.type) return false;
  if (matcher.name && !wildcardMatch(node.name ?? '', matcher.name)) return false;

  if (matcher.children) {
    const grandchildren = node.children;
    if (!grandchildren || grandchildren.length === 0) return false;
    return coverChildren(grandchildren, matcher.children, leaves);
  }

  if (!node.children || node.children.length === 0) leaves.push(node);
  return true;
}

/** Literal name match with `*` wildcard, whitespace-normalized like the name pattern. */
function wildcardMatch(name: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(name.replace(/\s+/g, ' ').trim());
}

/** Any visible solid fill whose raw color is one of the accepted `#RRGGBB` values. */
function fillMatches(node: RawNodeLike, accepted: string[]): boolean {
  const fills = node.fills;
  if (!Array.isArray(fills)) return false;
  const acceptedHex = accepted.filter((value) => value.startsWith('#')).map((value) => value.toLowerCase());
  return fills.some((paint) => {
    if (paint?.type !== 'SOLID' || paint.visible === false || !paint.color) return false;
    return acceptedHex.includes(paintHex(paint.color));
  });
}

function paintHex(color: { r: number; g: number; b: number }): string {
  const channel = (value: number) => Math.round(value * 255).toString(16).padStart(2, '0');
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}
