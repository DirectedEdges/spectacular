/**
 * Type-level tests for StringProp (merged from TextProp + GlyphProp)
 * and other prop types.
 *
 * These files are intentionally never executed — they are compiled with tsc
 * to assert that the type shape is correct.
 */
import type { StringProp, BooleanProp, EnumProp, SlotProp, PrimitiveSlotContent, NumberProp, ObjectProp, ObjectPropMember, AnyProp, FigmaCodeOnlySource, FigmaPropExtension, PropExtensions } from '../types/index.js';

// ─── StringProp — examples field ──────────────────────────────────────────────

// examples is optional and accepts string[]
const stringWithExamples: StringProp = { type: 'string', examples: ['Label', 'Title'] };
const stringNoExamples: StringProp = { type: 'string' };

// default is optional
const stringWithDefault: StringProp = { type: 'string', default: 'Label' };
const stringBoth: StringProp = { type: 'string', default: 'Label', examples: ['Label'] };

// nullable is optional
const stringNullable: StringProp = { type: 'string', nullable: true };

// default accepts null for nullable props
const stringNullDefault: StringProp = { type: 'string', default: null, nullable: true };
const stringNullDefaultOnly: StringProp = { type: 'string', default: null };

// @ts-expect-error: default must be string | null, not number
const _stringBadDefault: StringProp = { type: 'string', default: 42 };

// @ts-expect-error: examples must be string[], not number[]
const _stringBadExamples: StringProp = { type: 'string', examples: [42] };

// @ts-expect-error: examples must be an array, not a string
const _stringBadExamplesStr: StringProp = { type: 'string', examples: 'Label' };

// ─── StringProp assignable to AnyProp ─────────────────────────────────────────

const anyFromString: AnyProp = { type: 'string' } satisfies StringProp;
const anyFromStringExamples: AnyProp = { type: 'string', examples: ['Check', 'Close'] } satisfies StringProp;

// ─── TextProp, IconProp, and GlyphProp no longer exist ────────────────────────

// @ts-expect-error: TextProp is not exported
type _TextPropCheck = import('../types/index.js').TextProp;

// @ts-expect-error: IconProp is not exported
type _IconPropCheck = import('../types/index.js').IconProp;

// @ts-expect-error: GlyphProp is not exported
type _GlyphPropCheck = import('../types/index.js').GlyphProp;

// ─── BooleanProp — default remains required, no examples ────────────────────

const boolProp: BooleanProp = { type: 'boolean', default: true };

// @ts-expect-error: default is required on BooleanProp
const _boolNoDefault: BooleanProp = { type: 'boolean' };

// ─── EnumProp — default remains required, no examples ───────────────────────

const enumProp: EnumProp = { type: 'string', default: 'sm', enum: ['sm', 'md', 'lg'] };

// @ts-expect-error: default is required on EnumProp
const _enumNoDefault: EnumProp = { type: 'string', enum: ['sm', 'md'] };

// ─── SlotProp — default optional, nullable optional, null default ────────────

const slotProp: SlotProp = { type: 'slot', default: 'Content' };
const slotNullable: SlotProp = { type: 'slot', default: 'Content', nullable: true };
const slotNullDefault: SlotProp = { type: 'slot', default: null, nullable: true };
const slotNullDefaultOnly: SlotProp = { type: 'slot', default: null };

// default is now optional — SlotProp without default is valid (ADR 023)
const slotNoDefault: SlotProp = { type: 'slot' };

// @ts-expect-error: default must be string | null, not number
const _slotBadDefault: SlotProp = { type: 'slot', default: 42 };

// ─── $extensions — DTCG §5.2.3 platform metadata (ADR 026) ─────────────────

// FigmaPropExtension is the Figma metadata shape
const _figmaExt: FigmaPropExtension = { type: 'BOOLEAN' };
const _figmaExtEmpty: FigmaPropExtension = {};

// PropExtensions composes platform extensions
const _extCheck: PropExtensions = { 'com.figma': { type: 'BOOLEAN' } };
const _extEmpty: PropExtensions = {};
const _extUnknownVendor: PropExtensions = { 'com.sketch': {} };

// $extensions is optional on all prop types
const boolWithExt: BooleanProp = { type: 'boolean', default: true, $extensions: { 'com.figma': { type: 'BOOLEAN' } } };
const boolNoExt: BooleanProp = { type: 'boolean', default: false };
const stringWithExt: StringProp = { type: 'string', $extensions: { 'com.figma': { type: 'TEXT' } } };
const enumWithExt: EnumProp = { type: 'string', default: 'sm', enum: ['sm', 'md'], $extensions: { 'com.figma': { type: 'VARIANT' } } };
const slotWithExt: SlotProp = { type: 'slot', $extensions: { 'com.figma': { type: 'INSTANCE_SWAP' } } };

// $extensions with empty com.figma
const boolEmptyFigma: BooleanProp = { type: 'boolean', default: true, $extensions: { 'com.figma': {} } };

// com.figma.name preserves a Figma property name the key could not represent (ADR-066)
const boolDivergentKey: BooleanProp = {
  type: 'boolean',
  default: false,
  $extensions: { 'com.figma': { type: 'BOOLEAN', name: 'Cut & paste' } },
};

// name is optional — safe keys emit no name at all
const enumSafeKey: EnumProp = {
  type: 'string',
  default: 'sm',
  enum: ['sm', 'md'],
  $extensions: { 'com.figma': { type: 'VARIANT' } },
};

// $extensions with empty object
const boolEmptyExt: BooleanProp = { type: 'boolean', default: true, $extensions: {} };

// $extensions with unknown reverse-domain vendor key
const boolWithUnknownExt: BooleanProp = { type: 'boolean', default: true, $extensions: { 'com.sketch': {} } };

// ─── FigmaCodeOnlySource — code-only prop provenance (ADR 027) ──────────────

// FigmaCodeOnlySource requires kind and layer
const _codeOnlyBasic: FigmaCodeOnlySource = { kind: 'codeOnlyProp', layer: 'Accessibility label' };

// instanceOf is optional (for enum code-only props)
const _codeOnlyWithInstance: FigmaCodeOnlySource = { kind: 'codeOnlyProp', layer: 'Heading Level', instanceOf: 'Heading Level' };

// source is optional on FigmaPropExtension
const _figmaExtWithSource: FigmaPropExtension = { type: 'TEXT', source: { kind: 'codeOnlyProp', layer: 'Accessibility label' } };
const _figmaExtNoSource: FigmaPropExtension = { type: 'BOOLEAN' };

// Code-only string prop with source metadata
const stringCodeOnly: StringProp = { type: 'string', examples: ['Submit form'], $extensions: { 'com.figma': { type: 'TEXT', source: { kind: 'codeOnlyProp', layer: 'Accessibility label' } } } };

// Code-only enum prop with source and instanceOf
const enumCodeOnly: EnumProp = { type: 'string', default: 'h2', enum: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], $extensions: { 'com.figma': { type: 'VARIANT', source: { kind: 'codeOnlyProp', layer: 'Heading Level', instanceOf: 'Heading Level' } } } };

// Code-only boolean prop with source
const boolCodeOnly: BooleanProp = { type: 'boolean', default: false, $extensions: { 'com.figma': { type: 'BOOLEAN', source: { kind: 'codeOnlyProp', layer: 'hasA11yOverrides' } } } };

// Code-only props are assignable to AnyProp
const anyFromStringCodeOnly: AnyProp = stringCodeOnly;
const anyFromEnumCodeOnly: AnyProp = enumCodeOnly;
const anyFromBoolCodeOnly: AnyProp = boolCodeOnly;

// Props with $extensions are assignable to AnyProp
const anyFromBoolExt: AnyProp = boolWithExt;
const anyFromStringExt: AnyProp = stringWithExt;
const anyFromEnumExt: AnyProp = enumWithExt;
const anyFromSlotExt: AnyProp = slotWithExt;

// ─── SlotProp — slot constraints (ADR 028) ──────────────────────────────────

// minChildren is optional
const slotWithMin: SlotProp = { type: 'slot', minChildren: 1 };

// maxChildren is optional
const slotWithMax: SlotProp = { type: 'slot', maxChildren: 4 };

// anyOf is optional
const slotWithAnyOf: SlotProp = { type: 'slot', anyOf: ['Avatar'] };

// All three constraints together
const slotFullConstraints: SlotProp = { type: 'slot', default: null, nullable: true, minChildren: 1, maxChildren: 4, anyOf: ['Avatar', 'Badge'] };

// Constraints with $extensions
const slotConstraintsWithExt: SlotProp = { type: 'slot', minChildren: 1, maxChildren: 4, anyOf: ['Avatar'], $extensions: { 'com.figma': { type: 'INSTANCE_SWAP' } } };

// No constraints — still valid (backwards compatible)
const slotNoConstraints: SlotProp = { type: 'slot' };

// Constrained slot assignable to AnyProp
const anyFromConstrainedSlot: AnyProp = slotFullConstraints;

// @ts-expect-error: minItems must be number, not string
const _slotBadMinItems: SlotProp = { type: 'slot', minItems: '1' };

// @ts-expect-error: maxItems must be number, not string
const _slotBadMaxItems: SlotProp = { type: 'slot', maxItems: '4' };

// @ts-expect-error: anyOf must be string[], not string
const _slotBadAnyOf: SlotProp = { type: 'slot', anyOf: 'Avatar' };

// @ts-expect-error: anyOf must be string[], not number[]
const _slotBadAnyOfNumbers: SlotProp = { type: 'slot', anyOf: [1, 2, 3] };

// ─── NumberProp (ADR 029) ─────────────────────────────────────────────────────

// minimal valid NumberProp
const numberMinimal: NumberProp = { type: 'number' };

// with optional default
const numberWithDefault: NumberProp = { type: 'number', default: 24 };

// with optional examples
const numberWithExamples: NumberProp = { type: 'number', examples: [1, 2, 3] };

// with both
const numberFull: NumberProp = { type: 'number', default: 1, examples: [1, 2, 4] };

// @ts-expect-error: default must be number, not string
const _numberStringDefault: NumberProp = { type: 'number', default: '24' };

// @ts-expect-error: examples must be number[], not string[]
const _numberStringExamples: NumberProp = { type: 'number', examples: ['1', '2'] };

// ─── NumberProp.enum (ADR 072) ────────────────────────────────────────────────

// enum is optional — its absence means the prop accepts any number
const numberNoEnum: NumberProp = { type: 'number', default: 1 };

// a numeric VARIANT: numeric type, closed option set, absence excluded
const numberWithEnum: NumberProp = {
  type: 'number',
  default: 1,
  enum: [1, 2, 3, 4, 5, 6, 7, 8],
  nullable: false,
};

// @ts-expect-error: enum must be number[], not string[]
const _numberStringEnum: NumberProp = { type: 'number', enum: ['1', '2'] };

// @ts-expect-error: EnumProp still carries string values only
const _enumNumericValues: EnumProp = { type: 'string', default: '1', enum: [1, 2] };

// ─── nullable (ADR 065) ───────────────────────────────────────────────────────

// nullable is optional on NumberProp — absent means true
const numberNullableAbsent: NumberProp = { type: 'number', default: 2 };

// nullable: false explicitly asserts the prop always has a value
const numberNotNullable: NumberProp = { type: 'number', default: 2, nullable: false };
const numberNullable: NumberProp = { type: 'number', nullable: true };

// @ts-expect-error: nullable must be boolean, not string
const _numberNullableString: NumberProp = { type: 'number', nullable: 'false' };

// nullable: false is expressible on every open-valued prop type
const stringNotNullable: StringProp = { type: 'string', default: 'Label', nullable: false };
const slotNotNullable: SlotProp = { type: 'slot', default: 'Content', nullable: false };

// EnumProp defaults to non-nullable; nullable: true admits null explicitly
const enumNullable: EnumProp = { type: 'string', default: 'sm', enum: ['sm', 'lg'], nullable: true };

// NumberProp is assignable to AnyProp
const anyFromNumber: AnyProp = { type: 'number' } satisfies NumberProp;
const anyFromNumberFull: AnyProp = { type: 'number', default: 10, examples: [10, 20] } satisfies NumberProp;

// ─── SlotProp.defaultSlot (ADR 099) ───────────────────────────────────────────

// defaultSlot is optional
const slotDefaultSlot: SlotProp = { type: 'slot', defaultSlot: true };
const slotNoDefaultSlot: SlotProp = { type: 'slot' };

// defaultSlot composes with existing constraints
const slotDefaultSlotWithConstraints: SlotProp = {
  type: 'slot',
  defaultSlot: true,
  minChildren: 1,
  anyOf: ['Avatar'],
};

// @ts-expect-error: defaultSlot must be boolean, not string
const _slotBadDefaultSlot: SlotProp = { type: 'slot', defaultSlot: 'true' };

// defaultSlot assignable to AnyProp
const anyFromDefaultSlot: AnyProp = slotDefaultSlot;

// ─── anyOf carries reserved primitive markers (ADR 102) ───────────────────────

// anyOf is still optional — absence means any component and no primitive
const slotNoAnyOf: SlotProp = { type: 'slot' };

// Text-only: a Badge whose children are a string, with no component permitted
const slotTextOnly: SlotProp = { type: 'slot', anyOf: ['$text'] };

// A glyph and a label, or a composed Badge — one list, three permitted things
const slotGlyphTextOrComponent: SlotProp = { type: 'slot', anyOf: ['$glyph', '$text', 'badge'] };

// Component-only is unchanged from today — no marker, no primitive
const slotComponentOnly: SlotProp = { type: 'slot', anyOf: ['badge'] };

// Markers and defaultSlot are orthogonal: a primitive-accepting default slot
const slotPrimitiveDefault: SlotProp = { type: 'slot', defaultSlot: true, anyOf: ['$text', 'badge'] };

// ...primitive-accepting but NOT the default slot — an Alert's description
const slotPrimitiveNotDefault: SlotProp = { type: 'slot', anyOf: ['$text', 'link'] };

// ...the default slot, taking components only — a layout component
const slotDefaultComponentOnly: SlotProp = { type: 'slot', defaultSlot: true, anyOf: ['card'] };

// The marker vocabulary
const markerText: PrimitiveSlotContent = '$text';
const markerGlyph: PrimitiveSlotContent = '$glyph';

// @ts-expect-error: the vocabulary is closed to the two primitives
const _markerImage: PrimitiveSlotContent = '$image';

// @ts-expect-error: the sigil is part of the value — a bare primitive name is not a marker
const _markerBare: PrimitiveSlotContent = 'text';

// @ts-expect-error: `string` is not the vocabulary — the primitive is named `text` (ADR 102, Decision 4)
const _markerString: PrimitiveSlotContent = '$string';

// anyOf stays string[], so a marker and a component name coexist without a cast
const anyOfMixed: string[] = ['$glyph', '$text', 'badge'];
const slotFromMixed: SlotProp = { type: 'slot', anyOf: anyOfMixed };

// A marker is assignable into anyOf precisely because the array is string[]
const slotFromMarkerConst: SlotProp = { type: 'slot', anyOf: [markerText, 'badge'] };

// Still assignable to AnyProp
const anyFromMarkers: AnyProp = slotGlyphTextOrComponent;

// ─── ObjectProp (ADR-111) ─────────────────────────────────────────────────────

// the motivating case: a responsive margin with enumerated members
const objectMargin: ObjectProp = {
  type: 'object',
  members: {
    compact: { type: 'string', default: 'none', enum: ['none', 'small', 'large'] },
    expanded: { type: 'string', default: 'none', enum: ['none', 'small', 'large'] },
  },
};

// members may mix scalar shapes
const objectMixed: ObjectProp = {
  type: 'object',
  members: {
    visible: { type: 'boolean', default: true },
    label: { type: 'string' },
    count: { type: 'number', default: 1 },
  },
};

// each member is an ObjectPropMember
const memberEnum: ObjectPropMember = { type: 'string', default: 'sm', enum: ['sm', 'lg'] };
const memberBool: ObjectPropMember = { type: 'boolean', default: false };

// members carry per-member provenance — the flat Figma source name (ADR-066)
const objectWithProvenance: ObjectProp = {
  type: 'object',
  members: {
    compact: {
      type: 'string',
      default: 'none',
      enum: ['none', 'small', 'large'],
      $extensions: { 'com.figma': { type: 'VARIANT', name: 'margin.compact' } },
    },
  },
};

// $extensions is optional at the object level too
const objectWithExt: ObjectProp = {
  type: 'object',
  members: { compact: { type: 'boolean', default: false } },
  $extensions: { 'com.figma': {} },
};

// ObjectProp is assignable to AnyProp
const anyFromObject: AnyProp = objectMargin;

// @ts-expect-error: members is required
const _objectNoMembers: ObjectProp = { type: 'object' };

// @ts-expect-error: a SlotProp is not a valid member — members are one level deep, scalars only
const _objectSlotMember: ObjectProp = { type: 'object', members: { content: { type: 'slot' } } };

const _objectNestedMember: ObjectProp = {
  type: 'object',
  members: {
    // @ts-expect-error: a nested ObjectProp is not a valid member — members are one level deep
    horizontal: { type: 'object', members: { compact: { type: 'boolean', default: false } } },
  },
};

const _objectTopDefault: ObjectProp = {
  type: 'object',
  // @ts-expect-error: ObjectProp carries no top-level default — defaults live per member
  default: {},
  members: { compact: { type: 'boolean', default: false } },
};
