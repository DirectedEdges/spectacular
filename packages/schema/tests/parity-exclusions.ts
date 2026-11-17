/**
 * The deliberate divergences between the package's two publications — the
 * TypeScript types in `types/` and the JSON Schema definitions in `schema/`
 * (DSPEC-22; CONSTITUTION §I).
 *
 * Parity is name-for-name after two conventions the test applies first:
 * a definition `<X>StyleValue` (or `<X>Value`) pairs with a type `<X>` or
 * `<X>Style`, because TS folds a wrapper union into the type it wraps.
 * Everything still unpaired must be listed here with its reason, and every
 * entry must still be unpaired — a name that gains a counterpart, or stops
 * existing, fails the test from the list side until the entry is removed.
 *
 * Each entry is a judgment a person made; like `styles-exclusions.ts`, the
 * list is data the test checks against, not a property it can derive. An entry
 * whose reason stops being true is a candidate for a counterpart, not a
 * permanent resident.
 */

/** Exported type names with no schema definition, and why that is right. */
export const typesWithoutDefinition: Record<string, string> = {
  // The schema carries these as a file's root, which draft-07 leaves unnamed.
  ComponentConcernDocument: "the component-concern file's root oneOf over its three document kinds",
  CompositionConcernDocument: "the composition-concern file's root oneOf over its three document kinds",
  GuidelinesDocument: "the guidelines file's root object",
  SupplementalDocument: "the supplemental file's root object",
  FoundationGuidelinesDocument: 'a path-scoped narrowing of the guidelines root to the foundation vocabulary',
  FoundationSupplementalDocument: 'a path-scoped narrowing of the supplemental root to the foundation vocabulary',

  // Value unions the schema writes inline at their one use site; TS names
  // them so consumers can import the vocabulary.
  Concern: "the oneOf under metadata.concern",
  GuidelinesConcern: "the guidelines component-scope section-key vocabulary; the schema spells it as root property names",
  SupplementalConcern: "the supplemental component-scope section-key vocabulary; likewise root property names",
  FoundationConcern: "the foundation section-key vocabulary; likewise root property names",
  GuidelinesStatus: "the oneOf under GuidelinesMeta.status",
  SupplementalStatus: "the oneOf under SupplementalMeta.status",
  ColorFormat: "the oneOf under settings spec.color",
  BindingKey: "the element members a PropBinding may sit under; the schema has no one site that enumerates them",
  RoleConceptName: 'an open string alias documenting the role vocabulary; the schema type is a plain string',
  ActionConceptName: 'an open string alias documenting the action vocabulary; the schema type is a plain string',

  // Structures the schema expresses anonymously at their position.
  Children: "the Element.children union, written inline",
  ObjectPropMember: "the member union under ObjectProp.members' additionalProperties",
  Subcomponents: "the map under Component.subcomponents' additionalProperties",
  Compositions: 'a map of Composition entries; the schema writes the map inline where it appears',
  FigmaImageExtension: "the com.figma object inline under ImageData.$extensions",
  ImageDataExtensions: "the $extensions object inline under ImageData",

  // TS conveniences over the Styles surface as a whole.
  Style: 'the flat style value union; the schema expresses it through each Styles property',
  StyleKey: "the union of Styles property names; the schema expresses it as the properties themselves",

  // Runtime shapes after defaults apply — deliberately TS-only (no document carries them).
  ResolvedSettings: 'settings after scaffolded defaults apply; a consumer-side shape, never serialized',
  ResolvedConventions: 'conventions after defaults apply; likewise never serialized',
  ResolvedPlatformConventions: 'one platform of ResolvedConventions; likewise never serialized',
};

/** Schema definition names with no exported type, and why that is right. */
export const definitionsWithoutType: Record<string, string> = {
  // Wrapper unions TS writes inline at their use sites instead of naming.
  BooleanStyleValue: 'inline at its Styles use sites',
  BooleanBindableStyleValue: 'inline at its Styles use sites',
  NumberStyleValue: 'inline at its Styles use sites',
  StringStyleValue: 'inline at its Styles use sites',
  FontStyleValue: 'inline on Typography members',
  LineHeightStyleValue: 'inline on Typography.lineHeight',
  StrokeStyleValue: 'inline on Styles.strokes',
  CornerStyleValue: 'inline on Corners members',
  ImageStyleValue: 'inline on Styles.backgroundImage',
  GuidelineReferences: 'an array of GuidelineReference, written inline where used',

  // Grammars TS cannot express.
  SafeKeySentence: 'a pattern-constrained string; TS has no regex-typed strings',
  SafeKeyTitle: 'a pattern-constrained string; likewise',
  UnitInterval: "a 0–1 bounded number; TS carries the union as UnitIntervalStyle without the bound",
  MixedValue: "the sentinel is the literal 'mixed' folded into TS unions",
  MixedStringStyleValue: "folded into TS unions as string | 'mixed' | …",
  MixedNumberStyleValue: "folded into TS unions as number | 'mixed' | …",

  // Named differently per document in TS.
  Section: 'typed per document as mapped SupplementalEntry[] / GuidelineEntry[] sections',

  // Deprecated or historical — retained in the schema for old documents, never typed.
  ReferenceValue: 'deprecated pre-PropBinding form, schema-only for historical documents',
  VariableStyle: 'deprecated pre-TokenReference form, schema-only for historical documents',
  StyleIdValue: 'removed from Styles in v0.11.0, retained for historical reference',
};
