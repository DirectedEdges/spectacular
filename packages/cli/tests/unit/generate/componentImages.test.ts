import { describe, it, expect } from 'vitest';
import {
  collectComponentImages, mergeComponentImages, type ComponentImage,
} from '../../../src/generate/componentImages.js';

/** A registry entry as a spec carries it: Figma identity, plus `src` once resolved. */
function entry(hash: string, src?: string) {
  return { ...(src ? { src } : {}), $extensions: { 'com.figma': { imageHash: hash } } };
}

const IMAGES_DIR = 'assets/images';

describe('collectComponentImages', () => {
  it('records every image with the component that references it', () => {
    const result = collectComponentImages([
      { name: 'heroBanner', spec: { images: { backdrop: entry('aaa', '../../assets/images/aaa.png') } } },
    ], IMAGES_DIR);
    expect(result).toEqual([
      { imageHash: 'aaa', src: 'assets/images/aaa.png', usedBy: ['heroBanner'], origin: 'component' },
    ]);
  });

  // The cache does not know where the reader is standing, so the spec-relative
  // path it carries is rewritten against the config directory.
  it('rewrites src relative to the images directory, keeping only the filename', () => {
    const result = collectComponentImages([
      { name: 'card', spec: { images: { a: entry('aaa', '../../../assets/images/aaa.png') } } },
    ], 'nested/assets/images');
    expect(result[0].src).toBe('nested/assets/images/aaa.png');
  });

  // The whole reason this does not reuse ImageFillsResolver's collector.
  it('records an image that is already resolved', () => {
    const result = collectComponentImages([
      { name: 'card', spec: { images: { a: entry('aaa', '../../assets/images/aaa.png') } } },
    ], IMAGES_DIR);
    expect(result).toHaveLength(1);
  });

  it('records an unresolved image with no src', () => {
    const result = collectComponentImages([
      { name: 'card', spec: { images: { a: entry('aaa') } } },
    ], IMAGES_DIR);
    expect(result[0]).toEqual({ imageHash: 'aaa', usedBy: ['card'], origin: 'component' });
  });

  it('lists every component using one image, sorted', () => {
    const result = collectComponentImages([
      { name: 'zeta', spec: { images: { a: entry('shared') } } },
      { name: 'alpha', spec: { images: { b: entry('shared') } } },
    ], IMAGES_DIR);
    expect(result).toHaveLength(1);
    expect(result[0].usedBy).toEqual(['alpha', 'zeta']);
  });

  it('reaches a subcomponent registry', () => {
    const result = collectComponentImages([
      { name: 'card', spec: { subcomponents: { media: { images: { a: entry('sub') } } } } },
    ], IMAGES_DIR);
    expect(result[0]).toEqual({ imageHash: 'sub', usedBy: ['card'], origin: 'component' });
  });

  it('ignores a registry entry with no Figma identity', () => {
    const result = collectComponentImages([
      { name: 'card', spec: { images: { a: { src: 'assets/images/x.png' } } } },
    ], IMAGES_DIR);
    expect(result).toEqual([]);
  });

  it('finds nothing in components with no images', () => {
    expect(collectComponentImages([{ name: 'card', spec: {} }], IMAGES_DIR)).toEqual([]);
  });

  // Components arrive named as Figma names them; every other reference to a
  // component uses the formatted spec key, and one lookup must not carry both.
  it('records the spec key, not the raw Figma name', () => {
    const result = collectComponentImages(
      [{ name: 'DE Card', spec: { images: { a: entry('aaa') } } }],
      IMAGES_DIR,
      name => name.replace(/\s+(.)/g, (_, c) => c.toUpperCase()).replace(/^(.)/, c => c.toLowerCase()),
    );
    expect(result[0].usedBy).toEqual(['dECard']);
  });
});

describe('mergeComponentImages', () => {
  const previous: ComponentImage[] = [
    { imageHash: 'aaa', src: 'assets/images/aaa.png', usedBy: ['heroBanner'], origin: 'component' },
    { imageHash: 'bbb', src: 'assets/images/bbb.png', usedBy: ['card'], origin: 'component' },
  ];

  // The data-loss guard: an image did not stop existing because today's run was
  // narrow, so a scoped pass adds and updates but never removes.
  it('keeps an image a narrower pass did not see', () => {
    const found: ComponentImage[] = [
      { imageHash: 'aaa', src: 'assets/images/aaa.png', usedBy: ['heroBanner'], origin: 'component' },
    ];
    expect(mergeComponentImages(previous, found).map(i => i.imageHash)).toEqual(['aaa', 'bbb']);
  });

  it('unions the components across passes', () => {
    const found: ComponentImage[] = [
      { imageHash: 'aaa', usedBy: ['mediaTile'], origin: 'component' },
    ];
    const merged = mergeComponentImages(previous, found);
    expect(merged.find(i => i.imageHash === 'aaa')!.usedBy).toEqual(['heroBanner', 'mediaTile']);
  });

  it('keeps a src the earlier pass resolved when this pass has none', () => {
    const found: ComponentImage[] = [{ imageHash: 'aaa', usedBy: ['heroBanner'], origin: 'component' }];
    expect(mergeComponentImages(previous, found).find(i => i.imageHash === 'aaa')!.src)
      .toBe('assets/images/aaa.png');
  });

  it('takes this pass\'s src when it has one', () => {
    const found: ComponentImage[] = [
      { imageHash: 'aaa', src: 'assets/images/aaa.jpg', usedBy: ['heroBanner'], origin: 'component' },
    ];
    expect(mergeComponentImages(previous, found).find(i => i.imageHash === 'aaa')!.src)
      .toBe('assets/images/aaa.jpg');
  });

  it('adds an image only this pass saw', () => {
    const found: ComponentImage[] = [{ imageHash: 'ccc', usedBy: ['new'], origin: 'component' }];
    expect(mergeComponentImages(previous, found).map(i => i.imageHash)).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('treats an absent previous payload as this pass being the whole record', () => {
    const found: ComponentImage[] = [{ imageHash: 'aaa', usedBy: ['card'], origin: 'component' }];
    expect(mergeComponentImages([], found)).toEqual(found);
  });

  it('skips a malformed previous entry rather than carrying it forward', () => {
    const malformed = [{ usedBy: ['x'], origin: 'component' }] as unknown as ComponentImage[];
    expect(mergeComponentImages(malformed, [])).toEqual([]);
  });
});
