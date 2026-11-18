/**
 * Validating the split form: each concern document against its own schema
 * definition, the rule catalogue over the merged whole. The cross-concern
 * cases are the reason the merge lives in this package — a configuration in
 * the variants document is only judgeable against the props the api document
 * declares.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { mergeConcerns, validateConcernSet } from '../src/index.js';

function fixtureDoc(name: string): Record<string, unknown> {
  const raw = parseYaml(readFileSync(resolve(__dirname, 'fixtures/positive', name), 'utf8'));
  return raw.document;
}

const api = fixtureDoc('component-concern.api.yaml');
const variants = fixtureDoc('component-concern.variants.yaml');
const examples = fixtureDoc('component-concern.examples.yaml');

describe('validateConcernSet', () => {
  it('passes the three positive concern fixtures as one set', () => {
    const result = validateConcernSet({ api, variants, examples });
    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('judges a variants configuration against the api document’s props', () => {
    const badVariants = {
      ...variants,
      variants: [{ configuration: { tone: 'critical' }, elements: {} }],
    };
    const result = validateConcernSet({ api, variants: badVariants });
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual([
      {
        rule: 'DSPEC-11',
        concern: 'variants',
        path: '/variants/0/configuration/tone',
        message: 'prop "tone" is not declared in props',
      },
    ]);
  });

  it('attributes a schema failure to the concern file carrying it', () => {
    const badExamples = { ...examples, instanceExamples: { orientation: 'GRID', items: {} } };
    const result = validateConcernSet({ api, examples: badExamples });
    expect(result.valid).toBe(false);
    expect(result.violations.every(v => v.rule === 'schema' && v.concern === 'examples')).toBe(true);
  });

  it('validates a composition concern set under specKind composition', () => {
    const composition = fixtureDoc('composition-concern.variants.yaml');
    const result = validateConcernSet({ variants: composition }, { specKind: 'composition' });
    expect(result.violations).toEqual([]);
  });
});

describe('mergeConcerns', () => {
  it('drops metadata and merges subcomponent slices per key', () => {
    const merged = mergeConcerns({
      api: {
        metadata: { concern: 'api' },
        title: 'Card',
        subcomponents: { header: { title: 'Header', anatomy: { root: { type: 'container' } } } },
      },
      variants: {
        metadata: { concern: 'variants' },
        subcomponents: { header: { default: { elements: {} } } },
      },
    });
    expect(merged.metadata).toBeUndefined();
    expect(merged.title).toBe('Card');
    expect(merged.subcomponents).toEqual({
      header: {
        title: 'Header',
        anatomy: { root: { type: 'container' } },
        default: { elements: {} },
      },
    });
  });
});
