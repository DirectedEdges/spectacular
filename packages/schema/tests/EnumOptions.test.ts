/**
 * Closed value sets are declared as `oneOf` branches of `const` with a
 * description, never as a bare `enum` array (ADR-114).
 *
 * JSON Schema has no per-enum-member annotation keyword in any draft, so a
 * bare `enum` can list its values and say nothing about any of them. The
 * specification project closed that request by endorsing this pattern rather
 * than adding a keyword, which is what these tests hold the schema to.
 *
 * The exclusivity check is the one that earns its place. `oneOf` requires
 * exactly one branch to match, so a `const` branch beside an open branch of
 * the same type inverts: the legal value matches two branches and is rejected
 * while an illegal one passes. That failure is silent and reads as a typo.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const schemaDir = resolve(__dirname, '../schema');
const files = readdirSync(schemaDir).filter((f) => f.endsWith('.json'));

type Node = Record<string, any>;

/**
 * Keywords whose contents are instance data, not subschemas. Descending into
 * them reads a document as a schema: `EnumProp` has a *property* named `enum`,
 * so an example of an enum prop contains `enum: ["primary", "secondary"]` —
 * which is a value, and was reported as a bare enum declaration.
 */
const VALUE_KEYWORDS = new Set(['examples', 'default', 'const', 'enum']);

/** Every subschema in a file, with a JSON-pointer-ish path for reporting. */
const walk = (node: unknown, path: string, visit: (n: Node, p: string) => void): void => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, `${path}/${i}`, visit));
    return;
  }
  visit(node as Node, path);
  for (const [key, value] of Object.entries(node)) {
    if (VALUE_KEYWORDS.has(key)) continue;
    if (value && typeof value === 'object') walk(value, `${path}/${key}`, visit);
  }
};

const parsed: Record<string, Node> = Object.fromEntries(
  files.map((f) => [f, JSON.parse(readFileSync(join(schemaDir, f), 'utf8'))])
);

const eachFile = (visit: (n: Node, p: string, file: string) => void) => {
  for (const file of files) {
    walk(parsed[file].definitions, file, (n, p) => visit(n, p, file));
  }
};

/**
 * A branch, with a local `$ref` followed one hop.
 *
 * Sentinels are declared once and referenced — `MixedValue` holds `mixed` for
 * every property that can receive it. A check that only reads inline `const`
 * branches stops seeing them the moment they are factored out, and passes
 * because it is looking at nothing.
 */
const deref = (branch: Node, file: string): Node => {
  const ref: string | undefined = branch?.$ref;
  if (!ref?.startsWith('#/definitions/')) return branch;
  return parsed[file]?.definitions?.[ref.replace('#/definitions/', '')] ?? branch;
};

/**
 * Branches of a `oneOf`/`anyOf` that pin a single value.
 *
 * The `Array.isArray` guard is load-bearing: `SlotProp` has a *property* named
 * `anyOf`, so `node.anyOf` is sometimes a schema object rather than a list of
 * branches.
 */
const branchesOf = (node: Node): Node[] => {
  const branches = node.oneOf ?? node.anyOf;
  return Array.isArray(branches) ? (branches as Node[]) : [];
};

const constBranches = (node: Node): Node[] =>
  branchesOf(node).filter((b) => b && b.const !== undefined);


describe('closed value sets', () => {
  it('are never declared as a bare enum', () => {
    const found: string[] = [];
    eachFile((n, p) => {
      if (Array.isArray(n.enum)) found.push(`${p} — ${JSON.stringify(n.enum)}`);
    });
    expect(found).toEqual([]);
  });

  it('exist — the walker is reaching them', () => {
    let sets = 0;
    eachFile((n) => {
      if (constBranches(n).length > 1) sets += 1;
    });
    expect(sets).toBeGreaterThanOrEqual(31);
  });

  it('describe every option', () => {
    const bare: string[] = [];
    eachFile((n, p) => {
      const branches = constBranches(n);
      if (branches.length < 2) return;
      for (const b of branches) {
        // A `title` alone is a label, not a meaning. One of the two must say
        // what choosing the option does.
        if (!b.description && !b.title) bare.push(`${p} — ${JSON.stringify(b.const)}`);
      }
    });
    expect(bare).toEqual([]);
  });

  /**
   * A `title` identical to its value is a copy of the value.
   *
   * Only an exact match is checked. A near-match is often the point: `srgb`
   * titled "sRGB" and `rec2020` titled "Rec. 2020" supply the standard's own
   * spelling, which a reader cannot derive from the identifier. An earlier
   * version of this test normalised case and punctuation away and flagged all
   * eight colour-space titles, none of which were noise.
   */
  it('never title an option with a copy of its own value', () => {
    const noise: string[] = [];
    eachFile((n, p) => {
      for (const b of constBranches(n)) {
        if (typeof b.title === 'string' && b.title === String(b.const)) {
          noise.push(`${p} — ${JSON.stringify(b.const)} titled ${JSON.stringify(b.title)}`);
        }
      }
    });
    expect(noise).toEqual([]);
  });

  /**
   * No value may satisfy two branches of the same `oneOf`. Checked for the
   * specific collision the conversion can introduce: a `const` beside an open
   * branch of that value's own type.
   */
  it('keep their branches mutually exclusive', () => {
    const clashes: string[] = [];
    /**
     * An open branch is one admitting a whole JSON type. A branch that excludes
     * the sentinel with `not` is no longer open to it, which is how a declared
     * sentinel and a free-form string of the same type stay disjoint.
     */
    const openType = (b: Node): string | null =>
      b.const === undefined && typeof b.type === 'string' && !b.enum && !b.not ? b.type : null;

    eachFile((n, p, file) => {
      const branches = branchesOf(n).map((b) => ({ raw: b, resolved: deref(b, file) }));
      if (branches.length < 2) return;
      const consts = branches.filter((b) => b.resolved?.const !== undefined).map((b) => b.resolved);
      if (!consts.length) return;

      for (const b of branches) {
        const open = openType(b.raw);
        if (!open) continue;
        for (const c of consts) {
          const constType = c.const === null ? 'null' : typeof c.const === 'number' ? 'number' : typeof c.const;
          if (constType === open) {
            clashes.push(`${p} — const ${JSON.stringify(c.const)} also matches an open {type: "${open}"} branch`);
          }
        }
      }

      // Two branches pinning the same value is the simpler clash.
      const seen = new Set<string>();
      for (const c of consts) {
        const key = JSON.stringify(c.const);
        if (seen.has(key)) clashes.push(`${p} — ${key} is pinned by two branches`);
        seen.add(key);
      }
    });
    expect(clashes).toEqual([]);
  });
});
