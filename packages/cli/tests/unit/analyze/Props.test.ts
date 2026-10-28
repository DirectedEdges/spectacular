import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { PropsAnalyzer, propIsNullable } from '../../../src/analyze/Props.js';

type AggregateYaml = {
  summary: { totalProps: number; totalComponents: number; uniquePropNames: number; typeDistribution: Record<string, number> };
  propNameFrequency: Array<{ name: string; occurrences: number; components: string[]; types: string[]; typeConflict?: true }>;
  typeDiscordance: Array<{ propName: string; typeSets: Array<{ type: string; components: string[] }> }>;
  enumDiscordance: Array<{ propName: string; type: string; valueSets: Array<{ values?: string[]; open?: true; components: string[] }>; openAndClosed?: true }>;
  booleanNamingPatterns: Record<string, number>;
  apiSurface: Array<{ component: string; props: number; enumValues: number; slots: number; booleans: number }>;
  slots: Array<{ component: string; name: string; anyOf: unknown; minItems: number | null; maxItems: number | null; nullable: boolean }>;
};

describe('PropsAnalyzer', () => {
  let outputDir: string;
  let analysisDir: string;

  beforeEach(async () => {
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'props-test-'));
    analysisDir = path.join(outputDir, 'analysis');
  });

  afterEach(async () => {
    await fs.remove(outputDir);
  });

  async function runAnalyzer(components: Record<string, Record<string, unknown>>, outputFormat: 'JSON' | 'YAML' = 'YAML') {
    const a = new PropsAnalyzer();
    for (const [componentKey, apiYaml] of Object.entries(components)) {
      const compDir = path.join(outputDir, componentKey);
      await fs.ensureDir(compDir);
      await a.run(apiYaml, { specDir: compDir, outputDir: compDir, workspaceDir: compDir, specsRoot: compDir, kind: 'component' as const, componentKey, tokensFormat: 'TOKEN', outputFormat });
    }
    await a.finalize!(outputDir, analysisDir);
    if (outputFormat === 'JSON') {
      return JSON.parse(await fs.readFile(path.join(analysisDir, 'props.json'), 'utf-8')) as AggregateYaml;
    }
    return yaml.parse(await fs.readFile(path.join(analysisDir, 'props.yaml'), 'utf-8')) as AggregateYaml;
  }

  it('has name "props"', () => {
    expect(new PropsAnalyzer().name).toBe('props');
  });

  it('reports an object prop as member rows, never a bare object row (ADR-111)', async () => {
    const aggregate = await runAnalyzer({
      card: {
        props: {
          margin: {
            type: 'object',
            members: {
              compact: { type: 'string', default: 'None', enum: ['None', 'Tight'], nullable: false },
              emphasized: { type: 'boolean', default: false },
            },
          },
        },
      },
    });
    const names = aggregate.propNameFrequency.map(entry => entry.name);
    expect(names).toContain('margin.compact');
    expect(names).toContain('margin.emphasized');
    expect(names).not.toContain('margin');
    expect(aggregate.summary.typeDistribution).toEqual({ string: 1, boolean: 1 });
  });

  it('writes analysis/props.yaml when outputFormat is YAML', async () => {
    await runAnalyzer({ compA: { props: { label: { type: 'string' } } } }, 'YAML');
    expect(fs.existsSync(path.join(analysisDir, 'props.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(analysisDir, 'props.json'))).toBe(false);
  });

  it('writes analysis/props.json when outputFormat is JSON', async () => {
    await runAnalyzer({ compA: { props: { label: { type: 'string' } } } }, 'JSON');
    expect(fs.existsSync(path.join(analysisDir, 'props.json'))).toBe(true);
    expect(fs.existsSync(path.join(analysisDir, 'props.yaml'))).toBe(false);
  });

  it('does not write per-component files', async () => {
    const compDir = path.join(outputDir, 'compA');
    await fs.ensureDir(compDir);
    const a = new PropsAnalyzer();
    await a.run({ props: { label: { type: 'string' } } }, { specDir: compDir, outputDir: compDir, workspaceDir: compDir, specsRoot: compDir, kind: 'component' as const, componentKey: 'compA', tokensFormat: 'TOKEN', outputFormat: 'YAML' });
    expect(fs.existsSync(path.join(compDir, 'props.yaml'))).toBe(false);
  });

  it('does nothing when no components were processed', async () => {
    const a = new PropsAnalyzer();
    await a.finalize!(outputDir, analysisDir);
    expect(fs.existsSync(analysisDir)).toBe(false);
  });

  it('summary.totalProps counts all props across all scopes', async () => {
    const { summary } = await runAnalyzer({
      compA: { props: { size: { type: 'string' }, disabled: { type: 'boolean' } } },
      compB: { props: { size: { type: 'string' }, label: { type: 'string' }, children: { type: 'slot' } } },
    });
    expect(summary.totalProps).toBe(5);
  });

  it('summary.totalComponents counts unique scope keys', async () => {
    const { summary } = await runAnalyzer({
      compA: { props: { label: { type: 'string' } } },
      compB: { props: { label: { type: 'string' } } },
    });
    expect(summary.totalComponents).toBe(2);
  });

  it('summary.uniquePropNames counts distinct names', async () => {
    const { summary } = await runAnalyzer({
      compA: { props: { size: { type: 'string' }, disabled: { type: 'boolean' } } },
      compB: { props: { size: { type: 'string' }, label: { type: 'string' } } },
    });
    // size, disabled, label = 3
    expect(summary.uniquePropNames).toBe(3);
  });

  it('summary.typeDistribution counts by type', async () => {
    const { summary } = await runAnalyzer({
      compA: { props: { size: { type: 'string' }, disabled: { type: 'boolean' }, children: { type: 'slot' } } },
    });
    expect(summary.typeDistribution.string).toBe(1);
    expect(summary.typeDistribution.boolean).toBe(1);
    expect(summary.typeDistribution.slot).toBe(1);
  });

  it('includes the componentKey on each prop entry', async () => {
    const agg = await runAnalyzer({
      dsAlert: { props: { label: { type: 'string' } } },
    });
    expect(agg.apiSurface[0].component).toBe('dsAlert');
  });

  it('subcomponent props accumulate under dot-path scope keys', async () => {
    const { apiSurface } = await runAnalyzer({
      compA: {
        props: { label: { type: 'string' } },
        subcomponents: { item: { props: { active: { type: 'boolean' } } } },
      },
    });
    const keys = apiSurface.map(e => e.component);
    expect(keys).toContain('compA');
    expect(keys).toContain('compA.item');
  });

  it('subcomponent props do not appear in the top-level scope', async () => {
    const { propNameFrequency } = await runAnalyzer({
      compA: {
        props: { label: { type: 'string' } },
        subcomponents: { item: { props: { active: { type: 'boolean' } } } },
      },
    });
    const labelEntry = propNameFrequency.find(p => p.name === 'label');
    expect(labelEntry?.components).not.toContain('compA.item');
  });

  it('propNameFrequency is sorted by occurrences descending', async () => {
    const { propNameFrequency } = await runAnalyzer({
      compA: { props: { size: { type: 'string' }, disabled: { type: 'boolean' } } },
      compB: { props: { size: { type: 'string' }, label: { type: 'string' } } },
    });
    const counts = propNameFrequency.map(p => p.occurrences);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('propNameFrequency lists all components sharing a prop name', async () => {
    const { propNameFrequency } = await runAnalyzer({
      compA: { props: { size: { type: 'string' } } },
      compB: { props: { size: { type: 'string' } } },
    });
    const sizeEntry = propNameFrequency.find(p => p.name === 'size');
    expect(sizeEntry?.occurrences).toBe(2);
    expect(sizeEntry?.components.sort()).toEqual(['compA', 'compB']);
  });

  it('a prop whose components agree on the type carries no conflict flag', async () => {
    const { propNameFrequency, typeDiscordance } = await runAnalyzer({
      compA: { props: { size: { type: 'string' } } },
      compB: { props: { size: { type: 'string' } } },
    });
    expect(propNameFrequency.find(p => p.name === 'size')).not.toHaveProperty('typeConflict');
    expect(typeDiscordance.find(e => e.propName === 'size')).toBeUndefined();
  });

  it('flags the frequency row of a prop whose components disagree on the type', async () => {
    const { propNameFrequency } = await runAnalyzer({
      compA: { props: { placeholder: { type: 'string' } } },
      compB: { props: { placeholder: { type: 'boolean' } } },
    });
    const entry = propNameFrequency.find(p => p.name === 'placeholder');
    expect(entry?.typeConflict).toBe(true);
    expect(entry?.types.sort()).toEqual(['boolean', 'string']);
  });

  it('typeDiscordance names which components hold which type', async () => {
    const { typeDiscordance } = await runAnalyzer({
      compA: { props: { placeholder: { type: 'string' } } },
      compB: { props: { placeholder: { type: 'boolean' } } },
      compC: { props: { placeholder: { type: 'string' } } },
    });
    const discord = typeDiscordance.find(e => e.propName === 'placeholder');
    expect(discord?.typeSets).toHaveLength(2);
    expect(discord?.typeSets.find(t => t.type === 'string')?.components.sort()).toEqual(['compA', 'compC']);
    expect(discord?.typeSets.find(t => t.type === 'boolean')?.components).toEqual(['compB']);
  });

  it('a subcomponent scope is named as its own holder of a type', async () => {
    // A name colliding between a component and a subcomponent is the case most
    // likely to be two unrelated props, so the scope key has to appear as written.
    const { typeDiscordance } = await runAnalyzer({
      compA: {
        props: { active: { type: 'boolean' } },
        subcomponents: { item: { props: { active: { type: 'string' } } } },
      },
    });
    const discord = typeDiscordance.find(e => e.propName === 'active');
    expect(discord?.typeSets.find(t => t.type === 'string')?.components).toEqual(['compA.item']);
  });

  it('enumDiscordance is empty when same-named enum props share identical value sets', async () => {
    const { enumDiscordance } = await runAnalyzer({
      compA: { props: { size: { type: 'string', enum: ['sm', 'md', 'lg'] } } },
      compB: { props: { size: { type: 'string', enum: ['sm', 'md', 'lg'] } } },
    });
    expect(enumDiscordance.find(e => e.propName === 'size')).toBeUndefined();
  });

  it('enumDiscordance reports props whose enum value sets diverge', async () => {
    const { enumDiscordance } = await runAnalyzer({
      compA: { props: { size: { type: 'string', enum: ['sm', 'md'] } } },
      compB: { props: { size: { type: 'string', enum: ['xs', 'sm', 'md'] } } },
    });
    const discord = enumDiscordance.find(e => e.propName === 'size');
    expect(discord).toBeDefined();
    expect(discord?.type).toBe('string');
    expect(discord?.valueSets).toHaveLength(2);
    // Both sets are closed — nothing here is open, so the flag stays absent.
    expect(discord).not.toHaveProperty('openAndClosed');
  });

  it('enumDiscordance reports a name some components close and others leave open', async () => {
    const { enumDiscordance } = await runAnalyzer({
      compA: { props: { size: { type: 'string', enum: ['sm', 'md'] } } },
      compB: { props: { size: { type: 'string' } } },
    });
    const discord = enumDiscordance.find(e => e.propName === 'size');
    expect(discord?.openAndClosed).toBe(true);
    expect(discord?.valueSets.find(v => v.values)?.components).toEqual(['compA']);
    expect(discord?.valueSets.find(v => v.open)?.components).toEqual(['compB']);
  });

  it('a name that both disagrees on values and is left open reports all three sets', async () => {
    const { enumDiscordance } = await runAnalyzer({
      compA: { props: { size: { type: 'string', enum: ['sm', 'md'] } } },
      compB: { props: { size: { type: 'string', enum: ['xs', 'sm'] } } },
      compC: { props: { size: { type: 'string' } } },
    });
    const discord = enumDiscordance.find(e => e.propName === 'size');
    expect(discord?.valueSets).toHaveLength(3);
    expect(discord?.openAndClosed).toBe(true);
  });

  it('a name no component closes reports nothing', async () => {
    const { enumDiscordance } = await runAnalyzer({
      compA: { props: { label: { type: 'string' } } },
      compB: { props: { label: { type: 'string' } } },
    });
    expect(enumDiscordance.find(e => e.propName === 'label')).toBeUndefined();
  });

  it('a type conflict is not reported a second time as an enum divergence', async () => {
    // compB's boolean has no enum, but pairing it against compA's closed set
    // would restate the type conflict in the weaker of the two sections.
    const { enumDiscordance, typeDiscordance } = await runAnalyzer({
      compA: { props: { placeholder: { type: 'string', enum: ['sm', 'md'] } } },
      compB: { props: { placeholder: { type: 'boolean' } } },
    });
    expect(typeDiscordance.find(e => e.propName === 'placeholder')).toBeDefined();
    expect(enumDiscordance.find(e => e.propName === 'placeholder')).toBeUndefined();
  });

  it('booleanNamingPatterns counts prefixes and bare names', async () => {
    const { booleanNamingPatterns } = await runAnalyzer({
      compA: { props: {
        isDisabled: { type: 'boolean' },
        hasIcon:    { type: 'boolean' },
        canExpand:  { type: 'boolean' },
        loading:    { type: 'boolean' },
      } },
    });
    expect(booleanNamingPatterns.isPrefix).toBe(1);
    expect(booleanNamingPatterns.hasPrefix).toBe(1);
    expect(booleanNamingPatterns.canPrefix).toBe(1);
    expect(booleanNamingPatterns.bare).toBe(1);
  });

  it('apiSurface is sorted by props count descending', async () => {
    const { apiSurface } = await runAnalyzer({
      compA: { props: { a: { type: 'string' } } },
      compB: { props: { a: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' } } },
    });
    const counts = apiSurface.map(e => e.props);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('apiSurface counts booleans and slots per scope', async () => {
    const { apiSurface } = await runAnalyzer({
      compA: { props: { disabled: { type: 'boolean' } } },
      compB: { props: { children: { type: 'slot' } } },
    });
    expect(apiSurface.find(e => e.component === 'compA')?.booleans).toBe(1);
    expect(apiSurface.find(e => e.component === 'compB')?.slots).toBe(1);
  });

  it('apiSurface.enumValues counts total enum values per scope', async () => {
    const { apiSurface } = await runAnalyzer({
      compA: { props: { size: { type: 'string', enum: ['sm', 'md', 'lg'] } } },
    });
    expect(apiSurface.find(e => e.component === 'compA')?.enumValues).toBe(3);
  });

  it('slots lists all slot props with their constraints', async () => {
    const { slots } = await runAnalyzer({
      compA: { props: { children: { type: 'slot', minItems: 1, maxItems: 3, anyOf: ['DsButton'] } } },
    });
    const slot = slots.find(s => s.name === 'children');
    expect(slot?.component).toBe('compA');
    expect(slot?.minItems).toBe(1);
    expect(slot?.maxItems).toBe(3);
    expect(slot?.anyOf).toEqual(['DsButton']);
    // ADR-065: an absent `nullable` on a slot prop means true.
    expect(slot?.nullable).toBe(true);
  });

  /**
   * MIRROR PIN (specs#689). `propIsNullable` exists twice — here and in
   * `packages/from-specs/src/contract.ts` in the specs-from-figma repo — because
   * the CLI cannot import the closed core. The two must agree exactly: this one
   * decides what the analysis reports, that one decides what the emitted contract
   * declares, and a disagreement makes a spec's analysis and its contract state
   * different things about the same prop.
   *
   * This table is duplicated verbatim in that repo's
   * `packages/from-specs/tests/contract.test.ts`. Keep them diffable: change both,
   * or neither.
   */
  const NULLABILITY_TABLE: Array<[label: string, prop: Record<string, unknown>, nullable: boolean]> = [
    // Absent `nullable`: the per-type default ADR-065 documents. Open value sets
    // accept null; a closed one already enumerates every value it accepts.
    ['an open string', { type: 'string' }, true],
    ['a number', { type: 'number' }, true],
    ['an image', { type: 'image' }, true],
    ['a slot', { type: 'slot' }, true],
    ['an enum', { type: 'string', enum: ['sm', 'md'] }, false],
    ['a boolean', { type: 'boolean' }, false],
    // An explicit `nullable` always wins over the default, in both directions.
    ['an open string pinned false', { type: 'string', nullable: false }, false],
    ['an enum pinned true', { type: 'string', enum: ['sm', 'md'], nullable: true }, true],
    ['a boolean pinned true', { type: 'boolean', nullable: true }, true],
  ];

  it.each(NULLABILITY_TABLE)('treats %s as nullable=%j', (_label, prop, expected) => {
    expect(propIsNullable(prop)).toBe(expected);
  });

  it('reports a slot prop with no declared nullable as nullable', async () => {
    const { slots } = await runAnalyzer({
      compA: { props: { children: { type: 'slot' } } },
    });
    expect(slots.find(s => s.name === 'children')?.nullable).toBe(true);
  });

  it('output is deterministic for the same input', async () => {
    const outputDir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'props-det-'));
    try {
      const out1 = await runAnalyzer({ compA: { props: { size: { type: 'string', enum: ['sm', 'md'] }, disabled: { type: 'boolean' } } } });
      const a2 = new PropsAnalyzer();
      const compDir2 = path.join(outputDir2, 'compA');
      await fs.ensureDir(compDir2);
      await a2.run({ props: { size: { type: 'string', enum: ['sm', 'md'] }, disabled: { type: 'boolean' } } }, { specDir: compDir2, outputDir: compDir2, workspaceDir: compDir2, specsRoot: compDir2, kind: 'component' as const, componentKey: 'compA', tokensFormat: 'TOKEN', outputFormat: 'YAML' as const });
      const analysisDir2 = path.join(outputDir2, 'analysis');
      await a2.finalize!(outputDir2, analysisDir2);
      const raw2 = await fs.readFile(path.join(analysisDir2, 'props.yaml'), 'utf-8');
      const out2 = yaml.parse(raw2);
      expect(JSON.stringify(out1)).toBe(JSON.stringify(out2));
    } finally {
      await fs.remove(outputDir2);
    }
  });

  it('respects an explicit analysisDir override', async () => {
    const customDir = path.join(outputDir, 'custom-out');
    const a = new PropsAnalyzer();
    const compDir = path.join(outputDir, 'compA');
    await fs.ensureDir(compDir);
    await a.run({ props: { label: { type: 'string' } } }, { specDir: compDir, outputDir: compDir, workspaceDir: compDir, specsRoot: compDir, kind: 'component' as const, componentKey: 'compA', tokensFormat: 'TOKEN', outputFormat: 'YAML' as const });
    await a.finalize!(outputDir, customDir);
    expect(fs.existsSync(path.join(customDir, 'props.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'analysis', 'props.yaml'))).toBe(false);
  });
});
