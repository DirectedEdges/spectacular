/**
 * A member's default is stated twice — `DEFAULT_SETTINGS` supplies the resolved
 * value, `settings.schema.json` publishes it with the `default` keyword — and the
 * two are one contract (Constitution I). Nothing compared them, so for five members
 * they drifted apart and stayed apart across several releases (ADR-112).
 *
 * The comparison is generic rather than a list of expected values: a member added
 * to one side and not the other fails here, which a list would not catch.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SETTINGS } from '../types/index.js';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');

interface SchemaProperty {
  default?: unknown;
}
interface SchemaObject {
  properties?: Record<string, SchemaProperty & SchemaObject>;
}

const schema = JSON.parse(
  readFileSync(join(pkgDir, 'schema', 'settings.schema.json'), 'utf8'),
) as { definitions?: Record<string, SchemaObject> };

/** The `default` keyword of every property directly under one top-level concern. */
const schemaDefaults = (concern: 'curation' | 'spec'): Record<string, unknown> => {
  const properties = schema.definitions?.Settings?.properties?.[concern]?.properties;
  if (!properties) throw new Error(`settings.schema.json declares no ${concern} properties`);
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([, property]) => 'default' in property)
      .map(([key, property]) => [key, property.default]),
  );
};

describe.each(['curation', 'spec'] as const)('%s defaults', concern => {
  const published = schemaDefaults(concern);
  const resolved = DEFAULT_SETTINGS[concern] as Record<string, unknown>;

  it('states the same members on both sides', () => {
    expect(Object.keys(published).sort()).toEqual(Object.keys(resolved).sort());
  });

  it.each(Object.keys(published))('%s agrees between the type and the schema', key => {
    expect(published[key]).toEqual(resolved[key]);
  });
});

/**
 * The five values ADR-112 moved, asserted literally. The generic comparison above
 * passes whenever the two sides agree, including on a value changed in both by
 * mistake — these say which value was decided.
 */
describe('ADR-112 adopted defaults', () => {
  it('serializes to YAML with camelCase keys and alpha-carrying hex colors', () => {
    expect(DEFAULT_SETTINGS.spec.format).toBe('YAML');
    expect(DEFAULT_SETTINGS.spec.keys).toBe('CAMEL');
    expect(DEFAULT_SETTINGS.spec.color).toBe('HEXA');
  });

  it('keeps hand-edited curation selections and collapses an eligible single-child wrapper', () => {
    expect(DEFAULT_SETTINGS.curation.preserveManualSelections).toBe(true);
    expect(DEFAULT_SETTINGS.spec.collapsePrimitiveWrapper).toBe(true);
  });

  /**
   * The four members ADR-112 deliberately left behind. Each gates a feature that
   * reads something a workspace must declare first, so an on-switch is not evidence
   * that the behaviour is the normal case.
   */
  it('leaves the convention-gated feature switches off', () => {
    expect(DEFAULT_SETTINGS.spec.roles).toBe(false);
    expect(DEFAULT_SETTINGS.spec.promotePrimitives).toBe(false);
    expect(DEFAULT_SETTINGS.spec.defaultSlotContent).toBe(false);
    expect(DEFAULT_SETTINGS.spec.roleValidation).toBe('warn');
  });
});
