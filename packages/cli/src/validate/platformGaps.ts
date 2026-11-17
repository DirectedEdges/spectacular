/**
 * Which of a spec's style properties the platforms declare they cannot deliver.
 *
 * A spec can be entirely correct and still carry a property that reaches no surface. The
 * schema package records that per platform in `mappings/bindings/<platform>.json`, where a
 * `disposition` of `unsupported` means the platform declares it emits nothing and says
 * why. Nothing read those dispositions during authoring, so a stated requirement — a dash
 * pattern, a corner smoothing — validated clean, generated clean, and silently never
 * appeared on the surface the designer would review. The only record was a sentence in a
 * report in someone's scrollback.
 *
 * Reported as its own block rather than as findings: the spec is right and the platform is
 * limited, so this fails nothing. It is the author's cue to write a supplemental
 * requirement, which is where a gap the spec cannot carry belongs.
 */

import fs from 'fs-extra';
import path from 'path';
import { createRequire } from 'module';

export interface PlatformGap {
  spec: string;
  platform: string;
  property: string;
  /** The binding's own explanation, first sentence — their words, not ours. */
  note: string;
}

interface BindingFile {
  platform?: string;
  concepts?: { styles?: Record<string, { disposition?: string; notes?: string | null }> };
}

/** Style property → the platforms that declare it unsupported, read once per process. */
let cache: Map<string, Array<{ platform: string; note: string }>> | undefined;

function bindingsDir(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    // The package's only root export is its bundle; `mappings/` sits beside the directory
    // holding it, and ships with the package (`files` in its manifest).
    const entry = require.resolve('@directededges/specs-schema');
    const dir = path.join(path.dirname(path.dirname(entry)), 'mappings', 'bindings');
    return fs.existsSync(dir) ? dir : undefined;
  } catch {
    return undefined;
  }
}

function unsupportedIndex(): Map<string, Array<{ platform: string; note: string }>> {
  if (cache) return cache;
  cache = new Map();
  const dir = bindingsDir();
  if (!dir) return cache;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    let doc: BindingFile;
    try {
      doc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as BindingFile;
    } catch {
      continue; // a binding we cannot read is not a reason to fail a validate run
    }
    const platform = doc.platform ?? path.basename(file, '.json');
    for (const [property, entry] of Object.entries(doc.concepts?.styles ?? {})) {
      if (entry?.disposition !== 'unsupported') continue;
      const note = firstSentence(entry.notes ?? '') || 'declared unsupported, with no stated reason';
      const list = cache.get(property);
      if (list) list.push({ platform, note }); else cache.set(property, [{ platform, note }]);
    }
  }
  return cache;
}

/** The binding notes open with "Not emitted." — the sentence after it is the reason. */
function firstSentence(notes: string): string {
  const body = notes.replace(/^Not emitted(\s+for[^.]*)?\.\s*/, '').trim();
  const match = /^(.+?\.)(\s|$)/.exec(body);
  return (match ? match[1] : body).trim();
}

/** Every style property set anywhere in a spec's documents, deduped. */
function stylePropertiesIn(docs: readonly unknown[]): Set<string> {
  const props = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { for (const item of node) walk(item); return; }
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const styles = obj.styles;
    if (styles && typeof styles === 'object' && !Array.isArray(styles)) {
      for (const [key, value] of Object.entries(styles as Record<string, unknown>)) {
        if (value !== undefined) props.add(key);
      }
    }
    for (const value of Object.values(obj)) walk(value);
  };
  for (const doc of docs) walk(doc);
  return props;
}

export function platformGaps(spec: string, docs: readonly unknown[]): PlatformGap[] {
  const index = unsupportedIndex();
  if (index.size === 0) return [];
  const gaps: PlatformGap[] = [];
  for (const property of [...stylePropertiesIn(docs)].sort()) {
    for (const { platform, note } of index.get(property) ?? []) {
      gaps.push({ spec, platform, property, note });
    }
  }
  return gaps.sort((a, b) => a.platform.localeCompare(b.platform) || a.property.localeCompare(b.property));
}
