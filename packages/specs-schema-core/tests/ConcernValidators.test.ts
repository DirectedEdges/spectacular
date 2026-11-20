/**
 * Which definitions each kind's concern documents validate against.
 *
 * A composition's documents are its own exact shape (ADR-109), not a loosened
 * form of a component's: no props, no variants, and elements and layout at the
 * top level. Validating one against the component definitions reported three
 * errors per spec naming members a composition is not supposed to have and
 * cannot be given, which is what this guards.
 */

import { describe, expect, it } from 'vitest';
import { concernValidators } from '../src/index.js';

const compositionVariants = {
  metadata: { source: { pageId: '1:1', nodeId: '1:2', nodeType: 'FRAME' }, concern: 'variants' },
  elements: { root: { styles: { padding: 8 } } },
  layout: ['root'],
};

const componentVariants = {
  metadata: { source: { pageId: '1:1', nodeId: '1:2', nodeType: 'COMPONENT' }, concern: 'variants' },
  default: { elements: { root: { styles: { padding: 8 } } }, layout: ['root'] },
  variants: [],
};

describe('concernValidators', () => {
  it('accepts a composition variants document under the composition kind', () => {
    expect(concernValidators('composition').variants(compositionVariants)).toBe(true);
  });

  it('rejects that same document under the component kind', () => {
    // The old behaviour, kept as the thing the kind argument distinguishes: the
    // component definition wants `default` and `variants`, which a composition
    // has no way to supply.
    expect(concernValidators('component').variants(compositionVariants)).toBe(false);
  });

  it('accepts a component variants document under the component kind', () => {
    expect(concernValidators('component').variants(componentVariants)).toBe(true);
  });

  it('defaults to the component kind, so an existing caller is unchanged', () => {
    expect(concernValidators().variants(componentVariants)).toBe(true);
  });

  it('serves each concern of each kind', () => {
    for (const kind of ['component', 'composition'] as const) {
      const v = concernValidators(kind);
      for (const concern of ['api', 'variants', 'examples'] as const) {
        expect(typeof v[concern]).toBe('function');
      }
    }
  });

  it('caches per kind rather than serving one kind from the other', () => {
    expect(concernValidators('composition')).toBe(concernValidators('composition'));
    expect(concernValidators('composition')).not.toBe(concernValidators('component'));
  });
});
