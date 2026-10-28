import { ImageProp } from "./Image.js";

/**
 * Represents properties of a component.
 */
export type Props = Record<string, AnyProp>;

/**
 * Union of all supported property types
 */
export type AnyProp = BooleanProp | StringProp | EnumProp | SlotProp | NumberProp | ImageProp | ObjectProp;

/**
 * Provenance metadata for props extracted from a Figma code-only container layer.
 * Code-only props are non-visual properties embedded in a hidden container layer
 * within the Figma component, used to encode accessibility labels, semantic
 * heading levels, ARIA roles, and similar concerns.
 * @since 0.14.0
 */
export interface FigmaCodeOnlySource {
  /** Discriminator identifying this prop as originating from a code-only container. */
  kind: 'codeOnlyProp';
  /** Sub-layer name within the code-only container tree corresponding to this prop. */
  layer: string;
  /** For enum code-only props: the component name of the nested instance whose variants define the enum values. */
  instanceOf?: string;
}

/**
 * DTCG §5.2.3 Figma-specific metadata for a prop definition.
 * @since 0.14.0
 */
export interface FigmaPropExtension {
  /** Figma-native property type (e.g., BOOLEAN, TEXT, INSTANCE_SWAP, VARIANT). */
  type?: string;
  /** Provenance metadata — present only for props extracted from a code-only container layer. @since 0.14.0 */
  source?: FigmaCodeOnlySource;
  /**
   * The Figma component-property name (ADR-066). Recorded when the name fell outside
   * the safe key grammar, or when it was already written in the destination format and
   * passed through unformatted — in which case reversal is identity, not re-derivation.
   *
   * Under NONE no source convention is declared, so nothing can be re-derived from a
   * key — reversal hands the key back as the name. The key therefore reconstructs the
   * name only where the two are already identical, and this field is recorded wherever
   * formatting changed the name at all.
   * @since 0.30.0
   */
  name?: string;
  /** Additional Figma-specific metadata passes through without type enforcement. */
  [key: string]: unknown;
}

/**
 * DTCG §5.2.3 platform-specific extensions for prop definitions.
 * Each property is a reverse-domain key whose value is a platform extension type.
 * @since 0.14.0
 */
export interface PropExtensions {
  /** Figma extraction provenance for this prop. */
  'com.figma'?: FigmaPropExtension;
  [key: string]: unknown;
}

/**
 * Boolean property definition
 */
export interface BooleanProp {
  type: 'boolean';
  default: boolean;
  /** DTCG §5.2.3 platform-specific extensions. @since 0.14.0 */
  $extensions?: PropExtensions;
}

/**
 * String property definition (text content, glyph/instance swap, or other string-valued props)
 */
export interface StringProp {
  type: 'string';
  /** @deprecated Use `examples` for demo content */
  default?: string | null;
  /**
   * Whether this prop accepts a null value.
   * Absent means `true` — a string prop has an open value set, so null is
   * accepted unless `false` explicitly asserts otherwise. @since 0.29.0
   */
  nullable?: boolean;
  /** Sample values demonstrating typical content for this prop */
  examples?: string[];
  /** DTCG §5.2.3 platform-specific extensions. @since 0.14.0 */
  $extensions?: PropExtensions;
}

/**
 * Enumeration property definition
 */
export interface EnumProp {
  type: 'string';
  default: string;
  enum: string[];
  /**
   * Whether this prop accepts a null value.
   * Absent means `false` — `enum` enumerates every accepted value, and null is
   * not among them unless `true` explicitly admits it. @since 0.29.0
   */
  nullable?: boolean;
  /** DTCG §5.2.3 platform-specific extensions. @since 0.14.0 */
  $extensions?: PropExtensions;
}

/**
 * Number property definition — a numeric-valued prop, whether inferred from a TEXT
 * code-only prop or from a VARIANT whose options are all numbers (in which case
 * `enum` carries them).
 */
export interface NumberProp {
  type: 'number';
  /** Default numeric value. Optional — omitted when no meaningful default exists. */
  default?: number;
  /**
   * The closed set of accepted values, when the source enumerates them rather than
   * leaving the range open — a Figma VARIANT whose every option is numeric, say.
   * Absent means the prop accepts any number.
   *
   * Its presence changes what `nullable` defaults to in spirit but not in rule: an
   * enumerated prop lists every value it accepts, so a numeric enum that excludes
   * null should say `nullable: false` rather than rely on the open-set default
   * below. @since 0.31.0
   */
  enum?: number[];
  /**
   * Whether this prop accepts a null value.
   * Absent means `true` — a number prop has an open value set, so null is
   * accepted unless `false` explicitly asserts otherwise. @since 0.29.0
   */
  nullable?: boolean;
  /** Sample numeric values demonstrating typical content for this prop */
  examples?: number[];
  /** DTCG §5.2.3 platform-specific extensions. @since 0.30.0 */
  $extensions?: PropExtensions;
}

/**
 * A member of an {@link ObjectProp} — a scalar prop definition (ADR-111).
 *
 * Members are one level deep by design: no `SlotProp`, `ImageProp`, or nested
 * `ObjectProp`. Member typing, `default`, `enum`, `nullable`, and `examples`
 * semantics are those of the member's own prop shape.
 * @since 0.39.0
 */
export type ObjectPropMember = BooleanProp | StringProp | EnumProp | NumberProp;

/**
 * Object property definition (ADR-111) — a prop whose value is an object of named,
 * individually typed scalar members (e.g. a responsive `margin` with `compact` and
 * `expanded` members drawing from one enumerated set).
 *
 * Member names are opaque to the schema: breakpoint vocabularies are the library's
 * choice, and the contract attaches no semantics to them. Member names must not begin
 * with `$` (schema-enforced) and must not contain the platform's declared
 * `objectProps.separator` (a generator invariant).
 *
 * No top-level `default` or `nullable`: defaults live per member, and an object prop's
 * value always exists as the composition of its members' states.
 *
 * On platforms that cannot author an object natively (Figma), members fold from
 * separator-delimited flat property names under the opt-in
 * `platforms.<platform>.objectProps` convention; each member's
 * `$extensions['com.figma'].name` records the flat source name so unfolding is
 * reversal, not re-derivation.
 * @since 0.39.0
 */
export interface ObjectProp {
  type: 'object';
  /** Named members, each an existing scalar prop definition. At least one member. */
  members: Record<string, ObjectPropMember>;
  /** DTCG §5.2.3 platform-specific extensions. @since 0.39.0 */
  $extensions?: PropExtensions;
}

/**
 * Slot/nested content property definition
 */
export interface SlotProp {
  type: 'slot';
  /** Default slot content. Optional — omitted when no meaningful default exists. */
  default?: string | null;
  /**
   * Whether this slot prop accepts a null value.
   * Absent means `true` — a slot has an open content set and may be empty,
   * unless `false` explicitly asserts otherwise. @since 0.29.0
   */
  nullable?: boolean;
  /** Minimum number of children this slot accepts. @since 0.25.0 */
  minChildren?: number;
  /** Maximum number of children this slot accepts. @since 0.25.0 */
  maxChildren?: number;
  /** Component type names permitted in this slot. @since 0.14.0 */
  anyOf?: string[];
  /**
   * Whether this is the component's designated default slot, resolved from
   * `SpecsConventions.slots.default.match` at generation time. When true, an authored
   * example may nest a filling instance as a plain child element instead of through an
   * explicit `SlotContentRef`/`SlotBinding`. Absent means false: this is not the default
   * slot, or the library declared no default-slot convention. At most one `SlotProp` per
   * component may be true — an authoring/generator invariant, not schema-enforced.
   * @since 0.35.0
   */
  defaultSlot?: boolean;
  /** DTCG §5.2.3 platform-specific extensions. @since 0.14.0 */
  $extensions?: PropExtensions;
}
