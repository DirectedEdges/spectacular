/**
 * Every exported TypeScript type has a schema definition and every definition
 * a type (DSPEC-22; CONSTITUTION §I), under two pairing conventions and a
 * reasoned exclusion list.
 *
 * The conventions: a name pairs exactly, or a definition `<X>StyleValue` /
 * `<X>Value` pairs with a type `<X>` or `<X>Style` — TS folds a wrapper union
 * into the type it wraps, where the schema must name the wrapper to reference
 * it.
 *
 * What this closes: the parity window this package's own history shows —
 * definitions gaining types and names drifting apart, caught on inspection
 * rather than by anything. A new type or definition added without its
 * counterpart now fails here unless deliberately excluded with a reason, and
 * a stale exclusion fails from the other side.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { definitionsWithoutType, typesWithoutDefinition } from './parity-exclusions.js';

const pkg = resolve(__dirname, '..');

const exportedTypes = new Set<string>();
for (const match of readFileSync(join(pkg, 'types/index.ts'), 'utf8').matchAll(/export type \{([^}]+)\}/g)) {
  for (const raw of match[1].split(',')) {
    const name = raw.trim().split(/\s+as\s+/).pop();
    if (name) exportedTypes.add(name);
  }
}

const definitions = new Set<string>();
const schemaDir = join(pkg, 'schema');
for (const file of readdirSync(schemaDir).filter(f => f.endsWith('.schema.json'))) {
  const schema = JSON.parse(readFileSync(join(schemaDir, file), 'utf8'));
  for (const name of Object.keys(schema.definitions ?? {})) definitions.add(name);
}

/** The type names a wrapper definition may pair with. */
function wrapperStems(definition: string): string[] {
  for (const suffix of ['StyleValue', 'Value']) {
    if (definition.endsWith(suffix)) {
      const stem = definition.slice(0, -suffix.length);
      return [stem, `${stem}Style`];
    }
  }
  return [];
}

const unpairedDefinitions = [...definitions]
  .filter(d => !exportedTypes.has(d) && !wrapperStems(d).some(s => exportedTypes.has(s)))
  .sort();

const unpairedTypes = [...exportedTypes]
  .filter(t => {
    if (definitions.has(t)) return false;
    // Claimed by a wrapper definition through the same convention.
    const stems = t.endsWith('Style') ? [t.slice(0, -5), t] : [t];
    return !stems.some(s => definitions.has(`${s}StyleValue`) || definitions.has(`${s}Value`));
  })
  .sort();

describe('schema-to-types parity (DSPEC-22)', () => {
  it('reads both publications', () => {
    // Guards the parsers, not the contract: a regex that stops matching would
    // otherwise report perfect parity over two empty sets.
    expect(exportedTypes.size).toBeGreaterThan(100);
    expect(definitions.size).toBeGreaterThan(100);
  });

  it('every definition has a type, or a reasoned exclusion', () => {
    const unexplained = unpairedDefinitions.filter(d => !(d in definitionsWithoutType));
    expect(unexplained).toEqual([]);
  });

  it('every exported type has a definition, or a reasoned exclusion', () => {
    const unexplained = unpairedTypes.filter(t => !(t in typesWithoutDefinition));
    expect(unexplained).toEqual([]);
  });

  it('no exclusion is stale', () => {
    // An entry whose name gained a counterpart, or stopped existing, must
    // leave the list — otherwise the list quietly outgrows the truth.
    const unpairedDefs = new Set(unpairedDefinitions);
    const unpairedTys = new Set(unpairedTypes);
    expect(Object.keys(definitionsWithoutType).filter(d => !unpairedDefs.has(d)).sort()).toEqual([]);
    expect(Object.keys(typesWithoutDefinition).filter(t => !unpairedTys.has(t)).sort()).toEqual([]);
  });
});
