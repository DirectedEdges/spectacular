import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  lastFetchedBytes,
  estimateWaitBand,
  formatPayloadSize,
  preparingMessage,
} from '../../../src/fetch/estimate.js';

const MB = 1048576;

describe('fetch estimate', () => {
  let dir: string;

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'specs-estimate-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe('lastFetchedBytes', () => {
    it('reads the split manifest, which records the source size directly', () => {
      mkdirSync(join(dir, 'core.file'));
      writeFileSync(join(dir, 'core.file/manifest.json'), JSON.stringify({ sourceBytes: 738_000_000 }));
      expect(lastFetchedBytes(dir, 'core')).toBe(738_000_000);
    });

    it('falls back to the size on disk for a pre-split monolithic payload', () => {
      writeFileSync(join(dir, 'core.file.json'), 'x'.repeat(4096));
      expect(lastFetchedBytes(dir, 'core')).toBe(4096);
    });

    it('prefers the manifest over the monolithic file when both exist', () => {
      mkdirSync(join(dir, 'core.file'));
      writeFileSync(join(dir, 'core.file/manifest.json'), JSON.stringify({ sourceBytes: 999 }));
      writeFileSync(join(dir, 'core.file.json'), 'x'.repeat(4096));
      expect(lastFetchedBytes(dir, 'core')).toBe(999);
    });

    it('is null for a source never fetched here', () => {
      expect(lastFetchedBytes(dir, 'core')).toBeNull();
    });

    it('is null when the manifest exists but carries no usable size', () => {
      mkdirSync(join(dir, 'core.file'));
      writeFileSync(join(dir, 'core.file/manifest.json'), JSON.stringify({ pages: [] }));
      expect(lastFetchedBytes(dir, 'core')).toBeNull();
    });

    it('survives a corrupt manifest rather than throwing', () => {
      mkdirSync(join(dir, 'core.file'));
      writeFileSync(join(dir, 'core.file/manifest.json'), 'not json');
      expect(lastFetchedBytes(dir, 'core')).toBeNull();
    });
  });

  // Bands, never figures: the measured rate spans 10 to 18 seconds per 100MB, so
  // a precise number would claim precision the data does not support.
  describe('estimateWaitBand', () => {
    it.each([
      [36 * MB, 'up to 15 seconds'],
      [100 * MB, 'up to 30 seconds'],
      [200 * MB, 'between 30 and 60 seconds'],
      [400 * MB, 'between 60 and 90 seconds'],
      [700 * MB, 'more than 90 seconds'],
    ])('%d bytes reads as "%s"', (bytes, band) => {
      expect(estimateWaitBand(bytes)).toBe(band);
    });

    it('never narrows as a payload grows', () => {
      const bands = [1, 50, 100, 200, 300, 500, 1000].map(mb => estimateWaitBand(mb * MB));
      const order = ['up to 15 seconds', 'up to 30 seconds', 'between 30 and 60 seconds', 'between 60 and 90 seconds', 'more than 90 seconds'];
      const ranks = bands.map(b => order.indexOf(b));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    });
  });

  describe('formatPayloadSize', () => {
    it.each([
      [738 * MB, '738MB'],
      [36 * MB, '36MB'],
      [4096, '4KB'],
      [10, '1KB'],
    ])('%d bytes reads as "%s"', (bytes, text) => {
      expect(formatPayloadSize(bytes)).toBe(text);
    });
  });

  describe('preparingMessage', () => {
    it('names the source, the last size, and the band', () => {
      const message = preparingMessage('core', 'file', 738 * MB);
      expect(message).toContain('preparing core.file');
      expect(message).toContain('738MB');
      expect(message).toContain('more than 90 seconds');
    });

    it('quotes no size for a first fetch, having nothing to predict from', () => {
      const message = preparingMessage('core', 'file', null);
      expect(message).toContain('preparing core.file');
      expect(message).not.toMatch(/\d+MB/);
      expect(message).toContain('60 to 120 seconds');
    });
  });
});
