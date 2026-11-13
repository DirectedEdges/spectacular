import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import type { AnalyzerFoundations, Transformer, TransformerContext } from '../transforms/transformer.js';
import { ANALYSIS_DIR } from '../utilities/specsLayout.js';

/**
 * Which themes a library's specs actually select (ADR-123) — the usage report
 * over the vocabulary `foundations.yaml` declares.
 *
 * Its own report family rather than a tree inside `styling`: a styling row is a
 * token and its application sites, and a theme selection is neither a token nor an
 * application. It mirrors the styling analyzer's shape instead — a per-component
 * file plus a by-component, a by-theme, and an unused roll-up — because the
 * questions are the same three: what does this component select, who selects this
 * theme, and what does nothing select at all.
 *
 * **Authored selections only.** Every entry is a key a spec actually carries. The
 * effective theme an element renders under is the merge of its own selection over
 * its ancestors' (DSPEC-67), and that is not reported here: it would put a second
 * implementation of the resolution rule in a report, free to disagree with the one
 * the emitters use.
 */

/** One element's selections, in the variant that carries them. */
interface SelectionJson {
  /** The element key as the spec writes it. */
  element: string;
  /** `default`, or the variant's configuration rendered as a key. */
  variant: string;
  /** Token group → theme, verbatim as the spec carries them. */
  themes: Record<string, string>;
}

interface ThemesJson {
  selections: SelectionJson[];
}

/** One selection of one theme, for the by-theme roll-up. */
interface ByThemeEntry {
  component: string;
  element: string;
  variant: string;
}

interface UnusedJson {
  summary: {
    /** Token groups the library declares that at least one spec selects from. */
    groups: { total: number; selected: number; unselected: number };
    /** Themes across all declared groups, and how many are ever selected. */
    themes: { total: number; selected: number; unselected: number };
  };
  /** Declared groups nothing selects from, by name. */
  groups: string[];
  /** Declared themes nothing selects, as `group: theme`. */
  themes: string[];
}

export class ThemesAnalyzer implements Transformer {
  readonly name = 'themes';
  // A composition selects themes for the same reason a component does — a page
  // pinned to a dark surface is the clearest case there is.
  readonly readsKinds = ['component', 'composition'] as const;
  readonly perComponentOutput = 'themes';

  // Flat map: "componentKey" and "componentKey.subName" entries stored together,
  // matching the styling analyzer's scoping.
  private readonly _componentData = new Map<string, ThemesJson>();
  private _outputFormat: 'JSON' | 'YAML' = 'JSON';

  async run(apiYaml: Record<string, unknown>, context: TransformerContext): Promise<void> {
    const { outputDir, componentKey, outputFormat } = context;
    this._outputFormat = outputFormat;

    // Selections live on variant elements, which in split-concerns output is
    // variants.yaml. Single-file output carries them on the document itself.
    const variantsYaml = await loadVariantsYaml(outputDir);
    const source = variantsYaml ?? apiYaml;

    const scopes = new Map<string, ThemesJson>();
    scopes.set(componentKey, { selections: collectSelections(source) });

    const sourceSubcomponents = (source.subcomponents ?? {}) as Record<string, unknown>;
    for (const [subName, subSource] of Object.entries(sourceSubcomponents)) {
      const selections = collectSelections(subSource as Record<string, unknown>);
      if (selections.length) scopes.set(`${componentKey}.${subName}`, { selections });
    }

    const fileOutput: Record<string, ThemesJson> = {};
    for (const [scopeKey, data] of scopes) {
      this._componentData.set(scopeKey, data);
      fileOutput[scopeKey] = data;
    }

    const ext = this._outputFormat === 'YAML' ? 'yaml' : 'json';
    const content = this._outputFormat === 'YAML'
      ? yaml.stringify(fileOutput, { lineWidth: 120 })
      : JSON.stringify(fileOutput, null, 2) + '\n';
    await fs.writeFile(path.join(outputDir, `themes.${ext}`), content, 'utf-8');
  }

  async finalize(
    outputDir: string,
    analysisDir?: string,
    foundations?: AnalyzerFoundations,
    outputFormat?: 'JSON' | 'YAML',
  ): Promise<void> {
    if (outputFormat) this._outputFormat = outputFormat;

    const outDir = analysisDir ?? path.join(outputDir, ANALYSIS_DIR);
    await fs.ensureDir(outDir);

    await this._writeByComponent(outDir);
    await this._writeByTheme(outDir);
    if (foundations) {
      await this._writeUnused(outDir, foundations);
    }
  }

  private async _writeByComponent(dictDir: string): Promise<void> {
    const out: Record<string, ThemesJson> = {};
    for (const [key, data] of this._sortedScopes()) {
      // A component that selects nothing is not listed: the report answers which
      // components theme, and a catalogue of empty arrays buries the ones that do.
      if (data.selections.length) out[key] = data;
    }
    await this._write(dictDir, 'themes.byComponent', out);
  }

  private async _writeByTheme(dictDir: string): Promise<void> {
    const collected = new Map<string, ByThemeEntry[]>();
    for (const [scopeKey, data] of this._sortedScopes()) {
      for (const selection of data.selections) {
        for (const [group, theme] of Object.entries(selection.themes)) {
          const key = `${group}: ${theme}`;
          const entries = collected.get(key) ?? [];
          entries.push({ component: scopeKey, element: selection.element, variant: selection.variant });
          collected.set(key, entries);
        }
      }
    }

    // Keyed in ascending name order: the theme is the reader's index into this
    // report, not the order the walk met one.
    const out: Record<string, ByThemeEntry[]> = {};
    for (const key of Array.from(collected.keys()).sort((a, b) => a.localeCompare(b))) {
      out[key] = collected.get(key)!;
    }
    await this._write(dictDir, 'themes.byTheme', out);
  }

  private async _writeUnused(dictDir: string, foundations: AnalyzerFoundations): Promise<void> {
    const selectedGroups = new Set<string>();
    const selectedThemes = new Set<string>();
    for (const data of this._componentData.values()) {
      for (const selection of data.selections) {
        for (const [group, theme] of Object.entries(selection.themes)) {
          selectedGroups.add(group);
          selectedThemes.add(`${group}: ${theme}`);
        }
      }
    }

    const declaredGroups: string[] = [];
    const declaredThemes: string[] = [];
    for (const collection of foundations.collections.values()) {
      const group = collection.name;
      if (!group) continue;
      declaredGroups.push(group);
      for (const mode of collection.modes ?? []) {
        if (mode?.name) declaredThemes.push(`${group}: ${mode.name}`);
      }
    }

    const unusedGroups = declaredGroups.filter(g => !selectedGroups.has(g)).sort((a, b) => a.localeCompare(b));
    const unusedThemes = declaredThemes.filter(t => !selectedThemes.has(t)).sort((a, b) => a.localeCompare(b));

    const out: UnusedJson = {
      summary: {
        groups: {
          total: declaredGroups.length,
          selected: declaredGroups.length - unusedGroups.length,
          unselected: unusedGroups.length,
        },
        themes: {
          total: declaredThemes.length,
          selected: declaredThemes.length - unusedThemes.length,
          unselected: unusedThemes.length,
        },
      },
      groups: unusedGroups,
      themes: unusedThemes,
    };
    await this._write(dictDir, 'themes.unused', out);
  }

  private _sortedScopes(): Array<[string, ThemesJson]> {
    return Array.from(this._componentData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }

  private async _write(dictDir: string, base: string, data: unknown): Promise<void> {
    const ext = this._outputFormat === 'YAML' ? 'yaml' : 'json';
    const content = this._outputFormat === 'YAML'
      ? yaml.stringify(data, { lineWidth: 120 })
      : JSON.stringify(data, null, 2) + '\n';
    await fs.writeFile(path.join(dictDir, `${base}.${ext}`), content, 'utf-8');
  }
}

async function loadVariantsYaml(outputDir: string): Promise<Record<string, unknown> | null> {
  const variantsPath = path.join(outputDir, 'variants.yaml');
  if (!fs.existsSync(variantsPath)) return null;
  const raw = await fs.readFile(variantsPath, 'utf-8');
  return yaml.parse(raw) as Record<string, unknown>;
}

/** Every `themes` key the default and each variant carry, in document order. */
function collectSelections(source: Record<string, unknown>): SelectionJson[] {
  const out: SelectionJson[] = [];

  const defaultSection = source.default as Record<string, unknown> | undefined;
  if (defaultSection?.elements) {
    out.push(...selectionsIn(defaultSection.elements as Record<string, unknown>, 'default'));
  }

  const variants = (source.variants ?? []) as Array<Record<string, unknown>>;
  for (const variant of variants) {
    if (!variant.elements) continue;
    out.push(...selectionsIn(variant.elements as Record<string, unknown>, variantKey(variant.configuration)));
  }
  return out;
}

function selectionsIn(elements: Record<string, unknown>, variant: string): SelectionJson[] {
  const out: SelectionJson[] = [];
  for (const [element, raw] of Object.entries(elements)) {
    const themes = (raw as Record<string, unknown>)?.themes;
    if (!themes || typeof themes !== 'object' || Array.isArray(themes)) continue;
    const entries = Object.entries(themes as Record<string, unknown>)
      .filter(([, theme]) => typeof theme === 'string') as Array<[string, string]>;
    if (!entries.length) continue;
    out.push({ element, variant, themes: Object.fromEntries(entries) });
  }
  return out;
}

/** A variant's configuration as one readable key, matching the report's other labels. */
function variantKey(configuration: unknown): string {
  if (!configuration || typeof configuration !== 'object') return 'default';
  const parts = Object.entries(configuration as Record<string, unknown>)
    .map(([prop, value]) => `${prop}=${String(value)}`);
  return parts.length ? parts.join(', ') : 'default';
}
