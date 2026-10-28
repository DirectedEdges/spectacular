import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { kindDir, manifestEntries, type Manifest } from '../../../src/testing/visual/types.js';
import { loadSpecIndex } from '../../../src/testing/visual/specIndex.js';
import { loadIgnore, scoringFor } from '../../../src/testing/visual/ignore.js';

/**
 * A component and a composition may legally share a name (the version
 * assembler keys them separately for exactly this reason), so every on-disk
 * tree and every map keys kind before key. A flat key silently overwrites
 * one kind's baseline with the other's — the defect specs#711 exists to
 * make impossible.
 */
describe('kind-aware keying', () => {
  it('gives the two kinds distinct artifact directories for a shared name', () => {
    expect(kindDir('component')).not.toBe(kindDir('composition'));
    const a = path.join('figma', kindDir('component'), 'cardHeader');
    const b = path.join('figma', kindDir('composition'), 'cardHeader');
    expect(a).not.toBe(b);
  });

  it('iterates both kind maps, scoped by key across kinds', () => {
    const entry = (kind: 'component' | 'composition') =>
      ({ kind, children: [] }) as unknown as Manifest['components'][string];
    const manifest: Manifest = {
      $meta: { workspace: 'ws', scale: 2, sources: {} },
      components: { shared: entry('component'), onlyComp: entry('component') },
      compositions: { shared: entry('composition') },
    };
    const all = [...manifestEntries(manifest)].map(([kind, key]) => `${kind}/${key}`);
    expect(all).toEqual(['component/shared', 'component/onlyComp', 'composition/shared']);
    const scoped = [...manifestEntries(manifest, new Set(['shared']))].map(([k, key]) => `${k}/${key}`);
    expect(scoped).toEqual(['component/shared', 'composition/shared']);
  });
});

describe('spec discovery through the layout seam', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-specs-'));
  });
  afterEach(() => {
    fs.removeSync(root);
  });

  const writeSpec = (dir: string, nodeId: string) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'api.yaml'),
      `title: T\nprops: {}\nmetadata:\n  source:\n    nodeId: "${nodeId}"\n`,
    );
  };

  it('finds both kinds under the current components/ + compositions/ layout', () => {
    writeSpec(path.join(root, 'components', 'button'), '1:1');
    writeSpec(path.join(root, 'compositions', 'home'), '2:2');
    const index = loadSpecIndex(root);
    expect([...index.get('component')!.keys()]).toEqual(['button']);
    expect([...index.get('composition')!.keys()]).toEqual(['home']);
  });

  it('keeps a shared name as two distinct specs', () => {
    writeSpec(path.join(root, 'components', 'card'), '1:1');
    writeSpec(path.join(root, 'compositions', 'card'), '2:2');
    const index = loadSpecIndex(root);
    expect(index.get('component')!.get('card')!.nodeId).toBe('1:1');
    expect(index.get('composition')!.get('card')!.nodeId).toBe('2:2');
  });

  it('still reads the pre-ADR-096 flat layout, as components', () => {
    writeSpec(path.join(root, 'button'), '1:1');
    const index = loadSpecIndex(root);
    expect([...index.get('component')!.keys()]).toEqual(['button']);
    expect(index.get('composition')!.size).toBe(0);
  });

  /**
   * A spec with no source node cannot be shot, but dropping it in silence makes
   * a whole kind read as unsupported rather than unsourced — which is how four
   * hand-authored compositions left a manifest reporting "no mapping problems".
   */
  it('names a spec it cannot carry instead of dropping it silently', () => {
    writeSpec(path.join(root, 'components', 'button'), '1:1');
    const unsourced = path.join(root, 'compositions', 'articleDetail');
    fs.mkdirSync(unsourced, { recursive: true });
    fs.writeFileSync(path.join(unsourced, 'api.yaml'), 'title: Article detail\nprops: {}\n');

    const skipped: { kind: string; key: string; reason: string }[] = [];
    const index = loadSpecIndex(root, skipped);

    expect([...index.get('component')!.keys()]).toEqual(['button']);
    expect([...index.get('composition')!.keys()]).toEqual([]);
    expect(skipped.map((s) => `${s.kind}/${s.key}`)).toEqual(['composition/articleDetail']);
    expect(skipped[0].reason).toMatch(/metadata\.source\.nodeId/);
  });
});

describe('visual-ignore kind sections', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-ignore-'));
  });
  afterEach(() => {
    fs.removeSync(dir);
  });

  const write = (content: string) => {
    const p = path.join(dir, 'visual-ignore.yaml');
    fs.writeFileSync(p, content);
    return p;
  };

  it('reads flat top-level keys as components — the shape every recovered file has', () => {
    const ignore = loadIgnore(write('$defaults:\n  passPct: 3\nbutton:\n  passPct: 6\n  note: fonts\n'));
    expect(scoringFor(ignore, 'component', 'button', {}).passPct).toBe(6);
    expect(scoringFor(ignore, 'composition', 'button', {}).passPct).toBe(3);
  });

  it('keys kind sections separately for a shared name', () => {
    const ignore = loadIgnore(
      write(
        'components:\n  card:\n    passPct: 5\n    note: a\ncompositions:\n  card:\n    skip: true\n    note: b\n',
      ),
    );
    expect(scoringFor(ignore, 'component', 'card', {}).passPct).toBe(5);
    expect(scoringFor(ignore, 'component', 'card', {}).skip).toBe(false);
    expect(scoringFor(ignore, 'composition', 'card', {}).skip).toBe(true);
  });

  it('names entries missing the required note', () => {
    const ignore = loadIgnore(write('button:\n  passPct: 9\n'));
    expect(ignore.noteless).toEqual(['button']);
  });
});
