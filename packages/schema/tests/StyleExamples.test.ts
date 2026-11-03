/**
 * The two things about `Styles` examples that are specific to `Styles`.
 *
 * Whether an example is a value its schema admits, and whether it repeats the
 * declared default, are checked for every definition in the package by
 * `SchemaExamples.test.ts`. Those assertions lived here first and were removed
 * rather than left to drift against the general ones.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { KEYS_WITHOUT_EXAMPLES } from './styles-exclusions.js';

const pkg = resolve(__dirname, '..');
const props: Record<string, any> = JSON.parse(
  readFileSync(join(pkg, 'schema/styles.schema.json'), 'utf8')
).definitions.Styles.properties;

describe('Styles examples', () => {
  const keys = Object.keys(props);

  const NO_EXAMPLE = KEYS_WITHOUT_EXAMPLES;

  it('cover every property but the ones whose value teaches nothing', () => {
    const missing = keys.filter(
      (k) => !NO_EXAMPLE.includes(k) && (!Array.isArray(props[k].examples) || !props[k].examples.length)
    );
    expect(missing).toEqual([]);
  });

  it('carry no example on the excluded properties', () => {
    const unexpected = NO_EXAMPLE.filter((k) => Array.isArray(props[k].examples) && props[k].examples.length);
    expect(unexpected).toEqual([]);
  });

  /**
   * An example is a value, never a list of the admitted values. Seven of the
   * rows preserved from the hand-written pages were an enum restatement —
   * `"START", "END", "CENTER"` in one cell — which belongs in `enum`, not here.
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
