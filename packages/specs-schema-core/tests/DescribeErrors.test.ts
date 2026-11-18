import { describe, it, expect } from 'vitest';
import type { ErrorObject } from 'ajv';
import { describeAjvErrors } from '../src/schemas.js';

/** An ajv error, with only the fields the describer reads. */
const err = (over: Partial<ErrorObject>): ErrorObject => ({
  instancePath: '',
  schemaPath: '#/x',
  keyword: 'type',
  params: {},
  ...over,
} as ErrorObject);

describe('describeAjvErrors', () => {
  it('collapses a failed oneOf over const branches into one message naming the vocabulary', () => {
    // What a closed-vocabulary mistake reported before: three messages for one error,
    // none of them naming a legal value, so the author read the type definitions instead.
    const described = describeAjvErrors([
      err({ instancePath: '/default/elements/root/styles/crossAxisAlignment', keyword: 'const', params: { allowedValue: 'START' } }),
      err({ instancePath: '/default/elements/root/styles/crossAxisAlignment', keyword: 'const', params: { allowedValue: 'CENTER' } }),
      err({ instancePath: '/default/elements/root/styles/crossAxisAlignment', keyword: 'const', params: { allowedValue: 'STRETCH' } }),
      err({ instancePath: '/default/elements/root/styles/crossAxisAlignment', keyword: 'oneOf', params: {}, message: 'must match exactly one schema in oneOf' }),
    ]);
    expect(described).toEqual([
      {
        path: '/default/elements/root/styles/crossAxisAlignment',
        message: 'must be one of: START, CENTER, STRETCH',
      },
    ]);
  });

  it('names null as a permitted value when a nullable branch failed too', () => {
    const described = describeAjvErrors([
      err({ instancePath: '/a', keyword: 'const', params: { allowedValue: 'FILL' } }),
      err({ instancePath: '/a', keyword: 'type', params: { type: 'null' }, message: 'must be null' }),
      err({ instancePath: '/a', keyword: 'oneOf', params: {} }),
    ]);
    expect(described[0].message).toBe('must be one of: FILL, or null');
  });

  it('keeps two unrelated failures apart', () => {
    const described = describeAjvErrors([
      err({ instancePath: '/a', keyword: 'const', params: { allowedValue: 'ONE' } }),
      err({ instancePath: '/a', keyword: 'oneOf', params: {} }),
      err({ instancePath: '/b', keyword: 'required', params: { missingProperty: 'title' } }),
    ]);
    expect(described).toHaveLength(2);
    // A `required` failure names the property that is missing, not the object missing it.
    expect(described.map(d => d.path)).toEqual(['/a', '/b/title']);
    expect(described[1].message).toBe('required property is missing');
  });

  it('describes a group with no union error one error at a time, deduped', () => {
    const described = describeAjvErrors([
      err({ instancePath: '/a', keyword: 'type', params: { type: 'number' }, message: 'must be number' }),
      err({ instancePath: '/a', keyword: 'type', params: { type: 'number' }, message: 'must be number' }),
    ]);
    expect(described).toEqual([{ path: '/a', message: 'must be number' }]);
  });

  it('still prints an enum vocabulary when the enum failed on its own', () => {
    const described = describeAjvErrors([
      err({ instancePath: '/a', keyword: 'enum', params: { allowedValues: ['YAML', 'JSON'] } }),
    ]);
    expect(described[0].message).toBe('must be one of: YAML, JSON');
  });
});
