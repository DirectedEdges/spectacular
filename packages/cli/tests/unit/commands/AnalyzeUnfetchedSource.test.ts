/**
 * `specs analyze` over a tree whose fetched data is not there.
 *
 * The raw Figma payloads are gitignored — megabytes rewritten wholesale by a
 * fetch, with no reviewable diff — while `data/cache/` and the manifests stay
 * committed. So a fresh clone, or a new worktree, has the cache index and none of
 * the universe behind it.
 *
 * Analysed anyway, that tree produces reports that are structurally valid and
 * wrong: `foundations.yaml` carries `collections: []`, which a reader cannot
 * distinguish from a library that genuinely declares no themes. An authoring
 * round read exactly that, concluded the workspace had no theme vocabulary, and
 * authored a component's examples with no theme — against an analysis that had
 * reported success.
 *
 * The distinction this file pins down is between a source that declares a kind
 * and a source that does not. Declaring `styles` and no `variables` is a correct
 * configuration for a foundations file and must stay silent forever. Declaring
 * `variables` with no `<alias>.variables.json` on disk is an un-fetched tree.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { runAnalyze } from '../../../src/commands/analyze.js';
import { StepError } from '../../../src/pipeline/StepError.js';
import { ERROR_CODES } from '../../../src/utilities/errorCodes.js';

let root: string;
let cwd: string;

/** A config declaring one source and whichever payload kinds the case needs. */
function writeSettings(fetchKinds: string[]): void {
  fs.writeFileSync(
    path.join(root, 'config', 'settings.yaml'),
    [
      'data:',
      '  directory: ./data',
      '  sources:',
      '    library:',
      '      key: ABC123',
      '      fetch:',
      ...fetchKinds.map(k => `        - ${k}`),
      'spec:',
      '  directory: ./specs',
      '  format: YAML',
      '',
    ].join('\n'),
  );
}

/** The shape `loadFoundations` reads: variables and collections under `meta`. */
function writeVariablesPayload(): void {
  fs.writeJSONSync(path.join(root, 'data', 'library.variables.json'), {
    meta: { variables: {}, variableCollections: {} },
  });
}

function writeStylesPayload(): void {
  fs.writeJSONSync(path.join(root, 'data', 'library.styles.json'), { meta: { styles: [] } });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-analyze-unfetched-'));
  fs.ensureDirSync(path.join(root, 'config'));
  fs.ensureDirSync(path.join(root, 'data'));
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

describe('runAnalyze on a tree with no fetched data', () => {
  it('refuses when a source declares variables and the payload is absent', async () => {
    writeSettings(['file', 'variables', 'styles']);
    writeStylesPayload(); // only the styles half arrived

    await expect(runAnalyze([], { verbose: false })).rejects.toThrow(StepError);
  });

  it('names the absent file and the command that fixes it', async () => {
    writeSettings(['file', 'variables']);

    const error = await runAnalyze([], { verbose: false }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StepError);
    const stepError = error as StepError;
    expect(stepError.code).toBe(ERROR_CODES.FILE_ERROR);
    expect(stepError.message).toContain(path.join('data', 'library.variables.json'));
    expect(stepError.message).toContain('specs fetch');
  });

  it('writes no analysis when it refuses, so a wrong baseline cannot be read back', async () => {
    writeSettings(['file', 'variables']);

    await runAnalyze([], { verbose: false }).catch(() => undefined);

    expect(fs.existsSync(path.join(root, 'specs', 'analysis'))).toBe(false);
  });

  it('runs when every declared payload is present', async () => {
    writeSettings(['file', 'variables', 'styles']);
    writeVariablesPayload();
    writeStylesPayload();

    const result = await runAnalyze([], { verbose: false });
    expect(result.detail).toBe('0 specs');
  });

  it('stays silent for a source that declares neither kind', async () => {
    // A foundations file fetched for its components and icons alone. Nothing is
    // missing here — there is nothing to miss.
    writeSettings(['file', 'icons']);

    const result = await runAnalyze([], { verbose: false });
    expect(result.detail).toBe('0 specs');
  });

  it('stays silent for a source that declares styles and no variables', async () => {
    // The real de-library foundations source: `file` and `styles`, no variables,
    // because that file carries none. An empty variables universe is correct.
    writeSettings(['file', 'styles']);
    writeStylesPayload();

    const result = await runAnalyze([], { verbose: false });
    expect(result.detail).toBe('0 specs');
  });
});
