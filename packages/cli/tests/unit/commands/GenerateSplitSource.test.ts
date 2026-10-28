// A `<alias>.file/` directory is a valid positional source for single-component
// generation (specs#562 made it the shape `specs fetch` writes). Resolution reads
// the split payload's root maps, so naming a component works exactly as it does
// against a monolithic payload.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PayloadSplitter, splitDirFor } from '../../../src/utilities/payloadSplit.js';
import { SectionedFile } from '../../../src/utilities/sectionedFile.js';
import { resolveComponentInSplitRoot } from '../../../src/commands/generate.js';

const FIXTURE = join(__dirname, '../../fixtures/sectioned/cross-page.file.json');

describe('a split payload as a generate source', () => {
  let dataDir: string;
  let root: Record<string, unknown>;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'specs-split-source-'));
    const splitter = new PayloadSplitter(splitDirFor(dataDir, 'library'));
    splitter.write(readFileSync(FIXTURE));
    await splitter.finish();
    const sectioned = SectionedFile.openDir(splitDirFor(dataDir, 'library'));
    expect(sectioned).not.toBeNull();
    root = sectioned!.root();
  });

  afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

  it('opens the directory as a split payload rather than reading it as text', () => {
    // The EISDIR this fixes: the source sniff used to read the path as a string.
    expect(SectionedFile.openDir(splitDirFor(dataDir, 'library'))).not.toBeNull();
  });

  it('resolves a component by node id', () => {
    const [id, entry] = Object.entries(
      (root.components ?? {}) as Record<string, { name?: string }>
    )[0];
    expect(resolveComponentInSplitRoot(root, id)).toEqual({ id, name: entry.name });
  });

  it('resolves a component by name', () => {
    const [id, entry] = Object.entries(
      (root.components ?? {}) as Record<string, { name?: string }>
    )[0];
    expect(resolveComponentInSplitRoot(root, entry.name as string)).toEqual({ id, name: entry.name });
  });

  it('returns null for a name the payload does not hold, so the caller can say so', () => {
    expect(resolveComponentInSplitRoot(root, 'No Such Component')).toBeNull();
  });

  it('answers nothing from an empty root instead of throwing', () => {
    expect(resolveComponentInSplitRoot({}, 'Anything')).toBeNull();
  });
});
