/**
 * Type-level tests for Conventions and ResolvedConventions.
 * These files are intentionally never executed — they are compiled with tsc
 * to assert that the type shape is correct.
 */
import type {
  Conventions,
  ResolvedConventions,
  StorybookConventions,
  MetadataConventions,
  PlatformConventions,
  ResolvedPlatformConventions,
  GlyphStructure,
  GlyphStructureNode,
  SpecsConventions,
  PrimitiveKind,
  PrimitiveEntry,
  PrimitiveRule,
  VariantStateEntry,
} from '../types/index.js';
import { DEFAULT_CONVENTIONS } from '../types/index.js';

// ─── A workspace declaring no conventions (ADR-073) ───────────────────────────

const none: Conventions = {};
const noPlatforms: Conventions = { platforms: {} };
const emptyPlatform: Conventions = { platforms: { figma: {} } };

// ─── Figma is a key like any other ────────────────────────────────────────────

const figmaEncoding: Conventions = {
  platforms: {
    figma: {
      naming: 'SENTENCE',
      glyphs: { match: 'DS Icon Glyph / {i}' },
      codeOnlyProps: { match: 'Code only props' },
      subcomponents: { scope: 'PAGE', match: ['{C} / _ / {S}'], exclude: ['{C} / Examples / {S}'] },
      instanceExamples: { scope: 'FILE', match: ['{C} Example'], parentNames: ['Examples'] },
      images: { backgroundImage: true, match: 'DS Image', sourceProps: ['imageSource'] },
      slotConstraints: true,
      inferNumberProps: true,
      defaultFillWidth: 375,
    },
  },
};

// Platform ids are free-form implementation names, not a closed set (ADR-073 Decision 3A)
const codePlatforms: Conventions = {
  platforms: {
    react: {
      stylesProp: 'sx',
      images: { component: 'DsImage' },
      defaultFillWidth: 375,
    },
    'web-components': { stylesProp: 'style' },
    swiftui: { stylesProp: 'modifier' },
  },
};

// The shape is deliberately permissive — a code platform may declare an encoding member
const permissive: PlatformConventions = { inferNumberProps: true, stylesProp: 'sx' };

// inferComposableSlots is optional on the authored shape, defaulting to false (ADR-102)
const composable: PlatformConventions = { inferComposableSlots: true };
const noComposable: PlatformConventions = {};
// @ts-expect-error: inferComposableSlots is a boolean, not a pattern list
const _badComposable: PlatformConventions = { inferComposableSlots: ['children'] };

// Figma may take a vocabulary member — the reason it is not special-cased
const figmaVocabulary: PlatformConventions = { images: { match: 'DS Image' } };

// @ts-expect-error — platforms is a map, not the old figma scope
const oldShape: Conventions = { figma: { naming: 'NONE' } };

// ─── Promotion entries (ADR-074 – ADR-076) ────────────────────────────────────

const kinds: PrimitiveKind[] = ['text', 'glyph', 'container'];

// @ts-expect-error — PrimitiveKind is closed; an image is not a node kind (ADR-077)
const imageKind: PrimitiveKind = 'image';

// primitives sits at the root of Conventions, not under a platform: a component's props
// are the same whichever platform renders it (ADR-075)
const promotion: Conventions = {
  primitives: {
    dsHeading: {
      elementType: 'text',
      map: [
        { source: 'typography', values: { 'Typography theme/Headline/M': { appearance: 'Headline M' } } },
        { source: 'content', prop: 'text' },
      ],
    },
    // One source may write several props, and a source may reach a prop of another meaning
    dsTypography: {
      elementType: 'text',
      map: [{ source: 'typography', values: { 'Typography/font__200__medium': { size: 200, weight: 'Medium' } } }],
    },
    dsIcon: {
      elementType: 'glyph',
      map: [
        { source: 'fillColor', values: { 'Color/Critical': { appearance: 'error' } } },
        { source: 'height', values: { 16: { size: 'XS' } } }, // raw scalars are keys too
        { source: 'content', prop: 'name' },
      ],
    },
    // A Row/Column/Box trio is three entries; an empty props object promotes without writing
    dsRow: { elementType: 'container', map: [{ source: 'layoutMode', values: { HORIZONTAL: {} } }] },
    dsColumn: { elementType: 'container', map: [{ source: 'layoutMode', values: { VERTICAL: {} } }] },
  },
};

// @ts-expect-error — primitives is not a platform member (ADR-074)
const platformPrimitives: PlatformConventions = { primitives: { dsText: { elementType: 'text', map: [] } } };

// @ts-expect-error — elementType is required
const entryWithoutKind: PrimitiveEntry = { map: [] };

// @ts-expect-error — map is required
const entryWithoutMap: PrimitiveEntry = { elementType: 'text' };

// @ts-expect-error — elementType is closed
const entryBadKind: PrimitiveEntry = { elementType: 'image', map: [] };

// A layout family indistinguishable by styling is selected by name, and a named entry
// whose every prop is a default carries no rules at all (ADR-100)
const namedEntry: PrimitiveEntry = {
  elementType: 'container',
  match: ['DS Section', 'Section'],
  map: [{ source: 'layoutMode', values: { VERTICAL: { direction: 'column' } } }],
};

const namedEntryNoRules: PrimitiveEntry = { elementType: 'container', match: ['Block'], map: [] };

// @ts-expect-error — match is an array of names, never a single string
const matchAsString: PrimitiveEntry = { elementType: 'container', match: 'Section', map: [] };

// source is a plain string — the honoured set is documented and implemented, not validated
// here, so renaming a Styles member never churns a conventions file (ADR-075)
const dottedSource: PrimitiveRule = { source: 'typography.fontStyle', values: { Bold: { weight: 'Bold' } } };

// @ts-expect-error — source is required
const ruleWithoutSource: PrimitiveRule = { prop: 'text' };

// ─── Images: encoding and vocabulary in one block (ADR-077) ───────────────────

const imageBoth: PlatformConventions = {
  images: { backgroundImage: true, match: 'DS Image', component: 'DsImage', sourceProps: ['imageSource'] },
};

// ─── defaultFillWidth (ADR-081) ───────────────────────────────────────────────

const width: PlatformConventions = { defaultFillWidth: 375 };

// @ts-expect-error — a width is a number, not a CSS length string
const stringWidth: PlatformConventions = { defaultFillWidth: '375px' };

// ─── slots.default.match (ADR-099) ────────────────────────────────────────────

// A library may name its default slot differently across component families
const defaultSlot: SpecsConventions = { slots: { default: { match: ['children', 'items'] } } };

// slots is optional; absence means no default-slot convention
const noDefaultSlot: SpecsConventions = {};

// @ts-expect-error — match is required when default is declared
const defaultSlotNoMatch: SpecsConventions = { slots: { default: {} } };

// @ts-expect-error — match is a string[], not a bare string (unlike codeOnlyProps.match)
const defaultSlotBareString: SpecsConventions = { slots: { default: { match: 'children' } } };

// @ts-expect-error — the default slot names a prop the spec declares, not a platform fact
const platformDefaultSlot: PlatformConventions = { slots: { default: { match: ['children'] } } };

// ─── Resolution guarantees members inside a declared block ────────────────────

declare const resolved: ResolvedConventions;

// platforms and each key stay optional — absence is a statement nothing can supply
const platformMayBeAbsent: number | undefined = resolved.platforms?.figma?.defaultFillWidth;

declare const platform: NonNullable<ResolvedConventions['platforms']>[string];

// Defaults inside a declared platform entry are guaranteed — no null check needed
const naming: 'NONE' | 'SENTENCE' | 'TITLE' = platform.naming;
const constraints: boolean = platform.slotConstraints;
const numbers: boolean = platform.inferNumberProps;
// inferComposableSlots is required on the resolved shape for the same reason (ADR-102)
const composableSlots: boolean = platform.inferComposableSlots;
const scope: 'NESTED' | 'PAGE' | undefined = platform.subcomponents?.scope;
const sourceProps: string[] | undefined = platform.images?.sourceProps;

// slots resolves at the root beside platforms — the prop it names is the spec's, not a platform's
const slotsMatch: string[] | undefined = resolved.specs?.slots?.default?.match;

// stylesProp survives resolution as a platform member — promotion targets are named by the
// spec, so there is no per-primitive block to fold it into (ADR-076)
const platformStyles: string | undefined = platform.stylesProp;

// Promotion entries resolve at the root, beside platforms rather than within one
declare const resolvedRoot: ResolvedConventions;
const resolvedEntry: PrimitiveEntry | undefined = resolvedRoot.primitives?.dsHeading;

// @ts-expect-error — a resolved platform entry must carry its defaulted members
const underResolved: ResolvedConventions = { platforms: { figma: { naming: 'NONE' } } };

// ─── MetadataConventions — exactly one platform (ADR-079) ─────────────────────

declare const producing: NonNullable<ResolvedConventions['platforms']>[string];

const meta: MetadataConventions = { platforms: { figma: producing } };

// Spec conventions ride along, so a render can read back a fact it cannot re-derive (ADR-099)
const metaWithSpecs: MetadataConventions = {
  platforms: { figma: producing },
  specs: { slots: { default: { match: ['children'] } } },
};

// @ts-expect-error — platforms is required in metadata; absence is not expressible
const metaWithoutPlatforms: MetadataConventions = {};

// @ts-expect-error — the promotion table is spent by the time a spec exists
const metaWithPrimitives: MetadataConventions = { platforms: { figma: producing }, primitives: {} };

// ─── Defaults ─────────────────────────────────────────────────────────────────

// A workspace that declares nothing. Every default belongs inside a platform entry,
// so there is nothing left to default at the root (ADR-073).
const defaults: ResolvedConventions = DEFAULT_CONVENTIONS;

// @ts-expect-error — no platform is defaulted; absence means none is declared
const defaultedPlatform: object = DEFAULT_CONVENTIONS.platforms.figma;

// ─── VariantStateEntry (unchanged) ────────────────────────────────────────────

const booleanState: VariantStateEntry = { prop: 'disabled' };
const enumState: VariantStateEntry = { prop: 'state', value: 'hover', contract: 'keep' };

// @ts-expect-error — prop is required
const noProp: VariantStateEntry = { value: 'pressed' };

// @ts-expect-error — contract is a closed set
const badContract: VariantStateEntry = { prop: 'focused', contract: 'inherit' };

// ─── Spec-side conventions (ADR-073 amendment) ────────────────────────────────

// states classifies variant props as semantic states — unchanged vocabulary
const specStates: SpecsConventions = {
  states: { disabled: { prop: 'disabled' }, hover: { prop: 'state', value: 'Hover' } },
};

// accessibility.label names the prop carrying an accessible name
const specAccessibility: SpecsConventions = {
  accessibility: { label: { prop: 'accessibilityLabel' } },
};

// value names the prop carrying a value no element represents, and the prop that
// says that value is unknown — a property OF the value, not a state concept
const specValue: SpecsConventions = { value: { prop: 'progress', indeterminate: 'isLooping' } };

// indeterminate is optional; a value with a known number needs nothing else
const specValueOnly: SpecsConventions = { value: { prop: 'progress' } };

// Every block is optional and they compose
const specAll: SpecsConventions = {
  states: { disabled: { prop: 'disabled' } },
  accessibility: { label: { prop: 'accessibilityLabel' } },
  value: { prop: 'progress' },
};
const specNone: SpecsConventions = {};

// @ts-expect-error — a prop reference is an object, so it can grow fields later
const specBareString: SpecsConventions = { accessibility: { label: 'accessibilityLabel' } };

// @ts-expect-error — a value convention requires the prop it names
const specValueNoProp: SpecsConventions = { value: { indeterminate: 'isLooping' } };

// @ts-expect-error — states no longer live on a platform
const platformStates: PlatformConventions = { states: { disabled: { prop: 'disabled' } } };


export {
  none, noPlatforms, emptyPlatform, figmaEncoding, codePlatforms, permissive, figmaVocabulary,
  oldShape, kinds, imageKind, promotion, platformPrimitives, entryWithoutKind, entryWithoutMap,
  entryBadKind, namedEntry, namedEntryNoRules, matchAsString, dottedSource, ruleWithoutSource, imageBoth,
  width, stringWidth, platformMayBeAbsent, naming, constraints, numbers, scope, sourceProps,
  defaultSlot, noDefaultSlot, defaultSlotNoMatch, defaultSlotBareString, platformDefaultSlot,
  slotsMatch, platformStyles, resolvedEntry, underResolved, meta, metaWithSpecs,
  metaWithoutPlatforms, metaWithPrimitives,
  defaults, defaultedPlatform, booleanState, enumState, noProp, badContract,
  specStates, specAccessibility, specValue, specValueOnly, specAll, specNone, specBareString,
  specValueNoProp, platformStates,
};


// ─── Storybook presentation conventions (ADR-098) ────────────────────────────

// Both levels open: any concern key, any feature key, any value shape.
const storybook: StorybookConventions = {
  color: { rowGroup: ['Palette'], groupLeaves: false },
  someFutureConcern: { anything: { nested: [1, 2, 3] } },
};

// Optional member on both Conventions and ResolvedConventions; absence is fine.
const withStorybook: Conventions = { storybook };
const resolvedWithStorybook: ResolvedConventions = { storybook };
const withoutStorybook: Conventions = {};

// Feature values arrive as `unknown` — a concern implementation must narrow
// before use; direct use as a specific type must not compile.
const narrowing = storybook.color.rowGroup;
// @ts-expect-error unknown is not string[] until the concern validates it
const asArray: string[] = storybook.color.rowGroup;

// ─── Structural glyph membership (ADR-103) ───────────────────────────────────

// The name form alone — today's declaration, unchanged
const glyphNameForm: PlatformConventions = {
  glyphs: { match: 'DS Icon Glyph / {i}' },
};

// The structural form alone — a plainly named library (Carbon, Primer)
const glyphStructureForm: PlatformConventions = {
  glyphs: {
    structure: {
      children: [{ type: 'VECTOR', name: 'Vector' }],
    },
  },
};

// Both forms coexist; membership is the union
const glyphBothForms: PlatformConventions = {
  glyphs: {
    match: 'DS Icon Glyph / {i}',
    structure: { children: [{ type: 'VECTOR' }] },
  },
};

// Naming rule over the component name, fill discriminant, and nested matchers
const glyphFull: GlyphStructure = {
  name: '{i}Icon',
  fill: ['#161616', 'DS Color/Icon/Default'],
  children: [
    { type: 'BOOLEAN_OPERATION', children: [{ type: 'VECTOR', name: 'Glyph - *' }] },
  ],
};

// A node matcher needs only its type; name and children stay optional
const glyphBareNode: GlyphStructureNode = { type: 'VECTOR' };

// @ts-expect-error — a structure declares its shape; children is required
const glyphNoChildren: GlyphStructure = { name: '{i}' };

// @ts-expect-error — type is required on a node matcher
const glyphNodeNoType: GlyphStructureNode = { name: 'Vector' };

// @ts-expect-error — fill is a list, even for a single value
const glyphScalarFill: GlyphStructure = { fill: '#161616', children: [{ type: 'VECTOR' }] };

// The resolved shape mirrors the declared one, both forms optional
const resolvedGlyphStructure: GlyphStructure | undefined = platform.glyphs?.structure;
const resolvedGlyphMatch: string | undefined = platform.glyphs?.match;

// ─── objectProps — separator-folded object props (ADR-111) ───────────────────

// opt-in with the default separator left implicit
const objectPropsDeclared: PlatformConventions = { objectProps: {} };

// an explicit separator
const objectPropsSeparator: PlatformConventions = { objectProps: { separator: '/' } };

// absence means no folding — the field is optional
const objectPropsAbsent: PlatformConventions = {};

// @ts-expect-error — separator is a string, not a boolean switch
const objectPropsBadSeparator: PlatformConventions = { objectProps: { separator: true } };

// the resolved form guarantees separator inside a declared block, block stays optional
const resolvedObjectProps: ResolvedPlatformConventions = {
  naming: 'NONE',
  slotConstraints: false,
  inferNumberProps: false,
  inferComposableSlots: false,
  objectProps: { separator: '.' },
};
const resolvedObjectPropsAbsent: ResolvedPlatformConventions = {
  naming: 'NONE',
  slotConstraints: false,
  inferNumberProps: false,
  inferComposableSlots: false,
};

const resolvedObjectPropsEmpty: ResolvedPlatformConventions = {
  naming: 'NONE',
  slotConstraints: false,
  inferNumberProps: false,
  inferComposableSlots: false,
  // @ts-expect-error — a declared resolved block has separator required
  objectProps: {},
};
