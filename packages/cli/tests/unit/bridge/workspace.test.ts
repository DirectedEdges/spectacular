/**
 * Where a render reads its workspace from, and what that workspace declares.
 *
 * Two things here fail quietly rather than loudly, which is why they are worth tests.
 * The directory precedence decides which workspace a request resolves against, and
 * getting it wrong renders against the wrong library. And `readGlyphsConvention` feeds
 * the icons cache signature — read it from a different place than the cache writer does
 * and the pattern comes back undefined, the two signatures disagree forever, and every
 * render refuses on a permanently "stale" icons.yaml.
 *
 * None of this could be reached by a test while it lived in server.ts, which opens a
 * WebSocket on import.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import {
  resolveDirs,
  resolveSources,
  readGlyphsConvention,
  type WorkspaceOverrides,
} from '../../../src/bridge/workspace.js';

let dir: string;

/** No startup pin and no env overrides — everything derived from the path. */
const derived: WorkspaceOverrides = {
  startupWorkspaceDir: null,
  envSpecsDir: null,
  envDataDir: null,
};

async function writeConfig(file: string, body: unknown) {
  const full = path.join(dir, file);
  await fs.ensureDir(path.dirname(full));
  await fs.writeFile(full, yaml.stringify(body), 'utf8');
}

/** A directory that `resolveWorkspaceDir` will recognise: specs/ and data/ side by side. */
async function makeWorkspace() {
  await fs.ensureDir(path.join(dir, 'specs', 'checkbox'));
  await fs.ensureDir(path.join(dir, 'data'));
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-workspace-'));
});

afterEach(async () => {
  await fs.remove(dir);
});

describe('resolveDirs — precedence', () => {
  it('derives specs/ and data/ from a spec path inside a workspace', async () => {
    await makeWorkspace();
    const r = resolveDirs(path.join(dir, 'specs', 'checkbox', 'api.yaml'), derived);
    expect(r.specsDir).toBe(path.join(dir, 'specs'));
    expect(r.dataDir).toBe(path.join(dir, 'data'));
  });

  it('prefers a pinned startup workspace over derivation', async () => {
    // `--workspace` or WORKSPACE_DIR pins one workspace for the session, so a path from
    // somewhere else still resolves against it.
    await makeWorkspace();
    const r = resolveDirs('/somewhere/else/api.yaml', { ...derived, startupWorkspaceDir: dir });
    expect(r.specsDir).toBe(path.join(dir, 'specs'));
  });

  it('lets an env override beat both', async () => {
    await makeWorkspace();
    const r = resolveDirs(path.join(dir, 'specs', 'checkbox', 'api.yaml'), {
      startupWorkspaceDir: dir,
      envSpecsDir: '/custom/specs',
      envDataDir: '/custom/data',
    });
    expect(r.specsDir).toBe('/custom/specs');
    expect(r.dataDir).toBe('/custom/data');
  });

  it('names what to do when no workspace can be found', () => {
    expect(() => resolveDirs('/nowhere/api.yaml', derived)).toThrow(/Pass --workspace <dir>/);
  });

  it('still refuses when only one env override is set', () => {
    // Half an override is not a layout — a render needs both directories.
    expect(() => resolveDirs('/nowhere/api.yaml', { ...derived, envSpecsDir: '/custom/specs' }))
      .toThrow(/Cannot determine workspace/);
  });

  it('accepts both env overrides with no workspace at all, and reports no aliases', () => {
    // Precedence case 4 in the server header: SPECS_DIR and DATA_DIR pointing at a layout
    // that is not a workspace. There is no config to read, so there are no source aliases,
    // and render reports that as an unusable cache.
    //
    // This threw a TypeError until the first test was written for it: the guard above lets
    // a null workspace through when both overrides are set, and an `as string` cast carried
    // the null into `pathResolve` inside `resolveSources`.
    const r = resolveDirs('/nowhere/api.yaml', {
      startupWorkspaceDir: null,
      envSpecsDir: '/custom/specs',
      envDataDir: '/custom/data',
    });
    expect(r).toMatchObject({ specsDir: '/custom/specs', dataDir: '/custom/data', aliases: [] });
  });
});

describe('resolveSources — the split config layout', () => {
  it('reads every source alias in declaration order', async () => {
    // A render resolves against all of them: a component can instance a component, bind a
    // token, or place a glyph from any library the workspace declares.
    await writeConfig('config/settings.yaml', { data: { sources: { library: {}, icons: {} } } });
    expect(resolveSources(dir).aliases).toEqual(['library', 'icons']);
  });

  it('returns no aliases when the config declares no sources', async () => {
    await writeConfig('config/settings.yaml', { data: {} });
    expect(resolveSources(dir).aliases).toEqual([]);
  });

  it('returns no aliases at all when there is no config', () => {
    // Render reports this as an unusable cache rather than crashing here.
    expect(resolveSources(dir)).toEqual({ aliases: [] });
  });
});

describe('resolveSources — the legacy single-file layout', () => {
  it('falls back to specs.config.yaml for a workspace never migrated', async () => {
    await writeConfig('specs.config.yaml', { sources: { library: {} } });
    expect(resolveSources(dir).aliases).toEqual(['library']);
  });

  it('carries the legacy glyph pattern across as a glyphs convention', async () => {
    await writeConfig('specs.config.yaml', {
      sources: { library: {} },
      config: { processing: { glyphNamePattern: 'icon/{i}' } },
    });
    expect(resolveSources(dir).glyphs).toEqual({ match: 'icon/{i}' });
  });

  it('leaves glyphs undefined when the legacy config names no pattern', async () => {
    await writeConfig('specs.config.yaml', { sources: { library: {} } });
    expect(resolveSources(dir).glyphs).toBeUndefined();
  });
});

describe('readGlyphsConvention', () => {
  it('reads the per-platform conventions file, where the filename is the platform', async () => {
    // config/conventions/figma.yaml holds that platform's conventions directly — there is
    // no `figma:` wrapper inside, because the filename already says which platform it is.
    await writeConfig('config/conventions/figma.yaml', { glyphs: { match: 'icon/{i}' } });
    expect(readGlyphsConvention(dir)).toEqual({ match: 'icon/{i}' });
  });

  it('falls back to the single-file layout, where there is a wrapper', async () => {
    await writeConfig('config/conventions.yaml', { figma: { glyphs: { match: 'glyph/{i}' } } });
    expect(readGlyphsConvention(dir)).toEqual({ match: 'glyph/{i}' });
  });

  it('prefers the per-platform file when both exist', async () => {
    await writeConfig('config/conventions/figma.yaml', { glyphs: { match: 'icon/{i}' } });
    await writeConfig('config/conventions.yaml', { figma: { glyphs: { match: 'old/{i}' } } });
    expect(readGlyphsConvention(dir)).toEqual({ match: 'icon/{i}' });
  });

  it('falls through when the per-platform file exists but declares no glyphs', async () => {
    await writeConfig('config/conventions/figma.yaml', { naming: 'SENTENCE' });
    await writeConfig('config/conventions.yaml', { figma: { glyphs: { match: 'old/{i}' } } });
    expect(readGlyphsConvention(dir)).toEqual({ match: 'old/{i}' });
  });

  it('returns undefined when no conventions file exists', () => {
    expect(readGlyphsConvention(dir)).toBeUndefined();
  });

  it('returns undefined rather than throwing on an unreadable file', async () => {
    const file = path.join(dir, 'config', 'conventions', 'figma.yaml');
    await fs.ensureDir(path.dirname(file));
    await fs.writeFile(file, '{[not yaml\n', 'utf8');
    expect(readGlyphsConvention(dir)).toBeUndefined();
  });
});
