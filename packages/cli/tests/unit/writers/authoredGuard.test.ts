import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { authoredOverwrites } from '../../../src/writers/authoredGuard.js';
import type { FileManifest } from '../../../src/writers/FileManifest.js';

let base: string;
beforeEach(async () => { base = await fs.mkdtemp(path.join(os.tmpdir(), 'authored-guard-')); });
afterEach(async () => { await fs.remove(base); });

const manifest = (paths: string[]): FileManifest =>
  ({ baseDir: base, entries: paths.map(p => ({ path: path.join(base, p), content: {}, metadata: { timestamp: new Date() } })) }) as unknown as FileManifest;

describe('authoredOverwrites', () => {
  it('flags an existing per-component file with no metadata.source', async () => {
    await fs.outputFile(path.join(base, 'favoritebutton/api.yaml'), 'props: {}\n');
    expect(await authoredOverwrites(manifest(['favoritebutton/api.yaml']))).toEqual(['favoritebutton']);
  });

  it('passes a captured spec — metadata.source present', async () => {
    await fs.outputFile(path.join(base, 'accordion/api.yaml'), 'metadata:\n  source:\n    nodeId: "1:2"\n');
    expect(await authoredOverwrites(manifest(['accordion/api.yaml']))).toEqual([]);
  });

  it('passes a target that does not exist yet', async () => {
    expect(await authoredOverwrites(manifest(['newthing/api.yaml']))).toEqual([]);
  });

  it('flags a file-per-component document without source, by its stem', async () => {
    await fs.outputFile(path.join(base, 'badge.yaml'), 'props: {}\n');
    expect(await authoredOverwrites(manifest(['badge.yaml']))).toEqual(['badge']);
  });

  it('ignores collapsed library and concern documents', async () => {
    await fs.outputFile(path.join(base, 'api.yaml'), 'components: {}\n');
    await fs.outputFile(path.join(base, 'library.yaml'), 'components: {}\n');
    expect(await authoredOverwrites(manifest(['api.yaml', 'library.yaml']))).toEqual([]);
  });

  it('treats an unparseable existing file as authored', async () => {
    await fs.outputFile(path.join(base, 'broken/variants.yaml'), '{{{not yaml');
    expect(await authoredOverwrites(manifest(['broken/variants.yaml']))).toEqual(['broken']);
  });

  it('reports a component once across its concern files', async () => {
    await fs.outputFile(path.join(base, 'link/api.yaml'), 'props: {}\n');
    await fs.outputFile(path.join(base, 'link/variants.yaml'), 'default: {}\n');
    expect(await authoredOverwrites(manifest(['link/api.yaml', 'link/variants.yaml']))).toEqual(['link']);
  });
});
