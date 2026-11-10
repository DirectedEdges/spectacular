import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import type { AnalyzerFoundations, Transformer, TransformerContext } from '../transforms/transformer.js';
import { ANALYSIS_DIR } from '../utilities/specsLayout.js';

/**
 * Reports what the catalogue's `supplemental.yaml` documents say, pivoted
 * (ADR-118).
 *
 * The first analyzer whose input is **authored** rather than generated, and that
 * changes what the report is for. Every other analysis is a census of what a run
 * produced — this one measures a judgment someone made by hand, so the useful
 * questions are about coverage and concentration rather than totals:
 *
 * - `bySchemaGap` is the one to read first. Each entry names the surface that
 *   could not carry it, so the paths named most often are where the schema is
 *   failing the most authors. That is a backlog for the schema, derived from
 *   evidence rather than from anyone's recollection.
 * - `byConcern` and `byPlatform` say where the hand-written work clusters. A
 *   concern carrying entries for most of the catalogue is a candidate for a
 *   catalogue-scope entry instead of one per component.
 * - `coverage` names the components with no document at all. That is not a
 *   defect — most components need nothing — but a component with a long
 *   `checkedBy: manual` list and no automation is worth seeing.
 *
 * Reads components only. A composition declares no props and no variants, so it
 * has far less the schema can fail to carry, and rows for it would mostly be
 * empty by construction.
 */

/**
 * Every concern key a supplemental document may carry, across both scopes.
 *
 * A document is keyed for one vocabulary or the other and never both, but this
 * analyzer reads whatever it finds: scoping it to the component set alone would
 * silently drop every foundation entry, and a report that under-counts is worse
 * than one that spans two vocabularies.
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

const PLATFORMS = ['react', 'webcomponents', 'web', 'ios', 'android'] as const;

/** One entry, flattened with the component and concern it was found under. */
interface Entry {
  component: string;
  concern: string;
  intent: string;
  gapPath: string;
  gapNeed: string;
  platforms: string[];
  checkedBy?: string;
  checks: number;
}

interface Collected {
  component: string;
  /** Whether the component has a supplemental document at all. */
  present: boolean;
  entries: Entry[];
}

interface GapGroup {
  path: string;
  entries: number;
  components: string[];
  /** What each citing entry said the surface cannot express. */
  needs: string[];
}

interface SupplementalAggregate {
  summary: {
    componentsWithDocument: number;
    componentsWithout: number;
    entries: number;
    /** Distinct `schemaGap.path` values cited. */
    schemaSurfacesCited: number;
    verified: { automated: number; assisted: number; manual: number; unstated: number };
  };
  /** Schema surfaces by how many entries name them — the schema's evidenced backlog. */
  bySchemaGap: GapGroup[];
  byConcern: Array<{ concern: string; entries: number; components: string[] }>;
  byPlatform: Array<{ platform: string; entries: number; components: string[] }>;
  byComponent: Array<{
    component: string;
    entries: number;
    concerns: string[];
    platforms: string[];
    unverified: number;
  }>;
  coverage: { withDocument: string[]; without: string[] };
}

export class SupplementalAnalyzer implements Transformer {
  readonly name = 'supplemental';

  readonly readsKinds = ['component'] as const;

  private readonly _collected: Collected[] = [];
  private _outputFormat: 'JSON' | 'YAML' = 'JSON';

  async run(_apiYaml: Record<string, unknown>, context: TransformerContext): Promise<void> {
    this._outputFormat = context.outputFormat;
    this._collected.push(this.collect(context.componentKey, context.specDir));
  }

  private collect(component: string, specDir: string): Collected {
    const doc = readAuthored(specDir, 'supplemental');
    if (!doc) return { component, present: false, entries: [] };

    const entries: Entry[] = [];
    for (const concern of CONCERNS) {
      const section = doc[concern];
      if (!Array.isArray(section)) continue;
      for (const raw of section) {
        if (!raw || typeof raw !== 'object') continue;
        const entry = raw as Record<string, unknown>;
        const gap = (entry.schemaGap ?? {}) as Record<string, unknown>;
        entries.push({
          component,
          concern,
          intent: typeof entry.intent === 'string' ? entry.intent : '',
          // A string `schemaGap` is the pre-ADR-118 shape. Recorded under a
          // sentinel path rather than dropped, so a part-migrated catalogue is
          // visible in the report instead of silently under-counted.
          gapPath: typeof entry.schemaGap === 'string'
            ? '(unmigrated string schemaGap)'
            : typeof gap.path === 'string' ? gap.path : '(none stated)',
          gapNeed: typeof gap.need === 'string' ? gap.need : '',
          platforms: Array.isArray(entry.platforms)
            ? entry.platforms.filter((p): p is string => typeof p === 'string')
            : [],
          checkedBy: typeof entry.checkedBy === 'string' ? entry.checkedBy : undefined,
          checks: Array.isArray(entry.checks) ? entry.checks.length : 0,
        });
      }
    }
    return { component, present: true, entries };
  }

  async finalize(
    outputDir: string,
    analysisDir?: string,
    _foundations?: AnalyzerFoundations,
    outputFormat?: 'JSON' | 'YAML',
  ): Promise<void> {
    if (outputFormat) this._outputFormat = outputFormat;
    const outDir = analysisDir ?? path.join(outputDir, ANALYSIS_DIR);
    await fs.ensureDir(outDir);
    await writeReport(outDir, 'supplemental', this.buildAggregate(), this._outputFormat);
  }

  private buildAggregate(): SupplementalAggregate {
    const all = this._collected.flatMap(c => c.entries);
    const withDoc = this._collected.filter(c => c.present).map(c => c.component).sort();
    const without = this._collected.filter(c => !c.present).map(c => c.component).sort();

    const gaps = new Map<string, GapGroup>();
    for (const e of all) {
      const group = gaps.get(e.gapPath) ?? { path: e.gapPath, entries: 0, components: [], needs: [] };
      group.entries++;
      if (!group.components.includes(e.component)) group.components.push(e.component);
      if (e.gapNeed && !group.needs.includes(e.gapNeed)) group.needs.push(e.gapNeed);
      gaps.set(e.gapPath, group);
    }

    const verified = { automated: 0, assisted: 0, manual: 0, unstated: 0 };
    for (const e of all) {
      if (e.checkedBy === 'automated') verified.automated++;
      else if (e.checkedBy === 'assisted') verified.assisted++;
      else if (e.checkedBy === 'manual') verified.manual++;
      else verified.unstated++;
    }

    return {
      summary: {
        componentsWithDocument: withDoc.length,
        componentsWithout: without.length,
        entries: all.length,
        schemaSurfacesCited: gaps.size,
        verified,
      },
      bySchemaGap: [...gaps.values()]
        .map(g => ({ ...g, components: g.components.sort(), needs: g.needs.sort() }))
        .sort((a, b) => b.entries - a.entries || a.path.localeCompare(b.path)),
      byConcern: CONCERNS
        .map(concern => {
          const hits = all.filter(e => e.concern === concern);
          return { concern, entries: hits.length, components: unique(hits.map(e => e.component)) };
        })
        .filter(row => row.entries > 0),
      byPlatform: PLATFORMS
        .map(platform => {
          // An entry with no `platforms` applies everywhere, so it counts toward
          // every platform — reporting it as unscoped would understate the reach
          // of exactly the entries with the widest reach.
          const hits = all.filter(e => e.platforms.length === 0 || e.platforms.includes(platform));
          return { platform, entries: hits.length, components: unique(hits.map(e => e.component)) };
        })
        .filter(row => row.entries > 0),
      byComponent: this._collected
        .filter(c => c.entries.length > 0)
        .map(c => ({
          component: c.component,
          entries: c.entries.length,
          concerns: unique(c.entries.map(e => e.concern)),
          platforms: unique(c.entries.flatMap(e => e.platforms)),
          unverified: c.entries.filter(e => e.checkedBy === undefined).length,
        }))
        .sort((a, b) => b.entries - a.entries || a.component.localeCompare(b.component)),
      coverage: { withDocument: withDoc, without },
    };
  }
}

/** One authored document beside a spec, parsed, or undefined when absent. */
export function readAuthored(specDir: string, kind: string): Record<string, unknown> | undefined {
  for (const ext of ['yaml', 'yml'] as const) {
    const file = path.join(specDir, `${kind}.${ext}`);
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = yaml.parse(fs.readFileSync(file, 'utf-8'));
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
    } catch {
      // A document that does not parse is `specs validate`'s finding to report,
      // not this report's. Counting it as absent keeps the two from disagreeing
      // about the same file in different words.
      return undefined;
    }
  }
  return undefined;
}

export function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export async function writeReport(
  outDir: string,
  name: string,
  aggregate: unknown,
  format: 'JSON' | 'YAML',
): Promise<void> {
  const ext = format === 'JSON' ? 'json' : 'yaml';
  const content = format === 'JSON'
    ? JSON.stringify(aggregate, null, 2) + '\n'
    : yaml.stringify(aggregate, { lineWidth: 120 });
  await fs.writeFile(path.join(outDir, `${name}.${ext}`), content, 'utf-8');
}
