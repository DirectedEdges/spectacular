import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import type { Transformer, TransformerContext, AnalyzerFoundations, AnalyzerSetup } from '../transforms/transformer.js';
import { formatKey, type FormatKeys } from '../utilities/formatKey.js';
import { ANALYSIS_DIR } from '../utilities/specsLayout.js';

/**
 * The foundations manifest: the workspace's token language, icons, and named
 * styles as one authoring-facing report — `analysis/foundations.yaml`.
 *
 * Unlike every other analyzer, the input is the *fetched data*, not the
 * catalogue: a workspace with zero specs still has a complete token language,
 * and authoring-from-scratch is exactly the situation that needs it. `run()`
 * is therefore a no-op and everything happens in `finalize`, with workspace
 * facts arriving through `setup()`.
 *
 * Variables and named styles consolidate into one `tokens` section, each entry
 * leading with the exact object an author writes (`{$token, $type}`). Entries
 * carry names only — alias targets by name, platform code-name *presence*, a
 * description when the library wrote one — never resolved values, so the
 * report is safe to publish anywhere the spec itself is.
 */

interface TokenEntry {
  $token: string;
  $type: string;
  /** Whether the name is a variable or a named style. */
  source: 'variable' | 'style';
  /** The variable this one aliases in its default mode, by token path. */
  aliasOf?: string;
  /**
   * The default-mode value, alias chains resolved, colors as hex — carried so a
   * reader can understand what a token is, never to be authored into a spec.
   */
  defaultValue?: string | number | boolean;
  description?: string;
  /** Platforms declaring a code-syntax name for this token — presence, not the names. */
  platformNames?: string[];
}

interface IconEntry {
  /** The raw glyph name as the library spells it. */
  name: string;
  /** The formatted key spelling — what spec `content`, defaults, and examples use. */
  key: string;
}

interface FoundationsReport {
  summary: {
    tokens: Record<string, number>;
    icons: number;
  };
  tokens: Record<string, TokenEntry[]>;
  icons: IconEntry[];
}

/** Figma variable resolvedType → the `$type` an authored token reference uses. */
const VARIABLE_TYPES: Record<string, string> = {
  COLOR: 'color',
  FLOAT: 'dimension',
  STRING: 'string',
  BOOLEAN: 'boolean',
};

/** Figma named-style type → `$type`. GRID styles bind to nothing a spec styles, so they are omitted. */
const STYLE_TYPES: Record<string, string> = {
  TEXT: 'typography',
  EFFECT: 'effect',
  FILL: 'color',
};

/** The section order of the report — fixed, so two runs diff cleanly. */
const TYPE_ORDER = ['color', 'dimension', 'string', 'boolean', 'typography', 'effect'];

export class FoundationsAnalyzer implements Transformer {
  readonly name = 'foundations';

  private _dataDir?: string;
  private _outputFormat: 'JSON' | 'YAML' = 'JSON';
  private _keys: FormatKeys = 'CAMEL';

  setup(facts: AnalyzerSetup): void {
    this._dataDir = facts.dataDir;
    this._outputFormat = facts.outputFormat;
    this._keys = facts.keys as FormatKeys;
  }

  /** Foundations derive from fetched data, never from specs. */
  async run(_apiYaml: Record<string, unknown>, _context: TransformerContext): Promise<void> {}

  async finalize(outputDir: string, analysisDir?: string, foundations?: AnalyzerFoundations): Promise<void> {
    const tokens = new Map<string, TokenEntry[]>();
    const add = (entry: TokenEntry): void => {
      (tokens.get(entry.$type) ?? tokens.set(entry.$type, []).get(entry.$type)!).push(entry);
    };

    if (foundations) {
      for (const variable of foundations.variables.values()) {
        const $type = VARIABLE_TYPES[variable.resolvedType ?? ''];
        if (!$type) continue;
        const entry: TokenEntry = {
          $token: this.tokenPath(variable, foundations),
          $type,
          source: 'variable',
        };
        const aliasOf = this.aliasTarget(variable, foundations);
        if (aliasOf) entry.aliasOf = aliasOf;
        const defaultValue = this.terminalValue(variable, foundations);
        if (defaultValue !== undefined) entry.defaultValue = defaultValue;
        if (variable.description) entry.description = variable.description;
        const platforms = Object.keys(variable.codeSyntax ?? {});
        if (platforms.length > 0) entry.platformNames = platforms.map(p => p.toLowerCase()).sort();
        add(entry);
      }
    }

    // Named styles: the endpoint data when the library publishes, the fetch
    // cache otherwise — a file's local styles never reach the REST styles
    // endpoint, but the cache records them all.
    for (const style of this.namedStyles(foundations)) {
      const $type = STYLE_TYPES[style.type];
      if (!$type) continue;
      const entry: TokenEntry = { $token: style.name, $type, source: 'style' };
      if (style.description) entry.description = style.description;
      add(entry);
    }

    const icons = this.icons();

    if (tokens.size === 0 && icons.length === 0) return; // nothing fetched — nothing to report

    const report: FoundationsReport = {
      summary: {
        tokens: Object.fromEntries(
          TYPE_ORDER.filter(t => tokens.has(t)).map(t => [t, tokens.get(t)!.length]),
        ),
        icons: icons.length,
      },
      tokens: Object.fromEntries(
        TYPE_ORDER.filter(t => tokens.has(t))
          .map(t => [t, dedupe(tokens.get(t)!).sort((a, b) => a.$token.localeCompare(b.$token))]),
      ),
      icons,
    };

    const outDir = analysisDir ?? path.join(outputDir, ANALYSIS_DIR);
    await fs.ensureDir(outDir);
    const ext = this._outputFormat === 'JSON' ? 'json' : 'yaml';
    const content = this._outputFormat === 'JSON'
      ? JSON.stringify(report, null, 2) + '\n'
      : yaml.stringify(report, { lineWidth: 120 });
    await fs.writeFile(path.join(outDir, `foundations.${ext}`), content, 'utf-8');
  }

  private tokenPath(
    variable: { name: string; variableCollectionId: string },
    foundations: AnalyzerFoundations,
  ): string {
    return tokenPath(variable, foundations);
  }

  private terminalValue(
    variable: { variableCollectionId: string; valuesByMode?: Record<string, unknown> },
    foundations: AnalyzerFoundations,
  ): string | number | boolean | undefined {
    return terminalTokenValue(variable, foundations);
  }

  /** The default-mode alias target's token path, when the value is an alias. */
  private aliasTarget(
    variable: { variableCollectionId: string; valuesByMode?: Record<string, unknown> },
    foundations: AnalyzerFoundations,
  ): string | undefined {
    const modes = variable.valuesByMode ?? {};
    const defaultModeId = foundations.collections.get(variable.variableCollectionId)?.defaultModeId;
    const value = (defaultModeId && defaultModeId in modes)
      ? modes[defaultModeId]
      : Object.values(modes)[0];
    const alias = value as { type?: string; id?: string } | undefined;
    if (!alias || typeof alias !== 'object' || alias.type !== 'VARIABLE_ALIAS' || !alias.id) return undefined;
    const target = foundations.variables.get(alias.id);
    return target ? this.tokenPath(target, foundations) : undefined;
  }

  /**
   * Named styles, deduplicated by name+type — `loadFoundations` indexes one
   * style under both its node id and its key hash — and backfilled from the
   * fetch cache, whose entries carry name and type for file-local styles.
   */
  private namedStyles(foundations?: AnalyzerFoundations): Array<{ name: string; type: string; description?: string }> {
    const byIdentity = new Map<string, { name: string; type: string; description?: string }>();
    for (const style of foundations?.styles.values() ?? []) {
      byIdentity.set(`${style.type}|${style.name}`, style);
    }
    for (const [name, entry] of Object.entries(this.cacheEntries('styles.yaml'))) {
      const type = (entry as { type?: string })?.type;
      if (!type) continue;
      const id = `${type}|${name}`;
      if (!byIdentity.has(id)) byIdentity.set(id, { name, type });
    }
    return [...byIdentity.values()];
  }

  /** Glyph names from the icons cache, each with its formatted key spelling. */
  private icons(): IconEntry[] {
    return Object.keys(this.cacheEntries('icons.yaml'))
      .sort((a, b) => a.localeCompare(b))
      .map(name => ({ name, key: formatKey(name, this._keys) }));
  }

  private cacheEntries(file: string): Record<string, unknown> {
    if (!this._dataDir) return {};
    const cachePath = path.join(this._dataDir, 'cache', file);
    if (!fs.existsSync(cachePath)) return {};
    try {
      const doc = yaml.parse(fs.readFileSync(cachePath, 'utf-8')) as { entries?: Record<string, unknown> };
      return doc?.entries ?? {};
    } catch {
      return {};
    }
  }
}

/** Full token path: the collection's name, then the variable's own path. */
export function tokenPath(
  variable: { name: string; variableCollectionId: string },
  foundations: AnalyzerFoundations,
): string {
  const collection = foundations.collections.get(variable.variableCollectionId)?.name;
  return collection ? `${collection}/${variable.name}` : variable.name;
}

/** A variable's default-mode value: the default mode's entry, else the first. */
function defaultModeValue(
  variable: { variableCollectionId: string; valuesByMode?: Record<string, unknown> },
  foundations: AnalyzerFoundations,
): unknown {
  const modes = variable.valuesByMode ?? {};
  const defaultModeId = foundations.collections.get(variable.variableCollectionId)?.defaultModeId;
  return (defaultModeId && defaultModeId in modes) ? modes[defaultModeId] : Object.values(modes)[0];
}

/**
 * The default-mode value with alias chains resolved to their terminal value,
 * formatted for a reader: scalars as themselves, colors as hex. Undefined for
 * anything else (an unresolvable alias, an exotic shape). THEMED — the default
 * mode's resolution only; other modes differ, so this orients and never gates.
 */
export function terminalTokenValue(
  variable: { variableCollectionId: string; valuesByMode?: Record<string, unknown> },
  foundations: AnalyzerFoundations,
): string | number | boolean | undefined {
  let value = defaultModeValue(variable, foundations);
  for (let hop = 0; hop < 10 && isAlias(value); hop++) {
    const target = foundations.variables.get((value as { id: string }).id);
    if (!target) return undefined;
    value = defaultModeValue(target, foundations);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  if (isColor(value)) return toHex(value);
  return undefined;
}

function isAlias(value: unknown): value is { type: string; id: string } {
  return Boolean(value) && typeof value === 'object'
    && (value as { type?: unknown }).type === 'VARIABLE_ALIAS'
    && typeof (value as { id?: unknown }).id === 'string';
}

function isColor(value: unknown): value is { r: number; g: number; b: number; a?: number } {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return typeof c.r === 'number' && typeof c.g === 'number' && typeof c.b === 'number';
}

function toHex(color: { r: number; g: number; b: number; a?: number }): string {
  const channel = (v: number): string => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0').toUpperCase();
  const base = `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
  return color.a !== undefined && color.a < 1 ? `${base}${channel(color.a)}` : base;
}

/** Two sources can carry one name (a published style also in the cache) — last write loses. */
function dedupe(entries: TokenEntry[]): TokenEntry[] {
  const seen = new Map<string, TokenEntry>();
  for (const entry of entries) {
    if (!seen.has(entry.$token)) seen.set(entry.$token, entry);
  }
  return [...seen.values()];
}
