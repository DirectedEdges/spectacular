// A scoped render must not report success for components it never rendered.
//
// `--components` warns and skips a name it cannot find, which is right when
// some names matched. When *none* did, success means a typo in a CI invocation
// passes green having rendered nothing — the one outcome a scoped run must not
// produce. Caught by running it; kept honest here.
//
// Nothing below reaches the bridge: the guard runs before the first render, so
// a zero-match call throws without a Figma file anywhere in sight.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { runRender, bridgeTarget } from '../../../src/commands/render.js';
import { StepError } from '../../../src/pipeline/StepError.js';

let root: string;
let cwd: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-render-scope-'));
  fs.ensureDirSync(path.join(root, 'config'));
  fs.writeFileSync(
    path.join(root, 'config', 'settings.yaml'),
    ['spec:', '  directory: ./specs', ''].join('\n'),
  );
  // Two component folders, each shaped the way the loader recognises one.
  for (const key of ['dsButton', 'dsBlock']) {
    const dir = path.join(root, 'specs', 'components', key);
    fs.ensureDirSync(dir);
    fs.writeFileSync(path.join(dir, 'api.yaml'), `title: ${key}\n`);
    fs.writeFileSync(path.join(dir, 'variants.yaml'), 'variants: []\n');
  }
  cwd = process.cwd();
  process.chdir(root);
});

afterEach(() => {
  process.chdir(cwd);
  fs.removeSync(root);
  vi.restoreAllMocks();
});

/**
 * Every call here passes an explicit `file`, which `bridgeTarget` lets through
 * without asking the bridge anything.
 *
 * That is not incidental. Without it these tests consult whatever bridge
 * happens to be running on this machine, and their result depends on how many
 * Figma files someone has open — they passed with one connected and failed
 * with two. A test that changes answer when you open a second tab is not
 * testing the thing it names.
 */
const PINNED = 'test-file-key';

describe('runRender — scoping by component', () => {
  it('fails when none of the named components exist, rather than rendering nothing and passing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(runRender({ components: ['nope', 'alsoNope'], file: PINNED })).rejects.toThrow(StepError);
    await expect(runRender({ components: ['nope'], file: PINNED })).rejects.toThrow(/none of the named components exist/);
  });

  it('names every component it could not find, so a typo is identifiable', async () => {
    const warnings: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => void warnings.push(args.join(' ')));
    await expect(runRender({ components: ['nope', 'alsoNope'], file: PINNED })).rejects.toThrow(StepError);
    expect(warnings.join('\n')).toContain('nope');
    expect(warnings.join('\n')).toContain('alsoNope');
  });

  it('refuses before contacting the bridge — a wrong name is not a network problem', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Nothing here can reach Figma: the scope check runs before the first
    // render, so the error says what is actually wrong rather than reporting
    // a connection failure.
    await expect(runRender({ components: ['nope'], file: PINNED })).rejects.toThrow(/none of the named components exist/);
  });

  it('stops when there is no specs directory to render from', async () => {
    fs.removeSync(path.join(root, 'specs'));
    await expect(runRender({ components: ['dsButton'], file: PINNED })).rejects.toThrow(/specs directory not found/);
  });
});

/**
 * Not having somewhere to render *to* is a fact about the environment, not a
 * fault in the workspace. It is reported and skipped, so a build whose every
 * other step wrote what it should still passes — and so a watch loop does not
 * die the moment Figma is closed.
 */
describe('bridgeTarget — when rendering cannot happen', () => {
  const status = (connections: Array<{ fileKey: string; fileName?: string }>) =>
    (async () => ({ connections })) as never;

  it('skips when the bridge is not running, and says how to start it', async () => {
    const unreachable = (async () => { throw new Error('ECONNREFUSED'); }) as never;
    const result = await bridgeTarget(undefined, unreachable);
    expect(result).toHaveProperty('skip');
    expect((result as { skip: string }).skip).toMatch(/bridge is not running/);
    expect((result as { skip: string }).skip).toContain('specs bridge start');
  });

  it('skips when the bridge is up but no file is connected', async () => {
    const result = await bridgeTarget(undefined, status([]));
    expect((result as { skip: string }).skip).toMatch(/no Figma file is connected/);
  });

  it('skips when more than one file is connected, naming them and the way out', async () => {
    const result = await bridgeTarget(undefined, status([
      { fileKey: 'aaa', fileName: 'Library' },
      { fileKey: 'bbb', fileName: 'Testing' },
    ]));
    const skip = (result as { skip: string }).skip;
    expect(skip).toMatch(/2 Figma files are connected/);
    expect(skip).toContain('--file');
    expect(skip).toContain('Library');
    expect(skip).toContain('Testing');
  });

  it('never prompts on an ambiguous bridge — a watch loop would stop dead waiting for a keystroke', async () => {
    // The picker reads stdin. Reaching it from a chain is the bug; the skip
    // above is what prevents it, so there is nothing here to answer.
    const result = await bridgeTarget(undefined, status([
      { fileKey: 'aaa' },
      { fileKey: 'bbb' },
    ]));
    expect(result).not.toHaveProperty('fileKey');
  });

  it('takes the sole connection when there is exactly one', async () => {
    const result = await bridgeTarget(undefined, status([{ fileKey: 'only', fileName: 'Testing' }]));
    expect(result).toEqual({ fileKey: 'only' });
  });

  it('passes an explicit --file straight through without asking the bridge', async () => {
    const neverCalled = (async () => { throw new Error('should not be consulted'); }) as never;
    expect(await bridgeTarget('chosen', neverCalled)).toEqual({ fileKey: 'chosen' });
  });
});
