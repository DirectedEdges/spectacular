/**
 * Type-level tests for Styles, Shadow, Blur, Effects, Typography, and gradient types.
 * These files are intentionally never executed — they are compiled with tsc
 * to assert that the type shape is correct.
 */
import type {
  Styles, Shadow, Blur, Effects, Typography,
  TokenReference, ColorStyle, ColorObject, GradientStop, GradientCenter, LinearGradient, RadialGradient,
  AngularGradient, GradientValue, AspectRatioValue, AspectRatioStyle,
  Sides, Corners, ItemSpacing, LayoutMode, WrapAlignment,
  MainAxisAlignment, CrossAxisAlignment, Position, PositionOffset,
  StrokeDashPattern, TextAlignHorizontal, TextOverflow,
  ContentStyles, TextContentStyles, GlyphContentStyles,
} from '../types/index.js';

// ─── ColorStyle ────────────────────────────────────────────────────────────

// ColorObject arm (DTCG Color §4.1 object)
const csColorObject: ColorStyle = {
  colorSpace: 'srgb',
  components: [1, 0, 0.498],
  alpha: 1,
  hex: '#ff007f',
} satisfies ColorObject;

// String arm is valid — covers formatted color strings (hex, rgba, hsla, etc.) when Config.format.color is non-OBJECT
const _csHexString: ColorStyle = '#ff007f';

// TokenReference arm
const csToken: ColorStyle = { $token: 'DS Color.Text.Primary', $type: 'color' } satisfies TokenReference;

// GradientValue arm
const csGradient: ColorStyle = {
  type: 'LINEAR',
  angle: 90,
  stops: [
    { position: 0, color: { colorSpace: 'srgb', components: [1, 0, 0.498], hex: '#ff007f' } },
    { position: 1, color: { colorSpace: 'srgb', components: [0, 0, 1], hex: '#0000ff' } },
  ],
} satisfies GradientValue;

// null is valid (no color)
const csNull: ColorStyle = null;

// @ts-expect-error: number is not valid for ColorStyle
const _csNumber: ColorStyle = 0xff007f;

// ─── Styles with ColorStyle fields ────────────────────────────────────────

const withBackground: Styles = {
  backgroundColor: { colorSpace: 'srgb', components: [1, 0, 0.498], hex: '#ff007f' },
};

const withTextColor: Styles = {
  textColor: { $token: 'DS Color.Text.Primary', $type: 'color' } satisfies TokenReference,
};

const withStrokes: Styles = {
  strokes: { colorSpace: 'srgb', components: [0, 0, 1], hex: '#0000ff' },
};

const withNullBackground: Styles = {
  backgroundColor: null,
};

// ─── Styles.fillColor (glyph fill) ───────────────────────────────────────

// ColorObject arm
const withFillColor: Styles = { fillColor: { colorSpace: 'srgb', components: [1, 0, 0.498], hex: '#ff007f' } };

// TokenReference arm
const withFillColorToken: Styles = {
  fillColor: { $token: 'DS Color.Icon.Primary', $type: 'color' } satisfies TokenReference,
};

// GradientValue arm
const withFillColorGradient: Styles = {
  fillColor: {
    type: 'LINEAR',
    angle: 45,
    stops: [
      { position: 0, color: { colorSpace: 'srgb', components: [1, 0, 0.498], hex: '#ff007f' } },
      { position: 1, color: { colorSpace: 'srgb', components: [0, 0, 1], hex: '#0000ff' } },
    ],
  } satisfies GradientValue,
};

// null is valid (no glyph fill)
const withNullFillColor: Styles = { fillColor: null };

// fillColor is optional — omitting it is valid
const withNoFillColor: Styles = {};

// String arms are valid — covers formatted color strings when Config.format.color is non-OBJECT
const _withBgHexString: Styles = { backgroundColor: '#ff007f' };
const _withTextColorHexString: Styles = { textColor: '#000000' };

// ─── Shadow ────────────────────────────────────────────────────────────────

const shadowRaw: Shadow = {
  visible: true,
  offsetX: 0,
  offsetY: 4,
  blur: 8,
  spread: 0,
  color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 1, hex: '#000000' },
};

const shadowVariable: Shadow = {
  visible: false,
  inset: true,
  offsetX: { $token: 'Space.2', $type: 'dimension' } satisfies TokenReference,
  offsetY: { $token: 'Space.4', $type: 'dimension' } satisfies TokenReference,
  blur: 4,
  spread: 0,
  color: { $token: 'DS Color.Text.Primary', $type: 'color' } satisfies TokenReference,
};

// Old VariableStyle shape must NOT compile as Shadow field — breaking change
// @ts-expect-error: VariableStyle is no longer valid for Shadow.offsetX
const _oldVarAsOffset: Shadow['offsetX'] = { id: 'var:1' };

// visible must be boolean — @ts-expect-error: string is not boolean
const _badVisible: Shadow = {
  // @ts-expect-error
  visible: 'yes',
  offsetX: 0, offsetY: 0, blur: 0, spread: 0, color: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' },
};

// ─── Blur ──────────────────────────────────────────────────────────────────

const blurRaw: Blur = { visible: true, radius: 12 };
const blurToken: Blur = { visible: false, radius: { $token: 'Blur.Soft', $type: 'dimension' } satisfies TokenReference };

// Old VariableStyle shape must NOT compile as Blur.radius — breaking change
// @ts-expect-error: VariableStyle is no longer valid for Blur.radius
const _oldVarAsRadius: Blur['radius'] = { id: 'var:4' };

// @ts-expect-error: missing required radius
const _badBlur: Blur = { visible: true };

// ─── Effects ──────────────────────────────────────────────────────────────

// All keys optional — empty Effects is valid
const emptyGroup: Effects = {};

const fullGroup: Effects = {
  shadows: [shadowRaw, { ...shadowVariable, inset: true }],
  layerBlur: blurRaw,
  backgroundBlur: blurToken,
};

// shadows is Shadow[], not Shadow
const _shadowsType: Shadow[] | undefined = fullGroup.shadows;

// layerBlur is singular Blur, not array
const _layerType: Blur | undefined = fullGroup.layerBlur;

// ─── Styles.effects ────────────────────────────────────────────────────────

// Named style reference — now uses TokenReference ($type: 'effects')
const withEffectsRef: Styles = {
  effects: { $token: 'Elevation.Shadow.Card', $type: 'effects' } satisfies TokenReference,
};

// Old FigmaStyle shape must NOT compile as Styles.effects — breaking change
// @ts-expect-error: FigmaStyle is no longer valid for Styles.effects
const _oldFigmaAsEffects: NonNullable<Styles['effects']> = { id: 'S:abc123' };

// Inline effects via Effects
const withEffectsGroup: Styles = {
  effects: fullGroup,
};

// effects is optional — no effects key at all is valid
const withNoEffects: Styles = {};

// ─── effects must not be a Shadow[] array directly (old shape) ─────────────
// @ts-expect-error: Shadow[] is not assignable to TokenReference | Effects
const _oldEffectsShape: TokenReference | Effects = [shadowRaw];

// ─── AspectRatioValue ──────────────────────────────────────────────────────

const ratio16x9: AspectRatioValue = { x: 16, y: 9 };
const ratioSquare: AspectRatioValue = { x: 1, y: 1 };
const ratioIrrational: AspectRatioValue = { x: 1.618, y: 1 };

// @ts-expect-error: missing required y
const _missingY: AspectRatioValue = { x: 16 };

// @ts-expect-error: missing required x
const _missingX: AspectRatioValue = { y: 9 };

// @ts-expect-error: string not assignable to number
const _stringX: AspectRatioValue = { x: '16', y: 9 };

// ─── AspectRatioStyle ──────────────────────────────────────────────────────

// Object pair is valid
const ratioStyle: AspectRatioStyle = { x: 4, y: 3 };

// null is valid (no ratio constraint)
const noRatio: AspectRatioStyle = null;

// An { id } object must NOT be assignable to AspectRatioStyle
// @ts-expect-error: { id } is not a valid AspectRatioStyle
const _varRatio: AspectRatioStyle = { id: 'var:1' };

// ─── Styles.aspectRatio ────────────────────────────────────────────────────

// Field is optional — omitting it is valid
const noAspectRatio: Styles = {};

// Object pair
const withRatio: Styles = { aspectRatio: { x: 16, y: 9 } };

// null is valid
const withNullRatio: Styles = { aspectRatio: null };

// @ts-expect-error: plain number is not valid
const _numberRatio: Styles = { aspectRatio: 1.777 };

// @ts-expect-error: string is not valid
const _stringRatio: Styles = { aspectRatio: '16:9' };

// ─── Typography ────────────────────────────────────────────────────────────

// All keys optional — empty typography group is valid
const emptyTypography: Typography = {};

// Typography with all raw primitive values
const fullTypographyRaw: Typography = {
  fontSize: 16,
  fontFamily: 'Inter',
  fontStyle: 'Regular',
  lineHeight: '150%',
  letterSpacing: 0,
  textCase: 'ORIGINAL',
  textDecoration: 'NONE',
  paragraphIndent: 0,
  paragraphSpacing: 12,
  leadingTrim: 'NONE',
  listSpacing: 8,
  hangingPunctuation: false,
  hangingList: false,
};

// Typography with TokenReference values
const fullTypographyToken: Typography = {
  fontSize: { $token: 'Typography.Body.Size', $type: 'dimension' } satisfies TokenReference,
  fontFamily: { $token: 'Typography.Body.FontFamily', $type: 'string' } satisfies TokenReference,
  fontStyle: { $token: 'Typography.Body.FontStyle', $type: 'string' } satisfies TokenReference,
  lineHeight: { $token: 'Typography.Body.LineHeight', $type: 'dimension' } satisfies TokenReference,
  letterSpacing: { $token: 'Typography.Body.LetterSpacing', $type: 'dimension' } satisfies TokenReference,
  textCase: { $token: 'Typography.Body.TextCase', $type: 'string' } satisfies TokenReference,
  textDecoration: { $token: 'Typography.Body.Decoration', $type: 'string' } satisfies TokenReference,
  paragraphIndent: { $token: 'Typography.Body.Indent', $type: 'dimension' } satisfies TokenReference,
  paragraphSpacing: { $token: 'Typography.Body.ParaSpacing', $type: 'dimension' } satisfies TokenReference,
  // leadingTrim no longer accepts TokenReference — it is a string enum ('NONE' | 'CAP_HEIGHT' | 'mixed')
  leadingTrim: 'CAP_HEIGHT',
  listSpacing: { $token: 'Typography.Body.ListSpacing', $type: 'dimension' } satisfies TokenReference,
  hangingPunctuation: { $token: 'Typography.Body.HangingPunct', $type: 'boolean' } satisfies TokenReference,
  hangingList: { $token: 'Typography.Body.HangingList', $type: 'boolean' } satisfies TokenReference,
};

// Old VariableStyle shape must NOT compile as Typography sub-field — breaking change
// @ts-expect-error: VariableStyle is no longer valid for Typography.fontSize
const _oldVarAsFontSize: Typography['fontSize'] = { id: 'var:fontSize' };

// Typography with 'mixed' values (for multi-selection)
const mixedTypography: Typography = {
  fontSize: 'mixed',
  fontFamily: 'mixed',
  fontStyle: 'mixed',
  letterSpacing: 'mixed',
  textCase: 'mixed',
  textDecoration: 'mixed',
  leadingTrim: 'mixed',
};

// fontSize accepts number, 'mixed', or TokenReference
const _fontSizeNumber: number | 'mixed' | TokenReference | undefined = fullTypographyRaw.fontSize;

// fontFamily/fontStyle accept string, 'mixed', or TokenReference
const _fontFamily: string | 'mixed' | TokenReference | undefined = fullTypographyRaw.fontFamily;

// hangingPunctuation accepts boolean or TokenReference
const _hangingBool: boolean | TokenReference | undefined = fullTypographyRaw.hangingPunctuation;

// @ts-expect-error: fontSize must not accept string
const _badFontSize: Typography = { fontSize: '16px' };

// leadingTrim accepts 'NONE', 'CAP_HEIGHT', or 'mixed' — not number or TokenReference
const _leadingTrimNone: Typography = { leadingTrim: 'NONE' };
const _leadingTrimCap: Typography = { leadingTrim: 'CAP_HEIGHT' };
const _leadingTrimMixed: Typography = { leadingTrim: 'mixed' };

// @ts-expect-error: leadingTrim must not accept number (was incorrectly typed as mixableNumber)
const _badLeadingTrimNumber: Typography = { leadingTrim: 0 };

// @ts-expect-error: leadingTrim must not accept TokenReference
const _badLeadingTrimToken: Typography['leadingTrim'] = { $token: 'X', $type: 'dimension' };

// fontFamily and fontStyle now accept TokenReference for variable-bound fonts
const _tokenFontFamily: Typography['fontFamily'] = { $token: 'Typography.FontFamily.Sans', $type: 'string' };
const _tokenFontStyle: Typography['fontStyle'] = { $token: 'Typography.FontStyle.Regular', $type: 'string' };

// @ts-expect-error: fontFamily must not accept number (font names are strings)
const _badFontFamilyNumber: Typography['fontFamily'] = 400;

// @ts-expect-error: fontStyle must not accept number (style names are strings)
const _badFontStyleNumber: Typography['fontStyle'] = 400;

// @ts-expect-error: hangingPunctuation must not accept string
const _badHanging: Typography = { hangingPunctuation: 'yes' };

// ─── Styles.typography ─────────────────────────────────────────────────────

// Named text style reference — now uses TokenReference ($type: 'typography')
const withTextStyle: Styles = {
  typography: { $token: 'Body.Medium', $type: 'typography' } satisfies TokenReference,
};

// Old FigmaStyle shape must NOT compile as Styles.typography — breaking change
// @ts-expect-error: FigmaStyle is no longer valid for Styles.typography
const _oldFigmaAsTypo: NonNullable<Styles['typography']> = { id: 'S:textStyle123' };

// Inline typography via Typography
const withTypographyGroup: Styles = {
  typography: fullTypographyRaw,
};

// typography is optional — no typography key at all is valid
const withNoTypography: Styles = {};

// ─── Verify flat typography properties removed from Styles ────────────────

// @ts-expect-error: fontSize no longer exists on Styles
const _oldFontSize: Styles = { fontSize: 16 };

// @ts-expect-error: fontFamily no longer exists on Styles
const _oldFontFamily: Styles = { fontFamily: 'Inter' };

// @ts-expect-error: fontStyle no longer exists on Styles
const _oldFontStyle: Styles = { fontStyle: 'Regular' };

// @ts-expect-error: lineHeight no longer exists on Styles
const _oldLineHeight: Styles = { lineHeight: { value: 24, unit: 'PIXELS' } };

// @ts-expect-error: letterSpacing no longer exists on Styles
const _oldLetterSpacing: Styles = { letterSpacing: 0 };

// @ts-expect-error: textCase no longer exists on Styles
const _oldTextCase: Styles = { textCase: 'ORIGINAL' };

// @ts-expect-error: textDecoration no longer exists on Styles
const _oldTextDecoration: Styles = { textDecoration: 'NONE' };

// @ts-expect-error: paragraphIndent no longer exists on Styles
const _oldParagraphIndent: Styles = { paragraphIndent: 0 };

// @ts-expect-error: paragraphSpacing no longer exists on Styles
const _oldParagraphSpacing: Styles = { paragraphSpacing: 12 };

// @ts-expect-error: leadingTrim no longer exists on Styles
const _oldLeadingTrim: Styles = { leadingTrim: 'NONE' };

// @ts-expect-error: listSpacing no longer exists on Styles
const _oldListSpacing: Styles = { listSpacing: 8 };

// @ts-expect-error: hangingPunctuation no longer exists on Styles
const _oldHangingPunctuation: Styles = { hangingPunctuation: false };

// @ts-expect-error: hangingList no longer exists on Styles
const _oldHangingList: Styles = { hangingList: false };

// @ts-expect-error: textStyleId no longer exists on Styles
const _oldTextStyleId: Styles = { textStyleId: 'S:123' };

// ─── Sides ───────────────────────────────────────────────────────────────────

// All keys optional — empty Sides is valid
const emptySides: Sides = {};

// Full Sides with numeric values
const fullSides: Sides = { top: 8, end: 16, bottom: 8, start: 16 };

// Individual sides with TokenReference
const tokenSides: Sides = {
  top: { $token: 'Space.4', $type: 'dimension' } satisfies TokenReference,
  end: 12,
  bottom: null,
  start: 12,
};

// ─── Corners ─────────────────────────────────────────────────────────────────

// All keys optional — empty Corners is valid
const emptyCorners: Corners = {};

// Full Corners with numeric values
const fullCorners: Corners = { topStart: 4, topEnd: 4, bottomEnd: 8, bottomStart: 8 };

// Individual corners with TokenReference
const tokenCorners: Corners = {
  topStart: { $token: 'Radius.Sm', $type: 'dimension' } satisfies TokenReference,
  topEnd: 4,
  bottomEnd: null,
  bottomStart: 4,
};

// ─── Styles.padding (scalar or Sides) ────────────────────────────────────────

// Scalar number (uniform padding)
const uniformPadding: Styles = { padding: 8 };

// Sides object (per-side padding)
const perSidePadding: Styles = { padding: { top: 8, end: 16, bottom: 8, start: 16 } };

// TokenReference for padding
const tokenPadding: Styles = {
  padding: { $token: 'Space.Container', $type: 'dimension' } satisfies TokenReference,
};

// null is valid
const nullPadding: Styles = { padding: null };

// ─── Styles.strokeWeight (scalar or Sides) ───────────────────────────────────

// Scalar number (uniform stroke weight)
const uniformStroke: Styles = { strokeWeight: 1 };

// Sides object (per-side stroke weight)
const perSideStroke: Styles = { strokeWeight: { top: 1, end: 0, bottom: 2, start: 0 } };

// TokenReference for strokeWeight
const tokenStroke: Styles = {
  strokeWeight: { $token: 'Border.Width', $type: 'dimension' } satisfies TokenReference,
};

// ─── Styles.cornerRadius (scalar or Corners) ────────────────────────────────

// Scalar number (uniform corner radius)
const uniformRadius: Styles = { cornerRadius: 8 };

// Corners object (per-corner radius)
const perCornerRadius: Styles = { cornerRadius: { topStart: 8, topEnd: 8, bottomEnd: 0, bottomStart: 0 } };

// TokenReference for cornerRadius
const tokenRadius: Styles = {
  cornerRadius: { $token: 'Radius.Md', $type: 'dimension' } satisfies TokenReference,
};

// ─── Verify flat side/corner properties removed from Styles ──────────────────

// @ts-expect-error: paddingLeft no longer exists on Styles
const _oldPaddingLeft: Styles = { paddingLeft: 8 };

// @ts-expect-error: paddingRight no longer exists on Styles
const _oldPaddingRight: Styles = { paddingRight: 8 };

// @ts-expect-error: paddingTop no longer exists on Styles
const _oldPaddingTop: Styles = { paddingTop: 8 };

// @ts-expect-error: paddingBottom no longer exists on Styles
const _oldPaddingBottom: Styles = { paddingBottom: 8 };

// @ts-expect-error: strokeTopWeight no longer exists on Styles
const _oldStrokeTop: Styles = { strokeTopWeight: 1 };

// @ts-expect-error: strokeBottomWeight no longer exists on Styles
const _oldStrokeBottom: Styles = { strokeBottomWeight: 1 };

// @ts-expect-error: strokeLeftWeight no longer exists on Styles
const _oldStrokeLeft: Styles = { strokeLeftWeight: 1 };

// @ts-expect-error: strokeRightWeight no longer exists on Styles
const _oldStrokeRight: Styles = { strokeRightWeight: 1 };

// @ts-expect-error: topLeftRadius no longer exists on Styles
const _oldTopLeftRadius: Styles = { topLeftRadius: 4 };

// @ts-expect-error: topRightRadius no longer exists on Styles
const _oldTopRightRadius: Styles = { topRightRadius: 4 };

// @ts-expect-error: bottomLeftRadius no longer exists on Styles
const _oldBottomLeftRadius: Styles = { bottomLeftRadius: 4 };

// @ts-expect-error: bottomRightRadius no longer exists on Styles
const _oldBottomRightRadius: Styles = { bottomRightRadius: 4 };

// ─── ItemSpacing ───────────────────��────────────────────────────────────────

// All keys optional — empty ItemSpacing is valid
const emptyItemSpacing: ItemSpacing = {};

// Full ItemSpacing with numeric values
const fullItemSpacing: ItemSpacing = { horizontal: 16, vertical: 8 };

// Individual axes with TokenReference
const tokenItemSpacing: ItemSpacing = {
  horizontal: { $token: 'Space.Gap.H', $type: 'dimension' } satisfies TokenReference,
  vertical: 8,
};

// null is valid for individual axis (absent/not set)
const nullAxisSpacing: ItemSpacing = { horizontal: null, vertical: 12 };

// ─── Styles.itemSpacing (scalar or ItemSpacing) ─────────────────────────────

// Scalar number (uniform spacing)
const uniformItemSpacing: Styles = { itemSpacing: 16 };

// ItemSpacing object (per-axis)
const perAxisItemSpacing: Styles = { itemSpacing: { horizontal: 16, vertical: 8 } };

// TokenReference for itemSpacing
const tokenItemSpacingStyle: Styles = {
  itemSpacing: { $token: 'Space.Gap', $type: 'dimension' } satisfies TokenReference,
};

// null is valid
const nullItemSpacing: Styles = { itemSpacing: null };

// @ts-expect-error: counterAxisSpacing no longer exists on Styles
const _oldCounterAxisSpacing: Styles = { counterAxisSpacing: 8 };

// ─── LayoutMode ─────────────────────────────────────────────────────────────

// Valid enum values
const _lmNone: LayoutMode = 'NONE';
const _lmHorizontal: LayoutMode = 'HORIZONTAL';
const _lmVertical: LayoutMode = 'VERTICAL';

// @ts-expect-error: arbitrary string is not valid LayoutMode
const _lmBad: LayoutMode = 'GRID';

// @ts-expect-error: number is not valid LayoutMode
const _lmNumber: LayoutMode = 0;

// ─── Styles.layoutMode (LayoutMode | null) ──────────────────────────────────

// Valid enum values on Styles
const withLayoutNone: Styles = { layoutMode: 'NONE' };
const withLayoutHorizontal: Styles = { layoutMode: 'HORIZONTAL' };
const withLayoutVertical: Styles = { layoutMode: 'VERTICAL' };

// null is valid
const withLayoutNull: Styles = { layoutMode: null };

// @ts-expect-error: TokenReference is not valid for layoutMode (not token-bindable)
const _lmToken: Styles = { layoutMode: { $token: 'Layout.Mode', $type: 'string' } satisfies TokenReference };

// @ts-expect-error: number is not valid for layoutMode
const _lmStyleNumber: Styles = { layoutMode: 1 };

// @ts-expect-error: arbitrary string is not valid for layoutMode
const _lmArbitrary: Styles = { layoutMode: 'ROW' };

// ─── WrapAlignment ──────────────────────────────────────────────────────────

// Valid enum values
const _waStart: WrapAlignment = 'START';
const _waSpaceBetween: WrapAlignment = 'SPACE_BETWEEN';

// @ts-expect-error: arbitrary string is not valid WrapAlignment
const _waBad: WrapAlignment = 'CENTER';

// @ts-expect-error: number is not valid WrapAlignment
const _waNumber: WrapAlignment = 0;

// @ts-expect-error: lowercase is not valid (SCREAMING_CASE required)
const _waLowercase: WrapAlignment = 'start';

// ─── Styles.wrap (boolean Style) ────────────────────────────────────────────

// Boolean values
const withWrapTrue: Styles = { wrap: true };
const withWrapFalse: Styles = { wrap: false };

// null is valid (Style includes null)
const withWrapNull: Styles = { wrap: null };

// TokenReference is valid (Style includes TokenReference)
const withWrapToken: Styles = {
  wrap: { $token: 'Layout.Wrap', $type: 'boolean' } satisfies TokenReference,
};

// ─── Styles.clipsContent (boolean Style) ────────────────────────────────────

// Boolean values
const withClipsContentTrue: Styles = { clipsContent: true };
const withClipsContentFalse: Styles = { clipsContent: false };

// null is valid (Style includes null)
const withClipsContentNull: Styles = { clipsContent: null };

// TokenReference is valid (Style includes TokenReference)
const withClipsContentToken: Styles = {
  clipsContent: { $token: 'Layout.ClipsContent', $type: 'boolean' } satisfies TokenReference,
};

// The pre-ADR-069 name is no longer a Styles key
// @ts-expect-error: clipContent was renamed to clipsContent
const withOldClipName: Styles = { clipContent: true };

// ─── Styles.wrapAlignment (WrapAlignment | null) ────────────────────────────

// Valid enum values on Styles
const withWrapAlignStart: Styles = { wrapAlignment: 'START' };
const withWrapAlignSpace: Styles = { wrapAlignment: 'SPACE_BETWEEN' };

// null is valid
const withWrapAlignNull: Styles = { wrapAlignment: null };

// @ts-expect-error: TokenReference is not valid for wrapAlignment (not token-bindable)
const _waToken: Styles = { wrapAlignment: { $token: 'Layout.WrapAlign', $type: 'string' } satisfies TokenReference };

// @ts-expect-error: number is not valid for wrapAlignment
const _waStyleNumber: Styles = { wrapAlignment: 1 };

// @ts-expect-error: arbitrary string is not valid for wrapAlignment
const _waArbitrary: Styles = { wrapAlignment: 'AUTO' };

// ─── Verify layoutWrap and counterAxisAlignContent removed from Styles ───────

// @ts-expect-error: layoutWrap no longer exists on Styles
const _oldLayoutWrap: Styles = { layoutWrap: true };

// @ts-expect-error: counterAxisAlignContent no longer exists on Styles
const _oldCounterAxisAlign: Styles = { counterAxisAlignContent: 'AUTO' };

// ─── MainAxisAlignment ──────────────────────────────────────────────────────

// Valid enum values
const _maStart: MainAxisAlignment = 'START';
const _maEnd: MainAxisAlignment = 'END';
const _maCenter: MainAxisAlignment = 'CENTER';
const _maSpaceBetween: MainAxisAlignment = 'SPACE_BETWEEN';

// @ts-expect-error: arbitrary string is not valid MainAxisAlignment
const _maBad: MainAxisAlignment = 'STRETCH';

// @ts-expect-error: number is not valid MainAxisAlignment
const _maNumber: MainAxisAlignment = 0;

// @ts-expect-error: lowercase is not valid (SCREAMING_CASE required)
const _maLowercase: MainAxisAlignment = 'center';

// ─── CrossAxisAlignment ─────────────────────────────────────────────────────

// Valid enum values
const _caStart: CrossAxisAlignment = 'START';
const _caEnd: CrossAxisAlignment = 'END';
const _caCenter: CrossAxisAlignment = 'CENTER';
const _caStretch: CrossAxisAlignment = 'STRETCH';
const _caBaseline: CrossAxisAlignment = 'BASELINE';

// @ts-expect-error: arbitrary string is not valid CrossAxisAlignment
const _caBad: CrossAxisAlignment = 'SPACE_BETWEEN';

// @ts-expect-error: number is not valid CrossAxisAlignment
const _caNumber: CrossAxisAlignment = 0;

// @ts-expect-error: lowercase is not valid (SCREAMING_CASE required)
const _caLowercase: CrossAxisAlignment = 'stretch';

// ─── Styles.mainAxisAlignment (MainAxisAlignment | null) ─────────────────────

// Valid enum values on Styles
const withMainStart: Styles = { mainAxisAlignment: 'START' };
const withMainEnd: Styles = { mainAxisAlignment: 'END' };
const withMainCenter: Styles = { mainAxisAlignment: 'CENTER' };
const withMainSpaceBetween: Styles = { mainAxisAlignment: 'SPACE_BETWEEN' };

// null is valid
const withMainNull: Styles = { mainAxisAlignment: null };

// @ts-expect-error: TokenReference is not valid for mainAxisAlignment (not token-bindable)
const _maToken: Styles = { mainAxisAlignment: { $token: 'Layout.Align', $type: 'string' } satisfies TokenReference };

// @ts-expect-error: number is not valid for mainAxisAlignment
const _maStyleNumber: Styles = { mainAxisAlignment: 1 };

// @ts-expect-error: arbitrary string is not valid for mainAxisAlignment
const _maArbitrary: Styles = { mainAxisAlignment: 'MIN' };

// ─── Styles.crossAxisAlignment (CrossAxisAlignment | null) ───────────────────

// Valid enum values on Styles
const withCrossStart: Styles = { crossAxisAlignment: 'START' };
const withCrossEnd: Styles = { crossAxisAlignment: 'END' };
const withCrossCenter: Styles = { crossAxisAlignment: 'CENTER' };
const withCrossStretch: Styles = { crossAxisAlignment: 'STRETCH' };
const withCrossBaseline: Styles = { crossAxisAlignment: 'BASELINE' };

// null is valid
const withCrossNull: Styles = { crossAxisAlignment: null };

// @ts-expect-error: TokenReference is not valid for crossAxisAlignment (not token-bindable)
const _caToken: Styles = { crossAxisAlignment: { $token: 'Layout.CrossAlign', $type: 'string' } satisfies TokenReference };

// @ts-expect-error: number is not valid for crossAxisAlignment
const _caStyleNumber: Styles = { crossAxisAlignment: 1 };

// @ts-expect-error: arbitrary string is not valid for crossAxisAlignment
const _caArbitrary: Styles = { crossAxisAlignment: 'MAX' };

// ─── Verify primaryAxisAlignItems and counterAxisAlignItems removed ──────────

// @ts-expect-error: primaryAxisAlignItems no longer exists on Styles
const _oldPrimaryAxis: Styles = { primaryAxisAlignItems: 'MIN' };

// @ts-expect-error: counterAxisAlignItems no longer exists on Styles
const _oldCounterAxis: Styles = { counterAxisAlignItems: 'MIN' };

// ─── Position ─────────────────────────────────────────────────────────────────

// Valid enum values
const _posAuto: Position = 'AUTO';
const _posAbsolute: Position = 'ABSOLUTE';

// @ts-expect-error: arbitrary string is not valid Position
const _posBad: Position = 'RELATIVE';

// @ts-expect-error: number is not valid Position
const _posNumber: Position = 0;

// @ts-expect-error: lowercase is not valid (SCREAMING_CASE required)
const _posLowercase: Position = 'auto';

// ─── PositionOffset ───────────────────────────────────────────────────────────

// number (pixel value)
const _poPx: PositionOffset = 24;

// string (percentage for SCALE constraint)
const _poPercent: PositionOffset = '25%';

// null (absent)
const _poNull: PositionOffset = null;

// @ts-expect-error: boolean is not valid PositionOffset
const _poBool: PositionOffset = true;

// @ts-expect-error: object is not valid PositionOffset
const _poObj: PositionOffset = { value: 24 };

// TokenReference must NOT be valid — positional offsets are not token-bindable
// @ts-expect-error: TokenReference is not assignable to PositionOffset
const _poToken: PositionOffset = { $token: 'Space.4', $type: 'dimension' } satisfies TokenReference;

// ─── Styles.position (Position | null) ────────────────────────────────────────

// Valid enum values on Styles
const withPositionAuto: Styles = { position: 'AUTO' };
const withPositionAbsolute: Styles = { position: 'ABSOLUTE' };

// null is valid
const withPositionNull: Styles = { position: null };

// @ts-expect-error: TokenReference is not valid for position (not token-bindable)
const _posToken: Styles = { position: { $token: 'Layout.Position', $type: 'string' } satisfies TokenReference };

// @ts-expect-error: number is not valid for position
const _posStyleNumber: Styles = { position: 1 };

// @ts-expect-error: arbitrary string is not valid for position
const _posArbitrary: Styles = { position: 'RELATIVE' };

// ─── Styles positioning offsets (PositionOffset) ──────────────────────────────

// Pixel number values
const withTop: Styles = { top: 24 };
const withBottom: Styles = { bottom: 0 };
const withStart: Styles = { start: 16 };
const withEnd: Styles = { end: 8 };
const withCenterH: Styles = { centerHorizontalOffset: 0 };
const withCenterV: Styles = { centerVerticalOffset: -12 };

// Percentage string values (SCALE constraint)
const withTopPercent: Styles = { top: '25%' };
const withStartPercent: Styles = { start: '10%' };

// null is valid
const withTopNull: Styles = { top: null };
const withStartNull: Styles = { start: null };

// STRETCH: both edges simultaneously
const withStretchH: Styles = { start: 16, end: 16 };
const withStretchV: Styles = { top: 8, bottom: 8 };

// Combined positioning example
const absoluteWithOffsets: Styles = {
  position: 'ABSOLUTE',
  start: 24,
  top: 16,
};

// @ts-expect-error: TokenReference is not valid for top (not token-bindable)
const _topToken: Styles = { top: { $token: 'Space.4', $type: 'dimension' } satisfies TokenReference };

// @ts-expect-error: boolean is not valid for start
const _startBool: Styles = { start: true };

// ─── Verify x, y, and layoutPositioning removed from Styles ──────────────────

// @ts-expect-error: x no longer exists on Styles
const _oldX: Styles = { x: 24 };

// @ts-expect-error: y no longer exists on Styles
const _oldY: Styles = { y: 16 };

// @ts-expect-error: layoutPositioning no longer exists on Styles
const _oldLayoutPositioning: Styles = { layoutPositioning: 'ABSOLUTE' };

// ─── StrokeDashPattern ────────────────────────────────────────────────────────

// Valid object with both required fields
const dashSolid: StrokeDashPattern = { dash: 8, gap: 4 };
const dashEqual: StrokeDashPattern = { dash: 4, gap: 4 };

// @ts-expect-error: missing required gap
const _missingGap: StrokeDashPattern = { dash: 8 };

// @ts-expect-error: missing required dash
const _missingDash: StrokeDashPattern = { gap: 4 };

// @ts-expect-error: string not assignable to number for dash
const _stringDash: StrokeDashPattern = { dash: '8px', gap: 4 };

// @ts-expect-error: string not assignable to number for gap
const _stringGap: StrokeDashPattern = { dash: 8, gap: '4px' };

// ─── Styles.strokeDashPattern (StrokeDashPattern | null) ─────────────────────

// Present = dashed stroke
const withDashPattern: Styles = { strokeDashPattern: { dash: 8, gap: 4 } };

// null = solid stroke (explicit)
const withSolidExplicit: Styles = { strokeDashPattern: null };

// absent = solid stroke (omitted is valid — Styles fields are all optional)
const withSolidOmitted: Styles = {};

// Combined with other stroke fields
const dashedBorder: Styles = {
  strokes: '#FF0000',
  strokeWeight: 1,
  strokeDashPattern: { dash: 6, gap: 3 },
};

// @ts-expect-error: TokenReference is not valid for strokeDashPattern (not token-bindable)
const _dashToken: Styles = { strokeDashPattern: { $token: 'Border.Dash', $type: 'string' } satisfies TokenReference };

// @ts-expect-error: plain number is not valid for strokeDashPattern
const _dashNumber: Styles = { strokeDashPattern: 8 };

// @ts-expect-error: string is not valid for strokeDashPattern
const _dashString: Styles = { strokeDashPattern: 'dashed' };

// ─── TextAlignHorizontal ──────────────────────────────────────────────────────

// Valid enum values
const _taStart: TextAlignHorizontal = 'START';
const _taCenter: TextAlignHorizontal = 'CENTER';
const _taEnd: TextAlignHorizontal = 'END';
const _taJustify: TextAlignHorizontal = 'JUSTIFY';

// Figma's physical raw values must NOT compile — remapped in the generator
// @ts-expect-error: LEFT is not valid TextAlignHorizontal (maps to START)
const _taLeft: TextAlignHorizontal = 'LEFT';

// @ts-expect-error: RIGHT is not valid TextAlignHorizontal (maps to END)
const _taRight: TextAlignHorizontal = 'RIGHT';

// @ts-expect-error: JUSTIFIED is not valid TextAlignHorizontal (maps to JUSTIFY)
const _taJustified: TextAlignHorizontal = 'JUSTIFIED';

// @ts-expect-error: number is not valid TextAlignHorizontal
const _taNumber: TextAlignHorizontal = 0;

// @ts-expect-error: lowercase is not valid (SCREAMING_CASE required)
const _taLowercase: TextAlignHorizontal = 'start';

// ─── Styles.textAlignHorizontal (TextAlignHorizontal | null) ─────────────────

// Valid enum values on Styles
const withAlignStart: Styles = { textAlignHorizontal: 'START' };
const withAlignCenter: Styles = { textAlignHorizontal: 'CENTER' };
const withAlignEnd: Styles = { textAlignHorizontal: 'END' };
const withAlignJustify: Styles = { textAlignHorizontal: 'JUSTIFY' };

// null is valid
const withAlignNull: Styles = { textAlignHorizontal: null };

// absent is valid (all Styles fields optional)
const withNoAlign: Styles = {};

// @ts-expect-error: TokenReference is not valid for textAlignHorizontal (not token-bindable)
const _taToken: Styles = { textAlignHorizontal: { $token: 'Text.Align', $type: 'string' } satisfies TokenReference };

// @ts-expect-error: arbitrary string is not valid for textAlignHorizontal
const _taArbitrary: Styles = { textAlignHorizontal: 'MIDDLE' };

// @ts-expect-error: Figma-raw LEFT is not valid for textAlignHorizontal
const _taStyleLeft: Styles = { textAlignHorizontal: 'LEFT' };

// @ts-expect-error: number is not valid for textAlignHorizontal
const _taStyleNumber: Styles = { textAlignHorizontal: 1 };

// ─── TextOverflow ─────────────────────────────────────────────────────────────

// Valid enum values
const _toClip: TextOverflow = 'CLIP';
const _toEllipsis: TextOverflow = 'ELLIPSIS';

// @ts-expect-error: arbitrary string is not valid TextOverflow
const _toBad: TextOverflow = 'FADE';

// @ts-expect-error: Figma's raw value is not valid TextOverflow (remapped in the generator)
const _toFigmaRaw: TextOverflow = 'ENDING';

// @ts-expect-error: number is not valid TextOverflow
const _toNumber: TextOverflow = 0;

// @ts-expect-error: lowercase is not valid (SCREAMING_CASE required)
const _toLowercase: TextOverflow = 'clip';

// ─── Styles.textOverflow (TextOverflow | null) ───────────────────────────────

// Valid enum values on Styles
const withOverflowClip: Styles = { textOverflow: 'CLIP' };
const withOverflowEllipsis: Styles = { textOverflow: 'ELLIPSIS' };

// null is valid
const withOverflowNull: Styles = { textOverflow: null };

// absent is valid (all Styles fields optional)
const withNoOverflow: Styles = {};

// @ts-expect-error: TokenReference is not valid for textOverflow (not token-bindable)
const _toToken: Styles = { textOverflow: { $token: 'Text.Overflow', $type: 'string' } satisfies TokenReference };

// @ts-expect-error: number is not valid for textOverflow
const _toStyleNumber: Styles = { textOverflow: 1 };

// @ts-expect-error: arbitrary string is not valid for textOverflow
const _toArbitrary: Styles = { textOverflow: 'FADE' };

// ─── Styles.maxLines (Style — a plain number like width/opacity) ─────────────

// number line count
const withMaxLines: Styles = { maxLines: 2 };

// null (no limit)
const withMaxLinesNull: Styles = { maxLines: null };

// absent is valid
const withNoMaxLines: Styles = {};

// TokenReference is valid — maxLines is an ordinary Style number, token-bindable
const withMaxLinesToken: Styles = {
  maxLines: { $token: 'Text.MaxLines', $type: 'number' } satisfies TokenReference,
};

// @ts-expect-error: boolean-only object is not a valid Style for maxLines
const _mlBadObject: Styles = { maxLines: { value: 2 } };

// ─── TextContentStyles — the closed text-formatting set (ADR-102) ─────────────

// All six members, each typed as its Styles counterpart
const textContentFull: TextContentStyles = {
  textColor: { $token: 'DS Color.Text.OnPrimary', $type: 'color' },
  typography: { $token: 'DS Type.Label.Medium', $type: 'typography' },
  textAlignHorizontal: 'CENTER',
  textAlignVertical: 'CENTER',
  textOverflow: 'ELLIPSIS',
  maxLines: 1,
};

// Every member is optional — a per-variant override carries only what changes
const textContentPartial: TextContentStyles = { textColor: '#FFFFFF' };
const textContentEmpty: TextContentStyles = {};

// typography carries the composite, so its own members travel inside it
const textContentInlineTypography: TextContentStyles = {
  typography: { fontSize: 14, fontFamily: 'Inter', lineHeight: '150%', textCase: 'UPPER' },
};

// Prop binding and conditionals work wherever the underlying type is Style
const textContentBound: TextContentStyles = { maxLines: { $binding: '#/props/lines' } };
const textContentConditional: TextContentStyles = {
  maxLines: {
    if: {
      condition: { operation: 'equals', args: { value: { $binding: '#/props/dense' }, compareTo: true } },
      then: 1,
      else: null,
    },
  },
};

// A value valid in styles is valid here — same ColorStyle arms
const textContentColorObject: TextContentStyles = {
  textColor: { colorSpace: 'srgb', components: [1, 1, 1], alpha: 1, hex: '#FFFFFF' },
};

// The set is closed — layout, surface and sizing cannot enter the content record
// @ts-expect-error: padding is not a content-formatting property
const _tcPadding: TextContentStyles = { padding: 8 };

// @ts-expect-error: backgroundColor is not a content-formatting property
const _tcBackground: TextContentStyles = { backgroundColor: '#FF0000' };

// @ts-expect-error: layoutMode is not a content-formatting property
const _tcLayout: TextContentStyles = { layoutMode: 'VERTICAL' };

// @ts-expect-error: width is not a content-formatting property
const _tcWidth: TextContentStyles = { width: 100 };

// @ts-expect-error: fillColor formats a glyph, not text
const _tcFill: TextContentStyles = { fillColor: '#FF0000' };

// @ts-expect-error: CENTRE is not a TextAlignHorizontal value
const _tcBadAlign: TextContentStyles = { textAlignHorizontal: 'CENTRE' };

// @ts-expect-error: TRUNCATE is not a TextOverflow value
const _tcBadOverflow: TextContentStyles = { textOverflow: 'TRUNCATE' };

// ─── GlyphContentStyles — fillColor and the two dimensions (ADR-102) ──────────

const glyphContentFull: GlyphContentStyles = {
  fillColor: { $token: 'DS Color.Icon.OnPrimary', $type: 'color' },
  width: 16,
  height: 16,
};

// Every member is optional
const glyphContentToken: GlyphContentStyles = {
  fillColor: { $token: 'DS Color.Icon.OnPrimary', $type: 'color' },
};
const glyphContentLiteral: GlyphContentStyles = { fillColor: '#FFFFFF' };
const glyphContentSizeOnly: GlyphContentStyles = { width: 24, height: 24 };
const glyphContentEmpty: GlyphContentStyles = {};

// Dimensions are `Style`, so they token-bind, prop-bind and take conditionals — the same
// arms Styles.width has
const glyphContentSizeToken: GlyphContentStyles = {
  width: { $token: 'DS Size.Icon.Small', $type: 'dimension' },
  height: { $token: 'DS Size.Icon.Small', $type: 'dimension' },
};
const glyphContentSizeBound: GlyphContentStyles = { width: { $binding: '#/props/iconSize' } };
const glyphContentSizeConditional: GlyphContentStyles = {
  height: {
    if: {
      condition: { operation: 'equals', args: { value: { $binding: '#/props/dense' }, compareTo: true } },
      then: 16,
      else: 24,
    },
  },
};

// Layout and surface still cannot enter — a glyph is sized, not laid out
// @ts-expect-error: padding is not a glyph content-formatting property
const _gcPadding: GlyphContentStyles = { padding: 4 };

// @ts-expect-error: minWidth is not a glyph content-formatting property
const _gcMinWidth: GlyphContentStyles = { minWidth: 16 };

// Text properties do not format a glyph
// @ts-expect-error: typography is not a glyph content-formatting property
const _gcTypography: GlyphContentStyles = { typography: { fontSize: 14 } };

// @ts-expect-error: textColor is not a glyph content-formatting property — fillColor is
const _gcTextColor: GlyphContentStyles = { textColor: '#FFFFFF' };

// ─── ContentStyles — keyed by primitive (ADR-102) ─────────────────────────────

// Both kinds together, which is what a glyph-plus-label default fill records
const contentBoth: ContentStyles = {
  $text: { typography: { $token: 'DS Type.Label.Medium', $type: 'typography' } },
  $glyph: { fillColor: { $token: 'DS Color.Icon.OnPrimary', $type: 'color' } },
};

// Either kind alone, and the empty map
const contentTextOnly: ContentStyles = { $text: textContentFull };
const contentGlyphOnly: ContentStyles = { $glyph: glyphContentToken };
const contentNone: ContentStyles = {};

// Keys are the marker vocabulary and nothing else
// @ts-expect-error: $image is not a primitive marker
const _csImage: ContentStyles = { $image: { fillColor: '#FF0000' } };

// @ts-expect-error: the sigil is part of the key
const _csBareKey: ContentStyles = { text: textContentFull };

// @ts-expect-error: `string` is not the vocabulary — the primitive is named `text`
const _csStringKey: ContentStyles = { $string: textContentFull };

// Styles are not written at the top level — they belong under a kind
// @ts-expect-error: ContentStyles is keyed by primitive, not a flat style block
const _csFlat: ContentStyles = { textColor: '#FFFFFF' };

// The per-kind sets do not leak into each other
// @ts-expect-error: a text set is not a glyph set
const _csSwapped: ContentStyles = { $glyph: { maxLines: 1 } };

// A Styles value is not assignable to ContentStyles — the keyed shape shares no member
// with it, which the flat shape could not claim
declare const someStyles: Styles;
// @ts-expect-error: Styles is not a primitive-keyed content map
const _fromStyles: ContentStyles = someStyles;
