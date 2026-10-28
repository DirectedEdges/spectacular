import { describe, it, expect } from 'vitest';
import { SectionedComponentDiscovery } from '../../../src/scan/discovery.js';
import type { SectionedFile } from '../../../src/utilities/sectionedFile.js';

/**
 * The page-split discovery path (specs#561) must qualify compositions identically to
 * the whole-graph one (ADR-095) — it has no parent table, so the outermost-wins rule
 * is carried down the walk instead of resolved by walking up.
 */
describe('SectionedComponentDiscovery.findCompositions', () => {
  const ready = { type: 'READY_FOR_DEV' };

  function fake(pages: any[]): SectionedFile {
    return {
      root: () => ({ name: 'Library', lastModified: '2026-09-29T00:00:00Z' }),
      pageEntries: () => pages.map((p, i) => ({ id: p.id ?? `page-${i}` })),
      loadPage: (entry: { id: string }) => pages.find((p, i) => (p.id ?? `page-${i}`) === entry.id),
      releasePage: () => {},
    } as unknown as SectionedFile;
  }

  it('lists a marked frame wherever it sits, across pages', () => {
    const d = new SectionedComponentDiscovery(fake([
      { id: 'p0', name: 'Page 1', type: 'PAGE', children: [
        { id: '2:0', name: 'Checkout', type: 'FRAME', devStatus: ready, children: [] },
      ] },
      { id: 'p1', name: 'Page 2', type: 'PAGE', children: [
        { id: '3:0', name: 'Screens', type: 'SECTION', children: [
          { id: '3:1', name: 'Home', type: 'FRAME', devStatus: ready, children: [] },
        ] },
      ] },
    ]));
    expect(d.findCompositions().map(c => c.id).sort()).toEqual(['2:0', '3:1']);
  });

  it('does not list a marked frame nested in a marked frame', () => {
    const d = new SectionedComponentDiscovery(fake([
      { id: 'p0', name: 'Page 1', type: 'PAGE', children: [
        { id: '2:0', name: 'Checkout', type: 'FRAME', devStatus: ready, children: [
          { id: '2:1', name: 'Panel', type: 'FRAME', devStatus: ready, children: [
            { id: '2:2', name: 'Deeper', type: 'FRAME', devStatus: ready, children: [] },
          ] },
        ] },
      ] },
    ]));
    expect(d.findCompositions().map(c => c.id)).toEqual(['2:0']);
  });

  it('lists a marked frame whose marked-ancestor chain is broken by an unmarked frame', () => {
    const d = new SectionedComponentDiscovery(fake([
      { id: 'p0', name: 'Page 1', type: 'PAGE', children: [
        { id: '2:0', name: 'Wrapper', type: 'FRAME', children: [
          { id: '2:1', name: 'Home', type: 'FRAME', devStatus: ready, children: [] },
        ] },
      ] },
    ]));
    expect(d.findCompositions().map(c => c.id)).toEqual(['2:1']);
  });

  it('does not list an unmarked frame, and leaves component rows unchanged', () => {
    const d = new SectionedComponentDiscovery(fake([
      { id: 'p0', name: 'Page 1', type: 'PAGE', children: [
        { id: '2:0', name: 'Scratch', type: 'FRAME', children: [
          { id: '2:1', name: 'Button', type: 'COMPONENT_SET', children: [
            { id: '2:2', name: 'Size=S', type: 'COMPONENT', children: [] },
          ] },
        ] },
      ] },
    ]));
    expect(d.findCompositions()).toHaveLength(0);
    expect(d.findAllComponents().map(c => c.id)).toEqual(['2:1']);
  });
});
