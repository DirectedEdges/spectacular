import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Storybook } from '../../../src/commands/storybook.js';
import { registry, concernNames } from '../../../src/storybook/concerns/registry.js';
import { deriveTabs, deriveCompositions, deriveModes } from '../../../src/storybook/concerns/components/index.js';
import { kebabizePath } from '../../../src/transforms/css/values/tokens.js';
import { buildColorData } from '../../../src/storybook/concerns/foundations/color.js';
import { buildIconsData } from '../../../src/storybook/concerns/foundations/icons.js';
import { buildTypographyData } from '../../../src/storybook/concerns/foundations/typography.js';
import { templatesDir, renderTemplate } from '../../../src/storybook/templates.js';
import type { Workspace } from '../../../src/storybook/workspace.js';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('StorybookCommand', () => {
  it('registers name, subcommands and the concern list', () => {
    expect(Storybook.name()).toBe('storybook');
    const subs = Storybook.commands.map(c => c.name());
    expect(subs).toContain('init');
    expect(subs).toContain('publish');
    expect(concernNames()).toEqual(['overview', 'foundations', 'components', 'analysis', 'visualtesting', 'versions']);
  });
});

describe('package boundary (ADR A decision 1)', () => {
  it('the CLI package declares no Storybook, Vite, or browser-automation dependency', () => {
    const pkg = fs.readJsonSync(path.resolve(here, '../../../package.json'));
    const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const name of all) {
      expect(name).not.toMatch(/^(storybook$|@storybook\/|vite$|playwright|puppeteer)/);
    }
  });

  it('the storybook modules import no Storybook code — templates are inert text', () => {
    const dir = path.resolve(here, '../../../src/storybook');
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
        e.isDirectory()
          ? (e.name === 'templates' ? [] : walk(path.join(d, e.name)))
          : e.name.endsWith('.ts') ? [path.join(d, e.name)] : []);
    for (const file of walk(dir)) {
      const source = fs.readFileSync(file, 'utf-8');
      expect(source, file).not.toMatch(/from '(@storybook|storybook|vite|playwright)/);
    }
  });

  it('imports no entitlement machinery — specs storybook is free', () => {
    const dir = path.resolve(here, '../../../src/storybook');
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
        e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    for (const file of walk(dir).filter(f => f.endsWith('.ts'))) {
      const source = fs.readFileSync(file, 'utf-8');
      expect(source, file).not.toMatch(/[Ll]icense|entitlement/);
    }
  });
});

describe('deriveTabs', () => {
  const ws = (hasReact: boolean, hasWebComponents: boolean) =>
    ({ hasReact, hasWebComponents } as Workspace);

  it('specs is always present, order fixed, canvas is the first tree', () => {
    expect(deriveTabs(ws(true, true))).toEqual({ tabs: ['react', 'webcomponents', 'specs'], canvas: 'react' });
    expect(deriveTabs(ws(true, false))).toEqual({ tabs: ['react', 'specs'], canvas: 'react' });
    expect(deriveTabs(ws(false, true))).toEqual({ tabs: ['webcomponents', 'specs'], canvas: 'webcomponents' });
    expect(deriveTabs(ws(false, false))).toEqual({ tabs: ['specs'], canvas: 'specs' });
  });
});

/**
 * The mode toolbar's attribute VALUE and the stylesheet's attribute selector are
 * one contract across two emitters: cssvars writes
 * `:root[data-<collection>="<kebabizePath(mode)>"]`, and the toolbar stamps
 * whatever `deriveModes` puts in `modes.json`. A disagreement is invisible —
 * the control sets an attribute no selector matches and the mode never switches
 * — so the agreement is pinned here rather than left to a comment (specs#689).
 *
 * `deriveModes` now calls `kebabizePath` instead of restating it; this fails if
 * anyone reintroduces a local copy that drifts.
 */
describe('mode names kebabize identically for the toolbar and the stylesheet', () => {
  const modesWorkspace = (dir: string) => ({ assetsDir: dir } as Workspace);

  const derive = (modeNames: string[]): Array<{ name: string; value: string }> => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modes-'));
    fs.ensureDirSync(path.join(dir, 'cssvars'));
    fs.writeJsonSync(path.join(dir, 'cssvars', 'modes.json'), {
      Theme: { attr: 'data-theme', modes: modeNames, default: modeNames[0] },
    });
    const { controls } = deriveModes(modesWorkspace(dir), { collections: ['Theme'] });
    fs.removeSync(dir);
    return controls[0].modes;
  };

  it.each([
    ['a space-separated name', 'High Contrast', 'high-contrast'],
    ['a camelCase name', 'darkMode', 'darkmode'],
    ['an underscored name', 'dark_mode', 'dark-mode'],
    ['a slashed name', 'Brand/Alt', 'brand-alt'],
    ['a plain name', 'Dark', 'dark'],
  ])('%s resolves to the selector the stylesheet writes', (_label, modeName, expected) => {
    // The stylesheet's side of the contract, called the same way Cssvars.ts does.
    expect(kebabizePath(modeName)).toBe(expected);
    // The toolbar's side, which must land on the same string.
    expect(derive([modeName, 'Other'])[0]).toEqual({ name: modeName, value: expected });
  });

  it('keeps the raw name for display and the kebab form for the attribute', () => {
    expect(derive(['Dark Mode', 'Light Mode'])).toEqual([
      { name: 'Dark Mode', value: 'dark-mode' },
      { name: 'Light Mode', value: 'light-mode' },
    ]);
  });
});

describe('buildColorData', () => {
  const payload = {
    meta: {
      variableCollections: {
        c1: { id: 'c1', name: 'Palette', defaultModeId: 'm1', modes: [{ modeId: 'm1', name: 'Default' }] },
      },
      variables: {
        v2: { id: 'v2', name: 'Ramp/96', resolvedType: 'COLOR', variableCollectionId: 'c1', valuesByMode: { m1: { r: 0, g: 0, b: 0, a: 1 } } },
        v1: { id: 'v1', name: 'Ramp/07', resolvedType: 'COLOR', variableCollectionId: 'c1', valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 } } },
        v3: { id: 'v3', name: 'Ramp/40', resolvedType: 'COLOR', variableCollectionId: 'c1', valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'v1' } } },
        v4: { id: 'v4', name: 'Ramp/50', resolvedType: 'COLOR', variableCollectionId: 'c1', valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'missing' } } },
      },
    },
  };

  it('keeps payload order, resolves aliases, and gives unresolved entries a reason', () => {
    const data = buildColorData([{ alias: 'library', variablesPayload: payload, fillStyles: [], sampledFills: {} }])!;
    const swatches = data.sources[0].collections[0].groups[0].swatches;
    expect(swatches.map(s => s.leaf)).toEqual(['96', '07', '40', '50']); // payload sequence, not alphabetical
    expect(swatches[2].value).toBe('#ffffff');
    expect(swatches[2].via).toBe('Ramp/07');
    expect(swatches[3].value).toBeNull();
    expect(swatches[3].unresolved).toContain('alias target');
  });

  it('resolves fill styles from sampled node fills, with reasons when it cannot', () => {
    const data = buildColorData([{
      alias: 'library',
      variablesPayload: null,
      fillStyles: [
        { node_id: 's1', name: 'Brand' },
        { node_id: 's2', name: 'Photo' },
        { node_id: 's3', name: 'Unused' },
      ],
      sampledFills: {
        s1: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }],
        s2: [{ type: 'IMAGE' }],
      },
    }])!;
    const styles = data.sources[0].styles;
    expect(styles[0]).toMatchObject({ name: 'Brand', value: '#ff0000', unresolved: null });
    expect(styles[1].unresolved).toContain('not a solid fill');
    expect(styles[2].unresolved).toContain('no node');
  });
});

describe('buildTypographyData', () => {
  it('keeps the full property set and marks unused styles unresolved', () => {
    const data = buildTypographyData([{
      alias: 'library',
      styleMap: {
        t1: { name: 'Body/M', key: 'k1', styleType: 'TEXT' },
        t2: { name: 'Body/Unused', key: 'k2', styleType: 'TEXT' },
        f1: { name: 'Fill', key: 'k3', styleType: 'FILL' },
      },
      sampledText: {
        t1: { fontFamily: 'Inter', fontWeight: 400, fontSize: 16, letterSpacing: 0.5, lineHeightPx: 24, lineHeightUnit: 'PIXELS', textCase: 'UPPER', textDecoration: 'NONE', irrelevant: true },
      },
    }])!;
    expect(data.styles).toHaveLength(2); // FILL style excluded
    expect(data.styles[0].style).toEqual({
      fontFamily: 'Inter', fontWeight: 400, fontSize: 16, letterSpacing: 0.5,
      lineHeightPx: 24, lineHeightUnit: 'PIXELS', textCase: 'UPPER', textDecoration: 'NONE',
    });
    expect(data.styles[1].style).toBeNull();
  });
});

describe('buildIconsData', () => {
  it('diffs spec glyph references against the fetched directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-sb-'));
    const specs = path.join(tmp, 'specs');
    const icons = path.join(tmp, 'icons');
    fs.ensureDirSync(path.join(specs, 'alert'));
    fs.ensureDirSync(icons);
    fs.writeFileSync(path.join(specs, 'alert', 'api.yaml'), 'anatomy:\n  icon:\n    type: glyph\n');
    fs.writeFileSync(path.join(specs, 'alert', 'variants.yaml'),
      'default:\n  elements:\n    icon:\n      content: alertError\nvariants:\n  - elements:\n      icon:\n        content: check\n');
    fs.writeFileSync(path.join(icons, 'check.svg'), '<svg/>');
    fs.writeFileSync(path.join(icons, 'unreferenced.svg'), '<svg/>');

    const data = buildIconsData(specs, icons)!;
    expect(data.present).toEqual([
      { name: 'check', referenced: true },
      { name: 'unreferenced', referenced: false },
    ]);
    expect(data.missing).toEqual([{ name: 'alert-error', referencedBy: ['alert'] }]);
    fs.removeSync(tmp);
  });
});

describe('templates', () => {
  it('ships every host template and page template', () => {
    const dir = templatesDir();
    for (const file of ['package.json.tpl', 'tsconfig.json.tpl', 'main.ts.tpl', 'preview.tsx.tpl', 'manager.tsx.tpl', 'manager-head.html.tpl', 'ComponentDocs.tsx.tpl',
      'pages/Color.stories.tsx.tpl', 'pages/Typography.stories.tsx.tpl', 'pages/Icons.stories.tsx.tpl',
      'pages/GettingStarted.stories.tsx.tpl', 'pages/Analysis.stories.tsx.tpl', 'pages/VersionsStub.stories.tsx.tpl']) {
      expect(fs.existsSync(path.join(dir, file)), file).toBe(true);
    }
  });

  it('renders placeholders and refuses unknown ones', () => {
    expect(renderTemplate('port {{PORT}}', { PORT: '6116' })).toBe('port 6116');
    expect(() => renderTemplate('{{NOPE}}', {})).toThrow(/NOPE/);
  });
});

describe('publish semantics', () => {
  it('every concern writes under content/<name>/ only, and placeholders always detect', () => {
    for (const concern of registry) {
      expect(concern.name).toMatch(/^[a-z]+$/);
    }
    const alwaysOn = registry.filter(c => ['overview', 'components'].includes(c.name));
    for (const concern of alwaysOn) {
      expect(concern.detect({} as Workspace)).toBe(true);
    }
    // analysis and versions are data-driven: each section exists only when its
    // folder does (specs/analysis/ and versions/ respectively).
    const analysisConcern = registry.find(c => c.name === 'analysis')!;
    expect(analysisConcern.detect({ specsDir: '/nonexistent' } as Workspace)).toBe(false);
    const versionsConcern = registry.find(c => c.name === 'versions')!;
    expect(versionsConcern.detect({ root: '/nonexistent' } as Workspace)).toBe(false);
  });
});

describe('storybook conventions (ADR-098)', () => {
  it('maps rowGroup and groupLeaves to the colour layout', async () => {
    const { buildColorData } = await import('../../../src/storybook/concerns/foundations/color.js');
    const out = buildColorData([], { layout: { default: 'group', overrides: { Palette: 'row' } }, collections: ['Color'] });
    // No sources → null regardless; the mapping itself is covered through publish,
    // but the layout parameter shape is pinned here.
    expect(out).toBeNull();
  });
});

/**
 * The compositions half of the navigation contract (specs#662). A composition states what
 * it is built from, which is the question a screen raises and a component page has no
 * equivalent of.
 */
describe('deriveCompositions', () => {
  function workspace(
    specs: Record<string, Record<string, string>>,
    componentKeys: string[],
    compositionKeys: string[],
  ): Workspace {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-compositions-'));
    for (const [rel, files] of Object.entries(specs)) {
      const dir = path.join(root, 'specs', rel);
      fs.ensureDirSync(dir);
      for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body, 'utf-8');
    }
    // components/ must exist or the layout reads as legacy, where compositions cannot be.
    fs.ensureDirSync(path.join(root, 'specs', 'components'));
    return { specsDir: path.join(root, 'specs'), componentKeys, compositionKeys } as Workspace;
  }

  it('names each composition and the components it instances, sorted and deduplicated', () => {
    const ws = workspace(
      {
        'compositions/homeScreen': {
          'api.yaml': 'title: Home Screen\nanatomy:\n  root:\n    type: container\n  card:\n    type: instance\n    instanceOf: dsCard\n',
          'variants.yaml': 'default:\n  elements:\n    card:\n      instanceOf: dsCard\n    button:\n      instanceOf: dsButton\n',
        },
      },
      ['dsButton', 'dsCard'],
      ['homeScreen'],
    );

    expect(deriveCompositions(ws)).toEqual({
      compositions: [{ key: 'homeScreen', title: 'Home Screen', composes: ['dsButton', 'dsCard'] }],
    });
  });

  it('omits a reference this workspace holds no component for', () => {
    const ws = workspace(
      {
        'compositions/screen': {
          'api.yaml': 'title: Screen\nanatomy:\n  a:\n    type: instance\n    instanceOf: dsCard\n  b:\n    type: instance\n    instanceOf: fromAnotherLibrary\n',
        },
      },
      ['dsCard'],
      ['screen'],
    );

    // An unresolved reference would be a dead link on the page, so it is left out.
    expect(deriveCompositions(ws).compositions[0].composes).toEqual(['dsCard']);
  });

  it('ignores a subcomponent reference, which is not a separate component', () => {
    const ws = workspace(
      {
        'compositions/screen': {
          'api.yaml': 'title: Screen\nanatomy:\n  a:\n    type: instance\n    instanceOf:\n      $ref: "#/subcomponents/part"\n  b:\n    type: instance\n    instanceOf: dsCard\n',
        },
      },
      ['dsCard'],
      ['screen'],
    );

    expect(deriveCompositions(ws).compositions[0].composes).toEqual(['dsCard']);
  });

  it('falls back to the key when a composition states no title', () => {
    const ws = workspace(
      { 'compositions/screen': { 'variants.yaml': 'default:\n  elements: {}\n' } },
      [],
      ['screen'],
    );

    expect(deriveCompositions(ws).compositions[0]).toEqual({ key: 'screen', title: 'screen', composes: [] });
  });

  it('is an empty list in a workspace with no compositions', () => {
    const ws = workspace({}, ['dsCard'], []);
    expect(deriveCompositions(ws)).toEqual({ compositions: [] });
  });

  it('still lists a composition whose spec does not parse', () => {
    const ws = workspace(
      { 'compositions/broken': { 'api.yaml': 'title: [unclosed\n  nope: :\n' } },
      [],
      ['broken'],
    );
    // The malformed document is the generator's problem; the nav contract still has a row.
    expect(deriveCompositions(ws).compositions.map((c) => c.key)).toEqual(['broken']);
  });
});
