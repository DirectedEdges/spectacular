// Rules that format a slot's PRIMITIVE content — the text or glyph fill its
// `contentStyles` describes (ADR-102) — never a component fill.
//
// Under `inferComposableSlots` the primitive children leave anatomy, so no
// element rule carries the label's typography or the glyph's fill any more;
// these rules put that formatting back, against the slot element's selector.
//
// Where each property lands, and why:
//
// - **Inherited text properties** (color, font, text-align — the same closed
//   set `TEXT_PROPERTIES` draws for collapsed controls) sit on the slot element
//   itself and reach a text fill by inheritance. CSS inheritance does not stop
//   at a composed component's boundary, so a COMPONENT fill whose own styles
//   state nothing inherits them too. That residual leak is inherent to the
//   platform: the selector is already as tight as CSS allows (the slot element
//   is the fill's direct parent), and the component's own stylesheet overrides
//   everything it declares. It is documented here rather than pretended away.
//
// - **Box-level text properties** (truncation, vertical alignment, gradient
//   text paint) change the element's box, which would distort a component fill
//   — so they are emitted only when the slot's `anyOf` admits no component.
//
// - **Glyph properties** (fill color, width, height) are non-inherited and must
//   never reach a component fill. They target the masked-span vocabulary the
//   emitters write for a glyph fill — `<span data-element aria-hidden="true">`,
//   a direct child of the slot element (react-from-specs `Spec/elements.ts`
//   `glyphSpanExpr`, both emitters' `Emit/compose.ts` `glyphSpan`; the
//   `aria-hidden` qualifier is what separates a glyph span from a composed text
//   leaf, which carries `data-element` alone). The selector does NOT discriminate
//   a component fill from a glyph fill: a component's own ROOT is emitted with
//   that exact shape — `<span {...rootAttrs} aria-hidden="true" data-element="root">`
//   (react-from-specs `Emit/Elements/glyph.ts`, `rootAttrs.ts`) — so on a mixed
//   slot (`anyOf` naming `$glyph` alongside one or more components) a slotted
//   icon component matches the glyph selector too. These rules are therefore
//   gated on `!admitsComponents`: a mixed slot keeps its correct inlined default
//   from the emitters and loses only the variant deltas a glyph-admitting,
//   component-admitting slot could otherwise carry — the same honest residual
//   the text path above accepts for inherited properties. Reaching a mixed
//   slot's variant deltas without that residual needs a marker the glyph span
//   carries and a component root never does (e.g. a `data-content` attribute) —
//   a possible future enhancement, not made here since it is a cross-package
//   change (the emitters would have to write the marker).
//
// Variant overrides need `!important`: the emitters inline the DEFAULT block's
// resolved contentStyles on the primitive fill (a runtime glyph span always
// carries inline width/height/background-color), and an inline style outranks
// every normal author declaration. An important declaration is the one cascade
// level that beats an inline style, so each variant's delta is emitted
// important — on selectors that, once gated on `!admitsComponents`, can only
// match primitive fills. The default block's own rules stay normal: they agree
// with the inline values by construction.
//
// For the custom element, `::slotted()` reaches only the slotted node itself,
// never its descendants (see the overlap note in ./elementRules.ts) — and a
// slotted raw TEXT node is not an element at all, so only inheritance from the
// slot's parent can format it. Inherited text properties therefore sit on the
// slot element in the shadow tree; the glyph span — slotted as a direct child
// by composed story content — is reached with `::slotted()` at exactly the one
// level it can address. A shadow-rooted host carries no emitted root attributes
// of its own on the slotted node in the light DOM the way the class form's
// composed root does, which narrows the collision there — it does not make the
// host immune, since nothing stops a future emitter shape from slotting a
// component whose own top-level node also carries `aria-hidden`/`data-element`,
// so the same `!admitsComponents` gate applies to both trees.
import { fillDecls } from '../style/fills.js';
import { typographyDecls } from '../style/typography.js';
import { textAlignDecls } from '../style/textAlign.js';
import { truncationDecls } from '../style/truncation.js';
import { sizeDecls } from '../style/size.js';
import type { RootForm } from '../types.js';
import type { PrimitiveContentStyles } from '../analysis/contentStylesRead.js';

/**
 * Whether the slot the element binds may hold a component fill.
 *
 * The slot prop's `anyOf` is the one list of what the slot permits: entries not
 * starting with `$` name components (ADR-102). An element whose binding or prop
 * cannot be read answers true — the conservative reading, since box-level
 * declarations on a slot that might hold a component would distort it.
 */
export function slotAdmitsComponents(
  element: Record<string, unknown>,
  apiProps: Record<string, Record<string, unknown>>,
): boolean {
  const binding = (element.children as Record<string, unknown> | undefined)?.$binding;
  const prop = typeof binding === 'string' ? binding.match(/^#\/props\/(.+)$/)?.[1] : undefined;
  const anyOf = prop ? apiProps[prop]?.anyOf : undefined;
  if (!Array.isArray(anyOf) || anyOf.length === 0) return true;
  return anyOf.some(entry => typeof entry === 'string' && !entry.startsWith('$'));
}

/** The masked glyph span the emitters write for a `$glyph` fill — see the header. */
const GLYPH_FILL = '[data-element][aria-hidden="true"]';

/** The glyph span's selector: a direct child for the class form, `::slotted()` for the host. */
function glyphFillSelector(slotSel: string, rootAs: RootForm): string {
  return rootAs === 'host'
    ? `${slotSel} > slot::slotted(${GLYPH_FILL})`
    : `${slotSel} > ${GLYPH_FILL}`;
}

/**
 * A `$text` entry's declarations, split by where they may land.
 *
 * `onParent` holds what formats text by inheritance from the slot element —
 * safe wherever the fill came from. `onBox` holds what changes the element's
 * box (truncation, the vertical-alignment flex box, gradient text paint) and
 * is applied only to a slot that admits no component. Every value goes through
 * the same modules an element's own `styles` use, so token references resolve
 * identically.
 */
function textContentDecls(
  entry: Record<string, unknown>,
  tokensFormat: string,
  /**
   * True when the slot element's own rule (written earlier, against the same
   * selector) already states a `flex-direction`. The vertical-align box forces
   * one of its own to stack the text; on a HORIZONTAL slot the element's own
   * rule already wrote `flex-direction: row`, and this rule lands later in the
   * sheet — same selector, same specificity, later wins — so emitting the box's
   * `column` there would silently flip the slot's axis. Skip the box rather
   * than fight that rule.
   */
  suppressVerticalAlignBox = false,
): { onParent: string[]; onBox: string[] } {
  const onParent: string[] = [];
  const onBox: string[] = [];
  // Gradient text is a multi-declaration group (background + clip + transparent
  // color) that only works whole — box-level, never split across the buckets.
  const fill = fillDecls(entry, tokensFormat, 'text');
  (fill.length > 1 ? onBox : onParent).push(...fill);
  onParent.push(...typographyDecls(entry, tokensFormat));
  onParent.push(...textAlignDecls(entry));
  if (!suppressVerticalAlignBox) onBox.push(...verticalAlignDecls(entry));
  onBox.push(...truncationDecls(entry));
  return { onParent, onBox };
}

/**
 * `textAlignVertical`, as a flex-column box distributing the text — the same
 * mapping the emitters inline for a primitive fill (react-from-specs
 * `Emit/styles.ts` `verticalAlignment`), so the stylesheet and an inline
 * default cannot disagree.
 */
function verticalAlignDecls(entry: Record<string, unknown>): string[] {
  const V: Record<string, string> = { TOP: 'flex-start', CENTER: 'center', BOTTOM: 'flex-end' };
  const value = entry.textAlignVertical;
  if (typeof value !== 'string' || !V[value]) return [];
  return ['display: flex', 'flex-direction: column', `justify-content: ${V[value]}`];
}

/** A `$glyph` entry's declarations: mask tint and box, through the shared token pipeline. */
function glyphContentDecls(entry: Record<string, unknown>, tokensFormat: string): string[] {
  return [...fillDecls(entry, tokensFormat, 'glyph'), ...sizeDecls(entry, tokensFormat)];
}

/** One rule, or nothing when it would be empty. Important per the header's cascade note. */
function rule(selector: string, decls: string[], important: boolean): string[] {
  if (decls.length === 0) return [];
  return [`${selector} {`, ...decls.map(d => `  ${d}${important ? ' !important' : ''};`), '}', ''];
}

export interface DefaultContentStylesInput {
  /** The slot element's own selector, as the base rule wrote it. */
  slotSel: string;
  /** The default block's resolved contentStyles for this element. */
  resolved: PrimitiveContentStyles;
  tokensFormat: string | undefined;
  /** True when the slot's `anyOf` admits a component fill (or cannot be read). */
  admitsComponents: boolean;
  rootAs: RootForm;
  /** See `textContentDecls`'s `suppressVerticalAlignBox` — same conflict, read off the element's own default rule. */
  ownHasFlexDirection: boolean;
}

/** The default block's primitive-content rules for one slot element. */
export function defaultContentStylesLines(input: DefaultContentStylesInput): string[] {
  const { slotSel, resolved, admitsComponents, rootAs, ownHasFlexDirection } = input;
  const fmt = input.tokensFormat ?? 'TOKEN';
  const lines: string[] = [];

  if (resolved.$text) {
    const { onParent, onBox } = textContentDecls(resolved.$text, fmt, ownHasFlexDirection);
    lines.push(...rule(slotSel, admitsComponents ? onParent : [...onParent, ...onBox], false));
  }
  // Non-inherited: gated on `!admitsComponents` — see the header's BLOCKER note.
  // A mixed slot keeps its correct inlined default and loses only this variant
  // delta, pending the cross-package `data-content` marker noted there.
  if (resolved.$glyph && !admitsComponents) {
    lines.push(...rule(glyphFillSelector(slotSel, rootAs), glyphContentDecls(resolved.$glyph, fmt), false));
  }
  return lines;
}

export interface VariantContentStylesInput {
  /** The slot element's selector under each of the variant's root selectors. */
  slotSelectors: string[];
  /** This variant's own contentStyles overlay for the element. */
  delta: PrimitiveContentStyles;
  /** The default block's entry, which decides whether an inline-formatted span exists. */
  defaultEntry: PrimitiveContentStyles;
  tokensFormat: string | undefined;
  admitsComponents: boolean;
  rootAs: RootForm;
  /** The comment labelling the variant, as the ordinary element rules spell it. */
  label: string;
}

/**
 * One variant's primitive-content rules for one slot element.
 *
 * Text, for a slot that admits no component: when the default block states
 * `$text` formatting, every string fill is already wrapped in an inline-styled
 * span (react-from-specs `primitiveSlotContentExpr`), so the override targets
 * that span — `> span` can only be the primitive fill on a component-less slot
 * — and is important to beat the inline default. Without a default `$text`
 * block no span exists, and the slot element's own rule reaches the raw text by
 * inheritance at normal priority. The custom element formats slotted TEXT nodes
 * by inheritance either way (no inline style intervenes at runtime); its
 * default-content fallback span (`<slot>`'s child) is re-tinted separately.
 *
 * Text, for a mixed slot: only the inherited properties are emitted, on the
 * slot element. A property the default block also states stays pinned at its
 * default on the inline-formatted span — the honest residual, since no selector
 * can single the primitive span out from a component fill there.
 */
export function variantContentStylesLines(input: VariantContentStylesInput): string[] {
  const { slotSelectors, delta, defaultEntry, admitsComponents, rootAs, label } = input;
  const fmt = input.tokensFormat ?? 'TOKEN';
  const lines: string[] = [];
  const push = (ruleLines: string[]): void => {
    if (ruleLines.length === 0) return;
    lines.push(`/* ${label} */`, ...ruleLines);
  };
  const sel = slotSelectors.join(',\n');

  if (delta.$text) {
    const { onParent, onBox } = textContentDecls(delta.$text, fmt);
    if (admitsComponents) {
      push(rule(sel, onParent, false));
    } else {
      const all = [...onParent, ...onBox];
      const defaultHasText = Object.keys(defaultEntry.$text ?? {}).length > 0;
      if (!defaultHasText) {
        push(rule(sel, all, false));
      } else if (rootAs === 'host') {
        push(rule(sel, all, false));
        // The <slot>'s fallback span carries the inline default; while it
        // renders, only an important rule can re-tint it.
        push(rule(slotSelectors.map(s => `${s} > slot > span`).join(',\n'), all, true));
      } else {
        push(rule(slotSelectors.map(s => `${s} > span`).join(',\n'), all, true));
      }
    }
  }

  // Non-inherited: gated on `!admitsComponents` — see the header's BLOCKER note.
  if (delta.$glyph && !admitsComponents) {
    const gsel = slotSelectors.map(s => glyphFillSelector(s, rootAs)).join(',\n');
    push(rule(gsel, glyphContentDecls(delta.$glyph, fmt), true));
  }

  return lines;
}
