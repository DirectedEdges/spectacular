import { PropBinding } from "./PropBinding.js";
import { Conditional } from "./Conditional.js";
import { Effects } from "./Effects.js";
import { GradientValue } from "./Gradient.js";
import { ImageValue } from "./Image.js";

export type Styles = Partial<{
  rotation: Style;
  visible: Style;
  opacity: Style;
  locked: Style;
  backgroundColor: ColorStyle;
  /** Image fill painted on a layer. Present on container element types. Fallback representation used when no image component is configured. A `TokenReference` when the image fill comes from an applied Figma fill style (the style reference routes here — not to `backgroundColor` — when the styled paint is an image). Absent when there is no image fill. @since 0.28.0 */
  backgroundImage: ImageValue | TokenReference | null;
  /** Glyph fill color. Present on GLYPH element type only. Represented in Figma as fills. @since 0.13.0 */
  fillColor: ColorStyle;
  effects: TokenReference | Effects;
  /** Whether the element clips content that overflows its box. @since 0.30.0 */
  clipsContent: Style;
  /** Corner radius. Scalar when uniform; `Corners` object when per-corner values differ. @since 1.0.0 */
  cornerRadius: Style | Corners;
  width: Style;
  height: Style;
  minWidth: Style;
  minHeight: Style;
  maxWidth: Style;
  maxHeight: Style;
  /** Layout positioning mode — AUTO (participates in parent auto-layout) or ABSOLUTE. Present as ABSOLUTE on every element that emits positioning offsets, including children of non-auto-layout containers; AUTO appears only inside auto-layout containers (ADR-070). Structural property — not token-bindable. @since 0.19.0 */
  position: Position | null;
  /** Offset from block-start (top) edge. Emitted only alongside `position` (ADR-070). Present when vertical constraint is MIN, STRETCH, or SCALE. Pixel number or percentage string. @since 0.19.0 */
  top: PositionOffset;
  /** Offset from block-end (bottom) edge. Emitted only alongside `position` (ADR-070). Present when vertical constraint is MAX or STRETCH. Pixel number. @since 0.19.0 */
  bottom: PositionOffset;
  /** Offset from inline-start edge. Emitted only alongside `position` (ADR-070). Present when horizontal constraint is MIN, STRETCH, or SCALE. Pixel number or percentage string. @since 0.19.0 */
  start: PositionOffset;
  /** Offset from inline-end edge. Emitted only alongside `position` (ADR-070). Present when horizontal constraint is MAX or STRETCH. Pixel number. @since 0.19.0 */
  end: PositionOffset;
  /** Horizontal offset from center. Emitted only alongside `position` (ADR-070). Present when horizontal constraint is CENTER. @since 0.19.0 */
  centerHorizontalOffset: PositionOffset;
  /** Vertical offset from center. Emitted only alongside `position` (ADR-070). Present when vertical constraint is CENTER. @since 0.19.0 */
  centerVerticalOffset: PositionOffset;
  layoutSizingHorizontal: Style;
  layoutSizingVertical: Style;
  strokes: ColorStyle;
  strokeAlign: Style;
  /** Stroke weight. Scalar when uniform; `Sides` object when per-side values differ. @since 1.0.0 */
  strokeWeight: Style | Sides;
  /** Dash pattern for a stroke. Present (non-null) when the stroke is dashed; null or absent when solid. Structural property — not token-bindable. @since 0.27.0 */
  strokeDashPattern: StrokeDashPattern | null;
  typography: TokenReference | Typography;
  /** Horizontal text alignment using logical inline-axis directions (`START`/`END`). `JUSTIFY` maps from Figma's `JUSTIFIED`. Structural property — not token-bindable. Present on TEXT element type only. @since 0.29.0 */
  textAlignHorizontal: TextAlignHorizontal | null;
  textAlignVertical: Style;
  /** How overflowing text is handled — `CLIP` (cut off) or `ELLIPSIS` (trailing ellipsis). Structural property — not token-bindable. Present on TEXT element type only. @since 0.28.0 */
  textOverflow: TextOverflow | null;
  /** Maximum number of lines before `ELLIPSIS` text overflow applies; `null` or absent means no limit. Present on TEXT element type only. @since 0.28.0 */
  maxLines: Style;
  textColor: ColorStyle;
  /** Alignment along the main axis (depends on `layoutMode`). Structural property — not token-bindable. @since 0.18.0 */
  mainAxisAlignment: MainAxisAlignment | null;
  primaryAxisSizingMode: Style;
  /** Alignment along the cross axis (perpendicular to `layoutMode`). Structural property — not token-bindable. @since 0.18.0 */
  crossAxisAlignment: CrossAxisAlignment | null;
  /** Auto-layout direction. Structural property — not token-bindable. @since 0.18.0 */
  layoutMode: LayoutMode | null;
  /** Whether auto-layout wrapping is enabled (default: false). @since 0.18.0 */
  wrap: Style;
  /** Space distribution between wrapped lines. Only meaningful when `wrap` is true. Structural property — not token-bindable. @since 0.18.0 */
  wrapAlignment: WrapAlignment | null;
  itemReverseZIndex: Style;
  /** Item spacing. Scalar when uniform; `ItemSpacing` object when horizontal and vertical gaps differ. @since 0.18.0 */
  itemSpacing: Style | ItemSpacing;
  /** Padding. Scalar when uniform; `Sides` object when per-side values differ. @since 1.0.0 */
  padding: Style | Sides;
  cornerSmoothing: Style;
  aspectRatio: AspectRatioStyle;
}>;

/**
 * The formatting a **text** primitive takes on when it fills a slot (ADR-102).
 *
 * Deliberately narrower than {@link Styles}: only properties that format text appear, so
 * a container's layout or surface styling cannot enter the content record. Each member is
 * typed identically to its `Styles` counterpart, so a value valid in `styles` is valid
 * here — token references, prop bindings and conditionals included, wherever the
 * underlying type is `Style`.
 *
 * `typography` is listed once, as the composite: its own members (`fontSize`,
 * `fontFamily`, `lineHeight`, `letterSpacing`, `textCase`, `textDecoration` and the rest)
 * travel inside {@link Typography} rather than being enumerated again here.
 * @since 0.39.0
 */
export type TextContentStyles = Partial<{
  /** Text color of the content. */
  textColor: ColorStyle;
  /** Typography of the content, as a composite or a type-token reference. */
  typography: TokenReference | Typography;
  /** Horizontal text alignment, using logical inline-axis directions (`START`/`END`). */
  textAlignHorizontal: TextAlignHorizontal | null;
  /** Vertical text alignment. */
  textAlignVertical: Style;
  /** How overflowing content is handled — `CLIP` or `ELLIPSIS`. */
  textOverflow: TextOverflow | null;
  /** Maximum number of lines before `ELLIPSIS` overflow applies; `null` means no limit. */
  maxLines: Style;
}>;

/**
 * The formatting a **glyph** primitive takes on when it fills a slot (ADR-102).
 *
 * `fillColor` plus the two dimensions. A glyph is sized rather than laid out: its box is
 * the icon's own, set on the layer and not derived from the slot's layout the way a text
 * run's measure is. So a glyph fill that does not carry its dimensions loses them, and a
 * render has nothing to restore — which is why `width` and `height` belong to the fill
 * here even though no text member does.
 * @since 0.39.0
 */
export type GlyphContentStyles = Partial<{
  /** Fill color of the glyph. */
  fillColor: ColorStyle;
  /** Width of the glyph box, in pixels. */
  width: Style;
  /** Height of the glyph box, in pixels. */
  height: Style;
}>;

/**
 * The styles applied to primitive content filling an element, as distinct from the
 * element's own {@link Styles} (ADR-102).
 *
 * Keyed by primitive, using the same reserved markers `SlotProp.anyOf` carries, because a
 * slot's default content may hold more than one kind — a glyph and a label — and each
 * kind is formatted by a disjoint property set. A flat block could not attribute which
 * styles belonged to which primitive.
 *
 * On a slot element each entry is the formatting that kind of fill takes on, captured from
 * the first top-level primitive of that kind in the slot's default content, per variant. It
 * is overridden per variant through `variants[].elements` exactly as `styles` is.
 *
 * A component fill is formatted by the component it instantiates, so a consumer rendering
 * one applies `styles` and discards `contentStyles`.
 *
 * Meaningful only on a slot element, and its keys should agree with that slot's `anyOf`
 * markers — both authoring/generator contracts, neither schema-enforced.
 * @since 0.39.0
 */
export type ContentStyles = Partial<{
  /** Formatting for a text primitive filling this slot. */
  $text: TextContentStyles;
  /** Formatting for a glyph primitive filling this slot. */
  $glyph: GlyphContentStyles;
}>;

/**
 * Platform-neutral token reference. Uses `$token` and `$type` as the
 * complete platform-facing API surface; `$extensions["com.figma"]` carries
 * Figma extraction provenance only and is not required by platform consumers.
 * @since 0.11.0
 */
export interface TokenReference {
  /** DTCG dot-separated token path, e.g. "DS Color.Text.Primary". Usable directly as DTCG alias {DS Color.Text.Primary}. */
  $token: string;
  /**
   * DTCG token type (Format Module §9). Standard values: color, dimension, string, number, boolean,
   * shadow, gradient, typography. "effects" is a Specs extension for EffectsGroup references
   * (multi-shadow + blur composite) with no DTCG equivalent. "image" is a Specs extension for
   * fill-style references whose styled paint is an image (ADR-063), likewise without a DTCG equivalent.
   */
  $type:
    | 'color'
    | 'dimension'
    | 'string'
    | 'number'
    | 'boolean'
    | 'shadow'
    | 'gradient'
    | 'typography'
    | 'effects'
    | 'image';
  /** Tool-specific metadata per DTCG §5.2.3 (reverse domain name notation). Optional; not required for platform code generation. */
  $extensions?: {
    'com.figma'?: {
      /** Figma variable or style UUID. */
      id: string;
      /** Figma name within collection, e.g. "Text/Primary". */
      name?: string;
      /** Figma collection name, e.g. "DS Color" (variables only; presence distinguishes variable from named-style reference). */
      collectionName?: string;
      /** Value resolved by Figma at extraction time. Color tokens resolve to a DTCG Color object. No DTCG equivalent; Figma extraction provenance only. */
      rawValue?: string | number | boolean | ColorObject;
    };
  };
}

/**
 * Style value types supported in the output format.
 * Can be primitives, token references, prop bindings, or conditional expressions.
 */
export type Style = string | boolean | number | null | TokenReference | PropBinding | Conditional;

/**
 * Inline resolved color value per DTCG Color Module §4.1.
 * `colorSpace` and `components` are required; `alpha` defaults to 1 when omitted;
 * `hex` is an optional 6-digit sRGB fallback (#RRGGBB — no alpha channel in hex).
 *
 * The 14 supported `colorSpace` values correspond to DTCG Color §4.2.
 * The `colorSpace` field is typed as `string` (not a literal union) to avoid drift
 * with the schema enum — the schema provides the validation constraint.
 *
 * Mirrors `ColorObject` in `schema/styles.schema.json`.
 * @since 0.11.0
 */
export interface ColorObject { /** Candidate */
  /** Color space identifier per DTCG Color §4.2 (e.g. 'srgb', 'oklch', 'display-p3'). */
  colorSpace: string;
  /** Ordered component values for the given color space. Each element is a number or the 'none' keyword. */
  components: (number | 'none')[];
  /** Alpha channel 0–1. Defaults to 1 (fully opaque) when omitted. */
  alpha?: number;
  /** Optional 6-digit sRGB fallback hex string (#RRGGBB). Alpha is excluded per DTCG §4.1. */
  hex?: string;
}

/**
 * Colour-specific style value type.
 * Mirrors `ColorStyleValue` in `schema/styles.schema.json`.
 * Used for `backgroundColor`, `fillColor`, `textColor`, and `strokes` — the four properties
 * whose values are always colour-semantics and may carry gradient data.
 *
 * The `string` arm covers formatted colour strings (e.g. `#FF6600`, `rgba(...)`)
 * emitted when `Settings.spec.color` is set to a non-`OBJECT` format.
 */
export type ColorStyle = string | ColorObject | TokenReference | GradientValue | null;

/**
 * Inline typography properties grouped into a composite object.
 * All fields are optional; only properties set on the text node are present.
 * Maps to transformer primitive types: font, mixableNumber, mixableString, pureNumber, boolean, lineHeight.
 */
export interface Typography {
  /** Font size in pixels (mixableNumber primitive) */
  fontSize?: number | 'mixed' | TokenReference;
  /** Font family name; 'mixed' when text has multiple families; TokenReference for variable-bound fonts */
  fontFamily?: string | 'mixed' | TokenReference;
  /** Style name (e.g., "Bold"); 'mixed' when varied; TokenReference for variable-bound fonts */
  fontStyle?: string | 'mixed' | TokenReference;
  /** Line height: "150%", "auto", or pixel value (lineHeight primitive) */
  lineHeight?: string | number | TokenReference;
  /** Letter spacing in pixels; 'mixed' allowed (mixableNumber primitive) */
  letterSpacing?: number | 'mixed' | TokenReference;
  /** Text case: "UPPER", "LOWER", "TITLE", "ORIGINAL", or 'mixed' (mixableString primitive) */
  textCase?: string | 'mixed' | TokenReference;
  /** Text decoration: "UNDERLINE", "STRIKETHROUGH", "NONE", or 'mixed' (mixableString primitive) */
  textDecoration?: string | 'mixed' | TokenReference;
  /** Paragraph indent in pixels (pureNumber primitive) */
  paragraphIndent?: number | TokenReference;
  /** Spacing between paragraphs in pixels (pureNumber primitive) */
  paragraphSpacing?: number | TokenReference;
  /** Leading trim mode — 'NONE' or 'CAP_HEIGHT' per Figma API; 'mixed' when varied across selection */
  leadingTrim?: 'NONE' | 'CAP_HEIGHT' | 'mixed';
  /** Spacing for list items in pixels (pureNumber primitive) */
  listSpacing?: number | TokenReference;
  /** Whether hanging punctuation is enabled (boolean primitive) */
  hangingPunctuation?: boolean | TokenReference;
  /** Whether hanging list is enabled (boolean primitive) */
  hangingList?: boolean | TokenReference;
}

/**
 * Aspect ratio expressed as a numerator/denominator pair.
 * `x` is the numerator (e.g. 16), `y` is the denominator (e.g. 9).
 * Both components are required; irrational ratios are expressed as `{ x: 1.618, y: 1 }`.
 */
export interface AspectRatioValue {
  /** Ratio numerator (e.g. 16 for 16:9) */
  x: number;
  /** Ratio denominator (e.g. 9 for 16:9) */
  y: number;
}

/**
 * Aspect ratio style value.
 * Present only when the node has a locked ratio; `null` when unconstrained.
 * `TokenReference` is intentionally excluded — aspect ratio is a structural
 * lock of literal numbers in the Figma API, not a token-driven value.
 */
export type AspectRatioStyle = AspectRatioValue | null;

/**
 * Per-side values using logical inline-axis directions (`start`/`end`).
 * Used for `padding` and `strokeWeight` when sides differ.
 * Each field is optional; only sides that differ from the collapsed value are present.
 * @since 1.0.0
 */
export interface Sides {
  /** Block-start (top) value */
  top?: Style;
  /** Inline-end value (right in LTR, left in RTL) */
  end?: Style;
  /** Block-end (bottom) value */
  bottom?: Style;
  /** Inline-start value (left in LTR, right in RTL) */
  start?: Style;
}

/**
 * Layout positioning mode. Structural property that cannot be token-bound.
 * @since 0.19.0
 */
export type Position = 'AUTO' | 'ABSOLUTE';

/**
 * Positional offset value. Pixel number, percentage string (SCALE constraint, e.g. "25%"), or null.
 * Narrower than `Style` — positional offsets are computed from Figma layout, not token-bindable.
 * @since 0.19.0
 */
export type PositionOffset = number | string | null;

/**
 * Auto-layout direction mode. Structural property that cannot be token-bound.
 * @since 0.18.0
 */
export type LayoutMode = 'NONE' | 'HORIZONTAL' | 'VERTICAL';

/**
 * Wrap alignment mode for multi-line auto-layout. Structural property that cannot be token-bound.
 * Only meaningful when `wrap` is true.
 * @since 0.18.0
 */
export type WrapAlignment = 'START' | 'SPACE_BETWEEN';

/**
 * Main axis alignment mode for auto-layout containers.
 * Controls alignment along the primary axis (depends on `layoutMode`).
 * Structural property that cannot be token-bound.
 * @since 0.18.0
 */
export type MainAxisAlignment = 'START' | 'END' | 'CENTER' | 'SPACE_BETWEEN';

/**
 * Cross axis alignment mode for auto-layout containers.
 * Controls alignment perpendicular to the primary axis (depends on `layoutMode`).
 * Structural property that cannot be token-bound.
 * @since 0.18.0
 */
export type CrossAxisAlignment = 'START' | 'END' | 'CENTER' | 'STRETCH' | 'BASELINE';

/**
 * Horizontal text alignment using logical inline-axis directions.
 * `START` resolves to left in LTR and right in RTL; `END` is the inverse.
 * Structural property that cannot be token-bound.
 * Values follow CSS Logical Properties (`text-align: start | end | justify`),
 * Jetpack Compose (`TextAlign.Start/End/Justify`), and Flutter; Figma's
 * physical `LEFT`/`RIGHT`/`JUSTIFIED` values are mapped at extraction time.
 * @since 0.29.0
 */
export type TextAlignHorizontal = 'START' | 'CENTER' | 'END' | 'JUSTIFY';

/**
 * How text is handled when it overflows its bounds. Structural property that cannot be token-bound.
 * `'CLIP'` cuts the text off; `'ELLIPSIS'` truncates with a trailing ellipsis.
 * Named after CSS `text-overflow` and Jetpack Compose `TextOverflow` (values `clip`/`ellipsis`).
 * @since 0.28.0
 */
export type TextOverflow = 'CLIP' | 'ELLIPSIS';

/**
 * Dash geometry for a dashed stroke.
 * Presence on `Styles.strokeDashPattern` indicates a dashed stroke; null or absent indicates solid.
 * `dash` and `gap` are in pixels and correspond to index 0 and 1 of Figma's `strokeDashes` array.
 * @since 0.27.0
 */
export interface StrokeDashPattern {
  /** Dash segment length in pixels */
  dash: number;
  /** Gap segment length in pixels */
  gap: number;
}

/**
 * Bi-axial item spacing values using absolute visual axes.
 * Used for `itemSpacing` when horizontal and vertical gaps differ.
 * Each field is optional; only axes that differ from the collapsed value are present.
 * @since 0.18.0
 */
export interface ItemSpacing {
  /** Horizontal gap between items */
  horizontal?: Style;
  /** Vertical gap between items */
  vertical?: Style;
}

/**
 * Per-corner values using logical inline-axis directions (`topStart`/`topEnd`/`bottomStart`/`bottomEnd`).
 * Used for `cornerRadius` when corners differ.
 * Each field is optional; only corners that differ from the collapsed value are present.
 * @since 1.0.0
 */
export interface Corners {
  /** Top-start corner (top-left in LTR, top-right in RTL) */
  topStart?: Style;
  /** Top-end corner (top-right in LTR, top-left in RTL) */
  topEnd?: Style;
  /** Bottom-end corner (bottom-right in LTR, bottom-left in RTL) */
  bottomEnd?: Style;
  /** Bottom-start corner (bottom-left in LTR, bottom-right in RTL) */
  bottomStart?: Style;
}

/**
 * Style property keys that can appear in the serialized output
 */
export type StyleKey =
  | 'rotation'
  | 'visible'
  | 'opacity'
  | 'locked'
  | 'backgroundColor'
  | 'backgroundImage'
  | 'fillColor'
  | 'effects'
  | 'clipsContent'
  | 'cornerRadius'
  | 'width'
  | 'height'
  | 'minWidth'
  | 'minHeight'
  | 'maxWidth'
  | 'maxHeight'
  | 'position'
  | 'top'
  | 'bottom'
  | 'start'
  | 'end'
  | 'centerHorizontalOffset'
  | 'centerVerticalOffset'
  | 'layoutSizingHorizontal'
  | 'layoutSizingVertical'
  | 'strokes'
  | 'strokeAlign'
  | 'strokeWeight'
  | 'strokeDashPattern'
  | 'typography'
  | 'textAlignHorizontal'
  | 'textAlignVertical'
  | 'textOverflow'
  | 'maxLines'
  | 'textColor'
  | 'mainAxisAlignment'
  | 'primaryAxisSizingMode'
  | 'crossAxisAlignment'
  | 'layoutMode'
  | 'wrap'
  | 'wrapAlignment'
  | 'itemReverseZIndex'
  | 'itemSpacing'
  | 'padding'
  | 'cornerSmoothing'
  | 'aspectRatio';
