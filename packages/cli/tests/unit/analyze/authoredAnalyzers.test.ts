// The two analyzers reading authored input rather than generated specs (ADR-118).
//
// Their reports answer different questions from every other analysis, so these
// tests pin the pivots that carry the judgment: which schema surfaces are cited
// most, and which prohibitions tell a reader to stop without saying what to do.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import yaml from 'yaml';
import { GuidelinesAnalyzer } from '../../../src/analyze/Guidelines.js';
import { SupplementalAnalyzer } from '../../../src/analyze/Supplemental.js';
import type { TransformerContext } from '../../../src/transforms/transformer.js';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'authored-analyze-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** A spec folder holding whichever authored documents the case needs. */
function specDir(key: string, docs: Record<string, unknown>): string {
  const dir = path.join(root, 'specs', 'components', key);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, doc] of Object.entries(docs)) {
    fs.writeFileSync(path.join(dir, `${name}.yaml`), yaml.stringify(doc));
  }
  return dir;
}

function context(key: string, dir: string): TransformerContext {
  return {
    specDir: dir,
    outputDir: dir,
    workspaceDir: root,
    specsRoot: path.join(root, 'specs'),
    componentKey: key,
    outputFormat: 'YAML',
  } as unknown as TransformerContext;
}

async function reportOf(name: string): Promise<Record<string, any>> {
  const file = path.join(root, 'specs', 'analysis', `${name}.yaml`);
  return yaml.parse(fs.readFileSync(file, 'utf-8'));
}

describe('supplemental analyzer', () => {
  it('groups by schema gap, counting the surface cited most first', async () => {
    const a = new SupplementalAnalyzer();
    const styles = 'styles.schema.json#/definitions/Styles';

    const button = specDir('button', {
      supplemental: {
        motion: [
          { intent: 'fades in', schemaGap: { path: styles, need: 'no transition key' }, platforms: ['web'], checkedBy: 'manual' },
          { intent: 'scales on press', schemaGap: { path: styles, need: 'no transform key' }, platforms: ['react'] },
        ],
      },
    });
    const icon = specDir('icon', {
      supplemental: {
        accessibility: [
          { intent: 'hidden when unlabelled', schemaGap: { path: styles, need: 'no transition key' }, checkedBy: 'automated', checks: [{ to: 't.ts' }] },
        ],
      },
    });
    const plain = specDir('badge', {});

    await a.run({}, context('button', button));
    await a.run({}, context('icon', icon));
    await a.run({}, context('badge', plain));
    await a.finalize(path.join(root, 'specs'), path.join(root, 'specs', 'analysis'), undefined, 'YAML');

    const report = await reportOf('supplemental');
    expect(report.summary.entries).toBe(3);
    expect(report.summary.componentsWithDocument).toBe(2);
    expect(report.summary.componentsWithout).toBe(1);
    expect(report.summary.schemaSurfacesCited).toBe(1);

    // One surface, cited by three entries across two components — the pivot that
    // turns authored judgment into a backlog for the schema.
    expect(report.bySchemaGap[0].path).toBe(styles);
    expect(report.bySchemaGap[0].entries).toBe(3);
    expect(report.bySchemaGap[0].components).toEqual(['button', 'icon']);
    expect(report.bySchemaGap[0].needs).toEqual(['no transform key', 'no transition key']);

    expect(report.summary.verified).toEqual({ automated: 1, assisted: 0, manual: 1, unstated: 1 });
    expect(report.coverage.without).toEqual(['badge']);
  });

  it('counts an unscoped entry toward every platform, since that is its reach', async () => {
    const a = new SupplementalAnalyzer();
    const dir = specDir('icon', {
      supplemental: {
        // No `platforms` — applies everywhere.
        accessibility: [{ intent: 'aria-hidden when unlabelled', schemaGap: { path: 'p', need: 'n' } }],
        motion: [{ intent: 'fades', schemaGap: { path: 'p', need: 'n' }, platforms: ['ios'] }],
      },
    });
    await a.run({}, context('icon', dir));
    await a.finalize(path.join(root, 'specs'), path.join(root, 'specs', 'analysis'), undefined, 'YAML');

    const byPlatform = (await reportOf('supplemental')).byPlatform as Array<{ platform: string; entries: number }>;
    const entriesFor = (p: string) => byPlatform.find(r => r.platform === p)?.entries;
    expect(entriesFor('react')).toBe(1);
    expect(entriesFor('android')).toBe(1);
    expect(entriesFor('ios')).toBe(2);
  });

  it('surfaces a pre-ADR-118 string schemaGap rather than under-counting it', async () => {
    const a = new SupplementalAnalyzer();
    const dir = specDir('badge', {
      supplemental: { props: [{ intent: 'x', schemaGap: 'styles.schema.json — no key' }] },
    });
    await a.run({}, context('badge', dir));
    await a.finalize(path.join(root, 'specs'), path.join(root, 'specs', 'analysis'), undefined, 'YAML');

    const report = await reportOf('supplemental');
    expect(report.summary.entries).toBe(1);
    expect(report.bySchemaGap[0].path).toBe('(unmigrated string schemaGap)');
  });
});

describe('guidelines analyzer', () => {
  it('reports the obligation distribution and the prohibitions with no remedy', async () => {
    const a = new GuidelinesAnalyzer();
    const dir = specDir('badge', {
      guidelines: {
        meta: { concern: 'badge', status: 'proposed' },
        slotComposition: [
          { statement: 'Use a badge for a changing value.', level: 'must-not', alternatives: [{ to: 'liveRegion' }] },
          // The failure the two remedy fields exist to prevent.
          { statement: 'Render an empty badge.', level: 'must-not' },
          { statement: 'Order a two-child fill glyph-first.', level: 'should' },
        ],
        styles: [
          { statement: 'Dim a badge.', level: 'should-not' },
          { statement: 'Use the inverse set together.', level: 'may' },
        ],
      },
    });
    await a.run({}, context('badge', dir));
    await a.finalize(path.join(root, 'specs'), path.join(root, 'specs', 'analysis'), undefined, 'YAML');

    const report = await reportOf('guidelines');
    expect(report.summary.rules).toBe(5);
    expect(report.summary.proposed).toBe(1);
    expect(report.summary.ratified).toBe(0);
    expect(report.summary.unverifiable).toBe(5);

    const byLevel = Object.fromEntries(
      (report.byLevel as Array<{ level: string; rules: number }>).map(r => [r.level, r.rules]),
    );
    expect(byLevel).toEqual({ 'must-not': 2, should: 1, 'should-not': 1, may: 1 });

    // Three prohibitions here; the two carrying no remedy are reported, ordered
    // by spec then concern — so slotComposition precedes styles.
    expect(report.prohibitionsWithoutRemedy).toHaveLength(2);
    expect(report.prohibitionsWithoutRemedy.map((p: any) => p.statement)).toEqual([
      'Render an empty badge.',
      'Dim a badge.',
    ]);

    expect(report.remedyForm).toEqual({ alternatives: 1, instead: 0, both: 0, none: 4 });
    expect(report.awaitingRatification).toEqual(['badge']);
  });

  it('reports an off-vocabulary level as itself rather than folding it in', async () => {
    const a = new GuidelinesAnalyzer();
    const dir = specDir('icon', {
      guidelines: { styles: [{ statement: 'x', level: 'never' }] },
    });
    await a.run({}, context('icon', dir));
    await a.finalize(path.join(root, 'specs'), path.join(root, 'specs', 'analysis'), undefined, 'YAML');

    const byLevel = (await reportOf('guidelines')).byLevel as Array<{ level: string }>;
    expect(byLevel.map(r => r.level)).toEqual(['never']);
  });

  // The catalogue and foundation scopes sit outside the per-spec walk, so they
  // are picked up in finalize or not at all. Without this the report omitted a
  // foundation's rules entirely, which is most of what it is for.
  it('picks up the catalogue and foundation scopes the spec walk never visits', async () => {
    const a = new GuidelinesAnalyzer();

    // Catalogue scope: every component.
    const components = path.join(root, 'specs', 'components');
    fs.mkdirSync(components, { recursive: true });
    fs.writeFileSync(
      path.join(components, 'guidelines.yaml'),
      yaml.stringify({ accessibility: [{ statement: 'Label every control.', level: 'must' }] }),
    );

    // Foundation scope, keyed by a foundation concern.
    const color = path.join(root, 'specs', 'foundations', 'color');
    fs.mkdirSync(color, { recursive: true });
    fs.writeFileSync(
      path.join(color, 'guidelines.yaml'),
      yaml.stringify({
        meta: { concern: 'color', status: 'proposed' },
        color: [{ statement: 'Style from a raw ramp step.', level: 'must-not' }],
        elevation: [{ statement: 'Assemble a shadow inline.', level: 'must' }],
      }),
    );

    const badge = specDir('badge', {
      guidelines: { props: [{ statement: 'Keep the label short.', level: 'should' }] },
    });
    await a.run({}, context('badge', badge));
    await a.finalize(path.join(root, 'specs'), path.join(root, 'specs', 'analysis'), undefined, 'YAML');

    const report = await reportOf('guidelines');
    expect(report.summary.specsWithDocument).toBe(3);
    expect(report.summary.rules).toBe(4);
    expect(report.coverage.withDocument).toEqual(['badge', 'components', 'foundations/color']);

    // A foundation concern key is reported as itself, not folded into a
    // component concern.
    const concerns = (report.byConcern as Array<{ concern: string }>).map(r => r.concern);
    expect(concerns).toContain('color');
    expect(concerns).toContain('elevation');
    expect(report.awaitingRatification).toContain('foundations/color');
  });

  it('treats an unparseable document as absent, leaving the finding to validate', async () => {
    const a = new GuidelinesAnalyzer();
    const dir = path.join(root, 'specs', 'components', 'broken');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'guidelines.yaml'), 'styles: [\n  - statement: "x"\n   level: must\n');

    await a.run({}, context('broken', dir));
    await a.finalize(path.join(root, 'specs'), path.join(root, 'specs', 'analysis'), undefined, 'YAML');

    const report = await reportOf('guidelines');
    expect(report.summary.specsWithDocument).toBe(0);
    expect(report.coverage.without).toEqual(['broken']);
  });
});
