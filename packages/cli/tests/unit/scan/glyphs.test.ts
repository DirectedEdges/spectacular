import { describe, it, expect } from 'vitest';
import { partitionByGlyphConvention } from '../../../src/commands/scan.js';
import { ManifestParserV2 } from '../../../src/utilities/manifestParserV2.js';
import type { ComponentInfo } from '../../../src/scan/discovery.js';

function ci(
  id: string,
  name: string,
  type: 'COMPONENT' | 'COMPONENT_SET' = 'COMPONENT_SET',
  devStatus: 'READY_FOR_DEV' | 'NONE' = 'NONE'
): ComponentInfo {
  return { id, name, type, devStatus };
}

describe('partitionByGlyphConvention', () => {
  it('returns all components when no ids are identified', () => {
    const all = [ci('1:1', 'Button'), ci('1:2', 'DS Icon Glyph / arrow')];
    const { components, glyphs } = partitionByGlyphConvention(all, new Set());
    expect(components).toHaveLength(2);
    expect(glyphs).toHaveLength(0);
  });

  it('splits components and glyphs by identified ids', () => {
    const all = [
      ci('1:1', 'Button'),
      ci('1:2', 'DS Icon Glyph / arrow-down'),
      ci('1:3', 'Card'),
      ci('1:4', 'DS Icon Glyph / close')
    ];
    const { components, glyphs } = partitionByGlyphConvention(all, new Set(['1:2', '1:4']));
    expect(components.map(c => c.name)).toEqual(['Button', 'Card']);
    expect(glyphs.map(g => g.name)).toEqual([
      'DS Icon Glyph / arrow-down',
      'DS Icon Glyph / close'
    ]);
  });
});

describe('ManifestParserV2 — Glyphs section', () => {
  const manifestWithGlyphs = `# Component Manifest

**Scan format version:** 2
**File:** test.json

---

## Components

| ✓ | Name | ID | Type | Dev Status |
|------|------|------|------|------------|
| [x] | Button | 1:1 | COMPONENT_SET | READY_FOR_DEV |
| [ ] | Card | 1:3 | COMPONENT_SET | NONE |

## Glyphs

| Name | ID | Type |
|------|------|------|
| DS Icon Glyph / arrow | 1:2 | COMPONENT |
| DS Icon Glyph / close | 1:4 | COMPONENT |
`;

  it('parses only Components section rows, ignoring Glyphs', () => {
    const result = ManifestParserV2.parse(manifestWithGlyphs);
    expect(result.components.map(c => c.id)).toEqual(['1:1', '1:3']);
  });

  it('round-trips component check state when a Glyphs section is present', () => {
    const result = ManifestParserV2.parse(manifestWithGlyphs);
    const button = result.components.find(c => c.id === '1:1')!;
    const card = result.components.find(c => c.id === '1:3')!;
    expect(button.included).toBe(true);
    expect(card.included).toBe(false);
  });
});
