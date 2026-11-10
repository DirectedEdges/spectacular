import fs from 'fs-extra';
import path from 'path';
import type { AnalyzerFoundations, Transformer, TransformerContext } from '../transforms/transformer.js';
import { ANALYSIS_DIR } from '../utilities/specsLayout.js';
import { authoredScopes } from '../utilities/authoredScopes.js';
import { readAuthored, unique, writeReport } from './Supplemental.js';

/**
 * Reports what the catalogue's `guidelines.yaml` documents say, pivoted
 * (ADR-118).
 *
 * Authored input, so the report measures a judgment rather than counting what a
 * run produced. The pivots that earn their place:
 *
 * - `byLevel` is the distribution of obligation. A catalogue where almost
 *   everything is `must` has not been calibrated — it has been written
 *   emphatically — and one where almost nothing is tells a consumer nothing is
 *   actually required.
 * - `prohibitionsWithoutRemedy` is the actionable list. A `must-not` or
 *   `should-not` that carries neither `alternatives` nor `instead` tells a
 *   reader to stop without telling them what to do, which is the failure mode
 *   the two remedy fields exist to prevent.
 * - `unverifiable` counts rules with no `checkedBy` at all. Not a defect — most
 *   guidance is judged by people — but it bounds how much of the catalogue's
 *   guidance could ever be enforced mechanically.
 * - `byConcern` and `coverage` say where guidance clusters and where it is
 *   absent.
 *
 * Reads both kinds. Unlike the supplemental analysis, a composition has as much
 * to say about its own use as a component does.
 */

/**
 * Every concern key a guidelines document may carry, across both scopes. Read
 * together for the same reason the supplemental analysis does: scoping to one
 * vocabulary would silently drop the other scope's rules.
 */
const CONCERNS = [
  // Component scope.
  'anatomy', 'props', 'styles', 'slotComposition', 'events', 'accessibility',
  'behavior', 'overrides', 'naming',
  // Foundation scope.
  'color', 'typography', 'space', 'shape', 'elevation', 'brand',
  // In both vocabularies.
  'motion', 'layout',
] as const;

const LEVELS = ['must', 'must-not', 'should', 'should-not', 'may'] as const;

type Level = (typeof LEVELS)[number];

const PROHIBITIONS: readonly string[] = ['must-not', 'should-not'];

interface Rule {
  spec: string;
  concern: string;
  statement: string;
  level: string;
  hasAlternatives: boolean;
  hasInstead: boolean;
  checkedBy?: string;
}

interface Collected {
  spec: string;
  present: boolean;
  status?: string;
  rules: Rule[];
}

interface GuidelinesAggregate {
  summary: {
    specsWithDocument: number;
    specsWithout: number;
    rules: number;
    proposed: number;
    ratified: number;
    unverifiable: number;
  };
  byLevel: Array<{ level: string; rules: number; specs: string[] }>;
  /** A prohibition with no remedy: stop, with no statement of what to do instead. */
  prohibitionsWithoutRemedy: Array<{ spec: string; concern: string; level: string; statement: string }>;
  /** How a remedy is expressed, when one is given. */
  remedyForm: { alternatives: number; instead: number; both: number; none: number };
  byConcern: Array<{ concern: string; rules: number; specs: string[]; levels: string[] }>;
  bySpec: Array<{ spec: string; rules: number; concerns: string[]; levels: string[]; status?: string }>;
  coverage: { withDocument: string[]; without: string[] };
  /** Documents still `proposed` — guidance a ratifier has not yet adopted. */
  awaitingRatification: string[];
}

export class GuidelinesAnalyzer implements Transformer {
  readonly name = 'guidelines';

  readonly readsKinds = ['component', 'composition'] as const;

  private readonly _collected: Collected[] = [];
  private _outputFormat: 'JSON' | 'YAML' = 'JSON';

  async run(_apiYaml: Record<string, unknown>, context: TransformerContext): Promise<void> {
    this._outputFormat = context.outputFormat;
    this._collected.push(this.collect(context.componentKey, context.specDir));
  }

  private collect(spec: string, specDir: string): Collected {
    const doc = readAuthored(specDir, 'guidelines');
    if (!doc) return { spec, present: false, rules: [] };

    const meta = (doc.meta ?? {}) as Record<string, unknown>;
    const rules: Rule[] = [];
    for (const concern of CONCERNS) {
      const section = doc[concern];
      if (!Array.isArray(section)) continue;
      for (const raw of section) {
        if (!raw || typeof raw !== 'object') continue;
        const rule = raw as Record<string, unknown>;
        rules.push({
          spec,
          concern,
          statement: typeof rule.statement === 'string' ? rule.statement : '',
          // An off-vocabulary level — `never`, `warn`, `avoid` — is reported as
          // itself rather than normalized, so a part-migrated catalogue shows up
          // here instead of being quietly folded into the nearest valid level.
          level: typeof rule.level === 'string' ? rule.level : '(none stated)',
          hasAlternatives: Array.isArray(rule.alternatives) && rule.alternatives.length > 0,
          hasInstead: typeof rule.instead === 'string' && rule.instead.length > 0,
          checkedBy: typeof rule.checkedBy === 'string' ? rule.checkedBy : undefined,
        });
      }
    }
    return {
      spec,
      present: true,
      status: typeof meta.status === 'string' ? meta.status : undefined,
      rules,
    };
  }

  async finalize(
    outputDir: string,
    analysisDir?: string,
    _foundations?: AnalyzerFoundations,
    outputFormat?: 'JSON' | 'YAML',
  ): Promise<void> {
    if (outputFormat) this._outputFormat = outputFormat;
    // `outputDir` is the specs root. The catalogue and foundation scopes sit
    // outside the per-spec folders the walk visits, so they are collected here
    // or not at all — and a foundation's rules are most of what this report is
    // for, which made the omission worth fixing rather than noting.
    this.collectScopes(outputDir);
    const outDir = analysisDir ?? path.join(outputDir, ANALYSIS_DIR);
    await fs.ensureDir(outDir);
    await writeReport(outDir, 'guidelines', this.buildAggregate(), this._outputFormat);
  }

  /** The catalogue and foundation scopes, each folded in as its own row. */
  private collectScopes(specsRoot: string): void {
    for (const scope of authoredScopes(specsRoot)) {
      const label = scope.label.replace(/\/$/, '');
      if (this._collected.some(c => c.spec === label)) continue;
      const collected = this.collect(label, scope.dir);
      if (collected.present) this._collected.push(collected);
    }
  }

  private buildAggregate(): GuidelinesAggregate {
    const all = this._collected.flatMap(c => c.rules);
    const withDoc = this._collected.filter(c => c.present).map(c => c.spec).sort();
    const without = this._collected.filter(c => !c.present).map(c => c.spec).sort();

    // Every level actually present, so an off-vocabulary one is visible rather
    // than dropped by iterating the valid set alone.
    const levelsSeen = unique([...LEVELS as readonly string[], ...all.map(r => r.level)])
      .filter(level => all.some(r => r.level === level));

    const remedyForm = { alternatives: 0, instead: 0, both: 0, none: 0 };
    for (const r of all) {
      if (r.hasAlternatives && r.hasInstead) remedyForm.both++;
      else if (r.hasAlternatives) remedyForm.alternatives++;
      else if (r.hasInstead) remedyForm.instead++;
      else remedyForm.none++;
    }

    return {
      summary: {
        specsWithDocument: withDoc.length,
        specsWithout: without.length,
        rules: all.length,
        proposed: this._collected.filter(c => c.status === 'proposed').length,
        ratified: this._collected.filter(c => c.status === 'ratified').length,
        unverifiable: all.filter(r => r.checkedBy === undefined).length,
      },
      byLevel: levelsSeen.map(level => {
        const hits = all.filter(r => r.level === level);
        return { level, rules: hits.length, specs: unique(hits.map(r => r.spec)) };
      }),
      prohibitionsWithoutRemedy: all
        .filter(r => PROHIBITIONS.includes(r.level) && !r.hasAlternatives && !r.hasInstead)
        .map(r => ({ spec: r.spec, concern: r.concern, level: r.level, statement: r.statement }))
        .sort((a, b) => a.spec.localeCompare(b.spec) || a.concern.localeCompare(b.concern)),
      remedyForm,
      byConcern: CONCERNS
        .map(concern => {
          const hits = all.filter(r => r.concern === concern);
          return {
            concern,
            rules: hits.length,
            specs: unique(hits.map(r => r.spec)),
            levels: unique(hits.map(r => r.level)),
          };
        })
        .filter(row => row.rules > 0),
      bySpec: this._collected
        .filter(c => c.rules.length > 0)
        .map(c => ({
          spec: c.spec,
          rules: c.rules.length,
          concerns: unique(c.rules.map(r => r.concern)),
          levels: unique(c.rules.map(r => r.level)),
          status: c.status,
        }))
        .sort((a, b) => b.rules - a.rules || a.spec.localeCompare(b.spec)),
      coverage: { withDocument: withDoc, without },
      awaitingRatification: this._collected
        .filter(c => c.present && c.status !== 'ratified')
        .map(c => c.spec)
        .sort(),
    };
  }
}

/** Re-exported so the level vocabulary has one definition in the analyze layer. */
export type { Level };
