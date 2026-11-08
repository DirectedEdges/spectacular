import { describe, it, expect } from 'vitest';
import { collectImageAssets, pagesOf } from '../../../src/fetch/assetImages.js';

const IMAGE = { type: 'IMAGE', imageRef: 'hash-a' };

/** A frame that paints an image, named however the caller says. */
function frame(name: string, ref = 'hash-a', overrides: Record<string, unknown> = {}) {
  return { id: `n-${name}`, name, type: 'FRAME', fills: [{ ...IMAGE, imageRef: ref }], ...overrides };
}

function page(name: string, children: unknown[]) {
  return { id: `p-${name}`, name, type: 'CANVAS', children };
}

const PATTERN = 'DE Image / {i}';

describe('collectImageAssets', () => {
  it('captures the name from the pattern for a direct page child', () => {
    const result = collectImageAssets([page('Images', [frame('DE Image / Wanaka')])], PATTERN);
    expect(result).toEqual([{ name: 'Wanaka', nodeId: 'n-DE Image / Wanaka', imageHash: 'hash-a' }]);
  });

  // The position rule (DSPEC-54) allows one section level, because that is how a
  // Figma page gets grouped by category.
  it('reaches a frame inside a section that is a direct page child', () => {
    const section = { id: 's1', name: 'Landscapes', type: 'SECTION', children: [frame('DE Image / Florence', 'hash-b')] };
    expect(collectImageAssets([page('Images', [section])], PATTERN).map(a => a.name)).toEqual(['Florence']);
  });

  it('does not reach a frame nested deeper than one section', () => {
    const inner = { id: 's2', name: 'Inner', type: 'SECTION', children: [frame('DE Image / Buried')] };
    const outer = { id: 's1', name: 'Outer', type: 'SECTION', children: [inner] };
    expect(collectImageAssets([page('Images', [outer])], PATTERN)).toEqual([]);
  });

  // The failure the position rule exists to prevent: a placeholder inside a
  // component named like an asset is not a library asset.
  it('does not reach a matching frame inside a component', () => {
    const component = { id: 'c1', name: 'DE Card', type: 'COMPONENT', children: [frame('DE Image / Placeholder')] };
    expect(collectImageAssets([page('Components', [component])], PATTERN)).toEqual([]);
  });

  it('skips a matching frame that paints no image', () => {
    const label = { id: 'l1', name: 'DE Image / Caption', type: 'FRAME', fills: [{ type: 'SOLID' }] };
    expect(collectImageAssets([page('Images', [label])], PATTERN)).toEqual([]);
  });

  it('skips an image frame whose name does not match — the declaration makes the set', () => {
    expect(collectImageAssets([page('Images', [frame('Scratch')])], PATTERN)).toEqual([]);
  });

  it('ignores a hidden image paint, as the style reader does', () => {
    const hidden = { id: 'h1', name: 'DE Image / Hidden', type: 'FRAME', fills: [{ ...IMAGE, visible: false }] };
    expect(collectImageAssets([page('Images', [hidden])], PATTERN)).toEqual([]);
  });

  it('spans every page, sorted by name', () => {
    const result = collectImageAssets([
      page('Two', [frame('DE Image / Zebra', 'hash-z')]),
      page('One', [frame('DE Image / Apple', 'hash-a')]),
    ], PATTERN);
    expect(result.map(a => a.name)).toEqual(['Apple', 'Zebra']);
  });

  it('keeps the first occurrence of a repeated name, as glyph collection does', () => {
    const result = collectImageAssets([
      page('One', [frame('DE Image / Same', 'first')]),
      page('Two', [frame('DE Image / Same', 'second')]),
    ], PATTERN);
    expect(result).toHaveLength(1);
    expect(result[0].imageHash).toBe('first');
  });

  it('finds nothing in a file with no pages', () => {
    expect(collectImageAssets([], PATTERN)).toEqual([]);
  });
});

describe('pagesOf', () => {
  it('reads the document children of a monolithic payload', () => {
    const payload = { document: { children: [page('Images', []), page('Components', [])] } };
    expect(pagesOf(payload).map(p => (p as { name: string }).name)).toEqual(['Images', 'Components']);
  });

  it('survives a payload with no document', () => {
    expect(pagesOf({})).toEqual([]);
    expect(pagesOf(null)).toEqual([]);
  });
});
