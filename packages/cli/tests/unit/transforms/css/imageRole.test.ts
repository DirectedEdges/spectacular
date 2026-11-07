// What an `image` role does to the stylesheet (/roles/image/).
//
// The path test in `imageRole.ts` is a deliberate second statement of
// `resolveImageForm` in `@directededges/from-specs` — this package must not
// depend on the emitters. These tests are this side's half of pinning the rule;
// the emitters pin theirs. The docs page is what both follow.
//
// The behaviour that matters: on the element path the picture arrives through a
// `src` attribute, so the stylesheet must stop painting it as a background. It
// was emitting both, which fetches the image twice and hands `object-fit` two
// different boxes to fit.
import { describe, it, expect } from 'vitest';
import { imageRoleTakesFill, imageElementFitDecls } from '../../../../src/transforms/css/sheet/imageRole.js';

const FILL = { backgroundImage: { $image: '#/components/image/images/hero' } };

/** `media` under `root`, the shape an authored image component has. */
const nested = new Map([['media', 'root']]);
/** `media` with a child of its own — an image painted behind content. */
const withChild = new Map([['media', 'root'], ['caption', 'media']]);

describe('imageRoleTakesFill — only the element path moves the fill', () => {
  it('takes the fill from a childless element with an image fill', () => {
    expect(imageRoleTakesFill('media', { media: 'image' }, { media: 'container' }, FILL, nested)).toBe(true);
  });

  it('leaves it where the element has children', () => {
    expect(imageRoleTakesFill('media', { media: 'image' }, { media: 'container' }, FILL, withChild)).toBe(false);
  });

  it('leaves it on a drawing, which has no fill to move', () => {
    expect(imageRoleTakesFill('media', { media: 'image' }, { media: 'glyph' }, FILL, nested)).toBe(false);
    expect(imageRoleTakesFill('media', { media: 'image' }, { media: 'vector' }, FILL, nested)).toBe(false);
  });

  it('leaves it where the element declares no image fill', () => {
    expect(imageRoleTakesFill('media', { media: 'image' }, { media: 'container' }, {}, nested)).toBe(false);
  });

  it('leaves it where the role is something else, or absent', () => {
    expect(imageRoleTakesFill('media', { media: 'indicator' }, { media: 'container' }, FILL, nested)).toBe(false);
    expect(imageRoleTakesFill('media', {}, { media: 'container' }, FILL, nested)).toBe(false);
  });
});

describe('imageElementFitDecls — the same two facts, against the content box', () => {
  it('states the fit and position, and never a background', () => {
    const decls = imageElementFitDecls(FILL.backgroundImage);
    expect(decls).toEqual(['object-position: center', 'object-fit: cover']);
    expect(decls.join(' ')).not.toContain('background');
  });

  it('carries CONTAIN through', () => {
    expect(imageElementFitDecls({ $image: '#/x', objectFit: 'CONTAIN' })).toEqual([
      'object-position: center',
      'object-fit: contain',
    ]);
  });

  // Absent means COVER, the same default `backgroundImageDecls` applies.
  it('defaults to cover where the fill states no fit', () => {
    expect(imageElementFitDecls({ $image: '#/x' })).toContain('object-fit: cover');
  });

  it('states nothing for a fill that is not an object', () => {
    expect(imageElementFitDecls(null)).toEqual([]);
    expect(imageElementFitDecls(undefined)).toEqual([]);
  });
});
