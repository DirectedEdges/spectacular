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
    if (!known.has(target)) {
      missingTargets.push(target);
      continue; // without the target's api there is nothing further to check
    }
    const props = declaredProps(specsPath, target);
    for (const [i, rule] of (entry.map ?? []).entries()) {
      const at = `/${target}/map/${i}`;
      const written = new Set<string>();
      if (typeof rule?.prop === 'string') written.add(rule.prop);
      for (const [key, writes] of Object.entries(rule?.values ?? {})) {
        if (tokens && looksLikeTokenPath(key) && !tokens.has(key)) {
          warnings.push({ at: `${at}/values/${key}`, message: `"${key}" is not a token this library holds — the row matches nothing` });
        }
        if (writes && typeof writes === 'object') {
          for (const prop of Object.keys(writes)) written.add(prop);
        }
      }
      if (!props) continue;
      for (const prop of [...written].sort()) {
        if (!props.has(prop)) {
          warnings.push({ at, message: `writes "${prop}", which "${target}" does not declare` });
        }
      }
    }
  }

  if (missingTargets.length > 0) {
    const names = missingTargets.sort();
    warnings.push({
      at: '/',
      message: `${names.length} promotion ${names.length === 1 ? 'target has' : 'targets have'} no spec folder, so ${names.length === 1 ? 'it promotes' : 'they promote'} nothing: ${names.join(', ')}`,
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

/** A target's declared prop names; undefined when its api cannot be read. */
function declaredProps(specsPath: string, target: string): Set<string> | undefined {
  for (const dir of ['components', 'compositions']) {
    const file = path.join(specsPath, dir, target, 'api.yaml');
    if (!fs.existsSync(file)) continue;
    try {
      const doc = parse(fs.readFileSync(file, 'utf8')) as { props?: Record<string, unknown> };
      const props = doc?.props;
      if (props && typeof props === 'object') return new Set(Object.keys(props));
    } catch {
      return undefined;
    }
  }
  return undefined;
}
