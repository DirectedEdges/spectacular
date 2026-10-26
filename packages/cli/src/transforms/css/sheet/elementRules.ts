// Declarations and rules that belong to one element, independent of whether it
// came from the default block or a variant (specs#691).
import path from 'path';
import { isGradient, isGradientToken, gradientValue } from '../values/gradients.js';
import { dimensionValue } from '../values/dimensions.js';
import { resolveTokenVar } from '../values/tokens.js';
import type { ImagesCssContext } from '../types.js';

/**
 * backgroundImage style ({ $image, objectFit? } | null) → CSS declarations.
 *
 * Fit describes the element, not the asset. An element that declares a
 * background image sizes and positions it the same way whether the URL comes
 * from the registry here or from a code-only source prop supplied at runtime,
 * so the fit declarations come from the declaration itself and only the
 * `background-image` URL depends on the registry entry resolving.
 */
export function backgroundImageDecls(value: unknown, images: ImagesCssContext | undefined): string[] {
  if (value === null) return ['background-image: none'];
  if (!value || typeof value !== 'object') return [];
  const v = value as Record<string, unknown>;
  if (typeof v.$image !== 'string') return [];
  const url = imageUrl(v.$image, images);
  return [...(url ? [`background-image: ${url}`] : []), ...fitDecls(v.objectFit)];
}

/**
 * The `url()` for a `$image` ref, or undefined when the registry entry is
 * unresolved. `src` is the registry's own portable data: an entry without one
 * has nothing further to try. Reading a Figma image hash to guess a filename
 * made output depend on where the spec came from (ADR-063).
 */
function imageUrl(ref: string, images: ImagesCssContext | undefined): string | undefined {
  if (!images?.examples) return undefined;
  const id = ref.match(/#\/components\/[^/]+\/images\/(.+)$/)?.[1];
  const entry = id ? images.examples.images[id] : undefined;
  if (typeof entry?.src !== 'string') return undefined;
  if (/^(data:|https?:)/.test(entry.src)) return `url('${entry.src}')`;
  return `url('${images.relPrefix}/${path.basename(entry.src)}')`;
}

function fitDecls(objectFit: unknown): string[] {
  return [
    'background-position: center',
    'background-repeat: no-repeat',
    `background-size: ${objectFit === 'CONTAIN' ? 'contain' : 'cover'}`,
  ];
}

/**
 * Declarations that describe TEXT rather than the box around it.
 *
 * Used when a collapsing role consumes a part: the part's box is gone with the
 * element, but its typography and colour are what the emitted control must
 * look like. Listed rather than inferred — a prefix test would sweep up
 * `text-indent` and `font` shorthand inconsistently, and the set is closed.
 */
export const TEXT_PROPERTIES: ReadonlySet<string> = new Set([
  'color',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-variant',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-align',
  'text-transform',
  'text-decoration',
  'font-feature-settings',
  '-webkit-font-smoothing',
]);

/** Glyphs and raw vectors, which paint through a mask rather than a background. */
export function isGlyphLike(elemType: string | undefined): boolean {
  return elemType === 'glyph' || elemType === 'vector';
}

/** Declarations that only mean something on an element that generates a box. */
const BOX_DECL = /^(width|height|min-width|min-height|max-width|max-height|flex|align-self|padding|margin):/;

/**
 * A text element renders as an inline span, and on a non-replaced inline box
 * the sizing declarations the spec asked for do nothing — nor does the line box
 * a declared line-height describes, which leaves the element measuring the
 * font's content area instead of its leading. When the spec gives a text
 * element box declarations, it means it as a box: `inline-block` makes them
 * apply without forcing the line break `block` would.
 */
export function inlineBlockIfBoxed(elemType: string | undefined, decls: string[]): void {
  if (elemType !== 'text') return;
  if (decls.some(d => d.startsWith('display:'))) return;
  if (!decls.some(d => BOX_DECL.test(d))) return;
  decls.push('display: inline-block');
}

/**
 * A text element whose content carries a line break preserves it.
 *
 * A design file's text is literal — a break in it is a break the designer put
 * there — while HTML collapses one into a space. Nothing emitted a
 * whitespace-preserving value, so a two-line paragraph rendered as one line:
 * the character survived the spec and the emitted code intact and was lost in
 * the browser, costing exactly one line height.
 *
 * Deliberately NOT applied to every text element. `pre-wrap` on a button label
 * or a heading preserves whitespace that was never meant as content, and most
 * web text should collapse. The declaration goes only where the content shows
 * an authored break.
 *
 * Content may be literal or bound to a prop, and a bound one is the common
 * case — the break then lives in that prop's examples or default, which is
 * where the design file's own text landed.
 */
export function preserveLineBreaks(
  element: Record<string, unknown>,
  apiProps: Record<string, Record<string, unknown>>,
  decls: string[],
): void {
  if (decls.some(d => d.startsWith('white-space:'))) return;
  if (!hasAuthoredBreak(element, apiProps)) return;
  decls.push('white-space: pre-wrap');
}

/**
 * The element's text, wherever the spec now keeps it.
 *
 * Not gated on the element being a `text` type any more. A text layer the
 * promotion recognised as a design system component is an `instance`, and its
 * text has moved into the component's `text` prop — so the old gate closed on
 * exactly the elements most likely to carry an authored break. The three text
 * components all collapse to a text root, so the class this rule writes against
 * lands on the element that renders the string, not on a box around it.
 *
 * An element with no text reaches the end and matches nothing, which is why the
 * type gate is not needed to protect anything.
 */
function hasAuthoredBreak(
  element: Record<string, unknown>,
  apiProps: Record<string, Record<string, unknown>>,
): boolean {
  if (contentHasLineBreak(element.content, apiProps)) return true;

  // What the promotion consumed, recorded so the reading reverses (ADR-084).
  const consumed = (element.$extensions as Record<string, Record<string, unknown>> | undefined)
    ?.['com.figma']?.content;
  if (typeof consumed === 'string' && consumed.includes('\n')) return true;

  // A string the spec configured on an instance — the promoted text's new home,
  // and equally a break an author typed into any component's text prop. A
  // member-keyed object value (ADR-111) carries its strings one level down.
  const configured = (element.propConfigurations ?? {}) as Record<string, unknown>;
  const carriesBreak = (v: unknown): boolean =>
    typeof v === 'string' ? v.includes('\n')
    : v !== null && typeof v === 'object' && !Array.isArray(v)
        && Object.keys(v).every(k => !k.startsWith('$'))
      ? Object.values(v).some(m => typeof m === 'string' && m.includes('\n'))
      : false;
  return Object.values(configured).some(carriesBreak);
}

/** Does this content — literal, or the prop it binds to — carry a newline? */
function contentHasLineBreak(
  content: unknown,
  apiProps: Record<string, Record<string, unknown>>,
): boolean {
  if (typeof content === 'string') return content.includes('\n');
  if (!content || typeof content !== 'object') return false;
  const binding = (content as { $binding?: unknown }).$binding;
  if (typeof binding !== 'string') return false;
  const propKey = binding.match(/^#\/props\/(.+)$/)?.[1];
  // A member pointer (ADR-111) reads the member's own definition.
  const memberPath = propKey?.split('/members/');
  const prop = memberPath && memberPath.length === 2
    ? ((apiProps[memberPath[0]]?.members as Record<string, Record<string, unknown>> | undefined)?.[memberPath[1]])
    : propKey ? apiProps[propKey] : undefined;
  if (!prop) return false;
  const candidates = [
    ...(Array.isArray(prop.examples) ? prop.examples : []),
    prop.default,
  ];
  return candidates.some(v => typeof v === 'string' && v.includes('\n'));
}

// `instanceFitRule` used to live here: a composed instance was emitted inside a
// wrapper that carried the instance node's own size, and this rule pushed that
// size down onto the wrapper's single child so the composed component filled it
// rather than painting at its master's size.
//
// The emitters no longer wrap. The composition's class goes on the composed
// component's own root, so the instance node's size is already on the element
// that needs it, and `composedSelector` in ./selectors.ts is what makes that
// rule win against the component's own root rule. One wrapper per composed
// instance, and this indirection with it, stopped being emitted.

/**
 * The ring that paints a gradient stroke, as a `::before` on the element.
 *
 * A gradient cannot be an outline, and `border-image` — the one border
 * property that takes a gradient — ignores `border-radius`, so a rounded
 * element comes out as a square frame. Painting into the element's own
 * `background` works only for an element that has no fill of its own; where
 * one exists, the ring and the fill compete for the same property and the fill
 * loses.
 *
 * A pseudo-element owns none of that. It covers the host exactly, inherits its
 * radius, and masks out its own middle so only the ring paints. The host keeps
 * its background, declares no border, and so costs no layout — the same as the
 * outline a solid stroke emits, which is what a Figma stroke does.
 *
 * Thickness is the pseudo-element's padding: it has no content, so the padding
 * box IS the ring, and excluding the content box from the border box leaves
 * exactly it.
 */
export function gradientRingRule(
  selector: string,
  styles: Record<string, unknown>,
  tokensFormat: string | undefined,
  fallbackWeight?: unknown,
): string[] {
  const strokes = styles.strokes;
  if (!isGradient(strokes) && !isGradientToken(strokes)) return [];
  const fmt = tokensFormat ?? 'TOKEN';
  const paint = isGradientToken(strokes)
    ? resolveTokenVar(strokes, fmt)
    : gradientValue(strokes, fmt);
  if (!paint) return [];
  // Thickness may be stated on another layer: a variant that restates only the
  // paint gets no `strokeWeight` of its own, and a ::before rule inherits
  // nothing from the default block's ::before — which may not even exist, since
  // the default's stroke can be solid. Without a width the mask excludes
  // everything and the ring paints nothing at all.
  const width =
    dimensionValue(styles.strokeWeight, fmt) ?? dimensionValue(fallbackWeight, fmt);
  return [
    `${selector}::before {`,
    "  content: '';",
    '  position: absolute;',
    '  inset: 0;',
    '  border-radius: inherit;',
    ...(width ? [`  padding: ${width};`] : []),
    `  background: ${paint};`,
    '  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);',
    '  mask-composite: exclude;',
    '  -webkit-mask-composite: xor;',
    '  pointer-events: none;',
    '}',
    '',
  ];
}

/**
 * Overlapping children: Figma expresses overlap as a NEGATIVE itemSpacing,
 * which `gap` cannot represent. CSS does it with a negative margin on every
 * child after the first, along the parent's main axis.
 */
export function overlapRule(selector: string, styles: Record<string, unknown>): string[] {
  const v = styles.itemSpacing;
  if (typeof v !== 'number' || v >= 0) return [];
  const prop = styles.layoutMode === 'VERTICAL' ? 'margin-block-start' : 'margin-inline-start';
  // This reaches the react scaffold's children directly. The webcomponents
  // scaffold projects slot content through a holder, and ::slotted() cannot
  // style a slotted node's descendants — so composed example content carries
  // the same margin inline instead (see composeSlotHtml).
  return [`${selector} > * + * {`, `  ${prop}: ${v}px;`, '}', ''];
}
