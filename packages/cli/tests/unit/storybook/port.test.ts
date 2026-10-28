import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  resolveStorybookPort,
  scaffoldedPort,
  DEFAULT_STORYBOOK_PORT,
} from '../../../src/storybook/port.js';
import type { Workspace } from '../../../src/storybook/workspace.js';

/**
 * A workspace's Storybook address is a fact about that workspace, and someone
 * maintaining several wants each to answer at the same localhost every day.
 * Before it could be declared it lived only inside the generated npm script —
 * a file `init --force` rewrites — so the declaration has to outrank the
 * script, or a rewrite moves the workspace off its own address again.
 */
describe('Storybook port resolution', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-port-'));
  });
  afterEach(() => {
    fs.removeSync(root);
    vi.restoreAllMocks();
  });

  const workspace = (storybook?: Record<string, unknown>): Workspace =>
    ({
      root,
      storybookDir: path.join(root, 'storybook'),
      config: { conventions: storybook ? { storybook } : {} },
    }) as unknown as Workspace;

  const scaffold = (port: number | null) => {
    const dir = path.join(root, 'storybook');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: { storybook: port === null ? 'storybook dev --no-open' : `storybook dev -p ${port} --no-open` },
      }),
    );
  };

  it('falls back to 6006 when nothing declares or scaffolds a port', () => {
    expect(resolveStorybookPort(workspace())).toEqual({
      port: DEFAULT_STORYBOOK_PORT,
      source: 'default',
    });
  });

  it('reads an existing scaffold when nothing is declared', () => {
    scaffold(6110);
    expect(resolveStorybookPort(workspace())).toEqual({ port: 6110, source: 'scaffold' });
  });

  it('prefers the declaration over the scaffolded script', () => {
    scaffold(6006);
    expect(resolveStorybookPort(workspace({ host: { port: 6101 } }))).toEqual({
      port: 6101,
      source: 'declared',
    });
  });

  it('lets --port answer for one run, over both', () => {
    scaffold(6006);
    const ws = workspace({ host: { port: 6101 } });
    expect(resolveStorybookPort(ws, 6200)).toEqual({ port: 6200, source: 'flag' });
    expect(resolveStorybookPort(ws, '6200')).toEqual({ port: 6200, source: 'flag' });
  });

  it('accepts a quoted port — the difference is invisible in YAML', () => {
    expect(resolveStorybookPort(workspace({ host: { port: '6101' } })).port).toBe(6101);
  });

  it('warns and ignores a declared value that is not a port', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    scaffold(6110);
    // Falling through silently to 6006 is how a declared port appears not to
    // work at all, so the ignore is always announced.
    expect(resolveStorybookPort(workspace({ host: { port: 'auto' } }))).toEqual({
      port: 6110,
      source: 'scaffold',
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('host.port');
  });

  it.each([0, -1, 70000, 1.5])('rejects %s as a port', (value) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveStorybookPort(workspace({ host: { port: value } })).source).toBe('default');
  });

  it('ignores an unrelated concern — host is one concern among many', () => {
    scaffold(6110);
    expect(resolveStorybookPort(workspace({ color: { layout: 'grid' } })).port).toBe(6110);
  });

  it('reports the scaffolded port separately, since that is what Storybook listens on', () => {
    scaffold(6110);
    expect(scaffoldedPort(workspace({ host: { port: 6101 } }))).toBe(6110);
  });

  it('reports no scaffolded port when the script carries no -p', () => {
    scaffold(null);
    expect(scaffoldedPort(workspace())).toBeNull();
    expect(resolveStorybookPort(workspace()).source).toBe('default');
  });
});
