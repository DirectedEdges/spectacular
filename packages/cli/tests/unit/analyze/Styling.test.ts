import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { StylingAnalyzer } from '../../../src/analyze/Styling.js';
import { tokenProfileWarnings } from '../../../src/commands/analyze.js';

const transformer = new StylingAnalyzer();

function makeContext(dir: string, componentKey = 'dsButton', outputFormat: 'JSON' | 'YAML' = 'JSON') {
  return { specDir: dir, outputDir: dir, workspaceDir: dir, specsRoot: dir, kind: 'component' as const, componentKey, tokensFormat: 'TOKEN', outputFormat };
}

async function run(dir: string, apiYaml: Record<string, unknown>, componentKey = 'dsButton') {
  await transformer.run(apiYaml, makeContext(dir, componentKey, 'JSON'));
  const raw = await fs.readFile(path.join(dir, 'styling.json'), 'utf-8');
  return JSON.parse(raw) as Record<string, {
    variables: Array<{ name: string; appliedAs: string; rawValue?: unknown; appliedTo: Record<string, number> }>;
    colorStyles: Array<{ name: string; appliedAs: string; rawValue?: unknown; appliedTo: Record<string, number> }>;
    textStyles: Array<{ name: string; appliedAs: string; rawValue?: unknown; appliedTo: Record<string, number> }>;
    effectStyles: Array<{ name: string; appliedAs: string; rawValue?: unknown; appliedTo: Record<string, number> }>;
  }>;
}

describe('StylingAnalyzer', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'styling-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('has name "styling"', () => {
    expect(transformer.name).toBe('styling');
  });

  it('writes styling.json keyed by componentKey with all four category groups', async () => {
    const out = await run(tmpDir, {});
    expect(out).toHaveProperty('dsButton');
    expect(out.dsButton).toHaveProperty('variables');
    expect(out.dsButton).toHaveProperty('colorStyles');
    expect(out.dsButton).toHaveProperty('textStyles');
    expect(out.dsButton).toHaveProperty('effectStyles');
  });

  it('collects variable tokens from default elements', async () => {
    const out = await run(tmpDir, {
      anatomy: { root: { type: 'container' } },
      default: {
        elements: {
          root: {
            styles: {
              backgroundColor: { $token: 'DS Color.Surface.Primary', $type: 'color' },
            },
          },
        },
      },
    });
    expect(out.dsButton.variables).toHaveLength(1);
    expect(out.dsButton.variables[0].name).toBe('DS Color.Surface.Primary');
    expect(out.dsButton.variables[0].appliedAs).toBe('backgroundColor');
    expect(out.dsButton.variables[0].appliedTo).toEqual({ root: 1 });
  });

  it('classifies typography tokens as textStyles', async () => {
    const out = await run(tmpDir, {
      anatomy: { label: { type: 'text' } },
      default: {
        elements: {
          label: {
            styles: {
              typography: { $token: 'DS Type.Body.Default', $type: 'typography' },
            },
          },
        },
      },
    });
    expect(out.dsButton.textStyles).toHaveLength(1);
    expect(out.dsButton.textStyles[0].name).toBe('DS Type.Body.Default');
    expect(out.dsButton.textStyles[0].appliedAs).toBe('typography');
  });

  it('classifies effects tokens as effectStyles', async () => {
    const out = await run(tmpDir, {
      anatomy: { root: { type: 'container' } },
      default: {
        elements: {
          root: {
            styles: {
              effects: { $token: 'DS Shadow.Elevation.1', $type: 'effects' },
            },
          },
        },
      },
    });
    expect(out.dsButton.effectStyles).toHaveLength(1);
    expect(out.dsButton.effectStyles[0].name).toBe('DS Shadow.Elevation.1');
    expect(out.dsButton.effectStyles[0].appliedAs).toBe('effects');
  });

  it('accumulates appliedTo counts across variants', async () => {
    const out = await run(tmpDir, {
      anatomy: { root: { type: 'container' } },
      default: {
        elements: {
          root: {
            styles: {
              backgroundColor: { $token: 'DS Color.Surface.Primary', $type: 'color' },
            },
          },
        },
      },
      variants: [
        {
          configuration: { appearance: 'secondary' },
          elements: {
            root: {
              styles: {
                backgroundColor: { $token: 'DS Color.Surface.Primary', $type: 'color' },
              },
            },
          },
        },
      ],
    });
    expect(out.dsButton.variables[0].appliedTo).toEqual({ root: 2 });
  });

  it('deduplicates the same token applied across multiple variants', async () => {
    const out = await run(tmpDir, {
      anatomy: { root: { type: 'container' } },
      default: {
        elements: {
          root: { styles: { backgroundColor: { $token: 'DS Color.Surface.Primary', $type: 'color' } } },
        },
      },
      variants: [
        { elements: { root: { styles: { backgroundColor: { $token: 'DS Color.Surface.Primary', $type: 'color' } } } } },
        { elements: { root: { styles: { backgroundColor: { $token: 'DS Color.Surface.Primary', $type: 'color' } } } } },
      ],
    });
    expect(out.dsButton.variables).toHaveLength(1);
  });

  it('uses the dot-joined key path as appliedAs for nested tokens', async () => {
    const out = await run(tmpDir, {
      anatomy: { root: { type: 'container' } },
      default: {
        elements: {
          root: {
            styles: {
              padding: {
                start: { $token: 'DS Space.3x', $type: 'dimension' },
                end: { $token: 'DS Space.3x', $type: 'dimension' },
                top: 0,
                bottom: 0,
              },
            },
          },
        },
      },
    });
    const appliedAs = out.dsButton.variables.map(r => r.appliedAs).sort();
    expect(appliedAs).toEqual(['padding.end', 'padding.start']);
  });

  it('uses dot-joined path for per-corner radii', async () => {
    const out = await run(tmpDir, {
      anatomy: { root: { type: 'container' } },
      default: {
        elements: {
          root: {
            styles: {
              cornerRadius: {
                topStart: { $token: 'DS Shape.Radius.XL', $type: 'dimension' },
                topEnd: { $token: 'DS Shape.Radius.XL', $type: 'dimension' },
                bottomStart: 0,
                bottomEnd: 0,
              },
            },
          },
        },
      },
    });
    const appliedAs = out.dsButton.variables.map(r => r.appliedAs).sort();
    expect(appliedAs).toEqual(['cornerRadius.topEnd', 'cornerRadius.topStart']);
  });

  it('skips non-token style values', async () => {
    const out = await run(tmpDir, {
      anatomy: { root: { type: 'container' } },
      default: {
        elements: {
          root: {
            styles: { visible: true, width: 48, strokes: '#FF0000' },
          },
        },
      },
    });
    expect(out.dsButton.variables).toHaveLength(0);
    expect(out.dsButton.colorStyles).toHaveLength(0);
    expect(out.dsButton.textStyles).toHaveLength(0);
    expect(out.dsButton.effectStyles).toHaveLength(0);
  });

  it('includes rawValue when present in $extensions', async () => {
    const out = await run(tmpDir, {
      anatomy: { root: { type: 'container' } },
      default: {
        elements: {
          root: {
            styles: {
              backgroundColor: {
                $token: 'DS Color.Primary',
                $type: 'color',
                $extensions: { 'com.figma': { rawValue: '#FF0000' } },
              },
            },
          },
        },
      },
    });
    expect(out.dsButton.variables[0].rawValue).toBe('#FF0000');
  });

  it('omits rawValue when $extensions are absent', async () => {
    const out = await run(tmpDir, {
      anatomy: { root: { type: 'container' } },
      default: {
        elements: {
          root: {
            styles: {
              backgroundColor: { $token: 'DS Color.Primary', $type: 'color' },
            },
          },
        },
      },
    });
    expect('rawValue' in out.dsButton.variables[0]).toBe(false);
  });

  it('output is deterministic for the same input', async () => {
    const apiYaml = {
      anatomy: { root: { type: 'container' }, label: { type: 'text' } },
      default: {
        elements: {
          root: { styles: { backgroundColor: { $token: 'DS Color.B', $type: 'color' } } },
          label: { styles: { backgroundColor: { $token: 'DS Color.A', $type: 'color' } } },
        },
      },
    };
    const tmpDir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'styling-det-'));
    try {
      const out1 = await run(tmpDir, apiYaml);
      const out2 = await run(tmpDir2, apiYaml);
      expect(JSON.stringify(out1)).toBe(JSON.stringify(out2));
    } finally {
      await fs.remove(tmpDir2);
    }
  });

  it('sorts rows alphabetically by name within each category', async () => {
    const out = await run(tmpDir, {
      anatomy: { root: { type: 'container' } },
      default: {
        elements: {
          root: {
            styles: {
              backgroundColor: { $token: 'DS Color.Zebra', $type: 'color' },
              strokes: { $token: 'DS Color.Alpha', $type: 'color' },
            },
          },
        },
      },
    });
    const names = out.dsButton.variables.map(r => r.name);
    expect(names).toEqual([...names].sort());
  });

  it('emits separate keys for component and subcomponent', async () => {
    const out = await run(tmpDir, {
      anatomy: { root: { type: 'container' } },
      default: {
        elements: {
          root: { styles: { backgroundColor: { $token: 'Color/Primary', $type: 'color' } } },
        },
      },
      subcomponents: {
        item: {
          default: {
            elements: {
              icon: { styles: { fillColor: { $token: 'Color/On surface', $type: 'color' } } },
            },
          },
        },
      },
    }, 'dsButton');
    expect(out).toHaveProperty('dsButton');
    expect(out).toHaveProperty('dsButton.item');
    expect(out['dsButton'].variables[0].name).toBe('Color/Primary');
    expect(out['dsButton.item'].variables[0].name).toBe('Color/On surface');
  });

  it('writes styling.yaml when outputFormat is YAML', async () => {
    const t = new StylingAnalyzer();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'styling-yaml-'));
    try {
      await t.run(
        { anatomy: { root: { type: 'container' } }, default: { elements: { root: { styles: { backgroundColor: { $token: 'DS Color.Primary', $type: 'color' } } } } } },
        { specDir: dir, outputDir: dir, workspaceDir: dir, specsRoot: dir, kind: 'component' as const, componentKey: 'dsButton', tokensFormat: 'TOKEN', outputFormat: 'YAML' },
      );
      expect(fs.existsSync(path.join(dir, 'styling.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'styling.json'))).toBe(false);
      const parsed = yaml.parse(await fs.readFile(path.join(dir, 'styling.yaml'), 'utf-8'));
      expect(parsed.dsButton.variables[0].name).toBe('DS Color.Primary');
    } finally {
      await fs.remove(dir);
    }
  });

  it('subcomponent tokens do not appear in the top-level component scope', async () => {
    const out = await run(tmpDir, {
      anatomy: { root: { type: 'container' } },
      default: {
        elements: {
          root: { styles: { backgroundColor: { $token: 'Color/Primary', $type: 'color' } } },
        },
      },
      subcomponents: {
        item: {
          default: {
            elements: {
              icon: { styles: { fillColor: { $token: 'Color/On surface', $type: 'color' } } },
            },
          },
        },
      },
    });
    const topNames = out.dsButton.variables.map(r => r.name);
    expect(topNames).not.toContain('Color/On surface');
  });
});

describe('StylingAnalyzer.finalize', () => {
  const TOKEN_A = { $token: 'Color/Primary', $type: 'color' };
  const TOKEN_B = { $token: 'Typography/Body', $type: 'typography' };

  const COMP_A = {
    anatomy: { root: { type: 'container' } },
    default: { elements: { root: { styles: { backgroundColor: TOKEN_A } } } },
  };
  const COMP_B = {
    anatomy: { root: { type: 'container' }, label: { type: 'text' } },
    default: {
      elements: {
        root: { styles: { backgroundColor: TOKEN_A } },
        label: { styles: { typography: TOKEN_B } },
      },
    },
  };

  let outputDir: string;
  let compDirA: string;
  let compDirB: string;

  beforeEach(async () => {
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'styling-dict-'));
    compDirA = path.join(outputDir, 'compA');
    compDirB = path.join(outputDir, 'compB');
    await fs.ensureDir(compDirA);
    await fs.ensureDir(compDirB);
  });

  afterEach(async () => {
    await fs.remove(outputDir);
  });

  async function runFinalize(outputFormat: 'JSON' | 'YAML' = 'JSON') {
    const t = new StylingAnalyzer();
    await t.run(COMP_A, { specDir: compDirA, outputDir: compDirA, workspaceDir: compDirA, specsRoot: compDirA, kind: 'component' as const, componentKey: 'compA', tokensFormat: 'TOKEN', outputFormat });
    await t.run(COMP_B, { specDir: compDirB, outputDir: compDirB, workspaceDir: compDirB, specsRoot: compDirB, kind: 'component' as const, componentKey: 'compB', tokensFormat: 'TOKEN', outputFormat });
    await t.finalize!(outputDir);
    const ext = outputFormat === 'YAML' ? 'yaml' : 'json';
    const byCompRaw = await fs.readFile(path.join(outputDir, 'analysis', `styling.byComponent.${ext}`), 'utf-8');
    const byTokenRaw = await fs.readFile(path.join(outputDir, 'analysis', `styling.byToken.${ext}`), 'utf-8');
    const parse = outputFormat === 'YAML' ? (s: string) => yaml.parse(s) : (s: string) => JSON.parse(s);
    return { byComp: parse(byCompRaw), byToken: parse(byTokenRaw) };
  }

  it('creates the analysis folder with both .json files when outputFormat is JSON', async () => {
    await runFinalize('JSON');
    expect(fs.existsSync(path.join(outputDir, 'analysis', 'styling.byComponent.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'analysis', 'styling.byToken.json'))).toBe(true);
  });

  it('creates the analysis folder with both .yaml files when outputFormat is YAML', async () => {
    await runFinalize('YAML');
    expect(fs.existsSync(path.join(outputDir, 'analysis', 'styling.byComponent.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'analysis', 'styling.byToken.yaml'))).toBe(true);
  });

  it('byComponent keys match component names in alphabetical order', async () => {
    const { byComp } = await runFinalize();
    expect(Object.keys(byComp)).toEqual(['compA', 'compB']);
  });

  it('byComponent entries mirror per-component file structure', async () => {
    const { byComp } = await runFinalize();
    expect(byComp.compA.variables).toHaveLength(1);
    expect(byComp.compA.variables[0].name).toBe('Color/Primary');
    expect(byComp.compB.textStyles).toHaveLength(1);
    expect(byComp.compB.textStyles[0].name).toBe('Typography/Body');
  });

  it('byComponent omits rawValue even when present in per-component file', async () => {
    const t = new StylingAnalyzer();
    const withRaw = {
      anatomy: { root: { type: 'container' } },
      default: { elements: { root: { styles: { backgroundColor: { $token: 'DS/X', $type: 'color', $extensions: { 'com.figma': { rawValue: '#FF0000' } } } } } } },
    };
    const compDir = path.join(outputDir, 'compRaw');
    await fs.ensureDir(compDir);
    await t.run(withRaw, { specDir: compDir, outputDir: compDir, workspaceDir: compDir, specsRoot: compDir, kind: 'component' as const, componentKey: 'compRaw', tokensFormat: 'TOKEN', outputFormat: 'JSON' });
    await t.finalize!(outputDir);
    const byComp = JSON.parse(await fs.readFile(path.join(outputDir, 'analysis', 'styling.byComponent.json'), 'utf-8'));
    expect('rawValue' in byComp.compRaw.variables[0]).toBe(false);
  });

  it('byToken groups usages by token name across components', async () => {
    const { byToken } = await runFinalize();
    expect(byToken.variables['Color/Primary']).toHaveLength(2);
    const components = byToken.variables['Color/Primary'].map((e: { component: string }) => e.component).sort();
    expect(components).toEqual(['compA', 'compB']);
  });

  it('byToken entries have component, appliedAs, appliedTo — no rawValue', async () => {
    const { byToken } = await runFinalize();
    const entry = byToken.variables['Color/Primary'][0];
    expect(entry).toHaveProperty('component');
    expect(entry).toHaveProperty('appliedAs');
    expect(entry).toHaveProperty('appliedTo');
    expect(entry).not.toHaveProperty('rawValue');
  });

  it('byToken textStyles contains token from only the component that uses it', async () => {
    const { byToken } = await runFinalize();
    expect(byToken.textStyles['Typography/Body']).toHaveLength(1);
    expect(byToken.textStyles['Typography/Body'][0].component).toBe('compB');
  });

  it('byToken uses dot-path key for subcomponent entries', async () => {
    const t = new StylingAnalyzer();
    const withSub = {
      anatomy: { root: { type: 'container' } },
      default: { elements: { root: { styles: { backgroundColor: { $token: 'Color/Primary', $type: 'color' } } } } },
      subcomponents: {
        item: {
          default: { elements: { icon: { styles: { fillColor: { $token: 'Color/On surface', $type: 'color' } } } } },
        },
      },
    };
    const compDir = path.join(outputDir, 'compSub');
    await fs.ensureDir(compDir);
    await t.run(withSub, { specDir: compDir, outputDir: compDir, workspaceDir: compDir, specsRoot: compDir, kind: 'component' as const, componentKey: 'compSub', tokensFormat: 'TOKEN', outputFormat: 'JSON' });
    await t.finalize!(outputDir);
    const byToken = JSON.parse(await fs.readFile(path.join(outputDir, 'analysis', 'styling.byToken.json'), 'utf-8'));
    const entry = byToken.variables['Color/On surface'][0];
    expect(entry.component).toBe('compSub.item');
  });

  it('byToken keys every set in ascending token-name order', async () => {
    const t = new StylingAnalyzer();
    const outOfOrder = {
      anatomy: { root: { type: 'container' }, label: { type: 'text' } },
      default: {
        elements: {
          root: {
            styles: {
              backgroundColor: { $token: 'Zebra/Surface', $type: 'color' },
              borderColor: { $token: 'Alpha/Border', $type: 'color' },
              boxShadow: { $token: 'Shadow/High', $type: 'shadow' },
            },
          },
          label: {
            styles: {
              typography: { $token: 'Typography/Title', $type: 'typography' },
              color: { $token: 'Mid/Text', $type: 'color' },
            },
          },
        },
      },
      variants: [
        { elements: { root: { styles: { boxShadow: { $token: 'Blur/Backdrop', $type: 'blur' } } } } },
        { elements: { label: { styles: { typography: { $token: 'Typography/Body', $type: 'typography' } } } } },
      ],
    };
    const compDir = path.join(outputDir, 'compOrder');
    await fs.ensureDir(compDir);
    await t.run(outOfOrder, { specDir: compDir, outputDir: compDir, workspaceDir: compDir, specsRoot: compDir, kind: 'component' as const, componentKey: 'compOrder', tokensFormat: 'TOKEN', outputFormat: 'JSON' });
    await t.finalize!(outputDir);
    const byToken = JSON.parse(await fs.readFile(path.join(outputDir, 'analysis', 'styling.byToken.json'), 'utf-8'));
    expect(Object.keys(byToken.variables)).toEqual(['Alpha/Border', 'Mid/Text', 'Zebra/Surface']);
    expect(Object.keys(byToken.textStyles)).toEqual(['Typography/Body', 'Typography/Title']);
    expect(Object.keys(byToken.effectStyles)).toEqual(['Blur/Backdrop', 'Shadow/High']);
  });

  it('does nothing when no components were processed', async () => {
    const t = new StylingAnalyzer();
    await t.finalize!(outputDir);
    expect(fs.existsSync(path.join(outputDir, 'analysis'))).toBe(false);
  });
});

describe('StylingAnalyzer unused tokens', () => {
  const USED_VARIABLE = { $token: 'Color/Primary', $type: 'color' };
  const USED_TEXT_STYLE = { $token: 'Typography/Body', $type: 'typography' };

  const COMPONENT = {
    anatomy: { root: { type: 'container' }, label: { type: 'text' } },
    default: {
      elements: {
        root: { styles: { backgroundColor: USED_VARIABLE } },
        label: { styles: { typography: USED_TEXT_STYLE } },
      },
    },
  };

  function makeFoundations() {
    return {
      variables: new Map([
        ['VariableID:1', { name: 'Primary', variableCollectionId: 'VC:1', resolvedType: 'COLOR' }],
        ['VariableID:2', { name: 'Never used', variableCollectionId: 'VC:1', resolvedType: 'COLOR' }],
      ]),
      collections: new Map([['VC:1', { name: 'Color' }]]),
      styles: new Map([
        ['S:fill', { id: 'S:fill', name: 'Brand/Accent', type: 'FILL' }],
        ['S:text', { id: 'S:text', name: 'Typography/Body', type: 'TEXT' }],
        ['S:text2', { id: 'S:text2', name: 'Typography/Caption', type: 'TEXT' }],
        ['S:effect', { id: 'S:effect', name: 'Shadow/Low', type: 'EFFECT' }],
        ['S:grid', { id: 'S:grid', name: 'Grid/Columns', type: 'GRID' }],
      ]),
    };
  }

  let outputDir: string;

  beforeEach(async () => {
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'styling-unused-'));
  });

  afterEach(async () => {
    await fs.remove(outputDir);
  });

  async function runUnused(
    foundations: ReturnType<typeof makeFoundations> | undefined,
    outputFormat: 'JSON' | 'YAML' = 'JSON',
  ) {
    const t = new StylingAnalyzer();
    const compDir = path.join(outputDir, 'comp');
    await fs.ensureDir(compDir);
    await t.run(COMPONENT, { specDir: compDir, outputDir: compDir, workspaceDir: compDir, specsRoot: compDir, kind: 'component' as const, componentKey: 'comp', tokensFormat: 'TOKEN', outputFormat });
    await t.finalize!(outputDir, undefined, foundations);
    const ext = outputFormat === 'YAML' ? 'yaml' : 'json';
    const unusedPath = path.join(outputDir, 'analysis', `styling.unused.${ext}`);
    if (!fs.existsSync(unusedPath)) return null;
    const raw = await fs.readFile(unusedPath, 'utf-8');
    return outputFormat === 'YAML' ? yaml.parse(raw) : JSON.parse(raw);
  }

  it('writes styling.unused.json when foundations are provided', async () => {
    const out = await runUnused(makeFoundations());
    expect(out).not.toBeNull();
    expect(out).toHaveProperty('summary');
    expect(out).toHaveProperty('variables');
    expect(out).toHaveProperty('colorStyles');
    expect(out).toHaveProperty('textStyles');
    expect(out).toHaveProperty('effectStyles');
  });

  it('does not write styling.unused when foundations are absent', async () => {
    const out = await runUnused(undefined);
    expect(out).toBeNull();
  });

  it('excludes used tokens and lists unmatched ones', async () => {
    const out = await runUnused(makeFoundations());
    expect(out.variables).toEqual(['Color/Never used']);
    expect(out.textStyles).toEqual(['Typography/Caption']);
  });

  it('prefixes variable names with their collection name', async () => {
    const out = await runUnused(makeFoundations());
    expect(out.variables).toContain('Color/Never used');
    expect(out.variables).not.toContain('Never used');
  });

  it('uses the unresolved-collection placeholder when the collection is missing', async () => {
    const foundations = makeFoundations();
    foundations.variables.set('VariableID:3', { name: 'Orphan', variableCollectionId: 'VC:missing', resolvedType: 'FLOAT' });
    const out = await runUnused(foundations);
    expect(out.variables).toContain('[collection-name-unresolved]/Orphan');
  });

  it('categorizes styles by style type and skips GRID styles', async () => {
    const out = await runUnused(makeFoundations());
    expect(out.colorStyles).toEqual(['Brand/Accent']);
    expect(out.effectStyles).toEqual(['Shadow/Low']);
    const all = [...out.variables, ...out.colorStyles, ...out.textStyles, ...out.effectStyles];
    expect(all).not.toContain('Grid/Columns');
  });

  it('counts a token as used regardless of the category it was classified under', async () => {
    // 'Color/Primary' is referenced as a variable; a FILL style with the same
    // name must not be reported as an unused color style.
    const foundations = makeFoundations();
    foundations.styles.set('S:fill2', { id: 'S:fill2', name: 'Color/Primary', type: 'FILL' });
    const out = await runUnused(foundations);
    expect(out.colorStyles).not.toContain('Color/Primary');
  });

  it('dedupes styles indexed under multiple map keys', async () => {
    const foundations = makeFoundations();
    const dual = { id: 'S:dual', name: 'Shadow/High', type: 'EFFECT' };
    foundations.styles.set('S:dual', dual);
    foundations.styles.set('keyhash-for-dual', dual);
    const out = await runUnused(foundations);
    expect(out.effectStyles.filter((n: string) => n === 'Shadow/High')).toHaveLength(1);
  });

  it('summary counts total, used, and unused per category', async () => {
    const out = await runUnused(makeFoundations());
    expect(out.summary.variables).toEqual({ total: 2, used: 1, unused: 1 });
    expect(out.summary.textStyles).toEqual({ total: 2, used: 1, unused: 1 });
    expect(out.summary.colorStyles).toEqual({ total: 1, used: 0, unused: 1 });
    expect(out.summary.effectStyles).toEqual({ total: 1, used: 0, unused: 1 });
  });

  it('sorts unused names alphabetically', async () => {
    const foundations = makeFoundations();
    foundations.variables.set('VariableID:4', { name: 'Aardvark', variableCollectionId: 'VC:1', resolvedType: 'COLOR' });
    const out = await runUnused(foundations);
    expect(out.variables).toEqual([...out.variables].sort());
  });

  it('writes styling.unused.yaml when outputFormat is YAML', async () => {
    const out = await runUnused(makeFoundations(), 'YAML');
    expect(out).not.toBeNull();
    expect(out.variables).toEqual(['Color/Never used']);
    expect(fs.existsSync(path.join(outputDir, 'analysis', 'styling.unused.json'))).toBe(false);
  });
});

describe('StylingAnalyzer name-shaped token profiles', () => {
  function makeFoundations() {
    return {
      variables: new Map([
        ['VariableID:1', { name: 'Surface/Primary', variableCollectionId: 'VC:1', resolvedType: 'COLOR' }],
        ['VariableID:2', { name: 'Layout/Vertical/M', variableCollectionId: 'VC:2', resolvedType: 'FLOAT' }],
      ]),
      collections: new Map([
        ['VC:1', { name: 'Color' }],
        ['VC:2', { name: 'Spacing' }],
      ]),
      styles: new Map([
        ['S:text', { id: 'S:text', name: 'Typography/Body', type: 'TEXT' }],
        ['S:fill', { id: 'S:fill', name: 'Brand/Accent', type: 'FILL' }],
        ['S:effect', { id: 'S:effect', name: 'Shadow/Low', type: 'EFFECT' }],
      ]),
    };
  }

  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'styling-names-'));
  });

  afterEach(async () => {
    await fs.remove(dir);
  });

  async function runWith(
    apiYaml: Record<string, unknown>,
    tokensFormat: string,
    // Explicit rather than defaulted: `undefined` is a case under test, and a
    // default parameter would silently substitute foundations for it.
    foundations: ReturnType<typeof makeFoundations> | undefined,
  ) {
    const t = new StylingAnalyzer();
    await t.run(apiYaml, {
      specDir: dir, outputDir: dir, workspaceDir: dir, specsRoot: dir,
      kind: 'component' as const, componentKey: 'dsButton',
      tokensFormat, outputFormat: 'JSON' as const, foundations,
    });
    const raw = await fs.readFile(path.join(dir, 'styling.json'), 'utf-8');
    return JSON.parse(raw).dsButton as {
      variables: Array<{ name: string; appliedAs: string; appliedTo: Record<string, number> }>;
      colorStyles: Array<{ name: string }>;
      textStyles: Array<{ name: string }>;
      effectStyles: Array<{ name: string }>;
    };
  }

  const WITH_NAMES = {
    anatomy: { root: { type: 'container' }, label: { type: 'text' } },
    default: {
      elements: {
        root: {
          styles: {
            backgroundColor: 'Color/Surface/Primary',
            itemSpacing: 'Spacing/Layout/Vertical/M',
          },
        },
        label: { styles: { typography: 'Typography/Body' } },
      },
    },
  };

  it('collects bare names as tokens under TOKEN_NAME', async () => {
    const out = await runWith(WITH_NAMES, 'TOKEN_NAME', makeFoundations());
    const names = out.variables.map(r => r.name).sort();
    expect(names).toEqual(['Color/Surface/Primary', 'Spacing/Layout/Vertical/M']);
  });

  it('collects bare names as tokens under FIGMA_NAME', async () => {
    const out = await runWith(WITH_NAMES, 'FIGMA_NAME', makeFoundations());
    expect(out.variables.map(r => r.name)).toContain('Color/Surface/Primary');
  });

  it('records appliedAs and appliedTo for a name-matched token', async () => {
    const out = await runWith(WITH_NAMES, 'TOKEN_NAME', makeFoundations());
    const row = out.variables.find(r => r.name === 'Spacing/Layout/Vertical/M');
    expect(row?.appliedAs).toBe('itemSpacing');
    expect(row?.appliedTo).toEqual({ root: 1 });
  });

  it('categorizes a matched style name by its style type, not as a variable', async () => {
    const out = await runWith(WITH_NAMES, 'TOKEN_NAME', makeFoundations());
    expect(out.textStyles.map(r => r.name)).toEqual(['Typography/Body']);
    expect(out.variables.map(r => r.name)).not.toContain('Typography/Body');
  });

  it('ignores literal enum values that name no token', async () => {
    const out = await runWith({
      anatomy: { root: { type: 'container' } },
      default: {
        elements: {
          root: {
            styles: {
              layoutMode: 'VERTICAL',
              crossAxisAlignment: 'CENTER',
              layoutSizingHorizontal: 'FILL',
              backgroundColor: 'Color/Surface/Primary',
            },
          },
        },
      },
    }, 'TOKEN_NAME', makeFoundations());
    expect(out.variables.map(r => r.name)).toEqual(['Color/Surface/Primary']);
  });

  it('matches names nested inside per-side objects', async () => {
    const out = await runWith({
      anatomy: { root: { type: 'container' } },
      default: {
        elements: {
          root: {
            styles: {
              padding: { start: 'Spacing/Layout/Vertical/M', end: 'Spacing/Layout/Vertical/M', top: 0 },
            },
          },
        },
      },
    }, 'TOKEN_NAME', makeFoundations());
    expect(out.variables.map(r => r.appliedAs).sort()).toEqual(['padding.end', 'padding.start']);
  });

  it('collects nothing from bare names when foundations are absent', async () => {
    const out = await runWith(WITH_NAMES, 'TOKEN_NAME', undefined);
    expect(out.variables).toHaveLength(0);
    expect(out.textStyles).toHaveLength(0);
  });

  it('ignores bare names under TOKEN, where a reference is always an object', async () => {
    const out = await runWith(WITH_NAMES, 'TOKEN', makeFoundations());
    expect(out.variables).toHaveLength(0);
    expect(out.textStyles).toHaveLength(0);
  });

  it('still collects object-shaped references under a name-shaped profile', async () => {
    // FIGMA_SYNTAX_* and CUSTOM fall back to object shapes for some tokens, and
    // a mixed spec must not lose the ones that did serialize as objects.
    const out = await runWith({
      anatomy: { root: { type: 'container' } },
      default: {
        elements: {
          root: {
            styles: {
              backgroundColor: { $token: 'Color/Surface/Primary', $type: 'color' },
              itemSpacing: 'Spacing/Layout/Vertical/M',
            },
          },
        },
      },
    }, 'TOKEN_NAME', makeFoundations());
    expect(out.variables.map(r => r.name).sort()).toEqual(['Color/Surface/Primary', 'Spacing/Layout/Vertical/M']);
  });

  it('prefers the variable category when a name is both a variable and a style', async () => {
    const foundations = makeFoundations();
    foundations.styles.set('S:dup', { id: 'S:dup', name: 'Color/Surface/Primary', type: 'FILL' });
    const out = await runWith(WITH_NAMES, 'TOKEN_NAME', foundations);
    expect(out.variables.map(r => r.name)).toContain('Color/Surface/Primary');
    expect(out.colorStyles).toHaveLength(0);
  });
});

describe('tokenProfileWarnings', () => {
  const styling = [{ name: 'styling' }] as Parameters<typeof tokenProfileWarnings>[2];
  const notStyling = [{ name: 'props' }] as Parameters<typeof tokenProfileWarnings>[2];

  it('says nothing for the object-shaped profiles', () => {
    expect(tokenProfileWarnings('TOKEN', true, styling)).toEqual([]);
    expect(tokenProfileWarnings('TOKEN_FIGMA_EXTENSIONS', true, styling)).toEqual([]);
  });

  it('says nothing for the name-shaped profiles when foundations loaded', () => {
    expect(tokenProfileWarnings('TOKEN_NAME', true, styling)).toEqual([]);
    expect(tokenProfileWarnings('FIGMA_NAME', true, styling)).toEqual([]);
  });

  it('warns for a name-shaped profile with no foundations data', () => {
    const [warning] = tokenProfileWarnings('TOKEN_NAME', false, styling);
    expect(warning).toContain('TOKEN_NAME');
    expect(warning).toContain('specs fetch');
  });

  it('warns for the profiles the analysis cannot read', () => {
    for (const profile of ['CUSTOM', 'FIGMA_SYNTAX_WEB', 'FIGMA_SYNTAX_IOS', 'FIGMA_SYNTAX_ANDROID']) {
      const warnings = tokenProfileWarnings(profile, true, styling);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(profile);
    }
  });

  it('warns about an unreadable profile even when foundations loaded', () => {
    expect(tokenProfileWarnings('CUSTOM', false, styling)).toHaveLength(1);
  });

  it('says nothing when the styling analyzer is not running', () => {
    expect(tokenProfileWarnings('CUSTOM', true, notStyling)).toEqual([]);
    expect(tokenProfileWarnings('TOKEN_NAME', false, notStyling)).toEqual([]);
  });
});
