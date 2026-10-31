/**
 * Enforces ADR-113 — DSPEC-44 and DSPEC-45.
 *
 * Every property of `Styles` must declare a `default`, and that default must be
 * a value the property itself accepts. A declared default that does not satisfy
 * its own property would be a published falsehood, and until this test existed
 * nothing could catch one.
 *
 * The package carries no JSON-Schema validator dependency (devDependencies are
 * `typescript` only, Constitution §Language/Tooling), so this checks the declared
 * value against the property's resolved value definition structurally rather than
 * by running a validator. That is narrower than full validation and is enough for
 * the failure this guards: a default of the wrong kind.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  readFileSync(join(here, '..', 'schema', 'styles.schema.json'), 'utf8')
) as { definitions: Record<string, any> };

const props = schema.definitions.Styles.properties as Record<string, any>;
const keys = Object.keys(props);

/** Follow a local `$ref` one hop. */
const resolve = (node: any): any =>
  node?.$ref?.startsWith('#/definitions/')
    ? schema.definitions[node.$ref.replace('#/definitions/', '')]
    : node;

/** Every JSON type a definition's union admits, flattened one level. */
const admittedTypes = (node: any): Set<string> => {
  const out = new Set<string>();
  const visit = (n: any, depth = 0) => {
    if (!n || depth > 3) return;
    const r = resolve(n);
    if (!r) return;
    if (typeof r.type === 'string') out.add(r.type);
    if (Array.isArray(r.type)) r.type.forEach((t: string) => out.add(t));
    if (r.const !== undefined) out.add(r.const === null ? 'null' : typeof r.const);
    if (Array.isArray(r.enum)) r.enum.forEach((v: unknown) => out.add(v === null ? 'null' : typeof v));
    for (const branch of ['oneOf', 'anyOf', 'allOf']) {
      if (Array.isArray(r[branch])) r[branch].forEach((b: any) => visit(b, depth + 1));
    }
    if (r.properties || r.patternProperties || r.additionalProperties) out.add('object');
  };
  visit(node);
  return out;
};

const jsonType = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;

describe('DSPEC-44 — every Styles property declares a default', () => {
  for (const key of keys) {
    it(`${key} declares one`, () => {
      // Presence, not truthiness: `default: null` is a declaration that the
      // default is "apply nothing", and is distinct from no default at all.
      expect(Object.prototype.hasOwnProperty.call(props[key], 'default')).toBe(true);
    });
  }

  it('declares one for all 46', () => {
    const missing = keys.filter((k) => !Object.prototype.hasOwnProperty.call(props[k], 'default'));
    expect(missing).toEqual([]);
  });
});

describe('DSPEC-44 — a declared default is a value its property accepts', () => {
  for (const key of keys) {
    it(`${key}'s default is an admitted type`, () => {
      const declared = props[key].default;
      const admitted = admittedTypes(props[key]);
      // A value definition that admits nothing recognisable is a gap in this
      // test, not a pass — fail loudly rather than vacuously.
      expect(admitted.size, `${key}: could not determine admitted types`).toBeGreaterThan(0);
      expect(admitted.has(jsonType(declared)), `${key}: default ${JSON.stringify(declared)} is ${jsonType(declared)}, property admits ${[...admitted].join(' | ')}`).toBe(true);
    });
  }
});

describe('DSPEC-45 — a declared default is a literal', () => {
  for (const key of keys) {
    it(`${key}'s default carries no reference or conditional`, () => {
      const d = props[key].default;
      if (d === null || typeof d !== 'object') return;
      // A default must not be a TokenReference, PropBinding, ImageValue or
      // Conditional: it is what a reader assumes with no authored value, so it
      // cannot itself need resolving.
      for (const marker of ['$token', '$binding', '$image', '$slotContent', 'if']) {
        expect(marker in (d as Record<string, unknown>), `${key}: default carries ${marker}`).toBe(false);
      }
    });
  }
});
