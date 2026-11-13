import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { discoverAnalyses } from '../../../src/storybook/concerns/analysis/index.js';
import type { Workspace } from '../../../src/storybook/workspace.js';

let dir: string;

function ws(): Workspace {
  return { specsDir: dir } as Workspace;
}

describe('analysis concern discovery', () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-analysis-'));
    fs.mkdirSync(path.join(dir, 'components'), { recursive: true });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('groups top-level files by their id prefix', () => {
    const analysis = path.join(dir, 'analysis');
    fs.mkdirSync(analysis, { recursive: true });
    fs.writeFileSync(path.join(analysis, 'props.yaml'), 'a: 1');
    fs.writeFileSync(path.join(analysis, 'styling.byToken.yaml'), 'a: 1');
    fs.writeFileSync(path.join(analysis, 'styling.byComponent.yaml'), 'a: 1');
    fs.writeFileSync(path.join(analysis, 'notes.md'), 'skip');
    expect(discoverAnalyses(ws())).toEqual([
      { id: 'props', title: 'Props', files: ['props.yaml'] },
      { id: 'styling', title: 'Styling', files: ['styling.byComponent.yaml', 'styling.byToken.yaml'] },
    ]);
  });

  it('lists a subdirectory\'s files under its id, index first', () => {
    const analysis = path.join(dir, 'analysis');
    fs.mkdirSync(path.join(analysis, 'foundations'), { recursive: true });
    fs.writeFileSync(path.join(analysis, 'foundations.yaml'), 'summary: {}');
    fs.writeFileSync(path.join(analysis, 'foundations', 'color.yaml'), 'tokens: []');
    fs.writeFileSync(path.join(analysis, 'foundations', 'icons.yaml'), 'icons: []');
    expect(discoverAnalyses(ws())).toEqual([
      {
        id: 'foundations',
        title: 'Foundations',
        files: ['foundations.yaml', 'foundations/color.yaml', 'foundations/icons.yaml'],
      },
    ]);
  });

  it('returns nothing without an analysis directory', () => {
    expect(discoverAnalyses(ws())).toEqual([]);
  });
});
