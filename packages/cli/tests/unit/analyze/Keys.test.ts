import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { KeysAnalyzer } from '../../../src/analyze/Keys.js';

type KeysYaml = {
  summary: {
    namingConvention: string | null;
    measured: boolean;
    totalComponents: number;
    componentsWithDivergence: number;
    totalNames: number;
    divergentNames: number;
    causeDistribution: Record<string, number>;
  };
  byComponent: Record<string, {
    divergent: number;
    props?: Array<{ key: string; figmaName: string; cause: string; segment?: string }>;
    anatomy?: Array<{ key: string; figmaName: string; cause: string }>;
  }>;
  byCause: Array<{ cause: string; occurrences: number; names: string[] }>;
  byName: Array<{ figmaName: string; occurrences: number; components: string[]; cause: string; segment?: string }>;
};

/** An anatomy or prop entry carrying a recorded Figma name. */
const withName = (type: string, figmaName: string) => ({
  type,
  $extensions: { 'com.figma': { name: figmaName } },
});

describe('KeysAnalyzer', () => {
  let outputDir: string;
  let analysisDir: string;

  beforeEach(async () => {
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keys-test-'));
    analysisDir = path.join(outputDir, 'analysis');
  });

  afterEach(async () => {
    await fs.remove(outputDir);
  });

  /**
   * @param figmaKeys The convention the specs declare in `metadata.config`. Defaults to
   *   SENTENCE; pass undefined to model a catalog generated under the NONE default.
   * @param objectProps The workspace's `objectProps` block, when the catalog folds
   *   object-prop members (ADR-111) on something other than the default separator.
   */
  async function runAnalyzer(
    components: Record<string, Record<string, unknown>>,
    figmaKeys: 'SENTENCE' | 'TITLE' | undefined = 'SENTENCE',
    objectProps?: { separator?: string },
  ) {
    const a = new KeysAnalyzer();
    for (const [componentKey, apiYaml] of Object.entries(components)) {
      const compDir = path.join(outputDir, componentKey);
      await fs.ensureDir(compDir);
      const spec = figmaKeys
        ? { ...apiYaml, metadata: { config: { format: { keys: 'CAMEL', figmaKeys } } } }
        : apiYaml;
      await a.run(spec, { specDir: compDir, outputDir: compDir, workspaceDir: compDir, specsRoot: compDir, kind: 'component' as const, componentKey, outputFormat: 'YAML', tokensFormat: 'TOKEN', ...(objectProps ? { platform: { naming: 'NONE', slotConstraints: false, inferNumberProps: false, slotPrimitives: false, objectProps } } : {}) } as never);
    }
    await a.finalize!(outputDir, analysisDir);
    const file = path.join(analysisDir, 'keys.yaml');
    if (!await fs.pathExists(file)) return null;
    return yaml.parse(await fs.readFile(file, 'utf-8')) as KeysYaml;
  }

  it('reports nothing for a catalog generated under the NONE default', async () => {
    const result = await runAnalyzer({
      dsBody: { anatomy: { root: withName('text', 'Text') } },
    }, undefined);
    expect(result!.summary.divergentNames).toBe(0);
    expect(result!.byComponent).toEqual({});
  });

  it('ignores a recorded name that satisfies the grammar — wrapper-collapse provenance', async () => {
    // $extensions['com.figma'].name has two triggers. ADR-058 wrapper collapse records
    // the pre-collapse layer name on `root` whether or not it diverges, so a safe name
    // like 'Text' or 'Icon glyph' must not be reported as a naming problem.
    const result = await runAnalyzer({
      dsBody: { anatomy: { root: withName('text', 'Text') } },
      dsIcon: { anatomy: { root: withName('glyph', 'Icon glyph') } },
      dsText: { anatomy: { root: withName('text', 'Text'), urlField: withName('text', 'URL field') } },
    });
    expect(result!.summary.divergentNames).toBe(1);
    expect(Object.keys(result!.byComponent)).toEqual(['dsText']);
    expect(result!.byComponent.dsText.anatomy).toEqual([
      { key: 'urlField', figmaName: 'URL field', cause: 'casing' },
    ]);
  });

  it('reports nothing when no name was recorded', async () => {
    const result = await runAnalyzer({
      dsButton: { anatomy: { label: { type: 'text' } }, props: { size: { type: 'string' } } },
    });
    expect(result!.summary.divergentNames).toBe(0);
    expect(result!.byComponent).toEqual({});
  });

  it('groups divergent names under their component', async () => {
    const result = await runAnalyzer({
      dsAlert: {
        anatomy: { root: { type: 'container' }, iconLeading: withName('glyph', 'Icon Leading') },
        props: { fullBleed: { type: 'boolean', $extensions: { 'com.figma': { name: 'Full Bleed' } } } },
      },
    });

    expect(result!.byComponent.dsAlert.divergent).toBe(2);
    expect(result!.byComponent.dsAlert.props).toEqual([
      { key: 'fullBleed', figmaName: 'Full Bleed', cause: 'casing' },
    ]);
    expect(result!.byComponent.dsAlert.anatomy).toEqual([
      { key: 'iconLeading', figmaName: 'Icon Leading', cause: 'casing' },
    ]);
  });

  it('omits a surface array entirely when it is empty', async () => {
    const result = await runAnalyzer({
      dsBadge: { props: { fullBleed: withName('boolean', 'Full Bleed') } },
    });
    expect(result!.byComponent.dsBadge).not.toHaveProperty('anatomy');
    expect(result!.byComponent.dsBadge.props).toHaveLength(1);
  });

  it('counts every name, not only divergent ones', async () => {
    const result = await runAnalyzer({
      dsButton: {
        anatomy: { root: { type: 'container' }, label: { type: 'text' }, urlField: withName('text', 'URL field') },
        props: { size: { type: 'string' } },
      },
    });
    expect(result!.summary.totalNames).toBe(4);
    expect(result!.summary.divergentNames).toBe(1);
    expect(result!.summary.componentsWithDivergence).toBe(1);
    expect(result!.summary.totalComponents).toBe(1);
  });

  it('aggregates a repeated name across components — one decision, not many', async () => {
    const props = { a11yLabel: withName('string', 'A11y label') };
    const result = await runAnalyzer({
      dsAvatar: { props }, dsBadge: { props }, dsButton: { props },
    });

    const entry = result!.byName.find(n => n.figmaName === 'A11y label')!;
    expect(entry.occurrences).toBe(3);
    expect(entry.components).toEqual(['dsAvatar', 'dsBadge', 'dsButton']);
  });

  it('walks anatomy nested in slot content and compositions', async () => {
    const result = await runAnalyzer({
      dsCard: {
        anatomy: { root: { type: 'container' } },
        slotContentExamples: { basic: { anatomy: { urlField: withName('text', 'URL field') } } },
        compositions: { hero: { anatomy: { cutPaste: withName('container', 'Cut & paste') } } },
      },
    });
    expect(result!.byComponent.dsCard.divergent).toBe(2);
  });

  it('collects subcomponents under a dot-path key', async () => {
    const result = await runAnalyzer({
      dsList: {
        anatomy: { root: { type: 'container' } },
        subcomponents: { item: { anatomy: { startIcon: withName('glyph', 'Start Icon') } } },
      },
    });
    expect(result!.byComponent['dsList.item'].divergent).toBe(1);
  });

  /**
   * Since ADR-089 a generated spec keeps only `metadata.source`, so the convention has
   * to be found beside it. Reading only the per-spec block reported zero divergence for
   * every current catalogue (issue #613).
   */
  describe('convention resolution', () => {
    const reduced = {
      metadata: { source: { fileKey: 'abc', nodeId: '1:2' } },
      props: { a11yLabel: withName('string', 'A11y label') },
    };

    /** Runs one spec that states no convention of its own. */
    async function runReduced(
      spec: Record<string, unknown>,
      opts: { run?: string; workspace?: string } = {},
    ) {
      const a = new KeysAnalyzer();
      const compDir = path.join(outputDir, 'dsButton');
      await fs.ensureDir(compDir);
      if (opts.run) {
        await fs.writeFile(
          path.join(outputDir, 'latest.metadata.yaml'),
          yaml.stringify({ conventions: { platforms: { figma: { naming: opts.run } } } }),
          'utf-8',
        );
      }
      await a.run(spec, {
        specDir: compDir, outputDir: compDir, workspaceDir: outputDir, specsRoot: outputDir, kind: 'component' as const,
        componentKey: 'dsButton', outputFormat: 'YAML', tokensFormat: 'TOKEN',
        platform: opts.workspace
          ? { naming: opts.workspace, slotConstraints: false, inferNumberProps: false, slotPrimitives: false }
          : undefined,
      } as never);
      await a.finalize!(outputDir, analysisDir);
      const file = path.join(analysisDir, 'keys.yaml');
      if (!await fs.pathExists(file)) return null;
      return yaml.parse(await fs.readFile(file, 'utf-8')) as KeysYaml;
    }

    it('records in the file which convention it measured against', async () => {
      const result = await runReduced(reduced, { run: 'SENTENCE' });
      expect(result!.summary.measured).toBe(true);
      expect(result!.summary.namingConvention).toBe('SENTENCE');
    });

    it('records in the file that nothing was measured, not only on stdout', async () => {
      // With no convention every name passes vacuously, so `divergentNames: 0` across
      // hundreds of names reads as a library that round-trips perfectly. The warning
      // that says otherwise goes to stdout and is gone by the time anyone opens the
      // committed artifact. A live workspace reported 0 of 490 this way.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await runReduced(reduced, { run: 'NONE' });
      warn.mockRestore();
      expect(result!.summary.divergentNames).toBe(0);
      expect(result!.summary.measured).toBe(false);
      expect(result!.summary.namingConvention).toBe(null);
    });

    it('reads the convention from the run document beside a reduced spec', async () => {
      const result = await runReduced(reduced, { run: 'SENTENCE' });
      expect(result!.summary.divergentNames).toBe(1);
      expect(result!.byComponent.dsButton.props).toEqual([
        { key: 'a11yLabel', figmaName: 'A11y label', cause: 'mixed-letter-digit' },
      ]);
    });

    it('falls back to the workspace conventions when no run document exists', async () => {
      const result = await runReduced(reduced, { workspace: 'SENTENCE' });
      expect(result!.summary.divergentNames).toBe(1);
    });

    it("prefers the spec's own record over the run document", async () => {
      // TITLE accepts 'Start Icon'; SENTENCE does not. The spec's record must win.
      const result = await runReduced({
        metadata: { conventions: { figma: { naming: 'TITLE' } } },
        anatomy: { startIcon: withName('glyph', 'Start Icon') },
      }, { run: 'SENTENCE' });
      expect(result!.summary.divergentNames).toBe(0);
    });

    it('reports zero and warns when nothing declares a convention', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await runReduced(reduced);
      expect(result!.summary.divergentNames).toBe(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no Figma naming convention declared'));
      warn.mockRestore();
    });
  });

  /**
   * An object prop (ADR-111) carries no Figma name of its own, so reading it as an
   * ordinary prop dropped every one of its members: a `Margin.Compact` that used to be
   * reported stopped appearing under either half of its name once `objectProps` folded
   * it. The members are the real property names in the file.
   */
  describe('object prop members', () => {
    /** The shape the generator emits: the flat source name recorded on each member. */
    const objectProp = (members: Record<string, string>) => ({
      type: 'object',
      members: Object.fromEntries(
        Object.entries(members).map(([key, figmaName]) => [key, withName('string', figmaName)]),
      ),
    });

    it('reports a divergent member under a dotted key', async () => {
      const result = await runAnalyzer({
        dsCard: { props: { anObjectProp: objectProp({ label: 'AnObjectProp.Label' }) } },
      });
      expect(result!.byComponent.dsCard.props).toEqual([
        { key: 'anObjectProp.label', figmaName: 'AnObjectProp.Label', cause: 'casing', segment: 'AnObjectProp' },
      ]);
    });

    it('does not report the separator as a symbol problem', async () => {
      // Measuring the whole compound name would fail on the dot and report every
      // object-prop member in the library, naming an edit nobody should make.
      const result = await runAnalyzer({
        dsCard: { props: { margin: objectProp({ compact: 'Margin.Compact', expanded: 'Margin.Expanded' }) } },
      });
      expect(result!.summary.divergentNames).toBe(0);
      expect(result!.byComponent).toEqual({});
    });

    it('counts each member as a name, and the container as none', async () => {
      const result = await runAnalyzer({
        dsCard: {
          props: {
            margin: objectProp({ compact: 'Margin.Compact', expanded: 'Margin.Expanded' }),
            size: withName('string', 'Size'),
          },
        },
      });
      expect(result!.summary.totalNames).toBe(3);
    });

    it('names the failing segment when the other half is well formed', async () => {
      const result = await runAnalyzer({
        dsCard: { props: { margin: objectProp({ compact: 'Margin.Compact Thing' }) } },
      });
      expect(result!.byComponent.dsCard.props![0].segment).toBe('Compact Thing');
    });

    it('splits on the separator the workspace declared, not always a dot', async () => {
      const result = await runAnalyzer({
        dsCard: { props: { margin: objectProp({ compact: 'Margin/Compact Thing' }) } },
      }, 'SENTENCE', { separator: '/' });
      expect(result!.byComponent.dsCard.props).toEqual([
        { key: 'margin.compact', figmaName: 'Margin/Compact Thing', cause: 'casing', segment: 'Compact Thing' },
      ]);
    });

    it('aggregates a repeated member name across components', async () => {
      const props = { margin: objectProp({ compact: 'A11y label.Compact' }) };
      const result = await runAnalyzer({ dsAvatar: { props }, dsBadge: { props } });
      const entry = result!.byName.find(n => n.figmaName === 'A11y label.Compact')!;
      expect(entry.occurrences).toBe(2);
      expect(entry.cause).toBe('mixed-letter-digit');
    });

    it('splits a byName row when the same name is folded in one component and flat in another', async () => {
      // The fixture catalogue does exactly this: `objectProps` excludes some properties
      // from the fold, so one name is measured whole here and segment by segment there.
      // Keeping one row per name reported whichever cause arrived first, which
      // contradicted `byComponent` for every other component listed in that row.
      const result = await runAnalyzer({
        dsFolded: { props: { margin: objectProp({ compact: 'AnObjectProp.Compact' }) } },
        dsFlat: { props: { anobjectpropCompact: withName('string', 'AnObjectProp.Compact') } },
      });

      const rows = result!.byName.filter(n => n.figmaName === 'AnObjectProp.Compact');
      expect(rows).toEqual([
        { figmaName: 'AnObjectProp.Compact', occurrences: 1, components: ['dsFolded'], cause: 'casing', segment: 'AnObjectProp' },
        { figmaName: 'AnObjectProp.Compact', occurrences: 1, components: ['dsFlat'], cause: 'symbol' },
      ]);
    });

    it('treats a prop typed object with no members as an ordinary prop', async () => {
      const result = await runAnalyzer({
        dsCard: { props: { margin: { type: 'object', members: {}, ...withName('string', 'Start Icon') } } },
      });
      expect(result!.byComponent.dsCard.props).toEqual([
        { key: 'margin', figmaName: 'Start Icon', cause: 'casing' },
      ]);
    });
  });

  describe('cause classification', () => {
    it.each([
      ['Label   ', 'separator'],
      ['Cut & paste', 'symbol'],
      ['Étiquette', 'non-ascii'],
      ['A11y label', 'mixed-letter-digit'],
      ['0000 0000', 'digit-initial'],
      ['Start Icon', 'casing'],
      ['x-figmacollapse', 'already-a-key'],
    ])('classifies %s as %s', async (figmaName, expected) => {
      const result = await runAnalyzer({
        dsX: { anatomy: { k: withName('text', figmaName as string) } },
      });
      expect(result!.byComponent.dsX.anatomy![0].cause).toBe(expected);
    });

    it('ranks causes by frequency', async () => {
      const result = await runAnalyzer({
        dsA: { anatomy: { a: withName('text', 'Start Icon'), b: withName('text', 'End Icon') } },
        dsB: { anatomy: { c: withName('text', 'Cut & paste') } },
      });
      expect(result!.byCause[0]).toEqual({ cause: 'casing', occurrences: 2, names: ['End Icon', 'Start Icon'] });
      expect(result!.byCause[1].cause).toBe('symbol');
    });
  });
});
