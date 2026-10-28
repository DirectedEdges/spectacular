/**
 * ImageFillsResolver unit tests (ADR-063 --get-images)
 * Covers the pure pieces: unresolved-hash collection, src application, and
 * magic-byte extension detection. Network/file steps are exercised by the
 * integration path.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { ImageFillsResolver, IMAGES_DIR_NAME } from '../../../src/generate/imageFills.js';

type Entry = { src?: string; $extensions?: { 'com.figma'?: { imageHash: string } } };

function unresolved(imageHash: string): Entry {
  return { $extensions: { 'com.figma': { imageHash } } };
}

function component(images?: Record<string, Entry>): { spec: Record<string, unknown> } {
  return { spec: images ? { title: 'X', images } : { title: 'X' } };
}

describe('ImageFillsResolver.collectUnresolvedHashes', () => {
  it('collects distinct hashes across components', () => {
    const hashes = ImageFillsResolver.collectUnresolvedHashes([
      component({ a: unresolved('hash-1'), b: unresolved('hash-2') }),
      component({ c: unresolved('hash-1') }),
      component(),
    ]);
    expect(hashes).toEqual(new Set(['hash-1', 'hash-2']));
  });

  it('ignores entries that already carry src', () => {
    const hashes = ImageFillsResolver.collectUnresolvedHashes([
      component({ a: { src: '../assets/images/hash-1.png', ...unresolved('hash-1') }, b: unresolved('hash-2') }),
    ]);
    expect(hashes).toEqual(new Set(['hash-2']));
  });

  it('collects from subcomponent registries too', () => {
    const spec = {
      title: 'Main',
      images: { root: unresolved('hash-main') },
      subcomponents: {
        media: { title: 'Main / Media', images: { root: unresolved('hash-sub') } },
      },
    } as Record<string, unknown>;
    expect(ImageFillsResolver.collectUnresolvedHashes([{ spec }])).toEqual(new Set(['hash-main', 'hash-sub']));
  });
});

describe('ImageFillsResolver.applyResolvedSources', () => {
  it('adds src to resolved entries — the Figma identity survives — and leaves missing hashes untouched', () => {
    const a = component({ hero: unresolved('hash-1'), banner: unresolved('missing') });
    const count = ImageFillsResolver.applyResolvedSources(
      [a],
      new Map([['hash-1', 'hash-1.png']]),
      `${IMAGES_DIR_NAME}/`
    );
    expect(count).toBe(1);
    expect(a.spec.images).toEqual({
      hero: { src: '../assets/images/hash-1.png', $extensions: { 'com.figma': { imageHash: 'hash-1' } } },
      banner: unresolved('missing'),
    });
  });

  it('uses the subfolder prefix when spec files live one level down', () => {
    const a = component({ hero: unresolved('hash-1') });
    ImageFillsResolver.applyResolvedSources([a], new Map([['hash-1', 'hash-1.jpg']]), `../${IMAGES_DIR_NAME}/`);
    expect((a.spec.images as Record<string, Entry>).hero.src).toBe('../../assets/images/hash-1.jpg');
  });

  it('resolves subcomponent registry entries too', () => {
    const spec = {
      images: { root: unresolved('hash-main') },
      subcomponents: {
        media: { images: { root: unresolved('hash-sub') } },
      },
    } as Record<string, unknown>;
    const count = ImageFillsResolver.applyResolvedSources(
      [{ spec }],
      new Map([['hash-main', 'hash-main.png'], ['hash-sub', 'hash-sub.jpg']]),
      `${IMAGES_DIR_NAME}/`
    );
    expect(count).toBe(2);
    expect((spec.subcomponents as Record<string, { images: Record<string, Entry> }>).media.images.root.src)
      .toBe('../assets/images/hash-sub.jpg');
  });

  it('does not touch entries that already carry src', () => {
    const a = component({ hero: { src: '../assets/images/hash-1.png', ...unresolved('hash-1') } });
    const count = ImageFillsResolver.applyResolvedSources([a], new Map([['hash-1', 'other.png']]), `${IMAGES_DIR_NAME}/`);
    expect(count).toBe(0);
    expect((a.spec.images as Record<string, Entry>).hero.src).toBe('../assets/images/hash-1.png');
  });
});

describe('ImageFillsResolver.findExisting', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(process.cwd(), 'tests', 'tmp', `images-${Date.now()}`);
    fs.ensureDirSync(path.join(testDir, IMAGES_DIR_NAME));
  });

  afterEach(() => {
    fs.removeSync(testDir);
  });

  it('reuses hash-named files already in assets/images/, regardless of extension', async () => {
    fs.writeFileSync(path.join(testDir, IMAGES_DIR_NAME, 'hash-1.png'), 'x');
    fs.writeFileSync(path.join(testDir, IMAGES_DIR_NAME, 'hash-2.jpg'), 'x');

    const existing = await ImageFillsResolver.findExisting(new Set(['hash-1', 'hash-2', 'hash-3']), testDir);
    expect(existing).toEqual(new Map([
      ['hash-1', 'hash-1.png'],
      ['hash-2', 'hash-2.jpg'],
    ]));
  });

  it('returns empty when assets/images/ does not exist', async () => {
    const existing = await ImageFillsResolver.findExisting(new Set(['hash-1']), path.join(testDir, 'nowhere'));
    expect(existing.size).toBe(0);
  });
});

describe('ImageFillsResolver.downloadAndWrite', () => {
  let testDir: string;
  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;

  beforeEach(() => {
    testDir = path.join(process.cwd(), 'tests', 'tmp', `dl-${Date.now()}`);
    fs.ensureDirSync(testDir);
  });

  afterEach(() => {
    fs.removeSync(testDir);
    vi.unstubAllGlobals();
  });

  it('downloads concurrently, writes hash-named files, and reports monotonic progress', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 200,
      arrayBuffer: async () => PNG_BYTES.slice(0),
    })));

    const hashes = new Set(['h1', 'h2', 'h3']);
    const urls = { h1: 'u1', h2: 'u2', h3: 'u3' };
    const progress: Array<[number, number]> = [];

    const written = await ImageFillsResolver.downloadAndWrite(hashes, urls, testDir, (c, t) => progress.push([c, t]));

    expect(written).toEqual(new Map([['h1', 'h1.png'], ['h2', 'h2.png'], ['h3', 'h3.png']]));
    expect(fs.existsSync(path.join(testDir, IMAGES_DIR_NAME, 'h2.png'))).toBe(true);
    expect(progress.map(([c]) => c)).toEqual([1, 2, 3]);
    expect(progress.every(([, t]) => t === 3)).toBe(true);
  });

  it('counts failed downloads in progress but leaves them out of the result', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === 'bad'
      ? { status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
      : { status: 200, arrayBuffer: async () => PNG_BYTES.slice(0) }));

    const progress: Array<[number, number]> = [];
    const written = await ImageFillsResolver.downloadAndWrite(
      new Set(['ok', 'fail']),
      { ok: 'good', fail: 'bad' },
      testDir,
      (c, t) => progress.push([c, t])
    );

    expect(written).toEqual(new Map([['ok', 'ok.png']]));
    expect(progress.at(-1)).toEqual([2, 2]);
  });
});

describe('ImageFillsResolver.detectExtension', () => {
  it('detects PNG', () => {
    expect(ImageFillsResolver.detectExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
  });

  it('detects JPEG', () => {
    expect(ImageFillsResolver.detectExtension(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
  });

  it('detects GIF', () => {
    expect(ImageFillsResolver.detectExtension(Buffer.from('GIF89a'))).toBe('gif');
  });

  it('detects WebP', () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
    expect(ImageFillsResolver.detectExtension(webp)).toBe('webp');
  });

  it('falls back to png for unknown bytes', () => {
    expect(ImageFillsResolver.detectExtension(Buffer.from('not an image'))).toBe('png');
  });
});
