import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { reconcileStaleConcerns, staleWarnings, STALE_SUFFIX } from '../../../src/writers/StaleConcerns.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stale-concerns-'));
});

afterEach(async () => {
  await fs.remove(dir);
});

/** Seed a component folder with the given files, and return its path. */
async function seed(component: string, files: Record<string, string>): Promise<string> {
  const folder = path.join(dir, component);
  await fs.ensureDir(folder);
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(folder, name), content, 'utf-8');
  }
  return folder;
}

const exists = (p: string): Promise<boolean> => fs.pathExists(p);

describe('reconcileStaleConcerns', () => {
  it('renames a concern the run no longer emits, keeping its content', async () => {
    const folder = await seed('button', {
      'api.yaml': 'title: Button\n',
      'variants.yaml': 'default: {}\n',
      'examples.yaml': 'slotContentExamples: {}\n',
    });

    const result = await reconcileStaleConcerns([
      path.join(folder, 'api.yaml'),
      path.join(folder, 'variants.yaml'),
    ]);

    expect(result.staled).toEqual([path.join(folder, `examples.yaml${STALE_SUFFIX}`)]);
    expect(await exists(path.join(folder, 'examples.yaml'))).toBe(false);
    // Nothing is deleted — the content stays recoverable.
    expect(await fs.readFile(path.join(folder, `examples.yaml${STALE_SUFFIX}`), 'utf-8'))
      .toBe('slotContentExamples: {}\n');
  });

  it('leaves the concerns the run did write untouched', async () => {
    const folder = await seed('button', { 'api.yaml': 'title: Button\n', 'variants.yaml': 'default: {}\n' });

    const result = await reconcileStaleConcerns([
      path.join(folder, 'api.yaml'),
      path.join(folder, 'variants.yaml'),
    ]);

    expect(result.staled).toEqual([]);
    expect(await exists(path.join(folder, 'api.yaml'))).toBe(true);
    expect(await exists(path.join(folder, 'variants.yaml'))).toBe(true);
  });

  it('clears the marker when a concern is emitted again', async () => {
    const folder = await seed('button', {
      'api.yaml': 'title: Button\n',
      'examples.yaml': 'slotContentExamples: {}\n',
      [`examples.yaml${STALE_SUFFIX}`]: 'slotContentExamples: {old: true}\n',
    });

    const result = await reconcileStaleConcerns([
      path.join(folder, 'api.yaml'),
      path.join(folder, 'examples.yaml'),
    ]);

    expect(result.cleared).toEqual([path.join(folder, `examples.yaml${STALE_SUFFIX}`)]);
    expect(await exists(path.join(folder, `examples.yaml${STALE_SUFFIX}`))).toBe(false);
    // The live file is the run's own output and is never touched by reconciliation.
    expect(await fs.readFile(path.join(folder, 'examples.yaml'), 'utf-8')).toBe('slotContentExamples: {}\n');
  });

  it('round-trips a convention being declared and reverted without leaving both forms', async () => {
    const folder = await seed('button', { 'api.yaml': 'a\n', 'examples.yaml': 'first\n' });
    const api = path.join(folder, 'api.yaml');
    const examples = path.join(folder, 'examples.yaml');
    const stale = `${examples}${STALE_SUFFIX}`;

    // Declared: the concern stops being emitted.
    await reconcileStaleConcerns([api]);
    expect([await exists(examples), await exists(stale)]).toEqual([false, true]);

    // Reverted: it is emitted again, and only one form remains.
    await fs.writeFile(examples, 'second\n', 'utf-8');
    await reconcileStaleConcerns([api, examples]);
    expect([await exists(examples), await exists(stale)]).toEqual([true, false]);
  });

  it('replaces an older marker rather than preserving it', async () => {
    const folder = await seed('button', {
      'api.yaml': 'a\n',
      'examples.yaml': 'current\n',
      [`examples.yaml${STALE_SUFFIX}`]: 'ancient\n',
    });

    await reconcileStaleConcerns([path.join(folder, 'api.yaml')]);

    expect(await fs.readFile(path.join(folder, `examples.yaml${STALE_SUFFIX}`), 'utf-8')).toBe('current\n');
  });

  it('stales a leftover from a different output format', async () => {
    const folder = await seed('button', { 'api.yaml': 'a\n', 'api.json': '{"title":"Button"}' });

    const result = await reconcileStaleConcerns([path.join(folder, 'api.yaml')]);

    expect(result.staled).toEqual([path.join(folder, `api.json${STALE_SUFFIX}`)]);
    expect(await exists(path.join(folder, 'api.yaml'))).toBe(true);
  });

  it('touches nothing that is not a concern file', async () => {
    const folder = await seed('button', { 'api.yaml': 'a\n', 'README.md': 'notes\n', 'styling.yaml': 'x\n' });

    const result = await reconcileStaleConcerns([path.join(folder, 'api.yaml')]);

    expect(result.staled).toEqual([]);
    expect(await exists(path.join(folder, 'README.md'))).toBe(true);
    expect(await exists(path.join(folder, 'styling.yaml'))).toBe(true);
  });

  it('reconciles each component folder independently', async () => {
    const a = await seed('button', { 'api.yaml': 'a\n', 'examples.yaml': 'x\n' });
    const b = await seed('card', { 'api.yaml': 'b\n', 'examples.yaml': 'y\n' });

    const result = await reconcileStaleConcerns([
      path.join(a, 'api.yaml'),
      path.join(b, 'api.yaml'),
      path.join(b, 'examples.yaml'),
    ]);

    expect(result.staled).toEqual([path.join(a, `examples.yaml${STALE_SUFFIX}`)]);
    expect(await exists(path.join(b, 'examples.yaml'))).toBe(true);
  });

  it('names what it renamed, and what it cleared', async () => {
    const folder = await seed('button', {
      'api.yaml': 'a\n',
      'examples.yaml': 'x\n',
      [`variants.yaml${STALE_SUFFIX}`]: 'old\n',
      'variants.yaml': 'v\n',
    });

    const warnings = staleWarnings(await reconcileStaleConcerns([
      path.join(folder, 'api.yaml'),
      path.join(folder, 'variants.yaml'),
    ]));

    expect(warnings.some(w => w.includes('examples.yaml') && w.includes('no longer generated'))).toBe(true);
    expect(warnings.some(w => w.includes('variants.yaml.stale') && w.includes('generated again'))).toBe(true);
  });

  it('leaves a marker alone when the run writes neither form', async () => {
    const folder = await seed('button', {
      'api.yaml': 'a\n',
      [`examples.yaml${STALE_SUFFIX}`]: 'old\n',
    });

    const result = await reconcileStaleConcerns([path.join(folder, 'api.yaml')]);

    expect(result).toEqual({ staled: [], cleared: [] });
    expect(await exists(path.join(folder, `examples.yaml${STALE_SUFFIX}`))).toBe(true);
  });
});
