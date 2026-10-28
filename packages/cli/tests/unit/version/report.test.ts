import { describe, it, expect, afterEach } from 'vitest';
import fsx from 'fs-extra';
import path from 'path';
import { assemble, resolveWorkspace } from '../../../src/version/assemble.js';
import { planCut, commitCut } from '../../../src/version/ledger/cut.js';
import { buildCutChangelog, buildCutDataset, buildLedgerReport, buildPremergeDataset } from '../../../src/version/report/dataset.js';
import { renderChangelog, renderReport, valueText, configText } from '../../../src/version/report/render.js';
import { loadRules } from '../../../src/version/rules/grade.js';
import { makeWorkspace, removeWorkspace, editYaml, writeYaml } from './helpers.js';

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

describe('value rendering', () => {
  it('prints tokens by name and unpacks composites', () => {
    expect(valueText({ $token: 'DE Color/Action/Initial', $type: 'color' })).toBe('DE Color/Action/Initial');
    expect(valueText({ top: 0, start: { $token: 'DE Space/Padding/0_375x', $type: 'dimension' } }))
      .toBe('top 0, start DE Space/Padding/0_375x');
    expect(valueText(16)).toBe('16');
    expect(configText({ size: 'S', selected: true })).toBe('size: S, selected: true');
  });
});

describe('premerge report', () => {
  it('follows the format canon: header, impact table first, graded sections, provenance', () => {
    const base = workspace('pm-base');
    const current = workspace('pm-current');
    editYaml(current, 'specs/deButton/api.yaml', doc => {
      doc.props.rounded = { type: 'boolean', default: false };
      delete doc.props.startIconVisible;
    });
    editYaml(current, 'specs/deButton/variants.yaml', doc => {
      delete doc.default.elements.startIcon.styles.visible;
      doc.default.elements.root.styles.height = 40;
      doc.default.elements.root.styles.backgroundColor = { $token: 'DE Color/Action/Loud', $type: 'color' };
    });

    const dataset = buildPremergeDataset({
      baseDir: path.join(base, 'specs'),
      currentDir: path.join(current, 'specs'),
      ruleSet,
      rulesLabel: 'built-in',
      targetLabel: 'main',
      sourceLabel: 'feature',
      author: 'Nathan Curtis',
    });
    const report = renderReport(dataset);

    // header: date, target ← source, then who ran it
    expect(report).toMatch(/\d{4}-\d{2}-\d{2} `main` ← `feature` · Nathan Curtis/);
    // impact table first, counts only with · for zero
    const impactIndex = report.indexOf('## Impact');
    expect(impactIndex).toBeGreaterThan(-1);
    expect(impactIndex).toBeLessThan(report.indexOf('## Breaking'));
    // one component changed: the totals row would restate the row beneath it
    expect(report).not.toContain('**All components**');
    expect(report).toContain('| DE Button | 1 | 1 |');
    expect(report).toMatch(/\| DE Button \| 1 \| 1 \| \d+ \| · \|/);
    // graded sections carry values, not just paths
    expect(report).toContain('## Breaking');
    // the component is a heading; its findings are the list beneath it
    expect(report).toMatch(/## Breaking\n\n### DE Button\n\n- /);
    expect(report).not.toMatch(/- \*\*DE Button\*\* — /);
    expect(report).toContain('removed `props.startIconVisible`');
    expect(report).toContain('boolean, default false');
    expect(report).toContain('DE Color/Action/Loud');
    // sections in canon order, provenance closes
    expect(report.indexOf('## Breaking')).toBeLessThan(report.indexOf('## Minor'));
    expect(report.indexOf('## Minor')).toBeLessThan(report.indexOf('## Patch'));
    expect(report.indexOf('## Patch')).toBeLessThan(report.indexOf('## Examples'));
    expect(report).toContain('## How this was produced');
    expect(report).toContain('| Severity rules | built-in |');
  });

  it('reports recorded renames with provenance and unruled changes under Needs review', () => {
    const base = workspace('pm-rn-base');
    const current = workspace('pm-rn-current');
    // recorded component rename
    fsx.moveSync(path.join(current, 'specs/deButton'), path.join(current, 'specs/dePushButton'));
    editYaml(current, 'specs/dePushButton/api.yaml', doc => { doc.title = 'DE Push Button'; });
    writeYaml(current, 'versions/renames.yaml', {
      events: [{ kind: 'rename', scope: 'deButton', from: 'DE Button', to: 'DE Push Button', reason: 'test' }],
    });

    const dataset = buildPremergeDataset({
      baseDir: path.join(base, 'specs'),
      currentDir: path.join(current, 'specs'),
      ruleSet,
      rulesLabel: 'built-in',
    });
    const report = renderReport(dataset);
    expect(report).toContain('DE Button → DE Push Button (recorded)');
    expect(report).toContain('renamed from `DE Button`');
  });

  it('surfaces an inferred rename (matching nodeId) as remove+add with a warning', () => {
    const base = workspace('pm-inf-base');
    const current = workspace('pm-inf-current');
    fsx.moveSync(path.join(current, 'specs/deButton'), path.join(current, 'specs/deCta'));
    editYaml(current, 'specs/deCta/api.yaml', doc => { doc.title = 'DE Cta'; });

    const dataset = buildPremergeDataset({
      baseDir: path.join(base, 'specs'),
      currentDir: path.join(current, 'specs'),
      ruleSet,
      rulesLabel: 'built-in',
    });
    expect(dataset.renames[0]).toMatchObject({ provenance: 'inferred', from: 'DE Button', to: 'DE Cta' });
    const report = renderReport(dataset);
    expect(report).toContain('(inferred, confidence 0.9)');
    expect(report).toContain('no longer in the library');
    expect(report).toContain('new component');
    expect(report).toContain('Likely rename');
  });
});

describe('cut-time report and changelog', () => {
  it('renders one dataset two ways: glance report and itemized changelog with migrations', () => {
    const dir = workspace('release');
    const ws = resolveWorkspace(dir);
    commitCut(ws, planCut(ws, ruleSet), { reportMd: 'r', changelogMd: 'c' });

    // tracked prop rename + an addition
    writeYaml(dir, 'versions/renames.yaml', {
      events: [{ kind: 'rename', scope: 'deButton.props', from: 'size', to: 'scale', reason: 'align naming' }],
    });
    editYaml(dir, 'specs/deButton/api.yaml', doc => {
      const def = doc.props.size;
      delete doc.props.size;
      doc.props.scale = def;
      doc.props.rounded = { type: 'boolean', default: false };
    });
    const plan = planCut(ws, ruleSet);
    const report = renderReport(buildCutDataset(plan, 'built-in'));
    const changelog = renderChangelog(buildCutChangelog(plan));

    expect(plan.libraryVersion).toBe('1.0.0');
    expect(report).toContain('# Release Report — 1.0.0');
    expect(report).toContain('`props.size` → `props.scale`');

    expect(changelog).toContain('## 1.0.0');
    expect(changelog).toContain('### DE Button (0.1.0 → 1.0.0) — BREAKING');
    expect(changelog).toContain('#### Breaking');
    expect(changelog).toContain('#### Added');
    expect(changelog).toContain('#### Migration');
    expect(changelog).toContain('- `props.size` → `props.scale`');
  });
});

describe('ledger-backed pre-release report', () => {
  it('accumulates diffs across releases since a version', () => {
    const dir = workspace('since');
    const ws = resolveWorkspace(dir);
    commitCut(ws, planCut(ws, ruleSet), { reportMd: 'r', changelogMd: 'c' });

    editYaml(dir, 'specs/deButton/api.yaml', doc => {
      doc.props.rounded = { type: 'boolean', default: false };
    });
    let plan = planCut(ws, ruleSet);
    commitCut(ws, plan, { reportMd: 'r', changelogMd: 'c' }); // 0.2.0

    editYaml(dir, 'specs/deAlert/api.yaml', doc => { delete doc.props.dismissable; });
    editYaml(dir, 'specs/deAlert/variants.yaml', doc => {
      if (doc.variants) {
        doc.variants = doc.variants.filter((v: any) => v.configuration?.dismissable === undefined);
      }
    });
    plan = planCut(ws, ruleSet);
    commitCut(ws, plan, { reportMd: 'r', changelogMd: 'c' }); // 1.0.0

    const { dataset, releases, since, latest } = buildLedgerReport({
      versionsDir: path.join(dir, 'versions'),
      ruleSet,
      rulesLabel: 'built-in',
      since: '0.1.0',
    });

    expect(since).toBe('0.1.0');
    expect(latest).toBe('1.0.0');
    expect(releases.map(r => r.libraryVersion)).toEqual(['1.0.0', '0.2.0']);

    const report = renderReport(dataset);
    expect(report).toContain('added `props.rounded`');
    expect(report).toContain('removed `props.dismissable`');

    const changelog = renderChangelog(releases);
    expect(changelog.indexOf('## 1.0.0')).toBeLessThan(changelog.indexOf('## 0.2.0'));
    expect(changelog).toContain('### DE Alert');
  });

  it('collects new variants into one bullet per component, without their styles', () => {
    const base = workspace('rp-variants-base');
    const current = workspace('rp-variants-current');
    editYaml(current, 'specs/deButton/variants.yaml', doc => {
      doc.variants.push({
        configuration: { size: 'XLarge' },
        elements: { root: { styles: { height: 44, cornerRadius: 8 } } },
      });
      doc.variants.push({
        configuration: { size: 'Tiny' },
        elements: { root: { styles: { height: 20 } } },
      });
    });

    const report = renderReport(buildPremergeDataset({
      baseDir: path.join(base, 'specs'),
      currentDir: path.join(current, 'specs'),
      ruleSet,
      rulesLabel: 'built-in',
      targetLabel: 'main',
      sourceLabel: 'feature',
    }));

    expect(report).toContain('### DE Button');
    expect(report).toContain('- added variants:');
    expect(report).toContain('  - `size=XLarge`');
    expect(report).toContain('  - `size=Tiny`');
    // the styles each new variant sets are the variant, not a finding of their own
    expect(report).not.toContain('`44`');
  });
});
