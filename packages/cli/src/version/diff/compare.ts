/**
 * Diff engine — structural, per-concern comparison of two assembled components.
 *
 * Strategy: each section is diffed independently by key-set comparison
 * (added / removed / common-then-deep-compare). Rename-aware: mappings from
 * versions/renames.yaml are applied at each scope (component titles, prop names,
 * enum values) before key-set comparison, so a tracked rename diffs as one rename
 * — never a removal plus an addition. Variants match by their `configuration`
 * object, never by array index. Every entry is atomic and replayable, which is
 * what lets MINOR/PATCH ledger entries be diff-only.
 */

import { grade, type RuleSet } from '../rules/grade.js';
import { componentRename, enumRenames, propRenames } from './renames.js';
import type { AssembledComponent, ConcernDoc, DiffEntry, Operation, RenameMap } from '../types.js';

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
    return ka.every(k => deepEqual(a[k], b[k]));
  }
  return false;
}

/** Stable, key-order-insensitive identity for a variant's configuration. */
export function configurationKey(config: unknown): string {
  if (!isObject(config)) return JSON.stringify(config ?? null);
  return Object.keys(config).sort().map(k => `${k}=${JSON.stringify(config[k])}`).join(', ');
}

type Ctx = {
  entries: DiffEntry[];
  concernFile: string;
  renames: RenameMap;
  component: { name: string; title: string };
};

function push(ctx: Ctx, path: string, operation: Operation, oldValue?: unknown, newValue?: unknown, flags?: string[]): void {
  const entry: DiffEntry = { path, concernFile: ctx.concernFile, operation, impact: 'unclassified' };
  if (oldValue !== undefined) entry.oldValue = oldValue;
  if (newValue !== undefined) entry.newValue = newValue;
  if (flags?.length) entry.flags = flags;
  ctx.entries.push(entry);
}

// ---------------------------------------------------------------- generic walk

/**
 * Generic deep walk for unstructured sections (variant styles above all).
 * Arrays that differ are reported as one whole-value modification — replay-safe,
 * and the values still print in full in the report.
 */
function walk(ctx: Ctx, a: unknown, b: unknown, path: string): void {
  if (deepEqual(a, b)) return;
  if (a === undefined) return push(ctx, path, 'added', undefined, b);
  if (b === undefined) return push(ctx, path, 'removed', a, undefined);

  if (isObject(a) && isObject(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      walk(ctx, a[key], b[key], path ? `${path}.${key}` : key);
    }
    return;
  }
  push(ctx, path, 'modified', a, b);
}

// ---------------------------------------------------------------- api sections

function diffAnatomy(ctx: Ctx, a: Record<string, unknown>, b: Record<string, unknown>, prefix: string): void {
  const p = (s: string) => `${prefix}anatomy.${s}`;
  for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const oldEl = a[name];
    const newEl = b[name];
    if (oldEl === undefined) { push(ctx, p(name), 'added', undefined, newEl); continue; }
    if (newEl === undefined) { push(ctx, p(name), 'removed', oldEl, undefined); continue; }
    if (deepEqual(oldEl, newEl)) continue;
    if (!isObject(oldEl) || !isObject(newEl)) { push(ctx, p(name), 'modified', oldEl, newEl); continue; }
    for (const field of new Set([...Object.keys(oldEl), ...Object.keys(newEl)])) {
      const ov = oldEl[field];
      const nv = newEl[field];
      if (deepEqual(ov, nv)) continue;
      if (field === 'actions' && Array.isArray(ov ?? []) && Array.isArray(nv ?? [])) {
        diffScalarSet(ctx, (ov ?? []) as unknown[], (nv ?? []) as unknown[], p(`${name}.actions`), new Map());
        continue;
      }
      const op: Operation = ov === undefined ? 'added' : nv === undefined ? 'removed' : 'modified';
      push(ctx, p(`${name}.${field}`), op, ov, nv);
    }
  }
}

/** Scalar arrays carry meaning as a set — enum values, actions. Rename-aware. */
function diffScalarSet(ctx: Ctx, a: unknown[], b: unknown[], path: string, renameMap: Map<string, string>): void {
  const bSet = b.map(v => JSON.stringify(v));
  const aSet = a.map(v => JSON.stringify(v));
  const removed = a.filter(v => !bSet.includes(JSON.stringify(v)));
  const added = b.filter(v => !aSet.includes(JSON.stringify(v)));

  const renamedFrom = new Set<unknown>();
  const renamedTo = new Set<unknown>();
  for (const v of removed) {
    if (typeof v !== 'string') continue;
    const to = renameMap.get(v);
    if (to !== undefined && added.some(x => x === to)) {
      push(ctx, path, 'renamed', v, to);
      renamedFrom.add(v);
      renamedTo.add(to);
    }
  }
  for (const v of removed) if (!renamedFrom.has(v)) push(ctx, path, 'removed', v, undefined);
  for (const v of added) if (!renamedTo.has(v)) push(ctx, path, 'added', undefined, v);

  // Replay applies removals/renames in place and appends additions. When the real
  // order differs from that prediction, one reorder entry carries the final order.
  const predicted = a
    .filter(v => !removed.includes(v) || renamedFrom.has(v))
    .map(v => (renamedFrom.has(v) ? renameMap.get(v as string) : v))
    .concat(added.filter(v => !renamedTo.has(v)));
  if (!deepEqual(predicted, b)) push(ctx, path, 'reordered', a, b);
}

const PROP_FIELDS_SET = ['enum'];

function diffProps(ctx: Ctx, a: Record<string, unknown>, b: Record<string, unknown>, prefix: string): void {
  const p = (s: string) => `${prefix}props.${s}`;
  const renameMap = prefix === '' ? propRenames(ctx.renames, ctx.component) : new Map<string, string>();

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  const pairs: Array<{ oldKey: string; newKey: string }> = [];
  const removed: string[] = [];
  const added = new Set(bKeys.filter(k => !aKeys.includes(k)));

  for (const key of aKeys) {
    if (bKeys.includes(key)) { pairs.push({ oldKey: key, newKey: key }); continue; }
    const to = renameMap.get(key);
    if (to !== undefined && added.has(to)) {
      push(ctx, p(key), 'renamed', key, to);
      pairs.push({ oldKey: key, newKey: to });
      added.delete(to);
      continue;
    }
    removed.push(key);
  }

  for (const key of removed) push(ctx, p(key), 'removed', a[key], undefined);
  for (const key of added) {
    const def = b[key];
    const optional = isObject(def) && (def.default !== undefined || def.nullable === true);
    push(ctx, p(key), 'added', undefined, def, [optional ? 'optional' : 'required']);
  }

  for (const { oldKey, newKey } of pairs) {
    const oldDef = a[oldKey];
    const newDef = b[newKey];
    if (deepEqual(oldDef, newDef)) continue;
    if (!isObject(oldDef) || !isObject(newDef)) { push(ctx, p(newKey), 'modified', oldDef, newDef); continue; }
    for (const field of new Set([...Object.keys(oldDef), ...Object.keys(newDef)])) {
      const ov = oldDef[field];
      const nv = newDef[field];
      if (deepEqual(ov, nv)) continue;
      const fieldPath = p(`${newKey}.${field}`);
      if (PROP_FIELDS_SET.includes(field) && Array.isArray(ov ?? []) && Array.isArray(nv ?? [])) {
        const enumMap = prefix === '' ? enumRenames(ctx.renames, ctx.component, newKey) : new Map<string, string>();
        diffScalarSet(ctx, (ov ?? []) as unknown[], (nv ?? []) as unknown[], fieldPath, enumMap);
        continue;
      }
      // Members (ADR-111) diff per member, not as one modified blob — a member is
      // API surface, and its removal must grade as such.
      if (field === 'members' && isObject(ov) && isObject(nv)) {
        diffMembers(ctx, ov, nv, fieldPath);
        continue;
      }
      const op: Operation = ov === undefined ? 'added' : nv === undefined ? 'removed' : 'modified';
      push(ctx, fieldPath, op, ov, nv);
    }
  }
}

/** One object prop's members (ADR-111), diffed with prop semantics one level down. */
function diffMembers(
  ctx: Ctx,
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  basePath: string,
): void {
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const ov = a[key];
    const nv = b[key];
    const path = `${basePath}.${key}`;
    if (ov === undefined) {
      const optional = isObject(nv) && (nv.default !== undefined || nv.nullable === true);
      push(ctx, path, 'added', undefined, nv, [optional ? 'optional' : 'required']);
      continue;
    }
    if (nv === undefined) { push(ctx, path, 'removed', ov, undefined); continue; }
    if (deepEqual(ov, nv)) continue;
    if (!isObject(ov) || !isObject(nv)) { push(ctx, path, 'modified', ov, nv); continue; }
    for (const field of new Set([...Object.keys(ov), ...Object.keys(nv)])) {
      const o = ov[field];
      const n = nv[field];
      if (deepEqual(o, n)) continue;
      const fieldPath = `${path}.${field}`;
      if (PROP_FIELDS_SET.includes(field) && Array.isArray(o ?? []) && Array.isArray(n ?? [])) {
        diffScalarSet(ctx, (o ?? []) as unknown[], (n ?? []) as unknown[], fieldPath, new Map());
        continue;
      }
      const op: Operation = o === undefined ? 'added' : n === undefined ? 'removed' : 'modified';
      push(ctx, fieldPath, op, o, n);
    }
  }
}

/** `invalidPropCombinations` is a set of combinations, matched by content. */
function diffCombinations(ctx: Ctx, a: unknown[], b: unknown[], path: string): void {
  const key = (c: unknown) => configurationKey(c);
  const aMap = new Map(a.map(c => [key(c), c]));
  const bMap = new Map(b.map(c => [key(c), c]));
  for (const [k, c] of bMap) if (!aMap.has(k)) push(ctx, path, 'added', undefined, c);
  for (const [k, c] of aMap) if (!bMap.has(k)) push(ctx, path, 'removed', c, undefined);
}

// ---------------------------------------------------------------- variants

const isVariantArray = (v: unknown): v is Array<Record<string, unknown>> =>
  Array.isArray(v) && v.length > 0 && v.every(e => isObject(e) && 'configuration' in e);

function diffVariants(ctx: Ctx, a: unknown[], b: unknown[], path: string): void {
  const index = (list: unknown[]) => {
    const map = new Map<string, Record<string, unknown>>();
    for (const entry of list) if (isObject(entry)) map.set(configurationKey(entry.configuration), entry);
    return map;
  };
  const aMap = index(a);
  const bMap = index(b);

  for (const [k, entry] of aMap) if (!bMap.has(k)) push(ctx, `${path}[${k}]`, 'removed', entry, undefined);
  for (const [k, entry] of bMap) if (!aMap.has(k)) push(ctx, `${path}[${k}]`, 'added', undefined, entry);
  for (const [k, oldEntry] of aMap) {
    const newEntry = bMap.get(k);
    if (newEntry) walk(ctx, oldEntry, newEntry, `${path}[${k}]`);
  }

  // Position, as one replayable entry carrying both full key orders. Replay
  // removes and appends; a reorder entry is emitted only when the real final
  // order differs from that prediction. The report derives who genuinely moved
  // from the survivor orders via LCS, so removals never masquerade as reorders.
  const keysOf = (list: unknown[]) => list.filter(isObject).map(e => configurationKey(e.configuration));
  const oldKeys = keysOf(a);
  const newKeys = keysOf(b);
  const predicted = oldKeys.filter(k => bMap.has(k)).concat(newKeys.filter(k => !aMap.has(k)));
  if (!deepEqual(predicted, newKeys)) push(ctx, path, 'reordered', oldKeys, newKeys);
}

/**
 * The variants that genuinely moved: relative order among survivors, via longest
 * common subsequence — deletions shifting everything up are not reorders.
 */
export function genuinelyMoved(oldOrder: string[], newOrder: string[]): string[] {
  const a = oldOrder;
  const b = newOrder;
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const stable = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { stable.add(a[i]); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return a.filter(k => !stable.has(k));
}

// ---------------------------------------------------------------- concern docs

const API_SECTIONS = ['title', 'anatomy', 'props', 'invalidPropCombinations', 'subcomponents'];
const VARIANT_SECTIONS = ['default', 'variants', 'subcomponents'];

function diffApiDoc(ctx: Ctx, a: ConcernDoc, b: ConcernDoc, prefix: string): void {
  if (!deepEqual(a.title, b.title)) push(ctx, `${prefix}title`, 'modified', a.title, b.title);
  diffAnatomy(ctx, (a.anatomy ?? {}) as Record<string, unknown>, (b.anatomy ?? {}) as Record<string, unknown>, prefix);
  diffProps(ctx, (a.props ?? {}) as Record<string, unknown>, (b.props ?? {}) as Record<string, unknown>, prefix);
  diffCombinations(
    ctx,
    (a.invalidPropCombinations ?? []) as unknown[],
    (b.invalidPropCombinations ?? []) as unknown[],
    `${prefix}invalidPropCombinations`,
  );
  diffSubcomponents(ctx, a, b, prefix, diffApiDoc);
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (API_SECTIONS.includes(key)) continue;
    walk(ctx, a[key], b[key], `${prefix}${key}`);
  }
}

function diffVariantsDoc(ctx: Ctx, a: ConcernDoc, b: ConcernDoc, prefix: string): void {
  walk(ctx, a.default, b.default, `${prefix}default`);
  const av = (a.variants ?? []) as unknown[];
  const bv = (b.variants ?? []) as unknown[];
  if (isVariantArray(av) || isVariantArray(bv)) diffVariants(ctx, av, bv, `${prefix}variants`);
  else walk(ctx, a.variants, b.variants, `${prefix}variants`);
  diffSubcomponents(ctx, a, b, prefix, diffVariantsDoc);
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (VARIANT_SECTIONS.includes(key)) continue;
    walk(ctx, a[key], b[key], `${prefix}${key}`);
  }
}

function diffSubcomponents(
  ctx: Ctx,
  a: ConcernDoc,
  b: ConcernDoc,
  prefix: string,
  recurse: (ctx: Ctx, a: ConcernDoc, b: ConcernDoc, prefix: string) => void,
): void {
  const as = (a.subcomponents ?? {}) as Record<string, unknown>;
  const bs = (b.subcomponents ?? {}) as Record<string, unknown>;
  for (const name of new Set([...Object.keys(as), ...Object.keys(bs)])) {
    const oldSub = as[name];
    const newSub = bs[name];
    const path = `${prefix}subcomponents.${name}`;
    if (oldSub === undefined) { push(ctx, path, 'added', undefined, newSub); continue; }
    if (newSub === undefined) { push(ctx, path, 'removed', oldSub, undefined); continue; }
    if (!isObject(oldSub) || !isObject(newSub)) { walk(ctx, oldSub, newSub, path); continue; }
    recurse(ctx, oldSub, newSub, `${path}.`);
  }
}

/** Examples concerns: diffed at the example-entry level, whole values. */
function diffExamplesDoc(ctx: Ctx, a: ConcernDoc, b: ConcernDoc): void {
  for (const section of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const av = a[section];
    const bv = b[section];
    if (deepEqual(av, bv)) continue;
    if (!isObject(av) || !isObject(bv)) { walk(ctx, av, bv, section); continue; }
    for (const key of new Set([...Object.keys(av), ...Object.keys(bv)])) {
      const o = av[key];
      const n = bv[key];
      if (deepEqual(o, n)) continue;
      const op: Operation = o === undefined ? 'added' : n === undefined ? 'removed' : 'modified';
      push(ctx, `${section}.${key}`, op, o, n);
    }
  }
}

// ---------------------------------------------------------------- orphan check

/**
 * Cross-check: every variant configuration key/value and $binding target must
 * exist in the current api props. Orphans attach as defects to the api-side entry
 * that caused them; without one they surface as component warnings.
 */
export function findOrphans(component: AssembledComponent): string[] {
  const api = component.concerns.api ?? {};
  const props = (api.props ?? {}) as Record<string, unknown>;
  const orphans: string[] = [];

  const checkScalar = (key: string, value: unknown, def: unknown, where: string) => {
    const allowed = isObject(def) && Array.isArray(def.enum) ? (def.enum as unknown[]) : null;
    if (allowed && typeof value === 'string' && !allowed.includes(value)) {
      orphans.push(`${where} uses \`${key}: ${value}\`, a value api.yaml no longer declares`);
    }
  };

  const checkConfig = (config: unknown, where: string) => {
    if (!isObject(config)) return;
    for (const [key, value] of Object.entries(config)) {
      const def = props[key];
      if (def === undefined) {
        orphans.push(`${where} keys \`${key}\`, which api.yaml no longer declares`);
        continue;
      }
      // A member-keyed value under an object prop (ADR-111) validates per member:
      // each key against the declared members, each value against its member's enum.
      const members = isObject(def) && def.type === 'object' && isObject(def.members)
        ? (def.members as Record<string, unknown>)
        : null;
      if (members && isObject(value)) {
        for (const [memberKey, memberValue] of Object.entries(value)) {
          const member = members[memberKey];
          if (member === undefined) {
            orphans.push(`${where} keys \`${key}.${memberKey}\`, a member api.yaml no longer declares`);
            continue;
          }
          checkScalar(`${key}.${memberKey}`, memberValue, member, where);
        }
        continue;
      }
      checkScalar(key, value, def, where);
    }
  };

  const checkBindings = (node: unknown, where: string) => {
    if (Array.isArray(node)) { node.forEach(n => checkBindings(n, where)); return; }
    if (!isObject(node)) return;
    const binding = node.$binding;
    if (typeof binding === 'string') {
      // A member pointer (ADR-111) crosses the members level; both halves must
      // still be declared.
      const member = binding.match(/^#\/props\/([^/]+)\/members\/([^/]+)$/);
      if (member) {
        const parent = props[member[1]];
        const declared = isObject(parent) && isObject(parent.members)
          ? (parent.members as Record<string, unknown>)[member[2]]
          : undefined;
        if (declared === undefined) {
          orphans.push(`${where} binds \`${binding}\`, but api.yaml no longer declares \`props.${member[1]}.members.${member[2]}\``);
        }
      } else {
        const match = binding.match(/^#\/props\/([^/]+)$/);
        if (match && props[match[1]] === undefined) {
          orphans.push(`${where} binds \`${binding}\`, but api.yaml no longer declares \`props.${match[1]}\``);
        }
      }
    }
    for (const value of Object.values(node)) checkBindings(value, where);
  };

  const variantsDoc = component.concerns.variants;
  if (variantsDoc) {
    const variants = (variantsDoc.variants ?? []) as unknown[];
    for (const v of variants) {
      if (!isObject(v)) continue;
      checkConfig(v.configuration, `variant \`${configurationKey(v.configuration)}\``);
    }
    checkBindings(variantsDoc.default, 'default');
    for (const v of variants) {
      if (isObject(v)) checkBindings(v, `variant \`${configurationKey(v.configuration)}\``);
    }
  }
  return orphans;
}

// ---------------------------------------------------------------- entry point

export interface ComponentDiffOptions {
  ruleSet: RuleSet;
  renames: RenameMap;
}

export interface ComponentDiffResult {
  entries: DiffEntry[];
  warnings: string[];
}

/**
 * Diff two assembled components (base → current). Entries are graded in place
 * from the rule set. Concern files absent on one side diff as empty sections.
 */
export function diffComponent(
  base: AssembledComponent,
  current: AssembledComponent,
  options: ComponentDiffOptions,
): ComponentDiffResult {
  const warnings: string[] = [];
  const entries: DiffEntry[] = [];
  const concernNames = new Set([...Object.keys(base.concerns), ...Object.keys(current.concerns)]);

  for (const concern of concernNames) {
    const a = base.concerns[concern] ?? {};
    const b = current.concerns[concern] ?? {};
    if (deepEqual(a, b)) continue;
    const ctx: Ctx = {
      entries,
      concernFile: `${concern}.yaml`,
      renames: options.renames,
      component: { name: current.name, title: current.title },
    };
    if (concern === 'api') diffApiDoc(ctx, a, b, '');
    else if (concern === 'variants') diffVariantsDoc(ctx, a, b, '');
    else diffExamplesDoc(ctx, a, b);
  }

  // A tracked component rename diffs as one rename, never as an anonymous change.
  const titleEntry = entries.find(e => e.path === 'title' && e.concernFile === 'api.yaml' && e.operation === 'modified');
  if (titleEntry) {
    const event = componentRename(
      options.renames,
      { name: base.name, title: String(titleEntry.oldValue) },
      { name: current.name, title: String(titleEntry.newValue) },
    );
    if (event) titleEntry.operation = 'renamed';
  }

  for (const entry of entries) grade(options.ruleSet, entry);

  // Orphans classify from the api-side change; they are defects to report.
  const orphans = findOrphans(current);
  if (orphans.length > 0) {
    const apiRemovals = entries.filter(e => e.concernFile === 'api.yaml' && (e.operation === 'removed' || e.operation === 'renamed'));
    if (apiRemovals.length > 0) {
      apiRemovals[0].defects = [...(apiRemovals[0].defects ?? []), ...orphans];
    }
    for (const orphan of orphans) warnings.push(`Orphan: ${orphan}`);
  }

  const untrackedTitle = entries.find(e => e.path === 'title' && e.operation === 'modified' && e.concernFile === 'api.yaml');
  if (untrackedTitle && untrackedTitle.operation === 'modified') {
    warnings.push(
      `Title changed \`${untrackedTitle.oldValue}\` → \`${untrackedTitle.newValue}\` with no entry in versions/renames.yaml — record the rename event.`,
    );
  }

  return { entries, warnings };
}

/** Diff previous vs current run facts (latest.metadata.yaml), once per run. */
export function diffRun(
  prev: { generatorVersion?: string; schemaVersion?: string },
  current: { generatorVersion?: string; schemaVersion?: string },
  ruleSet: RuleSet,
): DiffEntry[] {
  const entries: DiffEntry[] = [];
  if (prev.generatorVersion !== current.generatorVersion && (prev.generatorVersion || current.generatorVersion)) {
    entries.push({
      path: 'generator.version', concernFile: 'run', operation: 'modified',
      oldValue: prev.generatorVersion, newValue: current.generatorVersion, impact: 'unclassified',
    });
  }
  if (prev.schemaVersion !== current.schemaVersion && (prev.schemaVersion || current.schemaVersion)) {
    const majorOf = (v?: string) => parseInt((v ?? '0').split('.')[0], 10) || 0;
    const flags = majorOf(prev.schemaVersion) !== majorOf(current.schemaVersion) ? ['schemaMajor'] : undefined;
    entries.push({
      path: 'schema.version', concernFile: 'run', operation: 'modified',
      oldValue: prev.schemaVersion, newValue: current.schemaVersion, impact: 'unclassified',
      ...(flags ? { flags } : {}),
    });
  }
  for (const entry of entries) grade(ruleSet, entry);
  return entries;
}
