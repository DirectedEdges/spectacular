// A variant stating an aspect ratio has to release the height the default block
// fixed, or the ratio is inert.
//
// `sizeDecls` already applies this within one style set. These pin it across
// blocks, which is where it was missing: a default block declaring both `width`
// and `height`, and six `aspectRatio` variants each emitting nothing but the
// ratio. CSS ignores `aspect-ratio` when both dimensions are definite, so all
// six rendered identically to the default and the Storybook control looked dead.
import { describe, it, expect } from 'vitest';
import { ratioReleaseDecls } from '../../../../src/transforms/css/sheet/ratioRelease.js';

const RATIO = { aspectRatio: { x: 16, y: 9 } };

describe('ratioReleaseDecls', () => {
  it('releases the height a default block fixed', () => {
    expect(ratioReleaseDecls(RATIO, { styles: { width: 373, height: 210 } })).toEqual(['height: auto']);
  });

  it('releases it whether or not the default also fixed a width', () => {
    expect(ratioReleaseDecls(RATIO, { styles: { height: 210 } })).toEqual(['height: auto']);
  });

  it('states nothing where the default block fixed no height', () => {
    expect(ratioReleaseDecls(RATIO, { styles: { width: 373 } })).toEqual([]);
  });

  // The default block's own `sizeDecls` already withheld its height, so there is
  // nothing in the cascade to undo.
  it('states nothing where the default block stated a ratio of its own', () => {
    const defaults = { styles: { height: 210, aspectRatio: { x: 4, y: 3 } } };
    expect(ratioReleaseDecls(RATIO, defaults)).toEqual([]);
  });

  it('states nothing for a variant that does not touch the ratio', () => {
    expect(ratioReleaseDecls({ cornerRadius: 8 }, { styles: { height: 210 } })).toEqual([]);
  });

  // `aspectRatio: null` states that the element has NO ratio, which is a
  // different claim from not mentioning it — and its height is authored.
  it('states nothing where the variant nulls the ratio', () => {
    expect(ratioReleaseDecls({ aspectRatio: null }, { styles: { height: 210 } })).toEqual([]);
  });

  it('states nothing where the element has no default block entry', () => {
    expect(ratioReleaseDecls(RATIO, undefined)).toEqual([]);
  });
});
