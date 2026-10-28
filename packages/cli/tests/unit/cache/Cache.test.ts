import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, utimesSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parse } from 'yaml';
import {
  refreshCache, validateCache, readCacheFile, cachePath, describeProblems,
  type ComponentsEntry, type StylesEntry, type VariablesEntry, type IconsEntry,
} from '../../../src/cache/cache.js';

const PATTERN = 'Icon / {i}';

function filePayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    components: {
      '1:1': { key: 'componentkey1', name: 'Library Button/Primary/M' },
      '1:2': { name: 'Unpublished' }, // no published key — omitted from the cache
      '9:9': { key: 'glyphkey', name: 'Icon / star' },
    },
    componentSets: {
      '2:1': { key: 'setkey1', name: 'Library Card' },
    },
    styles: {
      s1: { styleType: 'FILL', name: 'Color/Primary', key: 'fillkey' },
      s2: { styleType: 'TEXT', name: 'Type/Body', key: 'textkey' },
      s3: { styleType: 'GRID', name: 'Grid/Ignored', key: 'gridkey' },
      s4: { styleType: 'EFFECT', name: 'Shadow/Low', key: 'effectkey' },
    },
    document: {
      id: '0:0',
      children: [
        { id: '9:9', type: 'COMPONENT', name: 'Icon / star' },
        { id: '9:8', type: 'COMPONENT', name: 'Not an icon' },
      ],
    },
    ...overrides,
  });
}

function variablesPayload(): string {
  return JSON.stringify({
    meta: {
      variableCollections: { c1: { name: 'Color' } },
      variables: {
        v1: { name: 'Primary', key: 'varkey1', variableCollectionId: 'c1', hiddenFromPublishing: false },
        v2: { name: 'Secret', key: 'varkey2', variableCollectionId: 'c1', hiddenFromPublishing: true },
      },
    },
  });
}

describe('Cache', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'specs-cache-'));
    writeFileSync(join(dataDir, 'library.file.json'), filePayload());
    writeFileSync(join(dataDir, 'library.variables.json'), variablesPayload());
  });

  afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

  const build = (aliases = ['library'], force = false) =>
    refreshCache({ dataDir, aliases, glyphs: { match: PATTERN }, force });

  describe('building', () => {
    it('writes all four caches', () => {
      const report = build();
      expect(report.rebuilt).toEqual(['library']);
      expect(report.counts).toEqual({ components: 3, styles: 3, variables: 2, icons: 1 });
    });

    it('records only components that carry a published key', () => {
      build();
      const cache = readCacheFile<ComponentsEntry>(dataDir, 'components')!;
      expect(Object.keys(cache.entries).sort()).toEqual(['1:1', '2:1', '9:9']);
      expect(cache.entries['1:1']).toEqual({ key: 'componentkey1', name: 'Library Button/Primary/M', file: 'library' });
    });

    it('keeps only the style types a spec can reference', () => {
      build();
      const cache = readCacheFile<StylesEntry>(dataDir, 'styles')!;
      expect(Object.keys(cache.entries).sort()).toEqual(['Color/Primary', 'Shadow/Low', 'Type/Body']);
      expect(cache.entries['Color/Primary']).toEqual({ key: 'fillkey', type: 'FILL', file: 'library' });
    });

    it('carries the published flag through to variables', () => {
      build();
      const cache = readCacheFile<VariablesEntry>(dataDir, 'variables')!;
      expect(cache.entries['Color/Primary'].published).toBe(true);
      expect(cache.entries['Color/Secret'].published).toBe(false);
    });

    it('extracts glyph names with the pattern and cross-references their keys', () => {
      build();
      const cache = readCacheFile<IconsEntry>(dataDir, 'icons')!;
      expect(cache.entries).toEqual({ star: { id: '9:9', key: 'glyphkey', file: 'library' } });
    });

    it('writes an empty icons cache when nothing matches, so "none" differs from "never built"', () => {
      refreshCache({ dataDir, aliases: ['library'], glyphs: { match: 'Nothing / {i}' } });
      const cache = readCacheFile<IconsEntry>(dataDir, 'icons')!;
      expect(cache.entries).toEqual({});
      expect(cache.sources.library).toBeDefined();
    });

    it('records the raw Figma name, which is what an instanceOf lookup matches against', () => {
      build();
      const cache = readCacheFile<ComponentsEntry>(dataDir, 'components')!;
      // Stored raw and formatted at lookup time, so changing format.keys needs no rebuild.
      expect(cache.entries['2:1'].name).toBe('Library Card');
      expect(cache.entries['9:9'].name).toBe('Icon / star');
    });

    it('tags every entry with the alias it came from', () => {
      writeFileSync(join(dataDir, 'brand.file.json'), JSON.stringify({
        components: { '5:5': { key: 'brandkey', name: 'Brand Thing' } },
        styles: {},
        document: {},
      }));
      build(['library', 'brand']);
      const cache = readCacheFile<ComponentsEntry>(dataDir, 'components')!;
      expect(cache.entries['1:1'].file).toBe('library');
      expect(cache.entries['5:5'].file).toBe('brand');
      expect(Object.keys(cache.sources).sort()).toEqual(['brand', 'library']);
    });

    it('skips an alias that has not been fetched', () => {
      const report = build(['library', 'missing']);
      expect(report.unfetched).toEqual(['missing']);
      expect(report.rebuilt).toEqual(['library']);
    });
  });

  describe('incremental rebuilds', () => {
    it('leaves an alias alone when its payload has not changed', () => {
      build();
      const report = build();
      expect(report.current).toEqual(['library']);
      expect(report.rebuilt).toEqual([]);
      expect(report.counts.components).toBe(3);
    });

    it('rebuilds every alias under --force', () => {
      build();
      expect(build(['library'], true).rebuilt).toEqual(['library']);
    });

    it('rebuilds only the alias whose payload changed, keeping the other alias intact', () => {
      writeFileSync(join(dataDir, 'brand.file.json'), JSON.stringify({
        components: { '5:5': { key: 'brandkey', name: 'Brand Thing' } }, styles: {}, document: {},
      }));
      build(['library', 'brand']);

      writeFileSync(join(dataDir, 'brand.file.json'), JSON.stringify({
        components: { '5:5': { key: 'brandkey2', name: 'Brand Thing' }, '6:6': { key: 'newkey', name: 'New Thing' } }, styles: {}, document: {},
      }));
      const report = build(['library', 'brand']);

      expect(report.rebuilt).toEqual(['brand']);
      expect(report.current).toEqual(['library']);

      const cache = readCacheFile<ComponentsEntry>(dataDir, 'components')!;
      expect(cache.entries['5:5'].key).toBe('brandkey2');
      expect(cache.entries['6:6']).toBeDefined();
      expect(cache.entries['1:1'].key).toBe('componentkey1'); // untouched alias survived
    });

    it('drops entries an alias no longer has', () => {
      build();
      writeFileSync(join(dataDir, 'library.file.json'), JSON.stringify({
        components: { '1:1': { key: 'componentkey1', name: 'Library Button/Primary/M' } }, styles: {}, document: {},
      }));
      build();
      const cache = readCacheFile<ComponentsEntry>(dataDir, 'components')!;
      expect(cache.entries['2:1']).toBeUndefined();
    });
  });

  describe('validation', () => {
    const validate = (aliases = ['library'], pattern: string | undefined = PATTERN) =>
      validateCache({ dataDir, aliases, glyphs: pattern ? { match: pattern } : undefined });

    it('passes on a freshly built cache', () => {
      build();
      expect(validate()).toEqual([]);
    });

    it('reports every concern as missing when nothing is built', () => {
      expect(validate().map(p => p.concern).sort()).toEqual(['components', 'icons', 'styles', 'variables']);
      expect(validate().every(p => p.reason === 'missing')).toBe(true);
    });

    it('reports the concern whose payload changed as stale', () => {
      build();
      writeFileSync(join(dataDir, 'library.variables.json'), JSON.stringify({ meta: { variables: {}, variableCollections: {} } }));
      expect(validate()).toEqual([{ concern: 'variables', alias: 'library', reason: 'stale' }]);
    });

    it('treats a same-size rewrite as stale, since mtime moved', () => {
      build();
      const path = join(dataDir, 'library.file.json');
      const content = readFileSync(path, 'utf8');
      writeFileSync(path, content);
      const future = new Date(Date.now() + 10_000);
      utimesSync(path, future, future);
      const stale = validate().filter(p => p.reason === 'stale').map(p => p.concern).sort();
      expect(stale).toEqual(['components', 'icons', 'styles']);
    });

    it('invalidates icons when the glyph pattern changes, with no file change at all', () => {
      build();
      expect(validate(['library'], 'Different / {i}')).toEqual([
        { concern: 'icons', alias: 'library', reason: 'stale' },
      ]);
    });

    it('reports a newly declared but unbuilt alias', () => {
      build();
      writeFileSync(join(dataDir, 'brand.file.json'), JSON.stringify({ components: {}, styles: {}, document: {} }));
      const problems = validateCache({ dataDir, aliases: ['library', 'brand'], glyphs: { match: PATTERN } });
      expect(problems.every(p => p.alias === 'brand' && p.reason === 'missing')).toBe(true);
    });

    it('names the command that fixes the problem', () => {
      const message = describeProblems([{ concern: 'variables', alias: 'library', reason: 'stale' }]);
      expect(message).toContain('variables.yaml: "library" is stale');
      expect(message).toContain('specs cache');
    });
  });

  describe('file format', () => {
    it('writes a do-not-edit header above valid YAML', () => {
      build();
      const raw = readFileSync(cachePath(dataDir, 'styles'), 'utf8');
      expect(raw.startsWith('# Generated by `specs cache`')).toBe(true);
      expect(parse(raw).entries['Color/Primary'].key).toBe('fillkey');
    });

    it('records the payload each alias was built from', () => {
      build();
      const cache = readCacheFile<StylesEntry>(dataDir, 'styles')!;
      expect(cache.sources.library.from).toBe('library.file.json');
      expect(cache.sources.library.bytes).toBeGreaterThan(0);
      expect(cache.sources.library.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('records the glyphs convention signature only on the icons cache', () => {
      build();
      expect(readCacheFile<IconsEntry>(dataDir, 'icons')!.sources.library.glyphConvention).toBe(JSON.stringify({ match: PATTERN }));
      expect(readCacheFile<StylesEntry>(dataDir, 'styles')!.sources.library.glyphConvention).toBeUndefined();
    });

    it('treats an unreadable cache as absent rather than throwing', () => {
      build();
      writeFileSync(cachePath(dataDir, 'components'), ': not : valid : yaml :\n  - [');
      expect(readCacheFile(dataDir, 'components')).toBeNull();
      const problems = validateCache({ dataDir, aliases: ['library'], glyphs: { match: PATTERN } });
      expect(problems.some(p => p.concern === 'components' && p.reason === 'missing')).toBe(true);
    });
  });

  describe('unreadable payloads', () => {
    it('reports a payload that cannot be parsed as a failure, never a silent skip', () => {
      writeFileSync(join(dataDir, 'broken.file.json'), '{ this is not json');
      const report = build(['library', 'broken']);

      expect(report.rebuilt).toContain('broken');
      expect(report.failures).toHaveLength(1);
      expect(report.failures[0].alias).toBe('broken');
      expect(report.failures[0].file).toBe('broken.file.json');
      expect(report.failures[0].reason).toContain('broken.file.json');
      expect(report.aliasCounts.broken).toEqual({ components: 0, styles: 0, variables: 0, icons: 0 });
      // The healthy alias is unaffected — and its contribution is attributable.
      expect(report.aliasCounts.library.components).toBe(3);
      expect(report.counts.components).toBe(3);
    });

    it('reports an unreadable variables payload without losing the file payload entries', () => {
      writeFileSync(join(dataDir, 'library.variables.json'), 'nope');
      const report = build(['library']);

      expect(report.failures).toHaveLength(1);
      expect(report.failures[0].file).toBe('library.variables.json');
      expect(report.aliasCounts.library.variables).toBe(0);
      expect(report.aliasCounts.library.components).toBe(3);
    });

    it('records per-alias contributions when every payload is healthy', () => {
      const report = build();
      expect(report.failures).toEqual([]);
      expect(report.aliasCounts.library).toEqual({ components: 3, styles: 3, variables: 2, icons: 1 });
    });
  });
});
