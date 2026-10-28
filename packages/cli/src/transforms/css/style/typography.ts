// Type: the `typography` style key, and the text alignment beside it (specs#691).
//
// Figma encodes weight and slant together in one `fontStyle` name
// ("SemiBold Italic"), so the mapping has to split what the design treats as a
// single choice into the two CSS properties that carry it.
import { isTokenRef, resolveTokenVar } from '../values/tokens.js';

const TEXT_CASE_MAP: Record<string, string> = {
  UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize', ORIGINAL: 'none',
};

const TEXT_DECORATION_MAP: Record<string, string> = {
  UNDERLINE: 'underline', STRIKETHROUGH: 'line-through', NONE: 'none',
};

// Figma fontStyle strings that carry weight semantics.
// Figma uses the style name as a combined weight+style descriptor.
const FONT_STYLE_WEIGHT_MAP: Record<string, string> = {
  Thin: '100', ExtraLight: '200', Light: '300', Regular: '400',
  Medium: '500', SemiBold: '600', Semibold: '600', Bold: '700',
  ExtraBold: '800', Black: '900',
};

const FONT_STYLE_ITALIC_SUFFIXES = ['Italic', 'Oblique'];

export function typographyDecls(styles: Record<string, unknown>, tokensFormat: string): string[] {
  if (!('typography' in styles) || styles.typography === null || styles.typography === undefined) return [];
  const decls: string[] = [];
  const v = styles.typography;
  const resolved = resolveTokenVar(v, tokensFormat);

  if (resolved) {
    // Typography token reference → CSS font shorthand placeholder. Phase 2 resolves.
    decls.push(`font: ${resolved}`);
    // `font` cannot carry letter-spacing, so cssvars emits it as a companion
    // variable. Nothing referenced it, and the shorthand resets it to normal —
    // so every tracked type token lost its tracking, while the raw-typography
    // path below applied it correctly. `normal` for tokens that declare none.
    const companion = resolved.replace(/^var\((--[\w-]+)/, '$1').match(/^(--[\w-]+)/)?.[1];
    if (companion) decls.push(`letter-spacing: var(${companion}-letter-spacing, normal)`);
    return decls;
  }

  if (typeof v !== 'object') return decls;
  const t = v as Record<string, unknown>;

  // Sub-properties are literal values unless they are explicit token refs —
  // a plain string here ("Inter", "Regular", "120%") is data, not a token name.
  if (t.fontSize !== undefined) {
    const r = isTokenRef(t.fontSize) ? resolveTokenVar(t.fontSize, tokensFormat) : null;
    if (r) decls.push(`font-size: ${r}`);
    else decls.push(`font-size: ${typeof t.fontSize === 'number' ? `${t.fontSize}px` : t.fontSize}`);
  }
  if (t.fontFamily !== undefined) {
    const r = isTokenRef(t.fontFamily) ? resolveTokenVar(t.fontFamily, tokensFormat) : null;
    if (r) decls.push(`font-family: ${r}`);
    else if (typeof t.fontFamily === 'string') {
      const fam = /\s/.test(t.fontFamily) ? `"${t.fontFamily}"` : t.fontFamily;
      decls.push(`font-family: ${fam}`);
    }
  }

  // fontStyle in Figma encodes weight + italic as a combined name ("SemiBold Italic").
  // Split into font-weight and font-style separately.
  if (t.fontStyle !== undefined && (typeof t.fontStyle === 'string' || isTokenRef(t.fontStyle))) {
    const r = isTokenRef(t.fontStyle) ? resolveTokenVar(t.fontStyle, tokensFormat) : null;
    if (r) {
      decls.push(`font-weight: ${r}`);
    } else if (typeof t.fontStyle === 'string') {
      const parts = t.fontStyle.split(/\s+/);
      const isItalic = FONT_STYLE_ITALIC_SUFFIXES.some(
        s => t.fontStyle === s || (t.fontStyle as string).endsWith(` ${s}`)
      );
      const weightName = parts.find(p => FONT_STYLE_WEIGHT_MAP[p]);
      if (weightName) decls.push(`font-weight: ${FONT_STYLE_WEIGHT_MAP[weightName]}`);
      if (isItalic) decls.push('font-style: italic');
    }
  }

  // lineHeight from Figma is always in pixels when a number.
  // Unitless lineHeight in CSS is a multiplier — always append px for numeric values.
  if (t.lineHeight !== undefined) {
    const r = isTokenRef(t.lineHeight) ? resolveTokenVar(t.lineHeight, tokensFormat) : null;
    if (r) decls.push(`line-height: ${r}`);
    else if (typeof t.lineHeight === 'number') decls.push(`line-height: ${t.lineHeight}px`);
    else if (typeof t.lineHeight === 'string') decls.push(`line-height: ${t.lineHeight}`);
  }

  if (t.letterSpacing !== undefined) {
    const r = isTokenRef(t.letterSpacing) ? resolveTokenVar(t.letterSpacing, tokensFormat) : null;
    if (r) decls.push(`letter-spacing: ${r}`);
    else if (typeof t.letterSpacing === 'number') decls.push(`letter-spacing: ${t.letterSpacing}px`);
  }
  if (t.textCase !== undefined && typeof t.textCase === 'string') {
    const mapped = TEXT_CASE_MAP[t.textCase];
    if (mapped) decls.push(`text-transform: ${mapped}`);
  }
  if (t.textDecoration !== undefined && typeof t.textDecoration === 'string') {
    const mapped = TEXT_DECORATION_MAP[t.textDecoration];
    if (mapped) decls.push(`text-decoration: ${mapped}`);
  }

  return decls;
}
