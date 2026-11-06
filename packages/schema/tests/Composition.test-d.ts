/**
 * Type-level tests covering ADRs 042 (Composition), 046 (SlotContent +
 * SlotContentRef), 047 (SlotBinding + Component.slotContentExamples),
 * 048 (InstanceExample with SlotContentRef), and 049 (PropConfigurations
 * widening to PropBinding + SlotContentRef).
 *
 * Never executed — compiled with tsc to assert type shapes.
 */
import type {
  SlotContent,
  Composition,
  Compositions,
  SlotContentRef,
  InstanceExample,
  InstanceExamples,
  Component,
  Children,
  SlotBinding,
  PropBinding,
  PropConfigurations,
  NestedPropConfiguration,
} from '../types/index.js';

// ─── ADR-046: SlotContent is the anonymous structural triplet ────────────────

const minimalSlotContent: SlotContent = {
  anatomy: { root: { type: 'container' } },
  elements: {},
  layout: ['root'],
};

const fullSlotContent: SlotContent = {
  anatomy: { wrap: { type: 'container' }, icon: { type: 'glyph' }, label: { type: 'text' } },
  elements: {
    label: { content: 'Hello' },
  },
  layout: [{ wrap: ['icon', 'label'] }],
};

// All three structural fields required
// @ts-expect-error: anatomy required
const _missingAnatomy: SlotContent = { elements: {}, layout: [] };
// @ts-expect-error: elements required
const _missingElements: SlotContent = { anatomy: {}, layout: [] };
// @ts-expect-error: layout required
const _missingLayout: SlotContent = { anatomy: {}, elements: {} };

// SlotContent carries no title/description — those live on Composition
const _slotContentWithTitle: SlotContent = {
  anatomy: {},
  elements: {},
  layout: [],
  // @ts-expect-error: title is not a valid key on SlotContent
  title: 'no',
};

// ─── ADR-042 + ADR-046: Composition is the top-level triplet + slotContent ───

// Simple composition — no bundled slot fills
const simpleComposition: Composition = {
  title: 'Composed Label',
  anatomy: { label: { type: 'text' } },
  elements: { label: { content: 'Hello' } },
  layout: ['label'],
};

// Composition with bundled slotContent fills
const compositionWithSlots: Composition = {
  title: 'Filter Results Page',
  description: 'Two-row layout — page header above filter grid.',
  anatomy: { header: { type: 'container' }, grid: { type: 'container' } },
  elements: {},
  layout: ['header', 'grid'],
  slotContent: {
    pageHeader: fullSlotContent,
  },
};

// anatomy, elements, layout all required
// @ts-expect-error: anatomy required
const _compMissingAnatomy: Composition = { elements: {}, layout: [] };
// @ts-expect-error: elements required
const _compMissingElements: Composition = { anatomy: {}, layout: [] };
// @ts-expect-error: layout required
const _compMissingLayout: Composition = { anatomy: {}, elements: {} };

// Compositions registry alias
const registry: Compositions = {
  composedLabel: simpleComposition,
  filterResultsPage: compositionWithSlots,
};

// ─── ADR-046: SlotContentRef ─────────────────────────────────────────────────

// Component-scoped reference (into slotContentExamples)
const componentScopedRef: SlotContentRef = {
  $slotContent: '#/components/pill/slotContentExamples/composedLabel',
};

// Intra-composition bundled fill reference
const intraCompositionRef: SlotContentRef = {
  $slotContent: '#/compositions/filterResultsPage/slotContent/pageHeader',
};

// Cross-composition reference (resolves to top-level triplet)
const crossCompositionRef: SlotContentRef = {
  $slotContent: '#/compositions/pageGrid',
};

// $slotContent must be a string
// @ts-expect-error: number not valid for $slotContent
const _badRef: SlotContentRef = { $slotContent: 42 };

// Extra keys rejected
// @ts-expect-error: extra keys not permitted on SlotContentRef
const _badRefExtra: SlotContentRef = { $slotContent: '#/x', extra: 'no' };

// ─── ADR-048: InstanceExample / InstanceExamples ────────────────────────────

// Scalar-only example
const scalarExample: InstanceExample = {
  title: 'Danger',
  propConfigurations: { intent: 'danger', disabled: false, weight: 700 },
};

// Example with a slot prop filled via SlotContentRef
const slotExample: InstanceExample = {
  title: 'With icon',
  propConfigurations: {
    intent: 'primary',
    startVisual: componentScopedRef,
  },
};

const examplesMap: InstanceExamples = {
  danger: scalarExample,
  withIcon: slotExample,
};

// PropBinding is still not permitted in InstanceExample.propConfigurations, but
// since ADR-111 the type cannot be the thing that says so: `ObjectPropValue` is
// `Record<string, scalar>`, which a `{ $binding }` object satisfies structurally.
// The ADR records this trade-off and moves enforcement to the JSON Schema, where
// `ObjectPropValue` sets `propertyNames: { pattern: "^[^$]" }` — a member name may
// not begin with `$`, which is what keeps the two forms apart. This assignment
// therefore type-checks, and is rejected on validation.
const _exampleBinding: InstanceExample = {
  propConfigurations: {
    label: { $binding: '#/props/label' },
  },
};

// Component carries instanceExamples
const componentWithExamples: Component = {
  title: 'Button',
  anatomy: { root: { type: 'container' } },
  default: { elements: {} },
  instanceExamples: examplesMap,
};

// ─── ADR-047: SlotBinding + Component.slotContentExamples ────────────────────

const slotBinding: SlotBinding = {
  $binding: '#/components/pill/props/children',
  examples: [
    { $slotContent: '#/components/pill/slotContentExamples/composedLabel' },
  ],
};

// Bare $binding still validates (structural superset of PropBinding)
const barePropAsSlot: SlotBinding = { $binding: '#/props/children' };

// Children = string[] | SlotBinding
const childArr: Children = ['a', 'b', 'c'];
const childSlot: Children = slotBinding;
const childBareBinding: Children = { $binding: '#/props/children' };

// Component.slotContentExamples — Record<string, SlotContent>
const componentWithSlotExamples: Component = {
  title: 'Pill',
  anatomy: { root: { type: 'container' } },
  default: { elements: {} },
  slotContentExamples: {
    composedLabel: fullSlotContent,
  },
};

// Note: SlotContent and Composition are structurally overlapping (Composition is a
// superset of SlotContent), so TypeScript structural typing cannot enforce the
// "SlotContent only, not Composition" constraint at the type level. The JSON Schema
// enforces this via additionalProperties: false on SlotContent.

// ─── ADR-049: PropBinding + SlotContentRef in PropConfigurations ─────────────

const propConfWithBinding: PropConfigurations = {
  intent: 'primary',
  disabled: false,
  size: 16,
  label: { $binding: '#/props/label' }, // PropBinding arm
};

const propConfWithSlotRef: PropConfigurations = {
  children: componentScopedRef,         // SlotContentRef arm
  trailingAction: intraCompositionRef,
};

const propConfMixed: PropConfigurations = {
  variant: 'default',                   // scalar
  label: { $binding: '#/props/label' }, // PropBinding
  startVisual: crossCompositionRef,      // SlotContentRef
};

// ─── ADR-052: $nested path-addressed configs of nested descendants ───────────

// Regular prop entries and the reserved `$nested` list coexist on one instance
const propConfWithNested: PropConfigurations = {
  density: 'comfortable',                                // regular scalar (direct)
  toolbar: componentScopedRef,                          // regular DIRECT slot fill
  $nested: [
    { path: ['filterHeader', 'row'], children: componentScopedRef },
    { path: ['filterContent', 'row'], children: crossCompositionRef },
  ],
};

// A single NestedPropConfiguration: path of instanceOf keys + payload at the terminal.
// path is a string[] of instanceOf element keys (not typed { instance } / { slot }
// segments — slot descents are reference boundaries, never path steps); the terminal
// instance owns the configured slot, named by the entry key (`actions`).
const oneNested: NestedPropConfiguration = {
  path: ['header', 'toolbar'],
  actions: { $slotContent: '#/slotContentExamples/toolbarActions' },
};

// Silence "declared but never read" for tsc strict mode
void [
  minimalSlotContent,
  fullSlotContent,
  _slotContentWithTitle,
  simpleComposition,
  compositionWithSlots,
  registry,
  componentScopedRef,
  intraCompositionRef,
  crossCompositionRef,
  scalarExample,
  slotExample,
  examplesMap,
  componentWithExamples,
  slotBinding,
  barePropAsSlot,
  childArr,
  childSlot,
  childBareBinding,
  componentWithSlotExamples,
  propConfWithBinding,
  propConfWithSlotRef,
  propConfMixed,
  propConfWithNested,
  oneNested,
];
