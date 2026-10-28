import { describe, it, expect } from 'vitest';
import { collectGlyphComponents } from '../../../src/commands/fetch.js';

const PATTERN = 'DS Icon asset / {i}';

function component(id: string, name: string, children: unknown[] = []) {
  return { id, name, type: 'COMPONENT', children };
}

describe('collectGlyphComponents', () => {
  it('collects COMPONENT nodes matching the pattern and captures the icon name', () => {
    const doc = { children: [component('1:1', 'DS Icon asset / Check'), component('1:2', 'Button')] };
    const glyphs = collectGlyphComponents(doc, { match: PATTERN });
    expect(glyphs).toEqual([{ id: '1:1', name: 'Check', slug: 'check' }]);
  });

  it('ignores non-COMPONENT nodes even when their names match', () => {
    const doc = {
      children: [
        { id: '2:1', name: 'DS Icon asset / Close', type: 'FRAME', children: [] },
        { id: '2:2', name: 'DS Icon asset / Close', type: 'INSTANCE', children: [] },
      ],
    };
    expect(collectGlyphComponents(doc, { match: PATTERN })).toEqual([]);
  });

  it('walks nested children at any depth', () => {
    const doc = {
      children: [
        { id: 'p', name: 'Page', type: 'CANVAS', children: [
          { id: 'f', name: 'Icons', type: 'FRAME', children: [component('3:1', 'DS Icon asset / Star')] },
        ] },
      ],
    };
    expect(collectGlyphComponents(doc, { match: PATTERN })).toHaveLength(1);
  });

  it('kebabizes spaces, underscores, and camelCase into stable slugs', () => {
    const doc = {
      children: [
        component('4:1', 'DS Icon asset / Arrow Left'),
        component('4:2', 'DS Icon asset / expandMore'),
        component('4:3', 'DS Icon asset / snake_case_name'),
        component('4:4', 'DS Icon asset /   padded   '),
      ],
    };
    const slugs = collectGlyphComponents(doc, { match: PATTERN }).map(g => g.slug);
    expect(slugs).toEqual(['arrow-left', 'expand-more', 'snake-case-name', 'padded']);
  });

  it('suffixes duplicate slugs with the node id instead of dropping them', () => {
    const doc = {
      children: [component('5:1', 'DS Icon asset / Check'), component('5:2', 'DS Icon asset / check')],
    };
    const slugs = collectGlyphComponents(doc, { match: PATTERN }).map(g => g.slug);
    expect(slugs).toEqual(['check', 'check-5-2']);
  });

  it('escapes regex-special characters in the pattern', () => {
    const doc = { children: [component('6:1', 'Icons (v2) / Check'), component('6:2', 'Icons xv2y / Check')] };
    const glyphs = collectGlyphComponents(doc, { match: "Icons (v2) / {i}" });
    expect(glyphs).toEqual([{ id: '6:1', name: 'Check', slug: 'check' }]);
  });

  it('requires a full-name match, not a substring', () => {
    const doc = { children: [component('7:1', 'Prefix DS Icon asset / Check suffix')] };
    expect(collectGlyphComponents(doc, { match: PATTERN })).toEqual([]);
  });

  it('a pattern without {i} matches literally and uses the full name', () => {
    const doc = { children: [component('8:1', 'Logo')] };
    expect(collectGlyphComponents(doc, { match: "Logo" })).toEqual([{ id: '8:1', name: 'Logo', slug: 'logo' }]);
  });

  it('returns empty for null or non-object documents', () => {
    expect(collectGlyphComponents(null, { match: PATTERN })).toEqual([]);
    expect(collectGlyphComponents(undefined, { match: PATTERN })).toEqual([]);
    expect(collectGlyphComponents('text', { match: PATTERN })).toEqual([]);
  });
});

describe('collectGlyphComponents — structural form (ADR-103)', () => {
  const structure = { children: [{ type: 'VECTOR', name: 'Vector' }] };
  const vector = (name = 'Vector', fill?: { r: number; g: number; b: number }) => ({
    id: 'v', name, type: 'VECTOR',
    ...(fill ? { fills: [{ type: 'SOLID', color: fill }] } : {}),
  });

  it('collects plainly named components whose children match the structure', () => {
    const doc = {
      children: [
        component('1:1', 'Add', [vector()]),
        component('1:2', 'Button', [{ id: 't', name: 'Label', type: 'TEXT' }]),
      ],
    };
    expect(collectGlyphComponents(doc, { structure })).toEqual([
      { id: '1:1', name: 'Add', slug: 'add' },
    ]);
  });

  it('applies the structure naming rule to the component name', () => {
    const doc = { children: [component('2:1', 'AddIcon', [vector()])] };
    const glyphs = { structure: { ...structure, name: '{i}Icon' } };
    expect(collectGlyphComponents(doc, glyphs)).toEqual([
      { id: '2:1', name: 'Add', slug: 'add' },
    ]);
  });

  it('enforces the fill discriminant on leaves', () => {
    const black = { r: 0x16 / 255, g: 0x16 / 255, b: 0x16 / 255 };
    const doc = {
      children: [
        component('3:1', 'Add', [vector('Vector', black)]),
        component('3:2', 'Brand', [vector('Vector', { r: 1, g: 0, b: 0 })]),
      ],
    };
    const glyphs = { structure: { ...structure, fill: ['#161616'] } };
    expect(collectGlyphComponents(doc, glyphs).map(g => g.name)).toEqual(['Add']);
  });

  it('a glyph cannot have properties — a component set and its variants are never glyphs', () => {
    const doc = {
      children: [{
        id: '4:0', name: 'Add', type: 'COMPONENT_SET',
        children: [component('4:1', 'Size=16', [vector()]), component('4:2', 'Size=24', [vector()])],
      }],
    };
    expect(collectGlyphComponents(doc, { structure })).toEqual([]);
  });

  it('a component declaring properties is a configurable component, not a glyph', () => {
    const configurable = {
      ...component('6:1', 'Pointer', [vector()]),
      componentPropertyDefinitions: { direction: { type: 'VARIANT' } },
    };
    const doc = { children: [configurable, component('6:2', 'Add', [vector()])] };
    expect(collectGlyphComponents(doc, { structure }).map(g => g.name)).toEqual(['Add']);
  });

  it('membership is the union of forms', () => {
    const doc = {
      children: [
        component('5:1', 'DS Icon asset / Check'),
        component('5:2', 'Cross', [vector()]),
      ],
    };
    const glyphs = { match: PATTERN, structure };
    expect(collectGlyphComponents(doc, glyphs).map(g => g.name)).toEqual(['Check', 'Cross']);
  });
});
