/**
 * `specs analyze` over a workspace with no component specs.
 *
 * A workspace being authored from scratch has fetched data and an empty
 * `specs/components/`, and the analysis reports are what it watches fill up.
 * The command used to refuse to run, leaving `analysis/` with no files at all —
 * which reads as a broken command rather than as an empty catalogue, and failed
 * `specs build` on a workspace whose only problem was that nobody had authored
 * a spec yet.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { runAnalyze } from '../../../src/commands/analyze.js';

let root: string;
let cwd: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-analyze-empty-'));
  fs.ensureDirSync(path.join(root, 'config'));
  fs.writeFileSync(
    path.join(root, 'config', 'settings.yaml'),
    ['spec:', '  directory: ./specs', '  format: YAML', ''].join('\n'),
  );
  // The layout a `specs generate` run writes, with nothing generated into it yet.
  fs.ensureDirSync(path.join(root, 'specs', 'components'));
  fs.ensureDirSync(path.join(root, 'specs', 'compositions'));
  cwd = process.cwd();
  process.chdir(root);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  process.chdir(cwd);
  fs.removeSync(root);
  vi.restoreAllMocks();
});

const analysisDir = (): string => path.join(root, 'specs', 'analysis');

describe('runAnalyze with an empty catalogue', () => {
  it('succeeds and reports nothing analysed', async () => {
    const result = await runAnalyze([], { verbose: false });
    expect(result.detail).toBe('0 specs');
  });

  it('writes every analyzer report, in the format the config declares', async () => {
    await runAnalyze([], { verbose: false });

    // `.yaml` because the config says YAML. Each analyzer learns the format from a
    // spec it visits, and here it visits none — so the format has to arrive another
    // way or every report lands as `.json` in a YAML workspace.
    expect(fs.readdirSync(analysisDir()).sort()).toEqual([
      'dependencies.byComponent.yaml',
      'dependencies.graph.yaml',
      'keys.yaml',
      'props.yaml',
      'roles.yaml',
      'styling.byComponent.yaml',
      'styling.byToken.yaml',
    ]);
  });

  it('writes reports a reader can parse, with zeroes rather than absences', async () => {
    await runAnalyze([], { verbose: false });

    const read = (file: string): Record<string, never> =>
      yaml.parse(fs.readFileSync(path.join(analysisDir(), file), 'utf-8'));

    const props = read('props.yaml') as unknown as {
      summary: { totalProps: number; totalComponents: number };
      propNameFrequency: unknown[];
    };
    expect(props.summary.totalProps).toBe(0);
    expect(props.summary.totalComponents).toBe(0);
    expect(props.propNameFrequency).toEqual([]);

    const graph = read('dependencies.graph.yaml') as unknown as {
      summary: { components: number };
      nodes: Record<string, unknown>;
      edges: unknown[];
    };
    expect(graph.summary.components).toBe(0);
    expect(graph.nodes).toEqual({});
    expect(graph.edges).toEqual([]);

    const roles = read('roles.yaml') as unknown as { summary: { elements: number } };
    expect(roles.summary.elements).toBe(0);

    const keys = read('keys.yaml') as unknown as { summary: { totalNames: number } };
    expect(keys.summary.totalNames).toBe(0);

    expect(read('styling.byComponent.yaml')).toEqual({});
  });

  it('names a single analyzer and writes only that report', async () => {
    await runAnalyze(['props'], { verbose: false });
    expect(fs.readdirSync(analysisDir())).toEqual(['props.yaml']);
  });
});
