import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { ThemesAnalyzer } from '../../../src/analyze/Themes.js';
import type { AnalyzerFoundations } from '../../../src/transforms/transformer.js';

/**
 * The theme usage report (ADR-123) — authored selections only, indexed by
 * component and by theme, measured against the vocabulary foundations declares.
 */

function makeContext(dir: string, componentKey = 'deCard') {
  return {
    specDir: dir, outputDir: dir, workspaceDir: dir, specsRoot: dir,
    kind: 'component' as const, componentKey, tokensFormat: 'TOKEN', outputFormat: 'JSON' as const,
  };
}

/** The library's own two multi-mode collections, as foundations reports them. */
const foundations = {
  variables: new Map(),
  styles: new Map(),
  collections: new Map([
    ['c1', { name: 'DE Color', defaultModeId: '4668:0', modes: [{ name: 'Light' }, { name: 'Dark' }] }],
    ['c2', { name: 'DE Space', defaultModeId: '4668:4', modes: [{ name: 'Cozy' }, { name: 'Compact' }] }],
  ]),
} as unknown as AnalyzerFoundations;

const variants = {
  default: {
    elements: {
      root: { themes: { 'DE Color': 'Dark' }, styles: { padding: 8 } },
      panel: { styles: { padding: 4 } },
    },
  },
  variants: [
    {
      configuration: { appearance: 'Secondary' },
      elements: { root: { themes: { 'DE Color': 'Light', 'DE Space': 'Compact' } } },
    },
  ],
};

describe('ThemesAnalyzer', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'themes-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('has name "themes"', () => {
    expect(new ThemesAnalyzer().name).toBe('themes');
  });

  it('records one entry per element that selects, with its variant', async () => {
    await fs.writeFile(path.join(tmpDir, 'variants.yaml'), yaml.stringify(variants));
    const analyzer = new ThemesAnalyzer();
    await analyzer.run({}, makeContext(tmpDir));
    const out = await fs.readJSON(path.join(tmpDir, 'themes.json'));

    expect(out.deCard.selections).toEqual([
      { element: 'root', variant: 'default', themes: { 'DE Color': 'Dark' } },
      { element: 'root', variant: 'appearance=Secondary', themes: { 'DE Color': 'Light', 'DE Space': 'Compact' } },
    ]);
  });

  it('says nothing about an element that selects nothing — absence means inherit', async () => {
    await fs.writeFile(path.join(tmpDir, 'variants.yaml'), yaml.stringify(variants));
    const analyzer = new ThemesAnalyzer();
    await analyzer.run({}, makeContext(tmpDir));
    const out = await fs.readJSON(path.join(tmpDir, 'themes.json'));
    expect(out.deCard.selections.map((s: { element: string }) => s.element)).not.toContain('panel');
  });

  it('indexes by theme, naming every component, element and variant that selects it', async () => {
    await fs.writeFile(path.join(tmpDir, 'variants.yaml'), yaml.stringify(variants));
    const analyzer = new ThemesAnalyzer();
    await analyzer.run({}, makeContext(tmpDir));
    await analyzer.finalize(tmpDir, tmpDir, foundations, 'JSON');
    const byTheme = await fs.readJSON(path.join(tmpDir, 'themes.byTheme.json'));

    expect(Object.keys(byTheme).sort()).toEqual(['DE Color: Dark', 'DE Color: Light', 'DE Space: Compact']);
    expect(byTheme['DE Color: Dark']).toEqual([
      { component: 'deCard', element: 'root', variant: 'default' },
    ]);
  });

  it('reports declared themes nothing selects, against the foundations vocabulary', async () => {
    await fs.writeFile(path.join(tmpDir, 'variants.yaml'), yaml.stringify(variants));
    const analyzer = new ThemesAnalyzer();
    await analyzer.run({}, makeContext(tmpDir));
    await analyzer.finalize(tmpDir, tmpDir, foundations, 'JSON');
    const unused = await fs.readJSON(path.join(tmpDir, 'themes.unused.json'));

    expect(unused.summary.groups).toEqual({ total: 2, selected: 2, unselected: 0 });
    expect(unused.summary.themes).toEqual({ total: 4, selected: 3, unselected: 1 });
    expect(unused.themes).toEqual(['DE Space: Cozy']);
  });

  it('omits a component that selects nothing from the by-component roll-up', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'variants.yaml'),
      yaml.stringify({ default: { elements: { root: { styles: { padding: 8 } } } }, variants: [] }),
    );
    const analyzer = new ThemesAnalyzer();
    await analyzer.run({}, makeContext(tmpDir, 'deBadge'));
    await analyzer.finalize(tmpDir, tmpDir, foundations, 'JSON');
    const byComponent = await fs.readJSON(path.join(tmpDir, 'themes.byComponent.json'));
    expect(byComponent).toEqual({});
  });

  it('ignores a themes value that is not a theme name', async () => {
    // A spec is read from disk; a malformed entry must not reach the report.
    await fs.writeFile(
      path.join(tmpDir, 'variants.yaml'),
      yaml.stringify({ default: { elements: { root: { themes: { 'DE Color': { mode: 'Dark' } } } } }, variants: [] }),
    );
    const analyzer = new ThemesAnalyzer();
    await analyzer.run({}, makeContext(tmpDir));
    const out = await fs.readJSON(path.join(tmpDir, 'themes.json'));
    expect(out.deCard.selections).toEqual([]);
  });

  it('scopes a subcomponent under a dot path, as styling does', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'variants.yaml'),
      yaml.stringify({
        default: { elements: { root: {} } },
        variants: [],
        subcomponents: {
          reviews: { default: { elements: { root: { themes: { 'DE Color': 'Dark' } } } }, variants: [] },
        },
      }),
    );
    const analyzer = new ThemesAnalyzer();
    await analyzer.run({}, makeContext(tmpDir));
    const out = await fs.readJSON(path.join(tmpDir, 'themes.json'));
    expect(out['deCard.reviews'].selections).toEqual([
      { element: 'root', variant: 'default', themes: { 'DE Color': 'Dark' } },
    ]);
  });
});
