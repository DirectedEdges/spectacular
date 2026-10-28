/**
 * Assets versioning — `assets/` is versioned and graded (icons/images/cssvars the
 * specs reference by name). Added = MINOR; removed while referenced = MAJOR-class
 * defect that fails the run; removed unreferenced / content changed = PATCH.
 * The previous state is `versions/latest/assets/` — the only place asset content
 * is retained.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { grade, type RuleSet } from '../rules/grade.js';
import type { AssembledComponent, DiffEntry } from '../types.js';

/** Relative path → content hash for every file under an assets directory. */
export function assetManifest(assetsDir: string): Record<string, string> {
  const manifest: Record<string, string> = {};
  if (!fs.existsSync(assetsDir)) return manifest;
  const walk = (dir: string, prefix: string) => {
    for (const name of fs.readdirSync(dir).sort()) {
      if (name.startsWith('.')) continue;
      const full = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (fs.statSync(full).isDirectory()) { walk(full, rel); continue; }
      manifest[rel] = crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex');
    }
  };
  walk(assetsDir, '');
  return manifest;
}

/** Every string leaf in every assembled component — the reference universe. */
export function referencedStrings(components: Iterable<AssembledComponent>): Set<string> {
  const strings = new Set<string>();
  const collect = (value: unknown) => {
    if (typeof value === 'string') { strings.add(value); return; }
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  for (const component of components) collect(component.concerns);
  return strings;
}

function isReferenced(relPath: string, references: Set<string>): boolean {
  if (references.has(relPath)) return true;
  const base = path.basename(relPath);
  if (references.has(base)) return true;
  const stem = base.replace(/\.[^.]+$/, '');
  return references.has(stem);
}

/** Diff two asset manifests into graded entries. */
export function diffAssets(
  previous: Record<string, string>,
  current: Record<string, string>,
  references: Set<string>,
  ruleSet: RuleSet,
): DiffEntry[] {
  const entries: DiffEntry[] = [];
  for (const rel of Object.keys(current)) {
    if (!(rel in previous)) {
      entries.push({ path: rel, concernFile: 'assets', operation: 'added', newValue: current[rel], impact: 'unclassified' });
    } else if (previous[rel] !== current[rel]) {
      entries.push({ path: rel, concernFile: 'assets', operation: 'modified', oldValue: previous[rel], newValue: current[rel], impact: 'unclassified' });
    }
  }
  for (const rel of Object.keys(previous)) {
    if (rel in current) continue;
    const referenced = isReferenced(rel, references);
    entries.push({
      path: rel, concernFile: 'assets', operation: 'removed', oldValue: previous[rel],
      impact: 'unclassified', flags: [referenced ? 'referenced' : 'unreferenced'],
    });
  }
  for (const entry of entries) grade(ruleSet, entry);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}
