import { describe, it, expect } from 'vitest';
import { elementScopeGaps } from '../../../src/validate/platformGaps.js';

// Runs against the real installed bindings: `strokes` is bound for figma with an
// element scope that excludes glyphs — the recorded strokes-on-glyph failure.
describe('elementScopeGaps', () => {
  const api = {
    anatomy: {
      root: { type: 'container' },
      icon: { type: 'glyph' },
    },
  };

  it('reports a bound key carried by an element type outside its scope', () => {
    const variants = {
      default: { elements: { icon: { styles: { strokes: [{ color: '#000' }] } } } },
    };
    const gaps = elementScopeGaps('fav', [api, variants, {}]);
    const hit = gaps.find(g => g.element === 'icon' && g.property === 'strokes');
    expect(hit).toBeDefined();
    expect(hit?.elementType).toBe('glyph');
  });

  it('stays silent for the same key on an element type inside its scope', () => {
    const variants = {
      default: { elements: { root: { styles: { strokes: [{ color: '#000' }] } } } },
    };
    expect(elementScopeGaps('fav', [api, variants, {}])).toEqual([]);
  });

  it('types a fill triplet\'s elements by its own anatomy, not the api\'s', () => {
    const examples = {
      slotContentExamples: {
        fill: {
          anatomy: { icon: { type: 'container' } },
          elements: { icon: { styles: { strokes: [{ color: '#000' }] } } },
          layout: ['icon'],
        },
      },
    };
    expect(elementScopeGaps('fav', [api, {}, examples])).toEqual([]);
  });

  it('skips elements the anatomy does not type', () => {
    const variants = {
      default: { elements: { ghost: { styles: { strokes: [{ color: '#000' }] } } } },
    };
    expect(elementScopeGaps('fav', [api, variants, {}])).toEqual([]);
  });
});
