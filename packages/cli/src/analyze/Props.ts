import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import type { Transformer, TransformerContext } from '../transforms/transformer.js';
import { ANALYSIS_DIR } from '../utilities/specsLayout.js';

interface PropEntry {
  component: string;
  name: string;
  type: string;
  hasEnum: boolean;
  enumValues: string[] | null;
  enumCount: number;
  default: unknown;
  nullable: boolean;
  slotAnyOf: unknown[] | null;
  slotMinItems: number | null;
  slotMaxItems: number | null;
  figmaType: string | null;
}

interface PropsByComponent {
  [scopeKey: string]: PropEntry[];
}

interface PropNameEntry {
  name: string;
  occurrences: number;
  components: string[];
  types: string[];
  /**
   * Present, and only present, on a name whose components do not agree on the
   * type. A row carrying it is the row that must not be configured uniformly —
   * absent on every other row so a consistent prop reads exactly as before.
   */
  typeConflict?: true;
}

interface TypeSet {
  type: string;
  components: string[];
}

interface TypeDiscordanceEntry {
  propName: string;
  typeSets: TypeSet[];
}

/**
 * One way a name's value set is declared: a closed list, or left open.
 *
 * A union rather than an optional `values`, because an open declaration has no
 * value list to report — not an empty one.
 */
type EnumValueSet =
  | { values: string[]; components: string[] }
  | { open: true; components: string[] };

interface EnumDiscordanceEntry {
  propName: string;
  /** The declared type these value sets were compared within. */
  type: string;
  valueSets: EnumValueSet[];
  /**
   * Present, and only present, when some components close the value set for this
   * name and others leave it open. A closed set promises the reader every value
   * the prop accepts; an open one promises nothing — so the two cannot be
   * configured as one prop, even though both are the same declared type.
   */
  openAndClosed?: true;
}

interface ApiSurfaceEntry {
  component: string;
  props: number;
  enumValues: number;
  slots: number;
  booleans: number;
}

interface SlotEntry {
  component: string;
  name: string;
  anyOf: unknown[] | null;
  minItems: number | null;
  maxItems: number | null;
  nullable: boolean;
}

interface PropsAggregate {
  summary: {
    totalProps: number;
    totalComponents: number;
    uniquePropNames: number;
    typeDistribution: Record<string, number>;
  };
  propNameFrequency: PropNameEntry[];
  typeDiscordance: TypeDiscordanceEntry[];
  enumDiscordance: EnumDiscordanceEntry[];
  booleanNamingPatterns: Record<string, number>;
  apiSurface: ApiSurfaceEntry[];
  slots: SlotEntry[];
}

export class PropsAnalyzer implements Transformer {
  readonly name = 'props';

  private readonly _allProps: PropEntry[] = [];
  private _outputFormat: 'JSON' | 'YAML' = 'JSON';

  async run(apiYaml: Record<string, unknown>, context: TransformerContext): Promise<void> {
    const { componentKey, outputFormat } = context;
    this._outputFormat = outputFormat;

    const mainProps = extractProps(componentKey, apiYaml);
    this._allProps.push(...mainProps);

    const subcomponents = (apiYaml.subcomponents ?? {}) as Record<string, unknown>;
    for (const [subName, subRaw] of Object.entries(subcomponents)) {
      const scopeKey = `${componentKey}.${subName}`;
      this._allProps.push(...extractProps(scopeKey, subRaw as Record<string, unknown>));
    }
  }

  async finalize(outputDir: string, analysisDir?: string): Promise<void> {
    if (this._allProps.length === 0) return;

    const outDir = analysisDir ?? path.join(outputDir, ANALYSIS_DIR);
    await fs.ensureDir(outDir);

    const aggregate = buildAggregate(this._allProps);
    const ext = this._outputFormat === 'JSON' ? 'json' : 'yaml';
    const content = this._outputFormat === 'JSON'
      ? JSON.stringify(aggregate, null, 2) + '\n'
      : yaml.stringify(aggregate, { lineWidth: 120 });
    await fs.writeFile(path.join(outDir, `props.${ext}`), content, 'utf-8');
  }
}

/**
 * Whether a prop accepts null, applying the per-type default ADR-065 documents
 * for an absent `nullable`.
 *
 * Absent means `true` for the open-valued types — a string, number, slot or
 * image prop with no closed value set is understood to accept null — and `false`
 * for an enum or boolean, whose `enum` or two-value domain already enumerates
 * every accepted value. Testing for an explicit `true` reported the opposite of
 * the documented default for essentially every non-enum prop.
 *
 * MIRRORED in the transform packages' contract emission. A change here must land
 * there too, or a spec's contract and its analysis disagree about the same prop.
 */
export function propIsNullable(prop: Record<string, unknown>): boolean {
  if (typeof prop.nullable === 'boolean') return prop.nullable;
  if (Array.isArray(prop.enum)) return false;
  return prop.type !== 'boolean';
}

function extractProps(scopeKey: string, comp: Record<string, unknown>): PropEntry[] {
  const results: PropEntry[] = [];
  const props = (comp.props ?? {}) as Record<string, unknown>;
  for (const [name, raw] of Object.entries(props)) {
    const prop = raw as Record<string, unknown>;
    // An object prop (ADR-111) reports its members, each a scalar prop row under
    // `prop.member` — a bare `object` row says nothing a reader can act on.
    if (prop.type === 'object' && prop.members && typeof prop.members === 'object') {
      for (const [memberKey, member] of Object.entries(prop.members as Record<string, Record<string, unknown>>)) {
        results.push(...extractProps(scopeKey, { props: { [`${name}.${memberKey}`]: member } }));
      }
      continue;
    }
    const extensions = prop.$extensions as Record<string, unknown> | undefined;
    const figmaExt = extensions?.['com.figma'] as Record<string, unknown> | undefined;
    results.push({
      component: scopeKey,
      name,
      type: (prop.type as string) ?? 'string',
      hasEnum: Array.isArray(prop.enum),
      enumValues: Array.isArray(prop.enum) ? (prop.enum as string[]) : null,
      enumCount: Array.isArray(prop.enum) ? prop.enum.length : 0,
      default: prop.default ?? null,
      nullable: propIsNullable(prop),
      slotAnyOf: Array.isArray(prop.anyOf) ? (prop.anyOf as unknown[]) : null,
      slotMinItems: typeof prop.minItems === 'number' ? prop.minItems : null,
      slotMaxItems: typeof prop.maxItems === 'number' ? prop.maxItems : null,
      figmaType: typeof figmaExt?.type === 'string' ? figmaExt.type : null,
    });
  }
  return results;
}

function buildAggregate(results: PropEntry[]): PropsAggregate {
  const totalComponents = new Set(results.map(r => r.component)).size;

  const typeDist: Record<string, number> = {};
  for (const r of results) {
    typeDist[r.type] = (typeDist[r.type] ?? 0) + 1;
  }

  const nameIndex = new Map<string, PropEntry[]>();
  for (const r of results) {
    const entries = nameIndex.get(r.name) ?? [];
    entries.push(r);
    nameIndex.set(r.name, entries);
  }

  const propNameFrequency: PropNameEntry[] = [...nameIndex.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, entries]) => {
      const types = [...new Set(entries.map(e => e.type))];
      return {
        name,
        occurrences: entries.length,
        components: entries.map(e => e.component),
        types,
        ...(types.length > 1 ? { typeConflict: true as const } : {}),
      };
    });

  // A name two components spell with different types is read as one prop and is
  // not one: a `placeholder` that is text here and a flag there cannot be
  // configured once. The frequency row already carried both types and said
  // nothing about the disagreement, so states, accessibility and slot decisions
  // were made from a row that looked like every other. Which component holds
  // which type is what separates a real divergence from two unrelated props that
  // happen to share a name.
  const typeDiscordance: TypeDiscordanceEntry[] = [];
  for (const [name, entries] of nameIndex.entries()) {
    const byType = new Map<string, TypeSet>();
    for (const e of entries) {
      const existing = byType.get(e.type);
      if (existing) existing.components.push(e.component);
      else byType.set(e.type, { type: e.type, components: [e.component] });
    }
    if (byType.size > 1) typeDiscordance.push({ propName: name, typeSets: [...byType.values()] });
  }

  // Value sets are compared within one declared type, never across two. A name
  // that is a boolean here and a string there is a type conflict, reported above;
  // pairing its boolean against the other's enum would report the same divergence
  // twice and in the weaker of the two places. Within a type, two things can
  // disagree — which values the closed sets hold, and whether the set is closed
  // at all — and a name can do both at once, so neither is a mode of the other.
  const enumDiscordance: EnumDiscordanceEntry[] = [];
  for (const [name, entries] of nameIndex.entries()) {
    const byType = new Map<string, PropEntry[]>();
    for (const e of entries) {
      const group = byType.get(e.type) ?? [];
      group.push(e);
      byType.set(e.type, group);
    }

    for (const [type, group] of byType.entries()) {
      const closed = new Map<string, { values: string[]; components: string[] }>();
      const open: string[] = [];
      for (const e of group) {
        if (!e.hasEnum || !e.enumValues) {
          open.push(e.component);
          continue;
        }
        const key = [...e.enumValues].sort().join('|');
        const existing = closed.get(key);
        if (existing) existing.components.push(e.component);
        else closed.set(key, { values: e.enumValues, components: [e.component] });
      }

      // Nothing to report where no component closed the set, or where the one
      // closed set is the only declaration there is.
      const openAndClosed = closed.size >= 1 && open.length > 0;
      if (closed.size < 2 && !openAndClosed) continue;

      const valueSets: EnumValueSet[] = [...closed.values()];
      if (open.length > 0) valueSets.push({ open: true, components: open });
      enumDiscordance.push({
        propName: name,
        type,
        valueSets,
        ...(openAndClosed ? { openAndClosed: true as const } : {}),
      });
    }
  }

  const boolPatterns: Record<string, number> = { isPrefix: 0, hasPrefix: 0, canPrefix: 0, bare: 0 };
  for (const r of results.filter(r => r.type === 'boolean')) {
    if (/^is[A-Z]/.test(r.name)) boolPatterns.isPrefix++;
    else if (/^has[A-Z]/.test(r.name)) boolPatterns.hasPrefix++;
    else if (/^can[A-Z]/.test(r.name)) boolPatterns.canPrefix++;
    else boolPatterns.bare++;
  }

  const compMap = new Map<string, ApiSurfaceEntry>();
  for (const r of results) {
    const entry = compMap.get(r.component) ?? { component: r.component, props: 0, enumValues: 0, slots: 0, booleans: 0 };
    entry.props++;
    entry.enumValues += r.enumCount;
    if (r.type === 'slot') entry.slots++;
    if (r.type === 'boolean') entry.booleans++;
    compMap.set(r.component, entry);
  }
  const apiSurface: ApiSurfaceEntry[] = [...compMap.values()].sort((a, b) => b.props - a.props);

  const slots: SlotEntry[] = results
    .filter(r => r.type === 'slot')
    .map(r => ({
      component: r.component,
      name: r.name,
      anyOf: r.slotAnyOf,
      minItems: r.slotMinItems,
      maxItems: r.slotMaxItems,
      nullable: r.nullable,
    }));

  return {
    summary: { totalProps: results.length, totalComponents, uniquePropNames: nameIndex.size, typeDistribution: typeDist },
    propNameFrequency,
    typeDiscordance,
    enumDiscordance,
    booleanNamingPatterns: boolPatterns,
    apiSurface,
    slots,
  };
}
