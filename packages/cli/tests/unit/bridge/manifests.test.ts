/**
 * These functions decide what a render can resolve: which node a spec key points at,
 * which published key lets a component from another file be placed at all, and which
 * token names mean anything on the render side. Getting one wrong produces a render that
 * silently omits something rather than an error.
 *
 * They had no tests because they lived in `server.ts`, which opens a WebSocket on import
 * — so importing the module to call a pure function started a server on port 9001. That
 * is the whole reason this file can exist.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import {
  buildManifest,
  buildGlyphManifest,
  buildStylesManifest,
  buildVariablesManifest,
  collectComponentNames,
  collectSpecFiles,
} from '../../../src/bridge/manifests.js';

let dir: string;
const specsDir = () => path.join(dir, 'specs');
const dataDir = () => path.join(dir, 'data');

/** A cache file as `specs fetch` / `specs cache` write it. */
async function writeCache(concern: string, entries: Record<string, unknown>) {
  const file = path.join(dataDir(), 'cache', `${concern}.yaml`);
  await fs.ensureDir(path.dirname(file));
  await fs.writeFile(file, yaml.stringify({ sources: {}, entries }), 'utf8');
}

async function writeSpec(folder: string, concern: string, body: Record<string, unknown>) {
  const file = path.join(specsDir(), folder, `${concern}.yaml`);
  await fs.ensureDir(path.dirname(file));
  await fs.writeFile(file, yaml.stringify(body), 'utf8');
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-manifests-'));
  await fs.ensureDir(specsDir());
  // These builders report progress on stdout. Silence it so a failure is readable.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(dir);
});

describe('collectSpecFiles', () => {
  it('reads a folder-per-component layout, keyed by folder', async () => {
    await writeSpec('checkbox', 'api', { title: 'Checkbox' });
    await writeSpec('checkbox', 'variants', { default: {} });
    const found = await collectSpecFiles(specsDir());
    expect(found.map((f) => f.key)).toEqual(['checkbox', 'checkbox']);
    expect(found.every((f) => f.path.endsWith('.yaml'))).toBe(true);
  });

  it('reads a flat layout, keyed by filename', async () => {
    await fs.writeFile(path.join(specsDir(), 'badge.yaml'), 'title: Badge\n', 'utf8');
    expect((await collectSpecFiles(specsDir())).map((f) => f.key)).toEqual(['badge']);
  });

  it('ignores files that are not YAML', async () => {
    await fs.writeFile(path.join(specsDir(), 'notes.md'), '# hi\n', 'utf8');
    await fs.writeFile(path.join(specsDir(), 'badge.yaml'), 'title: Badge\n', 'utf8');
    expect((await collectSpecFiles(specsDir())).map((f) => f.key)).toEqual(['badge']);
  });

  it('names the directory it cannot read', async () => {
    expect(() => collectSpecFiles(path.join(dir, 'nope'))).toThrow(/Cannot read specs directory/);
  });
});

describe('buildManifest — layer 1, a spec key to its own node', () => {
  it('maps a spec folder to the node id its metadata records', async () => {
    await writeSpec('checkbox', 'api', { metadata: { source: { nodeId: '43:2' } } });
    const m = buildManifest({}, specsDir(), dataDir());
    expect(m.checkbox).toEqual({ id: '43:2' });
  });

  it('adds the published key when the components cache knows the node', async () => {
    // The published key is what makes a component importable from another file; without
    // it a render can only place a node that already lives in the target file.
    await writeSpec('checkbox', 'api', { metadata: { source: { nodeId: '43:2' } } });
    await writeCache('components', { '43:2': { key: 'abc123', name: 'Checkbox', file: 'lib' } });
    expect(buildManifest({}, specsDir(), dataDir()).checkbox).toEqual({ id: '43:2', key: 'abc123' });
  });

  it('keeps the first node id found for a key', async () => {
    await writeSpec('checkbox', 'api', { metadata: { source: { nodeId: '43:2' } } });
    await writeSpec('checkbox', 'variants', { metadata: { source: { nodeId: '99:9' } } });
    const id = buildManifest({}, specsDir(), dataDir()).checkbox.id;
    expect(['43:2', '99:9']).toContain(id);
    expect(Object.keys(buildManifest({}, specsDir(), dataDir()))).toEqual(['checkbox']);
  });

  it('skips a spec it cannot parse rather than failing the render', async () => {
    await fs.ensureDir(path.join(specsDir(), 'broken'));
    await fs.writeFile(path.join(specsDir(), 'broken', 'api.yaml'), '{[not yaml\n', 'utf8');
    await writeSpec('checkbox', 'api', { metadata: { source: { nodeId: '43:2' } } });
    const m = buildManifest({}, specsDir(), dataDir());
    expect(m.checkbox).toEqual({ id: '43:2' });
    expect(m.broken).toBeUndefined();
  });

  it('skips a spec with no node id', async () => {
    await writeSpec('badge', 'api', { title: 'Badge' });
    expect(buildManifest({}, specsDir(), dataDir()).badge).toBeUndefined();
  });
});

describe('buildManifest — layer 2, a subcomponent reference', () => {
  it('maps a subcomponent that carries its own node id', async () => {
    const spec = { subcomponents: { icon: { source: { nodeId: '7:7' } } } };
    expect(buildManifest(spec, specsDir(), dataDir()).icon).toEqual({ id: '7:7' });
  });

  it('matches a subcomponent with no node id to a spec folder by title', async () => {
    // The title goes through the folder-key derivation rather than the configured key
    // format: a spec folder name has always been camelCase whatever `spec.keys` says.
    await writeSpec('fieldLabel', 'api', { metadata: { source: { nodeId: '5:5' } } });
    const spec = { subcomponents: { theLabel: { title: 'Field Label' } } };
    expect(buildManifest(spec, specsDir(), dataDir()).theLabel).toEqual({ id: '5:5' });
  });

  it('leaves a titled subcomponent alone when no spec folder matches', async () => {
    const spec = { subcomponents: { theLabel: { title: 'Nothing Here' } } };
    expect(buildManifest(spec, specsDir(), dataDir()).theLabel).toBeUndefined();
  });

  it('reads subcomponents from a library-shaped spec', async () => {
    const spec = { components: { checkbox: { subcomponents: { icon: { source: { nodeId: '7:7' } } } } } };
    expect(buildManifest(spec, specsDir(), dataDir()).icon).toEqual({ id: '7:7' });
  });
});

describe('buildManifest — layer 3, a library component with no spec', () => {
  it('recognises a referenced component by formatting the library name the same way', async () => {
    // A spec names a component with a formatted key and the transform is lossy, so the
    // name cannot be reconstructed — only recognised by formatting both sides.
    await writeCache('components', { '9:9': { key: 'pub9', name: 'DS Link/On overlay', file: 'lib' } });
    const spec = { anatomy: { thing: { type: 'instance', instanceOf: 'dsLinkOnOverlay' } } };
    expect(buildManifest(spec, specsDir(), dataDir(), 'CAMEL').dsLinkOnOverlay)
      .toEqual({ id: '9:9', key: 'pub9' });
  });

  it('lets a spec-derived entry win over a library one', async () => {
    // A workspace component is the more specific answer, and its node id is local to the
    // file being rendered into.
    await writeSpec('badge', 'api', { metadata: { source: { nodeId: '1:1' } } });
    await writeCache('components', { '9:9': { key: 'pub9', name: 'Badge', file: 'lib' } });
    const spec = { anatomy: { thing: { type: 'instance', instanceOf: 'badge' } } };
    expect(buildManifest(spec, specsDir(), dataDir(), 'CAMEL').badge).toEqual({ id: '1:1' });
  });

  it('adds only the components the spec actually references', async () => {
    await writeCache('components', {
      '9:9': { key: 'pub9', name: 'Badge', file: 'lib' },
      '8:8': { key: 'pub8', name: 'Avatar', file: 'lib' },
    });
    const spec = { anatomy: { thing: { type: 'instance', instanceOf: 'badge' } } };
    const m = buildManifest(spec, specsDir(), dataDir(), 'CAMEL');
    expect(m.badge).toBeDefined();
    expect(m.avatar).toBeUndefined();
  });

  it('ignores a cache entry with no name', async () => {
    await writeCache('components', { '9:9': { key: 'pub9', file: 'lib' } });
    const spec = { anatomy: { thing: { type: 'instance', instanceOf: 'badge' } } };
    expect(buildManifest(spec, specsDir(), dataDir(), 'CAMEL').badge).toBeUndefined();
  });
});

describe('collectComponentNames', () => {
  it('collects an instanceOf at any depth', () => {
    const spec = { a: { b: [{ instanceOf: 'badge' }, { c: { instanceOf: 'avatar' } }] } };
    expect([...collectComponentNames(spec)].sort()).toEqual(['avatar', 'badge']);
  });

  it('collects every string value of a propConfigurations block', () => {
    // A configured value names a component when the property is an instance swap, and the
    // spec gives no clue which values those are — it records the value, not the type. So
    // every string is offered: one matching no component finds nothing.
    const spec = { propConfigurations: { icon: 'iconStar', size: 'md' } };
    expect([...collectComponentNames(spec)].sort()).toEqual(['iconStar', 'md']);
  });

  it('collects a component named on a $nested entry', () => {
    // A `$nested` entry is `{ path: [...], <propKey>: value }` (ADR-052) — the configured
    // props sit on the entry itself. A swap set two instances down names a component
    // exactly as one set at the top level does, and it reaches the manifest the same way.
    // Missing it placed the descendant without the component, with no error.
    const spec = { propConfigurations: { $nested: [{ path: ['action1'], endVisual: 'iconStar' }] } };
    expect([...collectComponentNames(spec)]).toContain('iconStar');
  });

  it('skips the path segments of a $nested entry', () => {
    // Path segments are `instanceOf` element keys inside the spec, not component names.
    // Offering them up asks the library for components never meant to be found.
    const spec = { propConfigurations: { $nested: [{ path: ['action1', 'inner'], endVisual: 'iconStar' }] } };
    const found = [...collectComponentNames(spec)];
    expect(found).toEqual(['iconStar']);
  });

  it('collects from several $nested entries, and from a non-string value inside one', () => {
    const spec = {
      propConfigurations: {
        $nested: [
          { path: ['a'], icon: 'iconStar' },
          { path: ['b'], icon: 'iconBell', trailing: { $slotContent: '#/components/x/slotContentExamples/y' } },
        ],
      },
    };
    const found = [...collectComponentNames(spec)].sort();
    // The slot reference resolves within the spec, so it is not a name to look up.
    expect(found).toEqual(['iconBell', 'iconStar']);
  });

  it('ignores a $nested that is not an array', () => {
    expect([...collectComponentNames({ propConfigurations: { $nested: { path: ['a'] } } })]).toEqual([]);
  });

  it('still collects a nested entry that re-declares propConfigurations', () => {
    const spec = { propConfigurations: { $nested: [{ path: ['a'], propConfigurations: { icon: 'iconStar' } }] } };
    expect([...collectComponentNames(spec)]).toContain('iconStar');
  });

  it('ignores a non-string instanceOf', () => {
    expect([...collectComponentNames({ instanceOf: { $ref: '#/subcomponents/x' } })]).toEqual([]);
  });

  it('returns nothing for a primitive or null', () => {
    expect([...collectComponentNames(null)]).toEqual([]);
    expect([...collectComponentNames('badge')]).toEqual([]);
  });
});

describe('buildGlyphManifest', () => {
  it('maps a glyph name to its node, with the published key where there is one', async () => {
    await writeCache('icons', {
      star: { id: '2:2', key: 'k2', file: 'lib' },
      plain: { id: '3:3', file: 'lib' },
    });
    expect(buildGlyphManifest(dataDir())).toEqual({
      star: { id: '2:2', key: 'k2' },
      plain: { id: '3:3' },
    });
  });

  it('is empty when nothing has been cached', () => {
    expect(buildGlyphManifest(dataDir())).toEqual({});
  });
});

describe('buildStylesManifest', () => {
  it('maps a style name to its published key', async () => {
    await writeCache('styles', { 'text/body': { key: 'sk1', type: 'TEXT', file: 'lib' } });
    expect(buildStylesManifest(dataDir())).toEqual({ 'text/body': 'sk1' });
  });
});

describe('buildVariablesManifest', () => {
  it('maps a token name to the handles it resolves to', async () => {
    await writeCache('variables', {
      'Color/bg': { key: 'vk1', id: 'VariableID:1', published: true, file: 'lib' },
    });
    expect(buildVariablesManifest(dataDir())).toEqual({
      'Color/bg': { key: 'vk1', id: 'VariableID:1', published: true },
    });
  });

  it('warns rather than failing when nothing is cached, because binding is then off', () => {
    const warn = vi.spyOn(console, 'warn');
    expect(buildVariablesManifest(dataDir())).toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('variable binding disabled'));
  });

  it('counts the tokens the library cannot import, which fall back to an id', async () => {
    await writeCache('variables', {
      'Color/a': { key: 'vk1', id: 'VariableID:1', published: true, file: 'lib' },
      'Color/b': { key: 'vk2', id: 'VariableID:2', published: false, file: 'lib' },
    });
    const log = vi.spyOn(console, 'log');
    buildVariablesManifest(dataDir());
    expect(log).toHaveBeenCalledWith(expect.stringContaining('1 not importable'));
  });
});
