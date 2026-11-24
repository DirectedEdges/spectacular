/**
 * Cross-references the promotion table against the workspace it promotes into.
 *
 * Every side of a row is checkable against something the workspace already holds: a target
 * key is a spec folder, a written prop is in that spec's `api.yaml`, and a token-path
 * `values` key is a token in the foundations analysis. Nothing enforces any of it, so a
 * wrong row promotes nothing and reports nothing.
 *
 * Warnings only, and never a blocker: the table is authored ahead of the components it
 * names, so a row pointing at a component that does not exist yet is ordinary during a
 * build-out. A missing target costs one warning for the whole file rather than one per row.
 */

import fs from 'fs-extra';
import path from 'path';
import { parse } from 'yaml';

export interface PromotionWarning {
  /** Dotted path into the table, for the finding's `path`. */
  at: string;
  message: string;
}

interface Rule {
  source?: unknown;
  prop?: unknown;
  values?: Record<string, unknown>;
}

interface Entry {
  elementType?: unknown;
  map?: Rule[];
}

/** A `values` key naming a token rather than a raw scalar — only these are checkable. */
const looksLikeTokenPath = (key: string): boolean => key.includes('/');

/**
 * What a source may read, per element kind — the honoured set the conventions reference
 * lists. A source outside it reads as undefined, so its rule never resolves and the entry
 * quietly loses the score it would have won.
 *
 * `typography` is also addressed by dotted path, so a prefix match covers both forms.
 */
const HONOURED_SOURCES: Record<string, ReadonlySet<string>> = {
  text: new Set(['typography', 'textColor', 'content']),
  glyph: new Set(['width', 'height', 'fillColor', 'content']),
  container: new Set(['layoutMode', 'itemSpacing', 'padding', 'mainAxisAlignment', 'crossAxisAlignment', 'wrap', 'wrapAlignment']),
};

export function checkPromotionMap(options: {
  /** The `config/` directory, when the workspace has one. */
  configDir?: string;
  /** Specs root, for resolving a target's own `api.yaml`. */
  specsPath: string;
  /** Spec folder keys that exist, by kind-merged name. */
  known: ReadonlySet<string>;
}): PromotionWarning[] {
  const { configDir, specsPath, known } = options;
  if (!configDir) return [];
  const file = path.join(configDir, 'conventions', 'figma.primitives.yaml');
  if (!fs.existsSync(file)) return [];

  let table: Record<string, Entry>;
  try {
    table = (parse(fs.readFileSync(file, 'utf8')) ?? {}) as Record<string, Entry>;
  } catch {
    return []; // the file's own shape is the schema layer's business, not this check's
  }

  const warnings: PromotionWarning[] = [];
  const tokens = tokenPaths(specsPath);
  const missingTargets: string[] = [];

  for (const [target, entry] of Object.entries(table)) {
    if (!entry || typeof entry !== 'object') continue;
    // A target with no spec folder used to short-circuit the whole entry, so one line
    // ("promotes nothing") stood in for every defect beneath it — an entry keyed to a
    // name that was never a spec folder hid four dead size rows and seven dead colour
    // rows until someone rekeyed it by hand. The rows that do not need the target's own
    // api — the honoured-source check and the token-path check — run regardless; the
    // prop checks below are already guarded on `props`.
    if (!known.has(target)) missingTargets.push(target);
    const props = known.has(target) ? declaredProps(specsPath, target) : undefined;
    const honoured = typeof entry.elementType === 'string' ? HONOURED_SOURCES[entry.elementType] : undefined;
    for (const [i, rule] of (entry.map ?? []).entries()) {
      const at = `/${target}/map/${i}`;

      const source = typeof rule?.source === 'string' ? rule.source : undefined;
      if (source && honoured && !honoured.has(source.split('.')[0])) {
        warnings.push({
          at: `${at}/source`,
          message: `"${source}" is not read from a ${String(entry.elementType)} — the rule never resolves (honoured: ${[...honoured].sort().join(', ')})`,
        });
      }

      // prop → the values written to it, so an off-enum value names its own prop.
      const written = new Map<string, Set<string>>();
      const note = (prop: string, value?: unknown): void => {
        const seen = written.get(prop) ?? new Set<string>();
        if (typeof value === 'string') seen.add(value);
        written.set(prop, seen);
      };
      if (typeof rule?.prop === 'string') note(rule.prop);
      for (const [key, writes] of Object.entries(rule?.values ?? {})) {
        if (tokens && looksLikeTokenPath(key) && !tokens.has(key)) {
          warnings.push({ at: `${at}/values/${key}`, message: `"${key}" is not a token this library holds — the row matches nothing` });
        }
        if (writes && typeof writes === 'object') {
          for (const [prop, value] of Object.entries(writes as Record<string, unknown>)) note(prop, value);
        }
      }

      if (!props) continue;
      for (const [prop, values] of [...written].sort(([a], [b]) => a.localeCompare(b))) {
        const declared = props.get(prop);
        if (!declared) {
          warnings.push({ at, message: `writes "${prop}", which "${target}" does not declare` });
          continue;
        }
        // A prop with no enum has an open value set; only a closed one can be violated.
        if (!declared.enum) continue;
        for (const value of [...values].sort()) {
          if (!declared.enum.has(value)) {
            warnings.push({
              at,
              message: `writes "${prop}: ${value}", which is not one of "${target}"'s declared values (${[...declared.enum].join(', ')})`,
            });
          }
        }
      }
    }
  }

  if (missingTargets.length > 0) {
    const names = missingTargets.sort();
    warnings.push({
      at: '/',
      message: `${names.length} promotion ${names.length === 1 ? 'target has' : 'targets have'} no spec folder, so ${names.length === 1 ? 'it promotes' : 'they promote'} nothing and ${names.length === 1 ? 'its' : 'their'} rows cannot be checked against a declared prop surface: ${names.join(', ')}`,
    });
  }
  return warnings;
}

/** Every `$token` path the foundations analysis records; undefined when it has not been run. */
function tokenPaths(specsPath: string): Set<string> | undefined {
  const dir = path.join(specsPath, 'analysis', 'foundations');
  if (!fs.existsSync(dir)) return undefined;
  const paths = new Set<string>();
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.yaml'))) {
    try {
      const doc = parse(fs.readFileSync(path.join(dir, file), 'utf8')) as { tokens?: unknown };
      for (const token of Array.isArray(doc?.tokens) ? doc.tokens : []) {
        const name = (token as { $token?: unknown })?.$token;
        if (typeof name === 'string') paths.add(name);
      }
    } catch {
      continue;
    }
  }
  return paths.size > 0 ? paths : undefined;
}

/** A target's declared props, each with its closed value set where it has one. */
function declaredProps(specsPath: string, target: string): Map<string, { enum?: Set<string> }> | undefined {
  for (const dir of ['components', 'compositions']) {
    const file = path.join(specsPath, dir, target, 'api.yaml');
    if (!fs.existsSync(file)) continue;
    try {
      const doc = parse(fs.readFileSync(file, 'utf8')) as { props?: Record<string, unknown> };
      const props = doc?.props;
      if (!props || typeof props !== 'object') continue;
      const out = new Map<string, { enum?: Set<string> }>();
      for (const [name, prop] of Object.entries(props)) {
        const values = (prop as { enum?: unknown })?.enum;
        out.set(name, Array.isArray(values)
          ? { enum: new Set(values.map(String)) }
          : {});
      }
      return out;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
