import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import {
  cleanupRun,
  folderNameFor,
  parseBranchUrl,
  resolveRunFolder,
  retryable,
  formatBytes,
  pastRuns,
  removePastRuns,
  runFigmaPremerge,
  type PremergeSteps,
} from '../../../src/version/figmaPremerge.js';
import { buildPremergeDataset, loadManifest } from '../../../src/version/report/dataset.js';
import { renderReport } from '../../../src/version/report/render.js';
import { loadRules } from '../../../src/version/rules/grade.js';
import { makeWorkspace, removeWorkspace, editYaml } from './helpers.js';

const ruleSet = loadRules();
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) removeWorkspace(dirs.pop()!);
});

function workspace(name: string): string {
  const dir = makeWorkspace(name);
  dirs.push(dir);
  return dir;
}

const TODAY = new Date().toISOString().slice(0, 10);
const BRANCH_URL = 'https://www.figma.com/design/MAINKEY123/My-Library/branch/BRANCHKEY456/My-Library?node-id=1-2';

describe('branch URL parsing (ported from premerge-run.sh)', () => {
  it('reads the main key after /design/ and the branch key after /branch/', () => {
    expect(parseBranchUrl(BRANCH_URL)).toEqual({ mainKey: 'MAINKEY123', branchKey: 'BRANCHKEY456' });
  });

  it('rejects a URL without a /branch/ segment', () => {
    expect(() => parseBranchUrl('https://www.figma.com/design/MAINKEY123/My-Library'))
      .toThrow(/no \/branch\/ segment/);
  });

  it('rejects a URL without a main file key', () => {
    expect(() => parseBranchUrl('https://www.figma.com/branch/BRANCHKEY456'))
      .toThrow(/main file key/);
  });
});

describe('run folder naming (premerge-name-run.mjs semantics)', () => {
  it('names the folder <date>-<branch name>, spaces kept', () => {
    const dir = workspace('naming');
    const diffs = path.join(dir, 'versions', 'diffs');
    const first = resolveRunFolder(diffs, 'Premerge spec review', TODAY);
    expect(path.basename(first)).toBe(`${TODAY}-Premerge spec review`);
  });

  it('numbers duplicate runs as siblings instead of overwriting', () => {
    const dir = workspace('duplicates');
    const diffs = path.join(dir, 'versions', 'diffs');
    const first = resolveRunFolder(diffs, 'Premerge spec review', TODAY);
    fs.ensureDirSync(first);
    const second = resolveRunFolder(diffs, 'Premerge spec review', TODAY);
    expect(path.basename(second)).toBe(`${TODAY}-Premerge spec review 2`);
    fs.ensureDirSync(second);
    const third = resolveRunFolder(diffs, 'Premerge spec review', TODAY);
    expect(path.basename(third)).toBe(`${TODAY}-Premerge spec review 3`);
  });

  it('keeps branch names verbatim apart from path-hostile characters', () => {
    expect(folderNameFor('Premerge spec review')).toBe('Premerge spec review');
    expect(folderNameFor('feat: tokens / spacing')).toBe('feat- tokens - spacing');
    expect(folderNameFor('***')).toBe('***');
    expect(folderNameFor('///')).toBe('branch');
  });
});

describe('retryable causes', () => {
  it('matches license, rate-limit, and network causes only', () => {
    expect(retryable('The license check could not be completed')).toBe(true);
    expect(retryable('HTTP 429 Too Many Requests')).toBe(true);
    expect(retryable('connect ETIMEDOUT 1.2.3.4')).toBe(true);
    expect(retryable('Error: component had no anatomy')).toBe(false);
  });

  it('treats the license-validation burst refusal as transient', () => {
    expect(retryable('The license server could not be reached. Your key was not validated, so no licensed output was produced.')).toBe(true);
  });
});

/**
 * Fake steps: fetch writes receipts (and payload stand-ins), generate copies a
 * fixture spec tree — the branch side with one MINOR-class edit.
 */
function fakeSteps(fixturesFrom: string, options: { branchName?: string | null; failFetchTimes?: number } = {}): PremergeSteps & { calls: string[] } {
  let fetchFailures = options.failFetchTimes ?? 0;
  const calls: string[] = [];
  return {
    calls,
    fetch(side, sourceArg, dataDir) {
      calls.push(`fetch ${side} ${sourceArg}`);
      if (side === 'branch' && fetchFailures > 0) {
        fetchFailures--;
        throw new Error('Figma returned 429 rate limit');
      }
      fs.ensureDirSync(dataDir);
      fs.writeJsonSync(path.join(dataDir, `${side}.source.json`), {
        alias: side,
        key: side === 'branch' ? 'BRANCHKEY456' : 'MAINKEY123',
        mainFileKey: side === 'branch' ? 'MAINKEY123' : null,
        branchName: side === 'branch' ? (options.branchName === undefined ? 'Feature tokens' : options.branchName) : 'My Library',
        fetchedAt: new Date().toISOString(),
      });
      for (const kind of ['file', 'variables', 'styles']) {
        fs.writeFileSync(path.join(dataDir, `${side}.${kind}.json`), '{}');
      }
    },
    scan(side, _filePath, manifestPath) {
      calls.push(`scan ${side}`);
      fs.writeFileSync(manifestPath, '| [x] | DE Button | x | x | READY_FOR_DEV |\n| [x] | DE Alert | x | x | READY_FOR_DEV |\n');
    },
    generate(side, _manifest, specsDir) {
      calls.push(`generate ${side}`);
      fs.copySync(path.join(fixturesFrom, 'specs'), specsDir);
      if (side === 'branch') {
        const api = path.join(specsDir, 'deButton', 'api.yaml');
        const doc = yaml.parse(fs.readFileSync(api, 'utf8'));
        doc.props.branchOnly = { type: 'boolean', default: false };
        fs.writeFileSync(api, yaml.stringify(doc));
      }
    },
  };
}

describe('figmapremerge orchestration (injected steps, no network)', () => {
  it('runs both sides in parallel into versions/diffs/<date>-<branch>/', async () => {
    const dir = workspace('fp-run');
    const lines: string[] = [];
    const phases: string[] = [];
    const waits: number[] = [];
    const steps = fakeSteps(dir);
    const run = await runFigmaPremerge({
      url: BRANCH_URL,
      workspaceRoot: dir,
      versionsDir: path.join(dir, 'versions'),
      steps,
      sleep: async ms => { waits.push(ms); },
      log: line => lines.push(line),
      spinner: text => { phases.push(text); return () => '1s'; },
    });

    expect(path.basename(run.runDir)).toBe(`${TODAY}-Feature tokens`);
    expect(run.branchName).toBe('Feature tokens');
    expect(run.targetLabel).toBe('My Library');
    // both fetches started before either scan ran — the sides are concurrent
    expect(steps.calls.slice(0, 2).every(c => c.startsWith('fetch'))).toBe(true);
    expect(fs.existsSync(run.baseSpecsDir)).toBe(true);
    expect(fs.existsSync(run.currentSpecsDir)).toBe(true);
    // payload cleanup is the caller's post-report step now, not the run's
    expect(fs.existsSync(path.join(run.runDir, 'branch/data/branch.file.json'))).toBe(true);
    // neither side fetches published styles; both read the same empty document
    for (const side of ['branch', 'main']) {
      expect(fs.readJsonSync(path.join(run.runDir, `${side}/data/${side}.styles.json`)))
        .toEqual({ meta: { styles: [] } });
    }

    // opening milestone names what is being compared
    expect(lines[0]).toBe('Premerge diff — branch BRANCHKEY456 onto MAINKEY123');
    // phase-level display: one loading state per phase, one ✓ when BOTH sides are done
    expect(phases).toEqual(['Fetching branch and main', 'Generating specs from branch and main']);
    expect(lines).toContain('✓ Fetched branch and main (1s)');
    expect(lines).toContain('✓ Generate specs (1s)');
    expect(lines).toContain(`✓ Create diff folder: /versions/diffs/${TODAY}-Feature tokens`);
    // no per-side milestone lines
    expect(lines.some(l => /branch: fetch complete|main: fetch complete|branch: specs generated|main: specs generated/.test(l))).toBe(false);
    // both generates start as soon as their own side's scan completes — no waits
    expect(waits).toEqual([]);

    // a second run of the same branch lands in a numbered sibling
    const second = await runFigmaPremerge({
      url: BRANCH_URL,
      workspaceRoot: dir,
      versionsDir: path.join(dir, 'versions'),
      steps: fakeSteps(dir),
      sleep: async () => undefined,
    });
    expect(path.basename(second.runDir)).toBe(`${TODAY}-Feature tokens 2`);
    expect(fs.existsSync(run.runDir)).toBe(true); // the first run survived

    // the diff sees the branch-side edit as MINOR
    const dataset = buildPremergeDataset({
      baseDir: run.baseSpecsDir,
      currentDir: run.currentSpecsDir,
      ruleSet,
      rulesLabel: 'built-in',
      targetLabel: run.targetLabel,
      sourceLabel: run.sourceLabel,
    });
    const button = dataset.components.find(c => c.name === 'deButton')!;
    expect(button.entries.some(e => e.path === 'props.branchOnly' && e.impact === 'minor')).toBe(true);
    const report = renderReport(dataset);
    expect(report).toContain('`My Library` ← `Feature tokens`');
  });

  it('retries a transient fetch failure and then succeeds', async () => {
    const dir = workspace('fp-retry');
    const steps = fakeSteps(dir, { failFetchTimes: 1 });
    const waits: number[] = [];
    const run = await runFigmaPremerge({
      url: BRANCH_URL,
      workspaceRoot: dir,
      versionsDir: path.join(dir, 'versions'),
      steps,
      sleep: async ms => { waits.push(ms); },
    });
    // exactly one transient retry (30s), nothing else
    expect(waits).toEqual([30_000]);
    expect(fs.existsSync(run.runDir)).toBe(true);
  });

  it('retries a generate that hits the license burst refusal', async () => {
    const dir = workspace('fp-license');
    const steps = fakeSteps(dir);
    const originalGenerate = steps.generate.bind(steps);
    let refusals = 1;
    steps.generate = (side, manifest, specsDir, variablesPath, stylesPath) => {
      if (side === 'branch' && refusals > 0) {
        refusals--;
        throw new Error('The license server could not be reached. Your key was not validated, so no licensed output was produced.');
      }
      return originalGenerate(side, manifest, specsDir, variablesPath, stylesPath);
    };
    const waits: number[] = [];
    const run = await runFigmaPremerge({
      url: BRANCH_URL,
      workspaceRoot: dir,
      versionsDir: path.join(dir, 'versions'),
      steps,
      sleep: async ms => { waits.push(ms); },
    });
    expect(waits).toEqual([30_000]);
    expect(fs.existsSync(path.join(run.currentSpecsDir, 'deButton', 'api.yaml'))).toBe(true);
  });

  it('a non-retryable failure names the step and removes the half-run folder', async () => {
    const dir = workspace('fp-fail');
    const steps = fakeSteps(dir);
    steps.scan = side => {
      if (side === 'branch') throw new Error('component had no anatomy');
      // main side still writes its manifest so both sides settle
      };
    const lines: string[] = [];
    await expect(runFigmaPremerge({
      url: BRANCH_URL,
      workspaceRoot: dir,
      versionsDir: path.join(dir, 'versions'),
      steps,
      sleep: async () => undefined,
      log: line => lines.push(line),
    })).rejects.toThrow(/branch: scan failed/);
    expect(lines).toContain('✗ Generating specs from branch and main failed — run folder removed');
    // no half-run folder left behind
    const diffs = path.join(dir, 'versions', 'diffs');
    expect(fs.existsSync(path.join(diffs, `${TODAY}-Feature tokens`))).toBe(false);
    expect(fs.readdirSync(diffs).filter(n => !n.startsWith('.'))).toEqual([]);
  });

  it('falls back to "branch" without a receipt name', async () => {
    const dir = workspace('fp-noname');
    const run = await runFigmaPremerge({
      url: BRANCH_URL,
      workspaceRoot: dir,
      versionsDir: path.join(dir, 'versions'),
      steps: fakeSteps(dir, { branchName: null }),
      sleep: async () => undefined,
    });
    expect(path.basename(run.runDir)).toBe(`${TODAY}-branch`);
  });
});

describe('post-report cleanup', () => {
  async function finishedRun(dir: string) {
    const run = await runFigmaPremerge({
      url: BRANCH_URL,
      workspaceRoot: dir,
      versionsDir: path.join(dir, 'versions'),
      steps: fakeSteps(dir),
      sleep: async () => undefined,
    });
    fs.writeFileSync(path.join(run.runDir, 'report.md'), '# report\n');
    return run;
  }

  it('default: removes main/ entirely and keeps only the impacted components\' specs in branch/', async () => {
    const dir = workspace('clean-default');
    const run = await finishedRun(dir);

    cleanupRun(run.runDir, ['deButton'], false);

    expect(fs.existsSync(path.join(run.runDir, 'main'))).toBe(false);
    expect(fs.existsSync(path.join(run.runDir, 'branch/data'))).toBe(false);
    expect(fs.existsSync(path.join(run.runDir, 'branch/specs/deButton/api.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(run.runDir, 'branch/specs/deAlert'))).toBe(false);
    expect(fs.existsSync(path.join(run.runDir, 'branch/specs/latest.metadata.yaml'))).toBe(false);
    // the report and receipt survive
    expect(fs.existsSync(path.join(run.runDir, 'report.md'))).toBe(true);
  });

  it('--keep-data keeps everything: main/, all of branch/, and the payloads', async () => {
    const dir = workspace('clean-keep');
    const run = await finishedRun(dir);

    cleanupRun(run.runDir, ['deButton'], true);

    expect(fs.existsSync(path.join(run.runDir, 'main/specs/deAlert/api.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(run.runDir, 'branch/specs/deAlert/api.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(run.runDir, 'branch/data/branch.file.json'))).toBe(true);
    expect(fs.existsSync(path.join(run.runDir, 'main/data/main.file.json'))).toBe(true);
  });
});

describe('manifest-aware presence (ported from premerge-diff.mjs)', () => {
  it('tells an unpublished component apart from a deleted one, and a first publish from a new component', () => {
    const base = workspace('mf-base');
    const current = workspace('mf-current');
    // deAlert vanishes from the current tree but its manifest row is unchecked → unpublished
    fs.removeSync(path.join(current, 'specs/deAlert'));
    // deChip appears in the current tree and base manifest lists it unchecked → published
    fs.copySync(path.join(base, 'specs/deButton'), path.join(current, 'specs/deChip'));
    editYaml(current, 'specs/deChip/api.yaml', doc => {
      doc.title = 'DE Chip';
      doc.metadata.source.nodeId = '4242:1';
    });

    const currentManifest = path.join(current, 'current.manifest.md');
    fs.writeFileSync(currentManifest, [
      '| [x] | DE Button | p | n | READY_FOR_DEV |',
      '| [ ] | DE Alert | p | n | IN_PROGRESS |',
      '| [x] | DE Chip | p | n | READY_FOR_DEV |',
    ].join('\n'));
    const baseManifest = path.join(base, 'base.manifest.md');
    fs.writeFileSync(baseManifest, [
      '| [x] | DE Button | p | n | READY_FOR_DEV |',
      '| [x] | DE Alert | p | n | READY_FOR_DEV |',
      '| [ ] | DE Chip | p | n | NONE |',
    ].join('\n'));

    expect(loadManifest(currentManifest)!.get('deAlert')).toMatchObject({ checked: false, devStatus: 'IN_PROGRESS' });

    const dataset = buildPremergeDataset({
      baseDir: path.join(base, 'specs'),
      currentDir: path.join(current, 'specs'),
      ruleSet,
      rulesLabel: 'built-in',
      baseManifest,
      currentManifest,
    });

    const alert = dataset.components.find(c => c.name === 'deAlert')!;
    expect(alert.entries[0].rule).toBe('component-unpublished');
    expect(alert.entries[0].impact).toBe('major');
    const chip = dataset.components.find(c => c.name === 'deChip')!;
    expect(chip.entries[0].rule).toBe('component-published');
    expect(chip.entries[0].impact).toBe('minor');

    const report = renderReport(dataset);
    expect(report).toContain('no longer published as a spec');
    expect(report).toContain('dev status IN_PROGRESS');
    expect(report).toContain('published as a spec for the first time');
  });
});

describe('past runs — the housekeeping prompt reads these', () => {
  it('lists run folders with their total size, and removes them on request', () => {
    const dir = workspace('mf-past');
    const diffs = path.join(dir, 'versions/diffs');
    fs.outputFileSync(path.join(diffs, '2026-09-01-One/report.md'), 'x'.repeat(1024));
    fs.outputFileSync(path.join(diffs, '2026-09-02-Two/report.md'), 'y'.repeat(2048));
    fs.ensureDirSync(path.join(diffs, '.staging-abc'));

    const past = pastRuns(diffs);
    expect(past.folders.map(f => path.basename(f))).toEqual(['2026-09-01-One', '2026-09-02-Two']);
    expect(past.bytes).toBe(3072);
    expect(formatBytes(past.bytes)).toBe('3K');

    removePastRuns(past.folders);
    expect(pastRuns(diffs).folders).toEqual([]);
  });

  it('reports nothing for a diffs folder that does not exist yet', () => {
    expect(pastRuns(path.join(workspace('mf-none'), 'versions/diffs')).folders).toEqual([]);
  });
});
