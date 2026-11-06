/**
 * Type-level tests for `PropConfigurationValue`'s `null` arm (ADR-080).
 *
 * `null` means the prop is unset in this configuration — a value, not an
 * absence. These files are intentionally never executed; they are compiled
 * with tsc to assert the type shape is correct.
 */
import type {
  PropConfigurationValue,
  PropConfigurations,
  NestedPropConfiguration,
  ObjectPropValue,
  Element,
  InstanceExample,
  Variant,
} from '../types/index.js';

// ─── null is a PropConfigurationValue ───────────────────────────────────────

const unset: PropConfigurationValue = null;
const scalar: PropConfigurationValue = 'Surface';
const flag: PropConfigurationValue = false;
const count: PropConfigurationValue = 3;
const bound: PropConfigurationValue = { $binding: '#/props/label' };
const filled: PropConfigurationValue = {
  $slotContent: '#/components/card/slotContentExamples/cardHeader',
};

// A value union member that was never valid stays invalid.
// @ts-expect-error: undefined is not a PropConfigurationValue — an absent key is
// how a configuration says nothing, and it is not the same as an explicit null.
const absent: PropConfigurationValue = undefined;

// ─── null under a prop key, in every position PropConfigurations occupies ───

// A configuration that leaves a nullable slot unset.
const unsetSlot: PropConfigurations = { header: null };

// The same prop, set.
const setSlot: PropConfigurations = {
  header: { $slotContent: '#/components/card/slotContentExamples/cardHeader' },
};

// Element — a nested instance.
const element: Element = {
  instanceOf: 'card',
  propConfigurations: { header: null, bordered: 'Solid' },
};

// InstanceExample — a whole-component example.
const example: InstanceExample = {
  title: 'Card without a header',
  propConfigurations: { header: null },
};

// Variant.configuration.
const variant: Variant = {
  configuration: { header: null },
};

// NestedPropConfiguration — a path-addressed descendant ($nested).
const nested: NestedPropConfiguration = {
  path: ['contentContainer', 'badge'],
  children: null,
};

const withNested: PropConfigurations = { $nested: [nested] };

// ─── Layering: absent and null are distinct ─────────────────────────────────

// A base that binds the slot.
const base: PropConfigurations = {
  header: { $slotContent: '#/components/card/slotContentExamples/cardHeader' },
};

// A layer that unsets it — an explicit value, which overrides.
const overridesWithUnset: PropConfigurations = { header: null };

// A layer that omits it — inherits whatever the base carried.
const inherits: PropConfigurations = { bordered: 'Solid' };

// ─── ObjectPropValue — member-keyed object values (ADR-111) ──────────────────

// a member-keyed object is a PropConfigurationValue
const objectValue: PropConfigurationValue = { compact: 'none', expanded: 'large' };

// member values are scalars, or null to unset a member (ADR-080, per member)
const objectPartial: ObjectPropValue = { compact: 'small' };
const objectUnsetsMember: ObjectPropValue = { compact: null };
const objectMixedScalars: ObjectPropValue = { visible: true, count: 2, label: 'Hi' };

// object values flow through every configuration surface
const variantWithObject: Variant = {
  configuration: { margin: { compact: 'none', expanded: 'large' } },
};
const elementWithObject: Element = {
  instanceOf: 'header',
  propConfigurations: { margin: { compact: 'small' } },
};
const nestedWithObject: NestedPropConfiguration = {
  path: ['header'],
  margin: { compact: 'small' },
};
const exampleWithObject: InstanceExample = {
  title: 'Compact margins',
  propConfigurations: { margin: { compact: 'none', expanded: 'large' } },
};

// @ts-expect-error: member values are scalars or null — no nested objects (one level deep)
const _objectNestedValue: ObjectPropValue = { horizontal: { compact: 'none' } };

// @ts-expect-error: undefined is not a member value — omit the key to inherit
const _objectUndefinedMember: ObjectPropValue = { compact: undefined };

export type {};
