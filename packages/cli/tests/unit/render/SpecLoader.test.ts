import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { stringify } from 'yaml';
import * as yaml from 'yaml';
import { findComponentFolders, loadSpec } from '../../../src/render/SpecLoader';
import { splitComponentByConcern } from '../../../src/writers/DataTransformers';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specloader-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const COMPONENT = {
  title: 'DE Button',
  anatomy: { root: { type: 'container' } },
  props: { appearance: { type: 'string', default: 'Filled' } },
  default: { appearance: 'Filled' },
  variants: [{ appearance: 'Filled' }, { appearance: 'Outline' }],
  slotContentExamples: { label: 'Click me' },
  metadata: { lastUpdated: '2026-01-01T00:00:00.000Z' },
};

describe('loadSpec — single file', () => {
  it('parses a combined .yaml spec', () => {
    const dir = makeTmpDir();
    const file = path.join(dir, 'deButton.yaml');
    fs.writeFileSync(file, stringify(COMPONENT), 'utf8');

    const { spec, resolvePath } = loadSpec(file);

    expect(resolvePath).toBe(path.resolve(file));
    expect(spec.title).toBe('DE Button');
    expect(spec.variants).toEqual(COMPONENT.variants);
  });

  it('parses a combined .json spec', () => {
    const dir = makeTmpDir();
    const file = path.join(dir, 'deButton.json');
    fs.writeFileSync(file, JSON.stringify(COMPONENT), 'utf8');

    const { spec } = loadSpec(file);

    expect(spec.title).toBe('DE Button');
    expect(spec.props).toEqual(COMPONENT.props);
  });

  it('throws a clear error for an unsupported extension', () => {
    const dir = makeTmpDir();
    const file = path.join(dir, 'deButton.txt');
    fs.writeFileSync(file, 'title: X', 'utf8');

    expect(() => loadSpec(file)).toThrow(/Unsupported spec file extension/);
  });

  it('throws when the path does not exist', () => {
    expect(() => loadSpec('/nonexistent/path/to/spec.yaml')).toThrow(/not found/);
  });
});

describe('loadSpec — split-concerns folder', () => {
  it('merges api.yaml + variants.yaml + examples.yaml back into one component', () => {
    const dir = makeTmpDir();
    const { api, variants, examples } = splitComponentByConcern(COMPONENT);

    fs.writeFileSync(path.join(dir, 'api.yaml'), stringify(api), 'utf8');
    fs.writeFileSync(path.join(dir, 'variants.yaml'), stringify(variants), 'utf8');
    fs.writeFileSync(path.join(dir, 'examples.yaml'), stringify(examples), 'utf8');

    const { spec, resolvePath } = loadSpec(dir);

    expect(resolvePath).toBe(path.resolve(dir));
    expect(spec.title).toBe(COMPONENT.title);
    expect(spec.anatomy).toEqual(COMPONENT.anatomy);
    expect(spec.props).toEqual(COMPONENT.props);
    expect(spec.default).toEqual(COMPONENT.default);
    expect(spec.variants).toEqual(COMPONENT.variants);
    expect(spec.slotContentExamples).toEqual(COMPONENT.slotContentExamples);
  });

  it('supports mixed extensions across concern files', () => {
    const dir = makeTmpDir();
    const { api, variants } = splitComponentByConcern(COMPONENT);

    fs.writeFileSync(path.join(dir, 'api.json'), JSON.stringify(api), 'utf8');
    fs.writeFileSync(path.join(dir, 'variants.yaml'), stringify(variants), 'utf8');

    const { spec } = loadSpec(dir);

    expect(spec.title).toBe(COMPONENT.title);
    expect(spec.variants).toEqual(COMPONENT.variants);
    expect(spec.slotContentExamples).toBeUndefined();
  });

  it('works without an examples file (optional concern)', () => {
    const dir = makeTmpDir();
    const noExamples = { ...COMPONENT, slotContentExamples: undefined };
    const { api, variants } = splitComponentByConcern(noExamples);

    fs.writeFileSync(path.join(dir, 'api.yaml'), stringify(api), 'utf8');
    fs.writeFileSync(path.join(dir, 'variants.yaml'), stringify(variants), 'utf8');

    const { spec } = loadSpec(dir);

    expect(spec.title).toBe(COMPONENT.title);
    expect(spec.slotContentExamples).toBeUndefined();
  });

  it('throws when the folder is missing a required concern file', () => {
    const dir = makeTmpDir();
    const { api } = splitComponentByConcern(COMPONENT);
    fs.writeFileSync(path.join(dir, 'api.yaml'), stringify(api), 'utf8');

    expect(() => loadSpec(dir)).toThrow(/Expected api\.\(yaml\|json\) and variants\.\(yaml\|json\)/);
  });

  it('merges subcomponents recursively', () => {
    const dir = makeTmpDir();
    const withSub = {
      ...COMPONENT,
      subcomponents: {
        icon: {
          title: 'Icon',
          anatomy: {},
          props: { size: { type: 'number' } },
          default: { size: 16 },
          variants: [{ size: 16 }],
          metadata: {},
        },
      },
    };
    const { api, variants, examples } = splitComponentByConcern(withSub);

    fs.writeFileSync(path.join(dir, 'api.yaml'), stringify(api), 'utf8');
    fs.writeFileSync(path.join(dir, 'variants.yaml'), stringify(variants), 'utf8');
    fs.writeFileSync(path.join(dir, 'examples.yaml'), stringify(examples), 'utf8');

    const { spec } = loadSpec(dir);
    const sub = (spec.subcomponents as any).icon;

    expect(sub.title).toBe('Icon');
    expect(sub.props).toEqual({ size: { type: 'number' } });
    expect(sub.default).toEqual({ size: 16 });
  });
});

describe('findComponentFolders', () => {
  function makeComponent(dir: string, name: string): string {
    const folder = path.join(dir, name);
    fs.mkdirSync(folder, { recursive: true });
    const { api, variants } = splitComponentByConcern(COMPONENT);
    fs.writeFileSync(path.join(folder, 'api.yaml'), stringify(api), 'utf8');
    fs.writeFileSync(path.join(folder, 'variants.yaml'), stringify(variants), 'utf8');
    return folder;
  }

  it('returns the directory itself when it is a component folder', () => {
    const dir = makeTmpDir();
    const folder = makeComponent(dir, 'deButton');

    expect(findComponentFolders(folder)).toEqual([folder]);
  });

  it('finds component folders one and two levels down, in path order', () => {
    const dir = makeTmpDir();
    const button = makeComponent(dir, 'deButton');
    const input = makeComponent(dir, path.join('forms', 'deInput'));

    expect(findComponentFolders(dir)).toEqual([button, input].sort());
  });

  it('does not descend past two levels', () => {
    const dir = makeTmpDir();
    makeComponent(dir, path.join('a', 'b', 'deTooBuried'));

    expect(findComponentFolders(dir)).toEqual([]);
  });

  // ADR-096: pointing a batch at the specs root must reach as deep as pointing it
  // at `components/` — the kind directory is the layout's, not a level of grouping,
  // so it cannot spend the budget a grouped component needs.
  it('reaches a grouped component from the specs root, past the kind directory', () => {
    const dir = makeTmpDir();
    const button = makeComponent(dir, path.join('components', 'deButton'));
    const input = makeComponent(dir, path.join('components', 'forms', 'deInput'));

    expect(findComponentFolders(dir)).toEqual([button, input].sort());
  });

  it('finds compositions from the specs root too', () => {
    const dir = makeTmpDir();
    const checkout = makeComponent(dir, path.join('compositions', 'checkout'));

    expect(findComponentFolders(dir)).toEqual([checkout]);
  });

  it('spends the budget on a folder that only looks like a kind directory deeper down', () => {
    const dir = makeTmpDir();
    makeComponent(dir, path.join('components', 'forms', 'components', 'deTooBuried'));

    expect(findComponentFolders(dir)).toEqual([]);
  });

  it('does not descend into a component folder', () => {
    const dir = makeTmpDir();
    const button = makeComponent(dir, 'deButton');
    makeComponent(button, 'nested');

    expect(findComponentFolders(dir)).toEqual([button]);
  });

  it('ignores dot-directories and folders missing a required concern', () => {
    const dir = makeTmpDir();
    const button = makeComponent(dir, 'deButton');
    makeComponent(dir, '.cache');
    fs.mkdirSync(path.join(dir, 'deHalf'));
    fs.writeFileSync(path.join(dir, 'deHalf', 'api.yaml'), stringify({}), 'utf8');

    expect(findComponentFolders(dir)).toEqual([button]);
  });
});

describe('loadSpec — run metadata rehydration (ADR-089)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-loader-run-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const run = {
    author: 'Design Systems Team',
    lastUpdated: '2026-09-15T00:00:00.000Z',
    generator: { url: 'https://example.com', version: '0.30.0', name: 'specs-cli' },
    schema: { url: 'https://example.com/schema', version: '0.33.0' },
    conventions: { platforms: { figma: { naming: 'SENTENCE', slotConstraints: false, inferNumberProps: false } } },
    settings: { spec: { keys: 'SAFE' } },
  };
  const source = { pageId: 'p1', nodeId: 'n1', nodeType: 'COMPONENT' };

  const writeRun = () => fs.writeFileSync(path.join(dir, 'latest.metadata.yaml'), yaml.stringify(run));

  it('restores the run facts onto a reduced spec', () => {
    writeRun();
    const specPath = path.join(dir, 'button.yaml');
    fs.writeFileSync(specPath, yaml.stringify({ title: 'Button', metadata: { source } }));

    const { spec } = loadSpec(specPath);
    const metadata = spec.metadata as Record<string, unknown>;
    expect(metadata.conventions).toEqual(run.conventions);
    expect(metadata.settings).toEqual(run.settings);
    expect(metadata.source).toEqual(source);
  });

  it('leaves a spec that carries its own record untouched', () => {
    writeRun();
    const own = { platforms: { figma: { naming: 'TITLE', slotConstraints: false, inferNumberProps: false } } };
    const specPath = path.join(dir, 'button.yaml');
    fs.writeFileSync(specPath, yaml.stringify({ title: 'Button', metadata: { source, conventions: own, settings: { spec: { keys: 'NONE' } } } }));

    const { spec } = loadSpec(specPath);
    const metadata = spec.metadata as Record<string, unknown>;
    expect(metadata.conventions).toEqual(own);
    expect(metadata.settings).toEqual({ spec: { keys: 'NONE' } });
  });

  it('finds the run document one level up from a component folder', () => {
    writeRun();
    const folder = path.join(dir, 'button');
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'api.yaml'), yaml.stringify({ title: 'Button', anatomy: {}, props: {}, metadata: { source } }));
    fs.writeFileSync(path.join(folder, 'variants.yaml'), yaml.stringify({ default: {}, variants: [], metadata: { source } }));

    const { spec } = loadSpec(folder);
    expect((spec.metadata as Record<string, unknown>).conventions).toEqual(run.conventions);
  });

  it('leaves a reduced spec reduced when no run document is present', () => {
    const specPath = path.join(dir, 'button.yaml');
    fs.writeFileSync(specPath, yaml.stringify({ title: 'Button', metadata: { source } }));

    const { spec } = loadSpec(specPath);
    expect(spec.metadata).toEqual({ source });
  });
});
