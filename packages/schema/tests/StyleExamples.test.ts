/**
 * Every `Styles` property declares `examples`, and every example is a value the
 * property actually admits.
 *
 * Structural checking, not validation. The schema package takes no validator
 * dependency by constitutional rule, so this walks the property's own union and
 * asks whether each example matches one branch. That catches the mistakes that
 * actually happened while writing them — a `Shadow` given `radius` where the
 * schema requires `blur`, and a `Conditional` whose `args.value` was a pointer
 * string where the schema requires a `PropBinding` object.
 *
 * A real validator pass over every definition's examples is the separate
 * conformance-suite question.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const pkg = resolve(__dirname, '..');
const schema = JSON.parse(readFileSync(join(pkg, 'schema/styles.schema.json'), 'utf8'));
const defs: Record<string, any> = schema.definitions;
const props: Record<string, any> = defs.Styles.properties;

const deref = (node: any): any =>
  node?.$ref ? deref(defs[node.$ref.replace('#/definitions/', '')]) : node;

/** Whether a value matches one branch of a (possibly nested) schema node. */
const matches = (node: any, value: unknown, depth = 0): boolean => {
  if (!node || depth > 8) return true;
  const n = deref(node);

  const branches = n.oneOf ?? n.anyOf;
  if (Array.isArray(branches)) return branches.some((b) => matches(b, value, depth + 1));

  if (Array.isArray(n.enum)) return n.enum.includes(value as never);
  if (n.const !== undefined) return n.const === value;

  const type = n.type;
  if (type === 'null') return value === null;
  if (type === 'string') return typeof value === 'string';
  if (type === 'number' || type === 'integer') return typeof value === 'number';
  if (type === 'boolean') return typeof value === 'boolean';

  if (type === 'array') {
    if (!Array.isArray(value)) return false;
    return n.items ? value.every((v) => matches(n.items, v, depth + 1)) : true;
  }

  if (type === 'object' || n.properties) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const obj = value as Record<string, unknown>;
    for (const req of n.required ?? []) if (!(req in obj)) return false;
    for (const [key, v] of Object.entries(obj)) {
      const sub = n.properties?.[key];
      if (!sub) {
        if (n.additionalProperties === false) return false;
        continue;
      }
      if (!matches(sub, v, depth + 1)) return false;
    }
    return true;
  }

  return true;
};

describe('Styles examples', () => {
  const keys = Object.keys(props);

  it('cover every property', () => {
    const missing = keys.filter((k) => !Array.isArray(props[k].examples) || !props[k].examples.length);
    expect(missing).toEqual([]);
  });

  for (const key of keys) {
    it(`${key}: every example is a value the property admits`, () => {
      const bad = (props[key].examples ?? []).filter((ex: unknown) => !matches(props[key], ex));
      expect(bad).toEqual([]);
    });
  }

  /**
   * An example equal to the default teaches nothing: the `Default` section on
   * the page already states it, so the row is a duplicate.
   */
  it('never repeat the declared default', () => {
    const repeats = keys.filter(
      (k) =>
        Object.prototype.hasOwnProperty.call(props[k], 'default') &&
        (props[k].examples ?? []).some((ex: unknown) => JSON.stringify(ex) === JSON.stringify(props[k].default))
    );
    expect(repeats).toEqual([]);
  });

  /**
   * An example is a value, never a list of the admitted values. Seven of the
   * preserved page rows were an enum restatement — `"START", "END", "CENTER"`
   * in one cell — which belongs in `enum`, not here.
   */
  it('are single values, not enumerations', () => {
    const bad: string[] = [];
    for (const key of keys) {
      for (const ex of props[key].examples ?? []) {
        if (typeof ex === 'string' && /",\s*"/.test(ex)) bad.push(`${key}: ${ex}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
