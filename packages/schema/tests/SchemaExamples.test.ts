/**
 * Every `examples` value is a value its own schema admits, and every `$ref`
 * resolves.
 *
 * Structural, not a validator. The constitution permits this package no runtime
 * dependency and only `typescript` as a devDependency, so there is no Ajv here
 * to call. The matcher below walks the schema it is given — following `$ref`
 * across files, trying each branch of a `oneOf`/`anyOf`, and checking `type`,
 * `const`, `enum`, `required`, `additionalProperties`, `minItems` and
 * `minProperties`.
 *
 * What it does not do: `pattern`, `format`, numeric bounds, `not`,
 * `dependencies`, or tuple `items`. A real validator is the conformance
 * suite's job. This exists to catch the drift that actually happens — an
 * example written against a definition that later gains a required member, or
 * a `$ref` left pointing at a renamed definition.
 *
 * Both were worth writing: authoring the examples produced a `Shadow` given
 * `radius` where the schema requires `blur`, a `Conditional` whose `args.value`
 * was a pointer string where a `PropBinding` object is required, and a
 * `RunMetadata` missing three required members.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const schemaDir = resolve(__dirname, '../schema');
const files = readdirSync(schemaDir).filter((f) => f.endsWith('.json'));
const schemas: Record<string, any> = Object.fromEntries(
  files.map((f) => [f, JSON.parse(readFileSync(join(schemaDir, f), 'utf8'))])
);

type Node = Record<string, any>;

/** Resolve a `$ref`, which may name another file in this directory. */
const resolveRef = (ref: string, from: string): { node: Node | null; file: string } => {
  const [filePart, pointer] = ref.split('#');
  const file = filePart ? filePart : from;
  const doc = schemas[file];
  if (!doc || !pointer) return { node: null, file };
  const segments = pointer.split('/').filter(Boolean);
  let node: any = doc;
  for (const seg of segments) {
    node = node?.[seg.replace(/~1/g, '/').replace(/~0/g, '~')];
    if (node === undefined) return { node: null, file };
  }
  return { node, file };
};

/** Follow `$ref` chains until a concrete node is reached. */
const deref = (node: Node | null, file: string, depth = 0): { node: Node | null; file: string } => {
  if (!node || depth > 10) return { node, file };
  if (typeof node.$ref === 'string') {
    const next = resolveRef(node.$ref, file);
    return deref(next.node, next.file, depth + 1);
  }
  return { node, file };
};

/** Whether a value satisfies the keywords this matcher understands. */
const admits = (schema: Node | null, value: unknown, file: string, depth = 0): boolean => {
  if (!schema || depth > 12) return true;
  const { node: n, file: f } = deref(schema, file, 0);
  if (!n) return true;

  const branches = n.oneOf ?? n.anyOf;
  if (Array.isArray(branches)) {
    if (!branches.some((b) => admits(b, value, f, depth + 1))) return false;
  }
  if (Array.isArray(n.allOf) && !n.allOf.every((b: Node) => admits(b, value, f, depth + 1))) return false;

  if (n.const !== undefined && JSON.stringify(n.const) !== JSON.stringify(value)) return false;
  if (Array.isArray(n.enum) && !n.enum.some((e: unknown) => JSON.stringify(e) === JSON.stringify(value))) return false;

  const types: string[] | null = typeof n.type === 'string' ? [n.type] : Array.isArray(n.type) ? n.type : null;
  if (types) {
    const actual =
      value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'number' ? 'number' : typeof value;
    const ok = types.some((t) => (t === 'integer' ? actual === 'number' : t === actual));
    if (!ok) return false;
  }

  if (Array.isArray(value)) {
    if (typeof n.minItems === 'number' && value.length < n.minItems) return false;
    if (n.items && !value.every((v) => admits(n.items, v, f, depth + 1))) return false;
    return true;
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof n.minProperties === 'number' && Object.keys(obj).length < n.minProperties) return false;
    for (const req of n.required ?? []) if (!(req in obj)) return false;
    for (const [key, v] of Object.entries(obj)) {
      const sub = n.properties?.[key];
      if (sub) {
        if (!admits(sub, v, f, depth + 1)) return false;
        continue;
      }
      const pattern = Object.entries(n.patternProperties ?? {}).find(([re]) => new RegExp(re).test(key));
      if (pattern) {
        if (!admits(pattern[1] as Node, v, f, depth + 1)) return false;
        continue;
      }
      if (n.additionalProperties === false) return false;
      if (n.additionalProperties && typeof n.additionalProperties === 'object') {
        if (!admits(n.additionalProperties, v, f, depth + 1)) return false;
      }
    }
  }

  return true;
};

/** Every node carrying `examples`, with where it lives. */
const exampleSites = (): { file: string; path: string; node: Node }[] => {
  const out: { file: string; path: string; node: Node }[] = [];
  for (const file of files) {
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach((c, i) => walk(c, `${path}/${i}`));
        return;
      }
      const n = node as Node;
      if (Array.isArray(n.examples) && n.examples.length) out.push({ file, path, node: n });
      for (const [key, value] of Object.entries(n)) {
        // `examples` and `default` hold instance data, not subschemas.
        if (key === 'examples' || key === 'default') continue;
        if (value && typeof value === 'object') walk(value, `${path}/${key}`);
      }
    };
    walk(schemas[file].definitions, '');
  }
  return out;
};

describe('schema examples', () => {
  const sites = exampleSites();

  it('exist in quantity', () => {
    expect(sites.length).toBeGreaterThan(100);
  });

  it('are each a value their own schema admits', () => {
    const bad: string[] = [];
    for (const { file, path, node } of sites) {
      node.examples.forEach((ex: unknown, i: number) => {
        if (!admits(node, ex, file)) bad.push(`${file}${path}/examples/${i} — ${JSON.stringify(ex).slice(0, 70)}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('never repeat the declared default', () => {
    const repeats: string[] = [];
    for (const { file, path, node } of sites) {
      if (!Object.prototype.hasOwnProperty.call(node, 'default')) continue;
      if (node.examples.some((ex: unknown) => JSON.stringify(ex) === JSON.stringify(node.default))) {
        repeats.push(`${file}${path}`);
      }
    }
    expect(repeats).toEqual([]);
  });
});

describe('schema references', () => {
  it('all resolve', () => {
    const broken: string[] = [];
    for (const file of files) {
      const walk = (node: unknown, path: string) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          node.forEach((c, i) => walk(c, `${path}/${i}`));
          return;
        }
        const n = node as Node;
        if (typeof n.$ref === 'string' && resolveRef(n.$ref, file).node === null) {
          broken.push(`${file}${path} -> ${n.$ref}`);
        }
        for (const [key, value] of Object.entries(n)) {
          if (key === 'examples' || key === 'default') continue;
          if (value && typeof value === 'object') walk(value, `${path}/${key}`);
        }
      };
      walk(schemas[file].definitions, '');
    }
    expect(broken).toEqual([]);
  });

  /**
   * A cross-file `$ref` names a file in this directory.
   *
   * Walked rather than grepped. An earlier version scanned the raw text and
   * flagged `foundations#/definitions/glyph` — which is an `ElementTypeRef`
   * *example value*, not a reference the schema makes. Grepping a schema for
   * `$ref` reads its example data as if it were schema.
   */
  it('name a file that exists when they cross one', () => {
    const missingFiles: string[] = [];
    for (const file of files) {
      const walk = (node: unknown, path: string) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          node.forEach((c, i) => walk(c, `${path}/${i}`));
          return;
        }
        const n = node as Node;
        if (typeof n.$ref === 'string') {
          const [filePart] = n.$ref.split('#');
          if (filePart && !schemas[filePart]) missingFiles.push(`${file}${path} -> ${filePart}`);
        }
        for (const [key, value] of Object.entries(n)) {
          if (key === 'examples' || key === 'default') continue;
          if (value && typeof value === 'object') walk(value, `${path}/${key}`);
        }
      };
      walk(schemas[file].definitions, '');
    }
    expect(missingFiles).toEqual([]);
  });
});
