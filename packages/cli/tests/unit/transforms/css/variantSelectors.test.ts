// What a variant's configuration becomes, selector-wise (specs#691).
//
// Worth testing directly because the failure is silent. Expand wrongly and the
// state has no rule, so it renders as the default — no error, no warning, and
// the prop still reaches the contract and the stories, so it looks supported.
// Until this was pulled out of `buildCssLines` the only way to reach it was to
// generate a whole stylesheet and read it.
import { describe, it, expect } from 'vitest';
import { expandVariantSelectors, type VariantSelectorInput } from '../../../../src/transforms/css/sheet/variantSelectors.js';
import { flattenMemberValues } from '../../../../src/transforms/css/sheet/variantBlock.js';

/** Concept selectors as the real table supplies them, including the multi-part ones. */
const SELECTORS: Record<string, string> = {
  hover: ':hover',
  active: ':active',
  disabled: ':disabled, [aria-disabled="true"]',
  selected: '[aria-selected="true"]',
  checked: ':checked, [aria-checked="true"]',
  invalid: '[aria-invalid="true"]',
};

function input(overrides: Partial<VariantSelectorInput> = {}): VariantSelectorInput {
  return {
    configuration: {},
    classifiedProps: new Set(),
    stateLookup: new Map(),
    nestedClaimedPairs: new Set(),
    selectorFor: concept => SELECTORS[concept],
    attrNameFor: prop => `data-${prop}`,
    guardsDisabled: false,
    ...overrides,
  };
}

describe('an enum state concept', () => {
  it('becomes the concept selector, not a data attribute', () => {
    const result = expandVariantSelectors(input({
      configuration: { state: 'hover' },
      classifiedProps: new Set(['state']),
      stateLookup: new Map([['state::hover', 'hover']]),
    }));

    expect(result.skip).toBe(false);
    expect(result.stateSelSuffixes).toEqual([':hover']);
    expect(result.dataAttrs).toEqual([]);
  });

  it('matches the lookup case-insensitively, as the spec may carry either', () => {
    const result = expandVariantSelectors(input({
      configuration: { state: 'Hover' },
      classifiedProps: new Set(['state']),
      stateLookup: new Map([['state::hover', 'hover']]),
    }));

    expect(result.stateSelSuffixes).toEqual([':hover']);
  });

  it('gives a comma-separated concept one suffix per part, so each gets its own rule', () => {
    const result = expandVariantSelectors(input({
      configuration: { state: 'disabled' },
      classifiedProps: new Set(['state']),
      stateLookup: new Map([['state::disabled', 'disabled']]),
    }));

    expect(result.stateSelSuffixes).toEqual([':disabled', '[aria-disabled="true"]']);
  });

  it('expands two classified props as a cartesian product', () => {
    const result = expandVariantSelectors(input({
      configuration: { state: 'hover', validity: 'disabled' },
      classifiedProps: new Set(['state', 'validity']),
      stateLookup: new Map([['state::hover', 'hover'], ['validity::disabled', 'disabled']]),
    }));

    expect(result.stateSelSuffixes).toEqual([':hover:disabled', ':hover[aria-disabled="true"]']);
  });

  it('leaves an unclassified prop as a data attribute, booleans by presence', () => {
    const result = expandVariantSelectors(input({
      configuration: { size: 'Large', loading: true, compact: false },
    }));

    expect(result.dataAttrs).toEqual(['[data-size="large"]', '[data-loading]', ':not([data-compact])']);
    expect(result.stateSelSuffixes).toEqual(['']);
  });
});

describe('a classified boolean set to false', () => {
  it('negates the true concept rather than dropping the variant', () => {
    // Without this the variant is read as base/rest state and emits nothing, so
    // an unselected row — and every hover pairing with it — has no rule at all.
    const result = expandVariantSelectors(input({
      configuration: { selected: false },
      classifiedProps: new Set(['selected']),
      stateLookup: new Map([['selected::true', 'selected']]),
    }));

    expect(result.skip).toBe(false);
    expect(result.stateSelSuffixes).toEqual([':not([aria-selected="true"])']);
  });

  it('negates a multi-part concept as an AND of nots, not as two suffixes', () => {
    // `:checked, [aria-checked="true"]` means either. Its negation is neither —
    // expanding to two suffixes would emit a rule matching anything that merely
    // fails one of them.
    const result = expandVariantSelectors(input({
      configuration: { checked: false },
      classifiedProps: new Set(['checked']),
      stateLookup: new Map([['checked::true', 'checked']]),
    }));

    expect(result.stateSelSuffixes).toEqual([':not(:checked):not([aria-checked="true"])']);
  });

  it('keeps the negation as one part when combined with another state', () => {
    const result = expandVariantSelectors(input({
      configuration: { checked: false, state: 'hover' },
      classifiedProps: new Set(['checked', 'state']),
      stateLookup: new Map([['checked::true', 'checked'], ['state::hover', 'hover']]),
    }));

    expect(result.stateSelSuffixes).toEqual([':not(:checked):not([aria-checked="true"]):hover']);
  });

  it('falls through to unnamed when the true value has no concept either', () => {
    const result = expandVariantSelectors(input({
      configuration: { mystery: false },
      classifiedProps: new Set(['mystery']),
      stateLookup: new Map(),
    }));

    expect(result.skip).toBe(true);
    expect(result.unnamed).toEqual([{ prop: 'mystery', value: 'false' }]);
  });
});

describe('a pair a nested role claimed', () => {
  it('routes to the data attribute instead of being treated as unnamed', () => {
    // The concept is announced on the nested element, so the root carries the
    // variant prop's attribute. Declassified deliberately — not a config gap.
    const result = expandVariantSelectors(input({
      configuration: { validation: 'invalid' },
      classifiedProps: new Set(['validation']),
      stateLookup: new Map(),
      nestedClaimedPairs: new Set(['validation::invalid']),
    }));

    expect(result.skip).toBe(false);
    expect(result.unnamed).toEqual([]);
    expect(result.dataAttrs).toEqual(['[data-validation="invalid"]']);
    expect(result.stateSelSuffixes).toEqual(['']);
  });

  it('still resolves the sibling value the role did not claim', () => {
    // `validation` maps both `invalid` (claimed by a nested textbox) and `valid`
    // (not claimed). The claimed one must not make the other look unnamed.
    const claimed = expandVariantSelectors(input({
      configuration: { validation: 'invalid' },
      classifiedProps: new Set(['validation']),
      stateLookup: new Map([['validation::valid', 'selected']]),
      nestedClaimedPairs: new Set(['validation::invalid']),
    }));
    const unclaimed = expandVariantSelectors(input({
      configuration: { validation: 'valid' },
      classifiedProps: new Set(['validation']),
      stateLookup: new Map([['validation::valid', 'selected']]),
      nestedClaimedPairs: new Set(['validation::invalid']),
    }));

    expect(claimed.dataAttrs).toEqual(['[data-validation="invalid"]']);
    expect(unclaimed.stateSelSuffixes).toEqual(['[aria-selected="true"]']);
  });
});

describe('a classified value no concept names', () => {
  it('reports the pair and skips the variant', () => {
    const result = expandVariantSelectors(input({
      configuration: { state: 'sparkly' },
      classifiedProps: new Set(['state']),
      stateLookup: new Map([['state::hover', 'hover']]),
    }));

    expect(result.skip).toBe(true);
    expect(result.unnamed).toEqual([{ prop: 'state', value: 'sparkly' }]);
  });

  it('stops at the first one rather than reporting every later prop', () => {
    const result = expandVariantSelectors(input({
      configuration: { state: 'sparkly', other: 'alsoUnknown' },
      classifiedProps: new Set(['state', 'other']),
      stateLookup: new Map(),
    }));

    expect(result.unnamed).toHaveLength(1);
    expect(result.unnamed[0].prop).toBe('state');
  });

  it('keeps the attributes it had already resolved, for the caller to inspect', () => {
    const result = expandVariantSelectors(input({
      configuration: { size: 'Large', state: 'sparkly' },
      classifiedProps: new Set(['state']),
      stateLookup: new Map(),
    }));

    expect(result.skip).toBe(true);
    expect(result.dataAttrs).toEqual(['[data-size="large"]']);
  });
});

describe('the :hover / :active disabled guard', () => {
  it('stops a hover rule firing while disabled', () => {
    const result = expandVariantSelectors(input({
      configuration: { state: 'hover' },
      classifiedProps: new Set(['state']),
      stateLookup: new Map([['state::hover', 'hover']]),
      guardsDisabled: true,
    }));

    expect(result.stateSelSuffixes).toEqual([':hover:not(:disabled):not([aria-disabled="true"])']);
  });

  it('guards :active the same way', () => {
    const result = expandVariantSelectors(input({
      configuration: { state: 'active' },
      classifiedProps: new Set(['state']),
      stateLookup: new Map([['state::active', 'active']]),
      guardsDisabled: true,
    }));

    expect(result.stateSelSuffixes).toEqual([':active:not(:disabled):not([aria-disabled="true"])']);
  });

  it('leaves a suffix with neither alone', () => {
    const result = expandVariantSelectors(input({
      configuration: { state: 'selected' },
      classifiedProps: new Set(['state']),
      stateLookup: new Map([['state::selected', 'selected']]),
      guardsDisabled: true,
    }));

    expect(result.stateSelSuffixes).toEqual(['[aria-selected="true"]']);
  });

  it('guards every expanded suffix that carries one', () => {
    const result = expandVariantSelectors(input({
      configuration: { state: 'hover', mode: 'checked' },
      classifiedProps: new Set(['state', 'mode']),
      stateLookup: new Map([['state::hover', 'hover'], ['mode::checked', 'checked']]),
      guardsDisabled: true,
    }));

    expect(result.stateSelSuffixes).toEqual([
      ':hover:checked:not(:disabled):not([aria-disabled="true"])',
      ':hover[aria-checked="true"]:not(:disabled):not([aria-disabled="true"])',
    ]);
  });

  it('does not guard when the states convention names no disabled concept', () => {
    const result = expandVariantSelectors(input({
      configuration: { state: 'hover' },
      classifiedProps: new Set(['state']),
      stateLookup: new Map([['state::hover', 'hover']]),
      guardsDisabled: false,
    }));

    expect(result.stateSelSuffixes).toEqual([':hover']);
  });

  it('is not applied to a skipped variant — it never emits a rule', () => {
    const result = expandVariantSelectors(input({
      configuration: { state: 'sparkly' },
      classifiedProps: new Set(['state']),
      stateLookup: new Map(),
      guardsDisabled: true,
    }));

    expect(result.skip).toBe(true);
    expect(result.stateSelSuffixes).toEqual(['']);
  });
});

describe('object-prop member configurations (ADR-111)', () => {
  it('flattens member-keyed values to dotted keys, dropping null members', () => {
    expect(flattenMemberValues({
      margin: { compact: 'Tight', expanded: null },
      size: 'Small',
      bound: { $binding: '#/props/x' },
    })).toEqual({
      'margin.compact': 'Tight',
      size: 'Small',
      bound: { $binding: '#/props/x' },
    });
  });

  it('a flattened member expands to its own data attribute, never a stringified object', () => {
    const result = expandVariantSelectors(input({
      configuration: flattenMemberValues({ margin: { compact: 'Tight' } }),
      attrNameFor: prop => `data-${prop.replace('.', '-')}`,
    }));
    expect(result.skip).toBe(false);
    expect(result.dataAttrs).toEqual(['[data-margin-compact="tight"]']);
  });
});
