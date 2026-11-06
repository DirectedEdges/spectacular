import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import type { AnalyzerFoundations, Transformer, TransformerContext } from '../transforms/transformer.js';
import { ANALYSIS_DIR } from '../utilities/specsLayout.js';

type StylingCategory = 'VARIABLES' | 'COLOR_STYLES' | 'TEXT_STYLES' | 'EFFECT_STYLES';
type RawValue = string | number | boolean;

interface StylingRow {
  category: StylingCategory;
  name: string;
  appliedAs: string;
  rawValue?: RawValue;
  appliedTo: Map<string, number>;
}

interface StylingRowJson {
  name: string;
  appliedAs: string;
  rawValue?: RawValue;
  appliedTo: Record<string, number>;
}

interface StylingJson {
  variables: StylingRowJson[];
  colorStyles: StylingRowJson[];
  textStyles: StylingRowJson[];
  effectStyles: StylingRowJson[];
}

interface ByTokenEntry {
  component: string;
  appliedAs: string;
  appliedTo: Record<string, number>;
}

interface UnusedCategorySummary {
  total: number;
  used: number;
  unused: number;
}

interface UnusedJson {
  summary: Record<keyof StylingJson, UnusedCategorySummary>;
  variables: string[];
  colorStyles: string[];
  textStyles: string[];
  effectStyles: string[];
}

const STYLE_TYPE_CATEGORY: Record<string, keyof StylingJson> = {
  FILL: 'colorStyles',
  TEXT: 'textStyles',
  EFFECT: 'effectStyles',
};

const CATEGORY_ORDER: StylingCategory[] = ['VARIABLES', 'COLOR_STYLES', 'TEXT_STYLES', 'EFFECT_STYLES'];

const CATEGORY_KEYS: Array<keyof StylingJson> = ['variables', 'colorStyles', 'textStyles', 'effectStyles'];

const CATEGORY_FOR_KEY: Record<keyof StylingJson, StylingCategory> = {
  variables: 'VARIABLES',
  colorStyles: 'COLOR_STYLES',
  textStyles: 'TEXT_STYLES',
  effectStyles: 'EFFECT_STYLES',
};

/**
 * `spec.tokens` profiles that serialize a reference to its name alone.
 *
 * Under these a style value is an ordinary string, indistinguishable by shape
 * from a literal like `CENTER` — so a name is only read as a reference when the
 * fetched token universe contains it.
 */
const NAME_SHAPED_PROFILES = new Set(['TOKEN_NAME', 'FIGMA_NAME']);

const CATEGORY_KEY: Record<StylingCategory, keyof StylingJson> = {
  VARIABLES: 'variables',
  COLOR_STYLES: 'colorStyles',
  TEXT_STYLES: 'textStyles',
  EFFECT_STYLES: 'effectStyles',
};

export class StylingAnalyzer implements Transformer {
  readonly name = 'styling';
  // A composition is the clearest dependency data a library has — a screen states
  // which components it is built from — and it carries real styling of its own.
  readonly readsKinds = ['component', 'composition'] as const;
  readonly perComponentOutput = 'styling';

  // Flat map: "componentKey" and "componentKey.subName" entries stored together.
  private readonly _componentData = new Map<string, StylingJson>();
  private _outputFormat: 'JSON' | 'YAML' = 'JSON';
  /** Token name → category, for the name-shaped profiles. Built once per run. */
  private _nameIndex: Map<string, StylingCategory> | null = null;

  async run(apiYaml: Record<string, unknown>, context: TransformerContext): Promise<void> {
    const { outputDir, componentKey, outputFormat, tokensFormat, foundations } = context;
    this._outputFormat = outputFormat;

    // Only built for the profiles that need it, and only once per run — the
    // universe is the same for every spec this analyzer visits.
    if (NAME_SHAPED_PROFILES.has(tokensFormat) && foundations && !this._nameIndex) {
      this._nameIndex = buildNameIndex(foundations);
    }
    const nameIndex = NAME_SHAPED_PROFILES.has(tokensFormat) ? this._nameIndex : null;

    const anatomy = (apiYaml.anatomy ?? {}) as Record<string, unknown>;
    const elementTypes = extractElementTypes(anatomy);

    // In split-concerns output, variant/default element styling lives in variants.yaml.
    // Fall back to apiYaml itself for single-file format.
    const variantsYaml = await loadVariantsYaml(outputDir);
    const source = variantsYaml ?? apiYaml;

    // Build one StylingJson per scope: top-level component + each subcomponent.
    const scopes = new Map<string, StylingJson>();

    const topRows = new Map<string, StylingRow>();
    collectDefaultAndVariants(source, elementTypes, topRows, nameIndex);
    scopes.set(componentKey, buildStylingJson(topRows));

    const apiSubcomponents = (apiYaml.subcomponents ?? {}) as Record<string, unknown>;
    const sourceSubcomponents = (source.subcomponents ?? {}) as Record<string, unknown>;
    for (const [subName, subSource] of Object.entries(sourceSubcomponents)) {
      const subApiEntry = apiSubcomponents[subName] as Record<string, unknown> | undefined;
      const subAnatomy = (subApiEntry?.anatomy ?? {}) as Record<string, unknown>;
      const subElementTypes = extractElementTypes(subAnatomy);
      const subRows = new Map<string, StylingRow>();
      collectDefaultAndVariants(subSource as Record<string, unknown>, subElementTypes, subRows, nameIndex);
      scopes.set(`${componentKey}.${subName}`, buildStylingJson(subRows));
    }

    // Persist each scope to _componentData and write the per-component file.
    const fileOutput: Record<string, StylingJson> = {};
    for (const [scopeKey, data] of scopes) {
      this._componentData.set(scopeKey, data);
      fileOutput[scopeKey] = data;
    }

    const ext = this._outputFormat === 'YAML' ? 'yaml' : 'json';
    const outputPath = path.join(outputDir, `styling.${ext}`);
    const content = this._outputFormat === 'YAML'
      ? yaml.stringify(fileOutput, { lineWidth: 120 })
      : JSON.stringify(fileOutput, null, 2) + '\n';
    await fs.writeFile(outputPath, content, 'utf-8');
  }

  async finalize(outputDir: string, analysisDir?: string, foundations?: AnalyzerFoundations): Promise<void> {
    if (this._componentData.size === 0) return;

    const outDir = analysisDir ?? path.join(outputDir, ANALYSIS_DIR);
    await fs.ensureDir(outDir);

    await this._writeByComponent(outDir);
    await this._writeByToken(outDir);
    if (foundations) {
      await this._writeUnused(outDir, foundations);
    }
  }

  private async _writeByComponent(dictDir: string): Promise<void> {
    const out: Record<string, StylingJson> = {};
    for (const [key, data] of Array.from(this._componentData.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      out[key] = stripRawValues(data);
    }
    const ext = this._outputFormat === 'YAML' ? 'yaml' : 'json';
    const content = this._outputFormat === 'YAML'
      ? yaml.stringify(out, { lineWidth: 120 })
      : JSON.stringify(out, null, 2) + '\n';
    await fs.writeFile(path.join(dictDir, `styling.byComponent.${ext}`), content, 'utf-8');
  }

  private async _writeByToken(dictDir: string): Promise<void> {
    const collected: Record<keyof StylingJson, Map<string, ByTokenEntry[]>> = {
      variables: new Map(),
      colorStyles: new Map(),
      textStyles: new Map(),
      effectStyles: new Map(),
    };

    for (const [scopeKey, data] of Array.from(this._componentData.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      for (const groupKey of CATEGORY_KEYS) {
        for (const row of data[groupKey]) {
          const entries = collected[groupKey].get(row.name) ?? [];
          entries.push({ component: scopeKey, appliedAs: row.appliedAs, appliedTo: row.appliedTo });
          collected[groupKey].set(row.name, entries);
        }
      }
    }

    // Token names are the reader's index into this report, so each set is keyed
    // in ascending name order rather than in the order the walk met them.
    const out: Record<keyof StylingJson, Record<string, ByTokenEntry[]>> = {
      variables: {},
      colorStyles: {},
      textStyles: {},
      effectStyles: {},
    };
    for (const groupKey of CATEGORY_KEYS) {
      for (const name of Array.from(collected[groupKey].keys()).sort((a, b) => a.localeCompare(b))) {
        out[groupKey][name] = collected[groupKey].get(name)!;
      }
    }

    const ext = this._outputFormat === 'YAML' ? 'yaml' : 'json';
    const content = this._outputFormat === 'YAML'
      ? yaml.stringify(out, { lineWidth: 120 })
      : JSON.stringify(out, null, 2) + '\n';
    await fs.writeFile(path.join(dictDir, `styling.byToken.${ext}`), content, 'utf-8');
  }

  private async _writeUnused(dictDir: string, foundations: AnalyzerFoundations): Promise<void> {
    // Token names referenced anywhere in the analyzed specs, across all
    // categories — a token counts as used regardless of how it was classified.
    const used = new Set<string>();
    for (const data of this._componentData.values()) {
      for (const groupKey of CATEGORY_KEYS) {
        for (const row of data[groupKey]) used.add(row.name);
      }
    }

    const universe = tokenUniverse(foundations);

    const out: UnusedJson = {
      summary: {
        variables: { total: 0, used: 0, unused: 0 },
        colorStyles: { total: 0, used: 0, unused: 0 },
        textStyles: { total: 0, used: 0, unused: 0 },
        effectStyles: { total: 0, used: 0, unused: 0 },
      },
      variables: [],
      colorStyles: [],
      textStyles: [],
      effectStyles: [],
    };

    for (const groupKey of CATEGORY_KEYS) {
      const unused = Array.from(universe[groupKey])
        .filter(name => !used.has(name))
        .sort((a, b) => a.localeCompare(b));
      const total = universe[groupKey].size;
      out.summary[groupKey] = { total, used: total - unused.length, unused: unused.length };
      out[groupKey] = unused;
    }

    const ext = this._outputFormat === 'YAML' ? 'yaml' : 'json';
    const content = this._outputFormat === 'YAML'
      ? yaml.stringify(out, { lineWidth: 120 })
      : JSON.stringify(out, null, 2) + '\n';
    await fs.writeFile(path.join(dictDir, `styling.unused.${ext}`), content, 'utf-8');
  }
}

function buildStylingJson(rows: Map<string, StylingRow>): StylingJson {
  const sorted = Array.from(rows.values()).sort(compareRows);
  const output: StylingJson = { variables: [], colorStyles: [], textStyles: [], effectStyles: [] };
  for (const row of sorted) {
    const appliedTo: Record<string, number> = Object.fromEntries(
      Array.from(row.appliedTo.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    );
    const jsonRow: StylingRowJson = { name: row.name, appliedAs: row.appliedAs, appliedTo };
    if (row.rawValue !== undefined) jsonRow.rawValue = row.rawValue;
    output[CATEGORY_KEY[row.category]].push(jsonRow);
  }
  return output;
}

function stripRawValues(data: StylingJson): StylingJson {
  const strip = (rows: StylingRowJson[]): StylingRowJson[] =>
    rows.map(({ rawValue: _omit, ...rest }) => rest);
  return {
    variables: strip(data.variables),
    colorStyles: strip(data.colorStyles),
    textStyles: strip(data.textStyles),
    effectStyles: strip(data.effectStyles),
  };
}

async function loadVariantsYaml(outputDir: string): Promise<Record<string, unknown> | null> {
  const variantsPath = path.join(outputDir, 'variants.yaml');
  if (!fs.existsSync(variantsPath)) return null;
  const raw = await fs.readFile(variantsPath, 'utf-8');
  return yaml.parse(raw) as Record<string, unknown>;
}

function extractElementTypes(anatomy: Record<string, unknown>): Map<string, string> {
  const types = new Map<string, string>();
  for (const [name, raw] of Object.entries(anatomy)) {
    const entry = raw as Record<string, unknown>;
    if (typeof entry.type === 'string') {
      types.set(name, entry.type);
    }
  }
  return types;
}

function collectDefaultAndVariants(
  source: Record<string, unknown>,
  elementTypes: Map<string, string>,
  rows: Map<string, StylingRow>,
  nameIndex: Map<string, StylingCategory> | null
): void {
  const defaultSection = source.default as Record<string, unknown> | undefined;
  if (defaultSection?.elements) {
    collectElements(defaultSection.elements as Record<string, unknown>, elementTypes, rows, nameIndex);
  }
  const variants = (source.variants ?? []) as Array<Record<string, unknown>>;
  for (const variant of variants) {
    if (variant.elements) {
      collectElements(variant.elements as Record<string, unknown>, elementTypes, rows, nameIndex);
    }
  }
}

function collectElements(
  elements: Record<string, unknown>,
  elementTypes: Map<string, string>,
  rows: Map<string, StylingRow>,
  nameIndex: Map<string, StylingCategory> | null
): void {
  for (const [elementName, raw] of Object.entries(elements)) {
    const element = raw as Record<string, unknown>;
    const styles = element.styles as Record<string, unknown> | undefined;
    if (!styles) continue;

    const elementType = elementTypes.get(elementName) ?? 'container';

    for (const [styleKey, styleValue] of Object.entries(styles)) {
      collectTokens(elementName, [styleKey], styleValue, elementType, rows, nameIndex);
    }
  }
}

function collectTokens(
  elementName: string,
  keyPath: string[],
  value: unknown,
  elementType: string,
  rows: Map<string, StylingRow>,
  nameIndex: Map<string, StylingCategory> | null
): void {
  if (value === null || value === undefined) return;

  const addRow = (category: StylingCategory, name: string, rawValue?: RawValue): void => {
    const appliedAs = keyPath.join('.');
    const rowKey = `${category}\x00${name}\x00${appliedAs}`;
    const existing = rows.get(rowKey);
    if (existing) {
      existing.appliedTo.set(elementName, (existing.appliedTo.get(elementName) ?? 0) + 1);
    } else {
      rows.set(rowKey, { category, name, appliedAs, rawValue, appliedTo: new Map([[elementName, 1]]) });
    }
  };

  const tokenRef = asTokenReference(value);
  if (tokenRef) {
    const { name, rawValue, category } = resolveToken(tokenRef, keyPath, elementType);
    addRow(category, name, rawValue);
    return;
  }

  // Under a name-shaped profile the reference is the name itself. Only a string
  // the fetched universe knows is a reference; everything else is a literal.
  if (nameIndex && typeof value === 'string') {
    const category = nameIndex.get(value);
    if (category) addRow(category, value);
    return;
  }

  if (Array.isArray(value)) {
    // Don't push array index into keyPath — sibling items share the same appliedAs.
    for (const item of value) {
      collectTokens(elementName, keyPath, item, elementType, rows, nameIndex);
    }
    return;
  }

  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectTokens(elementName, [...keyPath, key], child, elementType, rows, nameIndex);
    }
  }
}

/**
 * Token name → category, over the whole fetched universe.
 *
 * Names are built the same way `tokenUniverse` builds them, so a spec value and
 * an index key are the same string. A name carried by both a variable and a
 * style resolves to the variable, matching the precedence `CATEGORY_ORDER` sets
 * everywhere else in this report.
 */
function buildNameIndex(foundations: AnalyzerFoundations): Map<string, StylingCategory> {
  const universe = tokenUniverse(foundations);
  const index = new Map<string, StylingCategory>();
  for (const groupKey of [...CATEGORY_KEYS].reverse()) {
    for (const name of universe[groupKey]) index.set(name, CATEGORY_FOR_KEY[groupKey]);
  }
  return index;
}

/**
 * Every token name the fetched data defines, grouped by category and named
 * exactly as the transformer names `$token` references: collection-prefixed
 * variables, raw names for styles. Sets dedupe the dual-indexed styles map.
 */
function tokenUniverse(foundations: AnalyzerFoundations): Record<keyof StylingJson, Set<string>> {
  const universe: Record<keyof StylingJson, Set<string>> = {
    variables: new Set(),
    colorStyles: new Set(),
    textStyles: new Set(),
    effectStyles: new Set(),
  };

  for (const variable of foundations.variables.values()) {
    const collectionName = foundations.collections.get(variable.variableCollectionId)?.name;
    const prefix = collectionName ?? '[collection-name-unresolved]';
    universe.variables.add(`${prefix}/${variable.name}`);
  }

  for (const style of foundations.styles.values()) {
    const category = STYLE_TYPE_CATEGORY[style.type];
    if (category) universe[category].add(style.name);
  }

  return universe;
}

interface TokenRef {
  $token: string;
  $type: string;
  $extensions?: { 'com.figma'?: { rawValue?: RawValue } };
}

function asTokenReference(value: unknown): TokenRef | null {
  if (
    value !== null &&
    typeof value === 'object' &&
    '$token' in (value as object) &&
    '$type' in (value as object)
  ) {
    return value as TokenRef;
  }
  return null;
}

function resolveToken(
  ref: TokenRef,
  keyPath: string[],
  elementType: string
): { name: string; rawValue: RawValue | undefined; category: StylingCategory } {
  const category = categoryForType(ref.$type, keyPath, elementType);
  const rawValue = ref.$extensions?.['com.figma']?.rawValue;
  return { name: ref.$token, rawValue, category };
}

function categoryForType(type: string, keyPath: string[], elementType: string): StylingCategory {
  if (type === 'typography') return 'TEXT_STYLES';
  if (type === 'shadow' || type === 'blur' || type === 'effects') return 'EFFECT_STYLES';
  return 'VARIABLES';
}

function compareRows(a: StylingRow, b: StylingRow): number {
  const catA = CATEGORY_ORDER.indexOf(a.category);
  const catB = CATEGORY_ORDER.indexOf(b.category);
  if (catA !== catB) return catA - catB;
  if (a.name !== b.name) return a.name.localeCompare(b.name);
  return a.appliedAs.localeCompare(b.appliedAs);
}
