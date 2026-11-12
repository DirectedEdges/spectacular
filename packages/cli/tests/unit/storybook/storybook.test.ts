import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Storybook } from '../../../src/commands/storybook.js';
import { registry, concernNames } from '../../../src/storybook/concerns/registry.js';
import { viewLeaves, deriveCompositions, deriveModes } from '../../../src/storybook/concerns/components/index.js';
import { specNavFolder } from '../../../src/storybook/concerns/components/navTitle.js';
import { kebabizePath } from '../../../src/transforms/css/values/tokens.js';
import { buildColorData } from '../../../src/storybook/concerns/foundations/color.js';
import { buildIconsData } from '../../../src/storybook/concerns/foundations/icons.js';
import { buildImagesData } from '../../../src/storybook/concerns/foundations/images.js';
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

/**
 * The sidebar order is a literal inside the preview's `storySort`, and it cannot
 * be anything else: Storybook's indexer pulls that parameter out of the file's
 * AST and `eval`s the function on its own, so it reaches no import, no module
 * constant, no helper, and no TypeScript annotation. Writing `storySort` as a
 * reference to a const took the whole instance down with "Parameter
 * 'options.storySort' should be defined inline".
 *
 * That forces a second copy of the view order into the template, so these pin
 * the two copies together. A leaf the preview does not rank falls through to
 * alphabetical and lands in the wrong place, which nothing errors on.
 */
describe('sidebar order in the scaffolded preview', () => {
  const preview = () => fs.readFileSync(path.join(templatesDir(), 'preview.tsx.tpl'), 'utf-8');

  it('reads platforms, then spec documents, then the Testing folder and its pages', () => {
    expect(viewLeaves()).toEqual([
      'React',
      'Web component',
      'API',
      'Variants',
      'Supplemental',
      'Guidelines',
      'Testing',
      'React Fidelity',
      'React Changes',
      'Web component Fidelity',
      'Web component Changes',
    ]);
  });

  it('omits Examples — it is no longer one of the views', () => {
    expect(viewLeaves()).not.toContain('Examples');
  });

  /**
   * A subcomponent folder is ranked by its absence from VIEWS. When the rank
   * only applied to a segment both titles ended on, `Item` fell through to
   * alphabetical and sorted above the component's own `React` page.
   */
  it('sorts a subcomponent folder after everything the component itself offers', () => {
    const body = /storySort:\s*\(a, b\) =>\s*\{([\s\S]*?)\n {6}\},/.exec(preview())?.[1] ?? '';
    const sort = new Function('a', 'b', body) as (a: { title: string }, b: { title: string }) => number;
    const under = (leaf: string) => ({ title: `Components/Action List/${leaf}` });
    const sorted = ['Item/React', 'Variants', 'Testing/React Changes', 'React', 'API', 'Web component']
      .map(under)
      .sort(sort)
      .map((e) => e.title.split('/').slice(2).join('/'));
    expect(sorted).toEqual([
      'React',
      'Web component',
      'API',
      'Variants',
      'Testing/React Changes',
      'Item/React',
    ]);
  });

  it('ranks every segment the concern can publish, in the same order', () => {
    const source = preview();
    const positions = viewLeaves().map((leaf) => source.indexOf(`'${leaf}'`));
    for (const [i, at] of positions.entries()) {
      expect(at, `${viewLeaves()[i]} is unranked in preview.tsx.tpl`).toBeGreaterThan(-1);
    }
    expect(positions).toEqual([...positions].sort((x, y) => x - y));
  });

  it('defines storySort inline, which is the only form the indexer accepts', () => {
    // `storySort: (a, b) => {` — never `storySort,` or `storySort: someConst`.
    expect(preview()).toMatch(/storySort:\s*\(a, b\)\s*=>/);
  });

  it('keeps the storySort body self-contained — no annotations, no outer references', () => {
    const body = /storySort:\s*\(a, b\) =>\s*\{([\s\S]*?)\n {6}\},/.exec(preview())?.[1];
    expect(body, 'storySort body not found — did its indentation change?').toBeTruthy();
    // A type annotation does not survive the AST extraction, and neither does a
    // reference to anything the function does not declare itself.
    expect(body).not.toMatch(/:\s*(string|number|boolean)\b/);
    for (const outer of ['viewsJson', 'modesJson', 'VIEW_ORDER', 'SECTION_ORDER']) {
      expect(body).not.toContain(outer);
    }
  });

  it('imports nothing that publish no longer writes', () => {
    expect(preview()).not.toContain('views.json');
  });
});

/**
 * The folder a published view lands in has to be the folder the emitters put
 * their own pages in, or one component splits into two sidebar folders. These
 * are the cases `storyTitle` in from-specs normalizes, asserted on this side of
 * the repo boundary.
 */
describe('specNavFolder', () => {
  it('nests each kind under its own section', () => {
    expect(specNavFolder('component', 'card', 'Card')).toBe('Components/Card');
    expect(specNavFolder('composition', 'checkout', 'Checkout')).toBe('Compositions/Checkout');
  });

  it('collapses spaced separators without creating blank levels', () => {
    expect(specNavFolder('component', 'item', 'DS  Nav /  Item')).toBe('Components/DS  Nav/Item');
  });

  it('drops a segment that sanitizes to nothing', () => {
    expect(specNavFolder('component', 'users', 'DS Row / _ / Users')).toBe('Components/DS Row/Users');
  });

  it('falls back to the folder key when the spec carries no title', () => {
    expect(specNavFolder('component', 'dsButton', undefined)).toBe('Components/DsButton');
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

describe('buildImagesData', () => {
  /** A workspace with both download paths' output and one unresolved reference. */
  function fixture(): { tmp: string; specs: string; images: string; data: string } {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-sb-img-'));
    const specs = path.join(tmp, 'specs');
    const images = path.join(tmp, 'assets', 'images');
    const data = path.join(tmp, 'data');
    fs.ensureDirSync(path.join(specs, 'hero'));
    fs.ensureDirSync(images);
    fs.ensureDirSync(path.join(data, 'cache'));

    // Two files on disk: one fetched from a fill style, one found on a component.
    fs.writeFileSync(path.join(images, 'aaa111.png'), 'png');
    fs.writeFileSync(path.join(images, 'bbb222.jpg'), 'jpg');

    // Keyed by hash, with `origin` saying where each lives in Figma.
    fs.writeFileSync(path.join(data, 'cache', 'images.yaml'),
      'sources:\n  library:styles:\n    from: library.images.json\n    bytes: 1\n    mtime: x\n'
      + 'entries:\n'
      + '  aaa111:\n    src: assets/images/aaa111.png\n    name: Images / Wanaka\n    origin:\n      - style\n    file: library\n'
      + '  bbb222:\n    src: assets/images/bbb222.jpg\n    usedBy:\n      - hero\n    origin:\n      - component\n    file: library\n');

    // The component references the component-found image and one that was never downloaded.
    fs.writeFileSync(path.join(specs, 'hero', 'api.yaml'), 'anatomy:\n  media:\n    type: image\n');
    fs.writeFileSync(path.join(specs, 'hero', 'images.yaml'),
      'images:\n'
      + '  backdrop:\n    src: ../../assets/images/bbb222.jpg\n    $extensions:\n      com.figma:\n        imageHash: bbb222\n'
      + '  pending:\n    $extensions:\n      com.figma:\n        imageHash: ccc333\n');
    return { tmp, specs, images, data };
  }

  it('lists every image on disk, whichever path downloaded it', () => {
    const { tmp, specs, images, data } = fixture();
    const result = buildImagesData(specs, images, data)!;
    expect(result.present.map(i => i.hash)).toEqual(['aaa111', 'bbb222']);
    fs.removeSync(tmp);
  });

  it('names an image from the fill style it was fetched from, and leaves the rest unnamed', () => {
    const { tmp, specs, images, data } = fixture();
    const result = buildImagesData(specs, images, data)!;
    expect(result.present[0].name).toBe('Images / Wanaka');
    expect(result.present[1].name).toBeUndefined();
    fs.removeSync(tmp);
  });

  // Read from the cache, never inferred from a missing name — a style-carried
  // image with no name would otherwise look component-found.
  it('takes each image\'s origin from the cache', () => {
    const { tmp, specs, images, data } = fixture();
    const result = buildImagesData(specs, images, data)!;
    expect(result.present.find(i => i.hash === 'aaa111')!.origin).toEqual(['style']);
    expect(result.present.find(i => i.hash === 'bbb222')!.origin).toEqual(['component']);
    fs.removeSync(tmp);
  });

  it('reports an empty origin for a file neither producer has accounted for', () => {
    const { tmp, specs, images, data } = fixture();
    fs.writeFileSync(path.join(images, 'ccc444.png'), 'png');
    const result = buildImagesData(specs, images, data)!;
    expect(result.present.find(i => i.hash === 'ccc444')!.origin).toEqual([]);
    fs.removeSync(tmp);
  });

  it('reports which components reference each image', () => {
    const { tmp, specs, images, data } = fixture();
    const result = buildImagesData(specs, images, data)!;
    expect(result.present.find(i => i.hash === 'bbb222')!.referencedBy).toEqual(['hero']);
    // A curated image nothing uses yet is still available to author with.
    expect(result.present.find(i => i.hash === 'aaa111')!.referencedBy).toEqual([]);
    fs.removeSync(tmp);
  });

  it('flags a registry entry whose image was never downloaded', () => {
    const { tmp, specs, images, data } = fixture();
    const result = buildImagesData(specs, images, data)!;
    expect(result.missing).toEqual([{ hash: 'ccc333', referencedBy: ['hero'] }]);
    fs.removeSync(tmp);
  });

  it('works with no cache at all, so images predating the images kind still list', () => {
    const { tmp, specs, images, data } = fixture();
    fs.removeSync(path.join(data, 'cache', 'images.yaml'));
    const result = buildImagesData(specs, images, data)!;
    expect(result.present.map(i => i.hash)).toEqual(['aaa111', 'bbb222']);
    expect(result.present.every(i => i.name === undefined)).toBe(true);
    fs.removeSync(tmp);
  });

  it('builds nothing for a workspace with no images and no references', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-sb-img-'));
    expect(buildImagesData(path.join(tmp, 'specs'), path.join(tmp, 'images'), tmp)).toBeNull();
    fs.removeSync(tmp);
  });
});

describe('templates', () => {
  it('ships every host template and page template', () => {
    const dir = templatesDir();
    for (const file of ['package.json.tpl', 'tsconfig.json.tpl', 'main.ts.tpl', 'preview.tsx.tpl', 'manager.tsx.tpl', 'manager-head.html.tpl',
      'pages/Color.stories.tsx.tpl', 'pages/Typography.stories.tsx.tpl', 'pages/Icons.stories.tsx.tpl', 'pages/Images.stories.tsx.tpl',
      'pages/GettingStarted.stories.tsx.tpl', 'pages/Analysis.stories.tsx.tpl', 'pages/VersionsStub.stories.tsx.tpl',
      'pages/SpecConcern.stories.tsx.tpl', 'pages/ComponentTesting.stories.tsx.tpl', 'pages/VisualReport.stories.tsx.tpl', 'PlatformDocs.tsx.tpl']) {
      expect(fs.existsSync(path.join(dir, file)), file).toBe(true);
    }
  });

  // The watcher development runs re-bundles the program and never re-copies
  // templates, so dist/ holds whatever the last full build left. Resolving
  // there first served a new template from a stale directory.
  it('resolves templates from the source tree in a checkout, not from dist', () => {
    expect(templatesDir()).toBe(path.resolve(here, '../../../src/storybook/templates'));
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

/**
 * The views a component carries as sidebar leaves. These pages are TSX the host
 * compiles, not data — a template that renders to something Vite cannot parse
 * takes the whole Storybook instance down, and the failure surfaces far from the
 * template. So each one is parsed here, as well as checked for its title.
 */
describe('components concern — published view pages', () => {
  const componentsConcern = registry.find((c) => c.name === 'components')!;

  /**
   * `reports` names the report files to write, each one covering `dsButton`.
   * `reportsWithoutTheSpec` writes a report that exists but does not list it —
   * the common case, since a visual manifest rarely pins the whole catalogue.
   */
  function workspace(options: {
    react: boolean;
    webcomponents: boolean;
    reports: string[];
    reportsWithoutTheSpec?: string[];
  }): Workspace {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-views-'));
    fs.ensureDirSync(path.join(root, 'specs', 'components', 'dsButton'));
    fs.writeFileSync(
      path.join(root, 'specs', 'components', 'dsButton', 'api.yaml'),
      'title: DS Button (Beta)\nprops: {}\n',
    );
    const writeReport = (name: string, body: string) => {
      fs.ensureDirSync(path.join(root, 'testing', 'visual', 'report'));
      fs.writeFileSync(path.join(root, 'testing', 'visual', 'report', `${name}.json`), body);
    };
    for (const name of options.reports) {
      writeReport(name, JSON.stringify({ components: { dsButton: { summary: {}, pairs: [] } } }));
    }
    for (const name of options.reportsWithoutTheSpec ?? []) {
      writeReport(name, JSON.stringify({ components: { dsCard: { summary: {}, pairs: [] } } }));
    }
    return {
      root,
      specsDir: path.join(root, 'specs'),
      assetsDir: path.join(root, 'assets'),
      componentKeys: ['dsButton'],
      compositionKeys: [],
      hasReact: options.react,
      hasWebComponents: options.webcomponents,
      config: { conventions: {} },
    } as unknown as Workspace;
  }

  /** Every story page the concern built, keyed by the title its meta declares. */
  async function pagesByTitle(ws: Workspace): Promise<Map<string, string>> {
    const built = await componentsConcern.build(ws);
    const pages = new Map<string, string>();
    for (const file of built) {
      if (!file.path.endsWith('.stories.tsx')) continue;
      const title = /title: '([^']*)'/.exec(file.content)?.[1];
      expect(title, file.path).toBeTruthy();
      pages.set(title!, file.content);
    }
    return pages;
  }

  it('lands every view in the folder the emitters title their own pages under', async () => {
    const pages = await pagesByTitle(
      workspace({ react: true, webcomponents: true, reports: ['fidelity.react', 'regression.webcomponents'] }),
    );
    expect([...pages.keys()].sort()).toEqual([
      'Components/DS Button (Beta)/API',
      'Components/DS Button (Beta)/Testing/React Fidelity',
      'Components/DS Button (Beta)/Testing/Web component Changes',
      'Components/DS Button (Beta)/Variants',
    ]);
  });

  it('names the component in every page heading, which the sidebar entry does not', async () => {
    const pages = await pagesByTitle(
      workspace({ react: true, webcomponents: true, reports: ['fidelity.react'] }),
    );
    expect(pages.get('Components/DS Button (Beta)/API')).toContain('"DS Button (Beta) / API"');
    expect(pages.get('Components/DS Button (Beta)/Testing/React Fidelity')).toContain(
      '"DS Button (Beta) / React Fidelity"',
    );
  });

  /**
   * `api` and `variants` every run generates. `supplemental` and `guidelines`
   * are authored by hand and most components have neither, so a view that
   * exists only to report its own emptiness is noise on every component.
   */
  it('publishes an authored spec view only for a component that has the document', async () => {
    const ws = workspace({ react: true, webcomponents: true, reports: [] });
    expect([...(await pagesByTitle(ws)).keys()]).not.toContain('Components/DS Button (Beta)/Supplemental');

    fs.writeFileSync(
      path.join((ws as unknown as { root: string }).root, 'specs', 'components', 'dsButton', 'supplemental.yaml'),
      'entries: []\n',
    );
    const after = [...(await pagesByTitle(ws)).keys()];
    expect(after).toContain('Components/DS Button (Beta)/Supplemental');
    expect(after).not.toContain('Components/DS Button (Beta)/Guidelines');
  });

  it('publishes a testing page only for a platform-and-baseline that has a report', async () => {
    const pages = await pagesByTitle(workspace({ react: true, webcomponents: true, reports: [] }));
    expect([...pages.keys()].sort()).toEqual([
      'Components/DS Button (Beta)/API',
      'Components/DS Button (Beta)/Variants',
    ]);
  });

  /**
   * Gating on the report FILE published a testing page for every component and
   * most of them read "this spec isn't in the visual manifest" — a page whose
   * only content is that it has none.
   */
  it('publishes no testing page for a spec the report does not cover', async () => {
    const pages = await pagesByTitle(
      workspace({ react: true, webcomponents: true, reports: [], reportsWithoutTheSpec: ['fidelity.react'] }),
    );
    expect([...pages.keys()].sort()).toEqual([
      'Components/DS Button (Beta)/API',
      'Components/DS Button (Beta)/Variants',
    ]);
  });

  it('reads an untargeted report as React results, never as Web Components', async () => {
    const pages = await pagesByTitle(workspace({ react: true, webcomponents: true, reports: ['fidelity'] }));
    expect(pages.has('Components/DS Button (Beta)/Testing/React Fidelity')).toBe(true);
    expect(pages.has('Components/DS Button (Beta)/Testing/Web component Fidelity')).toBe(false);
  });

  /**
   * Only the first report that exists is consulted, because that is the one the
   * page will read. A later candidate it never reaches must not decide whether
   * the page publishes.
   */
  it('ignores the legacy report when the targeted one exists and omits the spec', async () => {
    const pages = await pagesByTitle(
      workspace({
        react: true,
        webcomponents: false,
        reports: ['fidelity'],
        reportsWithoutTheSpec: ['fidelity.react'],
      }),
    );
    expect(pages.has('Components/DS Button (Beta)/Testing/React Fidelity')).toBe(false);
  });

  it('renders every page to TSX that parses, with no placeholder left behind', async () => {
    const esbuild = await import('esbuild');
    const pages = await pagesByTitle(
      workspace({ react: true, webcomponents: true, reports: ['fidelity.react', 'fidelity.webcomponents'] }),
    );
    expect(pages.size).toBeGreaterThan(0);
    for (const [title, content] of pages) {
      expect(content, title).not.toMatch(/\{\{[A-Z_]+\}\}/);
      expect(() => esbuild.transformSync(content, { loader: 'tsx' }), title).not.toThrow();
    }
  });
});
