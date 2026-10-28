import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { pruneOrphans } from '../../../src/emit/prune.js';
import type { Transformer } from '../../../src/transforms/transformer.js';

/**
 * Pruning is the destructive path, and compositions gave it a second kind to judge
 * (specs#659). Two rules carry the risk:
 *
 *  - each kind is judged only against its own specs, or every composition reads as an
 *    orphaned component and is deleted on the spot;
 *  - a kind this run did not emit is a kind it is not authoritative over, so nothing of
 *    it is removed. That is the free-tier case, where a run without Pro once deleted the
 *    composition output a Pro run had written and reported it as having no spec.
 */

let workspace: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'prune-orphans-'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(workspace);
});

const transformers = [{ outputTree: 'react' } as Transformer];

/** Seed emitted directories for both kinds, and return a reader for what survives. */
async function seed(components: string[], compositions: string[]): Promise<void> {
  for (const [kind, names] of [['components', components], ['compositions', compositions]] as const) {
    for (const name of names) {
      await fs.ensureDir(path.join(workspace, 'react', 'src', kind, name));
      await fs.writeFile(path.join(workspace, 'react', 'src', kind, name, 'scaffold.tsx'), '//\n');
    }
  }
}

const survivors = async (kind: 'components' | 'compositions'): Promise<string[]> => {
  const dir = path.join(workspace, 'react', 'src', kind);
  if (!(await fs.pathExists(dir))) return [];
  return (await fs.readdir(dir)).sort();
};

describe('pruneOrphans', () => {
  it('removes a composition whose spec is gone, and leaves components alone', async () => {
    await seed(['DsButton', 'DsCard'], ['HomeScreen', 'Retired']);

    await pruneOrphans(transformers, [
      { kind: 'component', key: 'dsButton' },
      { kind: 'component', key: 'dsCard' },
      { kind: 'composition', key: 'homeScreen' },
    ], workspace);

    expect(await survivors('compositions')).toEqual(['HomeScreen']);
    expect(await survivors('components')).toEqual(['DsButton', 'DsCard']);
  });

  it('removes a component whose spec is gone, and leaves compositions alone', async () => {
    await seed(['DsButton', 'Retired'], ['HomeScreen']);

    await pruneOrphans(transformers, [
      { kind: 'component', key: 'dsButton' },
      { kind: 'composition', key: 'homeScreen' },
    ], workspace);

    expect(await survivors('components')).toEqual(['DsButton']);
    expect(await survivors('compositions')).toEqual(['HomeScreen']);
  });

  it('judges each kind only against its own specs', async () => {
    // Same name in both trees. Judged across kinds, each would appear orphaned in the
    // other's directory and both would be deleted.
    await seed(['TestSlots'], ['TestSlots']);

    await pruneOrphans(transformers, [
      { kind: 'component', key: 'testSlots' },
      { kind: 'composition', key: 'testSlots' },
    ], workspace);

    expect(await survivors('components')).toEqual(['TestSlots']);
    expect(await survivors('compositions')).toEqual(['TestSlots']);
  });

  it('removes nothing of a kind this run did not emit — the free-tier case', async () => {
    await seed(['DsButton'], ['HomeScreen', 'Retired']);

    // A free run emits components and skips compositions. Without the guard it would
    // delete both composition directories, neither of which it was asked to produce.
    await pruneOrphans(
      transformers,
      [{ kind: 'component', key: 'dsButton' }],
      workspace,
      new Set(['composition']),
    );

    expect(await survivors('compositions')).toEqual(['HomeScreen', 'Retired']);
    expect(await survivors('components')).toEqual(['DsButton']);
  });

  it('still prunes the kind it did emit while skipping the other', async () => {
    await seed(['DsButton', 'Retired'], ['HomeScreen']);

    await pruneOrphans(
      transformers,
      [{ kind: 'component', key: 'dsButton' }],
      workspace,
      new Set(['composition']),
    );

    expect(await survivors('components')).toEqual(['DsButton']);
    expect(await survivors('compositions')).toEqual(['HomeScreen']);
  });

  it('names what it removed in one line, since a convention change can orphan a whole tree', async () => {
    const warn = vi.spyOn(console, 'warn');
    await seed([], ['One', 'Two']);

    await pruneOrphans(transformers, [], workspace);

    const lines = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('removed'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('One, Two');
    expect(lines[0]).toContain('compositions');
  });

  it('does nothing when a kind has no emitted directory at all', async () => {
    await seed(['DsButton'], []);

    await expect(
      pruneOrphans(transformers, [{ kind: 'component', key: 'dsButton' }], workspace),
    ).resolves.toBeUndefined();
    expect(await survivors('components')).toEqual(['DsButton']);
  });
});
