/**
 * Type-level tests for Overrides, Override, ElementOverrides and ElementOverride.
 * These files are intentionally never executed — they are compiled with tsc
 * to assert that the type shape is correct.
 */
import type {
  Overrides,
  Override,
  ElementOverrides,
  ElementOverride,
  Element,
} from '../types/index.js';

// An entry with no `configuration` applies at every configuration
const unscoped: Override = {
  elements: {
    icon: { styles: { fillColor: '#1B1B1BFF' } },
  },
};

// An entry matched against the instanced component's resolved props
const matched: Override = {
  configuration: { state: 'hover' },
  elements: {
    icon: { styles: { fillColor: '#FFFFFFFF' } },
  },
};

// @ts-expect-error — `elements` is required; an entry with no patches says nothing
const noElements: Override = { configuration: { state: 'hover' } };

// @ts-expect-error — an override does not restructure, so it carries no layout
const withLayout: Override = { elements: {}, layout: { root: ['icon'] } };

// @ts-expect-error — `invalid` describes a variant's existence, not a patch
const withInvalid: Override = { elements: {}, invalid: true };

// An element override may patch styles, content, or nested instances
const styleOnly: ElementOverride = { styles: { backgroundColor: '#FFFFFFFF' } };
const contentOnly: ElementOverride = { content: 'Save' };
const empty: ElementOverride = {};

// @ts-expect-error — content is static; a PropBinding is not accepted
const boundContent: ElementOverride = { content: { $binding: '#/props/label' } };

// @ts-expect-error — configuring a nested instance is `$nested`, not an override
const withPropConfigurations: ElementOverride = { propConfigurations: { label: 'Save' } };

// @ts-expect-error — swapping the component is structural, not a patch
const withInstanceOf: ElementOverride = { instanceOf: 'pill' };

// @ts-expect-error — primitive-fill formatting belongs to the component owning the slot
const withContentStyles: ElementOverride = { contentStyles: {} };

// Recursion follows instance boundaries: an instance element carries its own overrides
const nested: ElementOverride = {
  overrides: [
    {
      elements: {
        label: { styles: { textColor: '#FFFFFFFF' } },
      },
    },
  ],
};

// Two boundaries deep, as a single placed instance reports
const twoDeep: Overrides = [
  {
    elements: {
      selectedPill: {
        overrides: [{ elements: { label: { styles: { textColor: '#FFFFFFFF' } } } }],
      },
    },
  },
];

// `Overrides` is the ordered list form, and layering is positional
const ordered: Overrides = [unscoped, matched];

// The map is keyed by arbitrary element names — validity comes from the
// instanced component's anatomy, which no type can reach
const keyed: ElementOverrides = {
  root: { styles: { backgroundColor: '#FFFFFFFF' } },
  background: { styles: { backgroundColor: '#000000FF' } },
};

// `Element.overrides` is optional and additive
const instance: Element = {
  instanceOf: { $ref: '#/subcomponents/action' },
  styles: { width: 48 },
  overrides: ordered,
};
const withoutOverrides: Element = { instanceOf: 'pill' };
