/**
 * Enforces ADR-113 — DSPEC-44 and DSPEC-45 — and ADR-116 — DSPEC-52 and DSPEC-53.
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
 *
 * ADR-116 extends the same question to the composite types a style property
 * resolves to. An optional member can be absent, so it answers the question; a
 * required member cannot, so declaring one there would describe nothing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEMBERS_WITHOUT_DEFAULTS } from './styles-exclusions.js';

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

/**
 * The four value forms are documented once at the schema root and are not style
 * composites: they describe how any value may be written, not a shape a style
 * key resolves to. A `default` is forbidden on all of them by DSPEC-45 anyway.
 */
const VALUE_FORMS = new Set([
  'TokenReference',
  'PropBinding',
  'Conditional',
  'ConditionArgs',
  'ConditionExpression',
  'ReferenceValue',
  'VariableStyle',
  'StyleIdValue',
  'MixedValue',
]);

/** Every named object definition reachable from `Styles`, by traversal rather than by list. */
const composites = (() => {
  const found = new Map<string, any>();
  const seen = new Set<string>();
  const visit = (node: any, depth = 0) => {
    if (!node || depth > 8) return;
    if (typeof node.$ref === 'string' && node.$ref.startsWith('#/definitions/')) {
      const name = node.$ref.replace('#/definitions/', '');
      if (seen.has(name)) return;
      seen.add(name);
      const def = schema.definitions[name];
      if (!def) return;
      if (def.properties && !VALUE_FORMS.has(name)) found.set(name, def);
      visit(def, depth + 1);
      return;
    }
    for (const branch of ['oneOf', 'anyOf', 'allOf']) {
      if (Array.isArray(node[branch])) node[branch].forEach((b: any) => visit(b, depth + 1));
    }
    if (node.items) visit(node.items, depth + 1);
    if (node.not) visit(node.not, depth + 1);
    for (const member of Object.values(node.properties ?? {})) visit(member, depth + 1);
  };
  for (const key of keys) visit(props[key]);
  return found;
})();

/** `Type.member` for every member of every composite, split by whether it can be absent. */
const members = (() => {
  const optional: string[] = [];
  const required: string[] = [];
  for (const [type, def] of composites) {
    const req = new Set<string>(def.required ?? []);
    for (const member of Object.keys(def.properties)) {
      (req.has(member) ? required : optional).push(`${type}.${member}`);
    }
  }
  return { optional: optional.sort(), required: required.sort() };
})();

const memberSchema = (path: string): any => {
  const [type, member] = path.split('.');
  return composites.get(type).properties[member];
};

/**
 * The optional members ADR-116 deliberately leaves without a `default`. The
 * list and the reason for each entry are in `styles-exclusions.ts`.
 *
 * `lineHeight` is no longer among them. The contract spelled automatic leading
 * `'auto'` in the member's own description and `'AUTO'` everywhere a document
 * or a transform writes it; `'AUTO'` is now the only spelling the contract
 * carries, and the member declares it.
 *
 * The list is asserted in both directions. A member removed from it must declare
 * a default, and a member added to it must be argued for in the ADR first.
 */
const UNDECLARED = MEMBERS_WITHOUT_DEFAULTS;

const hasDefault = (node: any) => Object.prototype.hasOwnProperty.call(node, 'default');

describe('DSPEC-52 — an optional composite member declares a default', () => {
  it('reaches the composite types it is meant to', () => {
    // A traversal that silently stopped short would pass every assertion below
    // on an empty set.
    expect([...composites.keys()].sort()).toEqual([
      'AngularGradient',
      'AspectRatioValue',
      'Blur',
      'ColorObject',
      'Corners',
      'Effects',
      'GradientCenter',
      'GradientStop',
      'ImageValue',
      'ItemSpacing',
      'LinearGradient',
      'RadialGradient',
      'Shadow',
      'Sides',
      'StrokeDashPattern',
      'Typography',
    ]);
  });

  for (const path of members.optional.filter((p) => !UNDECLARED.includes(p))) {
    it(`${path} declares one`, () => {
      expect(hasDefault(memberSchema(path))).toBe(true);
    });
  }

  it('leaves undeclared only the members ADR-116 names', () => {
    const missing = members.optional.filter((p) => !hasDefault(memberSchema(p)));
    expect(missing).toEqual(UNDECLARED);
  });
});

describe('DSPEC-52 — a declared member default is a value its member accepts', () => {
  for (const path of members.optional.filter((p) => hasDefault(memberSchema(p)))) {
    it(`${path}'s default is an admitted type`, () => {
      const node = memberSchema(path);
      const admitted = admittedTypes(node);
      expect(admitted.size, `${path}: could not determine admitted types`).toBeGreaterThan(0);
      expect(
        admitted.has(jsonType(node.default)),
        `${path}: default ${JSON.stringify(node.default)} is ${jsonType(node.default)}, member admits ${[...admitted].join(' | ')}`
      ).toBe(true);
    });
  }
});

describe('DSPEC-45 — a declared member default is a literal', () => {
  for (const path of members.optional.filter((p) => hasDefault(memberSchema(p)))) {
    it(`${path}'s default carries no reference or conditional`, () => {
      const d = memberSchema(path).default;
      if (d === null || typeof d !== 'object') return;
      for (const marker of ['$token', '$binding', '$image', '$slotContent', 'if']) {
        expect(marker in (d as Record<string, unknown>), `${path}: default carries ${marker}`).toBe(false);
      }
    });
  }
});

describe('DSPEC-53 — a required composite member declares no default', () => {
  for (const path of members.required) {
    it(`${path} declares none`, () => {
      // A required member cannot be absent, so a default there answers a
      // question no document can ask.
      expect(hasDefault(memberSchema(path))).toBe(false);
    });
  }
});

/**
 * `Sides`, `Corners` and `ItemSpacing` are the per-part expansion of a scalar
 * style key: `padding: 8` and `padding: { top: 8, … }` say the same kind of
 * thing. Their member defaults are declared once on the shared composite, so a
 * style key reaching one must agree with it — `Sides` serves both `padding` and
 * `strokeWeight`, and a third key defaulting to anything but `0` would make
 * `Sides.top` wrong by that path with nothing else to catch it.
 *
 * Compared only where the two defaults are the same JSON type. `strokes`
 * defaults to `null` and reaches `ColorObject`, whose `alpha` defaults to `1`;
 * those answer different questions and are not each other's business.
 */
describe('A style key agrees with the member defaults of a composite it expands into', () => {
  const arms = (key: string): any[] => {
    const r = resolve(props[key]);
    return Array.isArray(r?.oneOf) ? r.oneOf : [];
  };

  for (const key of keys) {
    for (const arm of arms(key)) {
      const name = typeof arm.$ref === 'string' ? arm.$ref.replace('#/definitions/', '') : null;
      if (!name || !composites.has(name)) continue;
      for (const member of Object.keys(composites.get(name).properties)) {
        const node = composites.get(name).properties[member];
        if (!hasDefault(node)) continue;
        if (jsonType(node.default) !== jsonType(props[key].default)) continue;
        it(`${key} and ${name}.${member} declare the same default`, () => {
          expect(node.default).toEqual(props[key].default);
        });
      }
    }
  }
});
