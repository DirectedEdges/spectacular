import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  PayloadSplitter,
  SPLIT_FORMAT_VERSION,
  splitDirFor,
  type SplitManifest,
} from '../../../src/utilities/payloadSplit.js';

function payload(pages: unknown[], extras: Record<string, unknown> = {}): string {
  return JSON.stringify({
    document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: pages },
    components: { '1:1': { key: 'k1', name: 'Button' } },
    componentSets: {},
    styles: { s1: { styleType: 'FILL', name: 'Color/Primary', key: 'fk' } },
    name: 'Library',
    ...extras,
  });
}

const PAGE_A = { id: '10:1', name: 'Page One', type: 'CANVAS', children: [{ id: '10:2', name: 'Frame', type: 'FRAME', children: [] }] };
const PAGE_B = { id: '20:1', name: 'Page {Two} [tricky] "quoted\\"', type: 'CANVAS', children: [] };
const PAGE_C = { id: '30:1', name: 'Ünïcödé ❖ page', type: 'CANVAS', children: [] };

async function split(dir: string, source: string, chunkSize = 8192): Promise<SplitManifest> {
  const splitter = new PayloadSplitter(dir);
  const buf = Buffer.from(source, 'utf8');
  for (let i = 0; i < buf.length; i += chunkSize) {
    splitter.write(buf.subarray(i, Math.min(i + chunkSize, buf.length)));
  }
  return splitter.finish();
}

function reassemble(dir: string, manifest: SplitManifest): Buffer {
  const root = readFileSync(join(dir, 'root.json'));
  const parts: Buffer[] = [root.subarray(0, manifest.prefixBytes)];
  manifest.pages.forEach((page, i) => {
    parts.push(Buffer.from(manifest.separators[i], 'utf8'));
    parts.push(readFileSync(join(dir, page.file)));
  });
  parts.push(root.subarray(manifest.prefixBytes));
  return Buffer.concat(parts);
}

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

describe('PayloadSplitter', () => {
  let dir: string;

  beforeEach(() => { dir = join(mkdtempSync(join(tmpdir(), 'specs-split-')), 'lib.file'); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('splits pages out and indexes them by id and name', async () => {
    const manifest = await split(dir, payload([PAGE_A, PAGE_B, PAGE_C]));

    expect(manifest.formatVersion).toBe(SPLIT_FORMAT_VERSION);
    expect(manifest.pages.map(p => p.id)).toEqual(['10:1', '20:1', '30:1']);
    expect(manifest.pages[0].name).toBe(PAGE_A.name);
    expect(manifest.pages[1].name).toBe(PAGE_B.name);
    expect(manifest.pages[2].name).toBe('Ünïcödé ❖ page');
  });

  it('writes each page as valid standalone JSON', async () => {
    const manifest = await split(dir, payload([PAGE_A, PAGE_B]));
    for (const page of manifest.pages) {
      const parsed = JSON.parse(readFileSync(join(dir, page.file), 'utf8'));
      expect(parsed.id).toBe(page.id);
    }
  });

  it('writes root.json as the payload with children emptied', async () => {
    await split(dir, payload([PAGE_A, PAGE_B]));
    const root = JSON.parse(readFileSync(join(dir, 'root.json'), 'utf8'));
    expect(root.document.children).toEqual([]);
    expect(root.components['1:1'].key).toBe('k1');
    expect(root.styles.s1.name).toBe('Color/Primary');
    expect(root.name).toBe('Library');
  });

  it('reassembles byte-perfectly and records the source hash', async () => {
    const source = payload([PAGE_A, PAGE_B, PAGE_C]);
    const manifest = await split(dir, source);

    const rebuilt = reassemble(dir, manifest);
    expect(rebuilt.equals(Buffer.from(source, 'utf8'))).toBe(true);
    expect(sha256(rebuilt)).toBe(manifest.sourceSha256);
    expect(manifest.sourceBytes).toBe(Buffer.byteLength(source, 'utf8'));
  });

  it('survives one-byte chunking (every boundary lands mid-token)', async () => {
    const source = payload([PAGE_A, PAGE_B]);
    const manifest = await split(dir, source, 1);
    expect(manifest.pages.map(p => p.id)).toEqual(['10:1', '20:1']);
    expect(reassemble(dir, manifest).equals(Buffer.from(source, 'utf8'))).toBe(true);
  });

  it('is byte-perfect on pretty-printed JSON (whitespace between pages)', async () => {
    const source = JSON.stringify({
      document: { id: '0:0', name: 'Doc', type: 'DOCUMENT', children: [PAGE_A, PAGE_C] },
      components: {},
      name: 'Pretty',
    }, null, 2);
    const manifest = await split(dir, source);
    expect(manifest.pages).toHaveLength(2);
    expect(reassemble(dir, manifest).equals(Buffer.from(source, 'utf8'))).toBe(true);
  });

  it('does not mistake decoy keys inside strings or nested objects for pages', async () => {
    const decoy = {
      id: '40:1',
      name: 'Decoy "children": [{"id":"fake"}] here',
      type: 'CANVAS',
      children: [{ id: '40:2', name: 'document', type: 'FRAME', children: [{ id: '40:3', name: 'x', type: 'TEXT' }] }],
    };
    const source = payload([decoy]);
    const manifest = await split(dir, source);
    expect(manifest.pages.map(p => p.id)).toEqual(['40:1']);
    expect(reassemble(dir, manifest).equals(Buffer.from(source, 'utf8'))).toBe(true);
  });

  it('handles an empty children array', async () => {
    const source = payload([]);
    const manifest = await split(dir, source);
    expect(manifest.pages).toEqual([]);
    expect(reassemble(dir, manifest).equals(Buffer.from(source, 'utf8'))).toBe(true);
  });

  it('handles a payload with no document.children at all', async () => {
    const source = JSON.stringify({ components: {}, name: 'No document' });
    const manifest = await split(dir, source);
    expect(manifest.pages).toEqual([]);
    expect(readFileSync(join(dir, 'root.json'), 'utf8')).toBe(source);
  });

  // Figma sends the file payload chunked with no content-length, so a body that
  // stops early without a transport error reaches finish() looking ordinary. Each
  // case below cuts the payload at a different kind of boundary.
  describe('refuses a truncated payload', () => {
    const full = payload([PAGE_A, PAGE_B, PAGE_C]);

    /** Cut `source` just past `marker`. Offsets are byte offsets, not character
     *  offsets — page names carry multi-byte characters, so the two diverge. */
    async function cutPast(source: string, marker: string, extra = 0): Promise<unknown> {
      const buf = Buffer.from(source, 'utf8');
      const found = buf.indexOf(marker, 'utf8');
      expect(found, `marker not in payload: ${marker}`).not.toBe(-1);
      const splitter = new PayloadSplitter(dir);
      splitter.write(buf.subarray(0, found + Buffer.byteLength(marker, 'utf8') + extra));
      return splitter.finish();
    }

    it('cut inside a page', async () => {
      await expect(cutPast(full, '"children":[{"id":"10')).rejects.toThrow(/ended inside a page/);
    });

    it('cut in the root prefix, before document.children opens', async () => {
      await expect(cutPast(full, '{"document":{')).rejects.toThrow(/depth 2/);
    });

    it('cut between two pages, in the separator', async () => {
      await expect(cutPast(full, '"children":[]},')).rejects.toThrow(/depth 3/);
    });

    it('cut in the suffix, after document.children closes', async () => {
      await expect(cutPast(full, '"componentSets":{},')).rejects.toThrow(/depth 1/);
    });

    it('cut inside a string', async () => {
      await expect(cutPast(full, '"name":"Colo')).rejects.toThrow(/ended inside a string/);
    });

    // An escape leaves the scanner mid-string with `escaped` set; the root-level
    // value keeps the cut outside any page so the string check is what answers.
    it('cut directly after a string escape', async () => {
      const source = payload([PAGE_A], { note: 'a \\"quoted\\" root value' });
      await expect(cutPast(source, '"note":"a ', 1)).rejects.toThrow(/ended inside a string/);
    });

    it('an empty body', async () => {
      const splitter = new PayloadSplitter(dir);
      await expect(splitter.finish()).rejects.toThrow(/empty/);
    });
  });

  it('abort removes the partial directory', async () => {
    const splitter = new PayloadSplitter(dir);
    splitter.write(Buffer.from(payload([PAGE_A]).slice(0, 50), 'utf8'));
    splitter.abort();
    expect(existsSync(dir)).toBe(false);
  });

  it('splitDirFor names the directory after the alias', () => {
    expect(splitDirFor('/data', 'library')).toBe('/data/library.file');
  });
});
