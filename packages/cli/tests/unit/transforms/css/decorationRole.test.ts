// What a `decoration` role does to the stylesheet (/roles/decoration/).
//
// `aria-hidden` says "this means nothing" to assistive technology; the hit-test
// is the same statement to the pointer. The scope is the part worth pinning: a
// childless decoration is an overlay and goes hit-transparent, while one with
// children keeps its hit-test, because the role's focusable-content rule bars
// interactive descendants but not ordinary text — and unselectable text is a
// silent loss. The docs page is the specification.
import { describe, it, expect } from 'vitest';
import { decorationIsHitTransparent, DECORATION_HIT_DECL } from '../../../../src/transforms/css/sheet/decorationRole.js';

/** `outline` under `root`, the shape a card's border overlay has. */
const overlay = new Map([['outline', 'root']]);
/** `panel` with a caption of its own — a decorative box around content. */
const withChild = new Map([['panel', 'root'], ['caption', 'panel']]);

describe('decorationIsHitTransparent', () => {
  it('makes a childless decoration hit-transparent', () => {
    expect(decorationIsHitTransparent('outline', { outline: 'decoration' }, overlay)).toBe(true);
  });

  it('leaves a decoration with children alone', () => {
    expect(decorationIsHitTransparent('panel', { panel: 'decoration' }, withChild)).toBe(false);
  });

  it('leaves an element whose role is something else, or absent', () => {
    expect(decorationIsHitTransparent('outline', { outline: 'indicator' }, overlay)).toBe(false);
    expect(decorationIsHitTransparent('outline', {}, overlay)).toBe(false);
  });

  it('declares pointer-events: none and nothing else', () => {
    expect(DECORATION_HIT_DECL).toBe('pointer-events: none');
  });
});
