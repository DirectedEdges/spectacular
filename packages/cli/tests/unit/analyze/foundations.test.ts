import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'yaml';
import { FoundationsAnalyzer } from '../../../src/analyze/Foundations.js';
import type { AnalyzerFoundations } from '../../../src/transforms/transformer.js';

let dir: string;

function fabricatedFoundations(): AnalyzerFoundations {
  const variables = new Map();
  variables.set('VariableID:1', {
    name: 'Icon/Primary',
    variableCollectionId: 'C1',
    resolvedType: 'COLOR',
    valuesByMode: { 'm1': { type: 'VARIABLE_ALIAS', id: 'VariableID:2' } },
    description: 'Default icon color',
    codeSyntax: { WEB: '--icon-primary' },
  });
  variables.set('VariableID:2', {
    name: 'Neutral/900',
    variableCollectionId: 'C2',
    resolvedType: 'COLOR',
    valuesByMode: { 'm1': { r: 0, g: 0, b: 0, a: 1 } },
  });
  variables.set('VariableID:3', {
    name: 'icon/large',
    variableCollectionId: 'C3',
    resolvedType: 'FLOAT',
    valuesByMode: { 'm1': 24 },
  });
  const collections = new Map();
  collections.set('C1', { name: 'Brand Color', defaultModeId: 'm1', modes: [{ name: 'Light' }, { name: 'Dark' }] });
  collections.set('C2', { name: 'Brand Palette', defaultModeId: 'm1' });
  collections.set('C3', { name: 'Brand Sizing', defaultModeId: 'm1' });
  const styles = new Map();
  styles.set('S1', { id: 'S1', name: 'Label/Large', type: 'TEXT' });
  styles.set('S1-key', { id: 'S1', name: 'Label/Large', type: 'TEXT' }); // dual-indexed, must dedupe
  styles.set('S2', { id: 'S2', name: 'Grid/Page', type: 'GRID' }); // omitted — binds to nothing
  return { variables, collections, styles };
}

async function report(foundations?: AnalyzerFoundations): Promise<Record<string, any> | undefined> {
  const analyzer = new FoundationsAnalyzer();
  analyzer.setup({ dataDir: path.join(dir, 'data'), outputFormat: 'YAML', keys: 'CAMEL' });
  await analyzer.finalize(dir, path.join(dir, 'analysis'), foundations);
  const file = path.join(dir, 'analysis', 'foundations.yaml');
  return fs.existsSync(file) ? yaml.parse(fs.readFileSync(file, 'utf-8')) : undefined;
}

describe('foundations analyzer', () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-foundations-'));
    const cache = path.join(dir, 'data', 'cache');
    fs.mkdirSync(cache, { recursive: true });
    fs.writeFileSync(path.join(cache, 'icons.yaml'), yaml.stringify({
      entries: { 'Caret Right': { key: 'x' }, 'Info': { key: 'y' } },
    }));
    fs.writeFileSync(path.join(cache, 'styles.yaml'), yaml.stringify({
      entries: {
        'Images / Hero': { type: 'FILL', key: 'z' },
        'Label/Large': { type: 'TEXT', key: 'w' }, // already in foundations — not duplicated
      },
    }));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('consolidates variables and styles as token objects, names only', async () => {
    const doc = await report(fabricatedFoundations());
    expect(doc).toBeDefined();

    const color = doc!.tokens.color;
    const primary = color.find((t: any) => t.$token === 'Brand Color/Icon/Primary');
    expect(primary).toMatchObject({
      $type: 'color',
      source: 'variable',
      aliasOf: 'Brand Palette/Neutral/900',
      defaultValue: '#000000', // alias chain resolved to the target's color, as hex
      description: 'Default icon color',
      platformNames: ['web'],
    });
    expect(doc!.tokens.dimension[0].defaultValue).toBe(24);
    expect(doc!.collections).toContainEqual({ collection: 'Brand Color', modes: ['Light', 'Dark'] });
    // Names only — no resolved value anywhere on the entry.
    expect(JSON.stringify(primary)).not.toMatch(/"r"|"#"|valuesByMode/);

    expect(doc!.tokens.dimension[0]).toMatchObject({ $token: 'Brand Sizing/icon/large', $type: 'dimension' });
    expect(doc!.tokens.typography).toHaveLength(1); // dual-indexed style deduped
    expect(doc!.tokens.typography[0]).toMatchObject({ $token: 'Label/Large', source: 'style' });
    // FILL style from the cache arrives as a color token; GRID is omitted.
    expect(color.some((t: any) => t.$token === 'Images / Hero' && t.source === 'style')).toBe(true);
    expect(JSON.stringify(doc)).not.toContain('Grid/Page');
  });

  it('lists icons with raw name and formatted key', async () => {
    const doc = await report(fabricatedFoundations());
    expect(doc!.icons).toEqual([
      { name: 'Caret Right', key: 'caretRight' },
      { name: 'Info', key: 'info' },
    ]);
    expect(doc!.summary.icons).toBe(2);
  });

  it('works from caches alone when no foundations data was loaded', async () => {
    const doc = await report(undefined);
    expect(doc).toBeDefined();
    expect(doc!.icons).toHaveLength(2);
    expect(doc!.tokens.typography[0].$token).toBe('Label/Large');
  });

  it('writes nothing when there is nothing fetched', async () => {
    fs.rmSync(path.join(dir, 'data'), { recursive: true, force: true });
    const doc = await report(undefined);
    expect(doc).toBeUndefined();
  });
});
