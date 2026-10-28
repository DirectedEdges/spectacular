/**
 * Severity engine: matches diff entries against the rules data and grades them.
 *
 * Knows how to match; knows nothing about what any rule means. All meaning lives
 * in the rules YAML (semverRules.ts, overridable with an external file), which is
 * the file to edit — the premerge-severity.mjs division of labor.
 */

import * as fs from 'fs';
import * as yaml from 'yaml';
import { SEMVER_RULES_YAML } from './semver.js';
import type { Bump, DiffEntry, Impact } from '../types.js';

export interface Rule {
  id: string;
  grade: Impact;
  why: string;
  concern: string[] | null;
  operation: string[] | null;
  path: RegExp | null;
  flag: string[] | null;
}

export interface RuleSet {
  rules: Rule[];
  /** Where the rules came from, for the report's provenance section. */
  source: string;
}

const GRADES = new Set(['major', 'minor', 'patch', 'ignore']);

function asList(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

/** Load and compile a rules document. Throws with the offending rule id on bad input. */
export function loadRules(externalPath?: string): RuleSet {
  const text = externalPath ? fs.readFileSync(externalPath, 'utf8') : SEMVER_RULES_YAML;
  const doc = (yaml.parse(text) ?? {}) as { rules?: Array<Record<string, unknown>> };

  const rules: Rule[] = (doc.rules ?? []).map(raw => {
    if (!raw.id) throw new Error(`Rule without an id: ${JSON.stringify(raw)}`);
    if (!GRADES.has(String(raw.grade))) {
      throw new Error(`Rule "${raw.id}" has grade "${raw.grade}" — expected one of ${[...GRADES].join(', ')}`);
    }
    let path: RegExp | null = null;
    if (raw.path) {
      try {
        path = new RegExp(String(raw.path));
      } catch (err) {
        throw new Error(`Rule "${raw.id}" has an unusable path pattern: ${raw.path}\n  ${(err as Error).message}`);
      }
    }
    return {
      id: String(raw.id),
      grade: raw.grade as Impact,
      why: String(raw.why ?? ''),
      concern: asList(raw.concern),
      operation: asList(raw.operation),
      path,
      flag: asList(raw.flag),
    };
  });

  return { rules, source: externalPath ?? 'built-in semver rules (compiled from semver-rules.md)' };
}

/** `api.yaml` → `api`; `variants.yaml` → `variants`; every examples/images concern → `examples`. */
export function concernCategory(concernFile: string): string {
  if (concernFile === 'assets' || concernFile === 'run' || concernFile === 'component') return concernFile;
  const base = concernFile.replace(/\.(yaml|yml|json)$/, '');
  if (base === 'api') return 'api';
  if (base === 'variants') return 'variants';
  return 'examples';
}

function matches(rule: Rule, entry: DiffEntry, category: string): boolean {
  if (rule.concern && !rule.concern.includes(category)) return false;
  if (rule.operation && !rule.operation.includes(entry.operation)) return false;
  if (rule.path && !rule.path.test(entry.path)) return false;
  if (rule.flag && !rule.flag.every(f => entry.flags?.includes(f))) return false;
  return true;
}

/** Grade one entry in place. First matching rule wins; no rule → unclassified. */
export function grade(ruleSet: RuleSet, entry: DiffEntry): DiffEntry {
  const category = concernCategory(entry.concernFile);
  for (const rule of ruleSet.rules) {
    if (matches(rule, entry, category)) {
      entry.impact = rule.grade;
      entry.rule = rule.id;
      entry.why = rule.why;
      return entry;
    }
  }
  entry.impact = 'unclassified';
  entry.rule = undefined;
  entry.why = 'No rule covers this path yet.';
  return entry;
}

const BUMP_RANK: Record<Bump, number> = { none: 0, patch: 1, minor: 2, major: 3 };

export function bumpOf(entries: DiffEntry[]): Bump {
  let bump: Bump = 'none';
  for (const e of entries) {
    const b: Bump | null = e.impact === 'major' ? 'major' : e.impact === 'minor' ? 'minor' : e.impact === 'patch' ? 'patch' : null;
    if (b && BUMP_RANK[b] > BUMP_RANK[bump]) bump = b;
  }
  return bump;
}

export function maxBump(bumps: Bump[]): Bump {
  return bumps.reduce<Bump>((a, b) => (BUMP_RANK[b] > BUMP_RANK[a] ? b : a), 'none');
}

export function applyBump(version: string, bump: Bump): string {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(n => parseInt(n, 10) || 0);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  return version;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}
