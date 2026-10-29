// Rules that format a slot's PRIMITIVE content — the text or glyph fill its
// `contentStyles` describes (ADR-102) — never a component fill.
//
// Under `slotPrimitives` the primitive children leave anatomy, so no
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
//   — so they are emitted only for a slot the spec identified no component
//   content for (`slotAdmitsComponents` below, which reads the `anyOf` when the
//   slot declares one and the element's `contentStyles` when it does not).
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
// **Nothing here is `!important`.** `contentStyles` formats a slot's UNSTYLED
// primitive content; it is not a way to trump styling a consumer supplied, and
// `!important` is exactly that. These rules are ordinary author declarations,
// so a consumer's own stylesheet wins by ordinary cascade order and a variant's
// delta wins over the default block by coming later in the sheet.
//
// That was only possible once the emitters stopped inlining this formatting.
// An inline style outranks every normal author declaration, so while the
// scaffolds inlined the default block's resolved contentStyles on the primitive
// fill, a variant delta could reach it only by being important — and being
// important it also outranked the consumer. The emitters now inline it for ONE
// case: a slot whose `anyOf` admits a component, where (as above) the rules
// that could reach a primitive fill are withheld anyway. Everywhere else the
// stylesheet is the only thing formatting the fill, which is why no selector
// here targets an inline-styled wrapper span any more — there is none to beat.
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
import { contentStylesIn, type PrimitiveContentStyles } from '../analysis/contentStylesRead.js';

/**
 * Whether the slot the element binds may hold a fill a box-level rule must not
 * distort — a COMPONENT fill, as the spec IDENTIFIES one.
 *
 * A local mirror of the shared core's `slotAdmitsComponents`
 * (specs-transforms `packages/from-specs/src/slotContent.ts`), which both
 * emitters read to decide whether to inline a slot's `contentStyles`. That
 * package is private and bundled into each emitter at build time — the CLI's own
 * bundle marks all packages external, so it cannot consume the module directly.
 * Keep the two in step when either changes: the core answers from a `SlotInfo`
 * (`components` present when the prop declared an `anyOf`, `primitives` unioned
 * from the markers in it and the kinds in `contentStyles`); this reads the same
 * two records off the raw spec, the `anyOf` from the api props and the primitive
 * kinds from the element's own `contentStyles` (../analysis/contentStylesRead.ts
 * `contentStylesIn`, the CLI's single marker list).
 *
 * With an `anyOf` present it is the one list of what the slot permits, and
 * entries not starting with `$` name components (ADR-102): named components yes,
 * a marker-only or empty list no.
 *
 * With no `anyOf` the slot states no constraint, so a consumer may hand it
 * anything — but that is not the question here. The question is whether the spec
 * identified any component content for a box-level rule to reach. A slot with no
 * `anyOf` whose element carries a `contentStyles` block got it from the
 * generator looking at the slot's authored default content, finding primitives,
 * and identifying no component — since `anyOf` is a constraint, a marker-only
 * list would wrongly narrow a slot the design never narrowed, so none is
 * written and `contentStyles` is the only record left. Nothing is there to
 * distort, so the full formatting treatment applies. A slot with neither has had
 * nothing identified either way and keeps the open answer it has always had:
 * true, the conservative reading, which is also the answer for an element whose
 * binding or prop cannot be read.
 */
export function slotAdmitsComponents(
  element: Record<string, unknown>,
  apiProps: Record<string, Record<string, unknown>>,
): boolean {
  const binding = (element.children as Record<string, unknown> | undefined)?.$binding;
  const prop = typeof binding === 'string' ? binding.match(/^#\/props\/(.+)$/)?.[1] : undefined;
  const anyOf = prop ? apiProps[prop]?.anyOf : undefined;
  if (Array.isArray(anyOf)) {
    return anyOf.some(entry => typeof entry === 'string' && !entry.startsWith('$'));
  }
  return Object.keys(contentStylesIn(element)).length === 0;
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

/** One rule, or nothing when it would be empty. Always ordinary priority — see the header. */
function rule(selector: string, decls: string[]): string[] {
  if (decls.length === 0) return [];
  return [`${selector} {`, ...decls.map(d => `  ${d};`), '}', ''];
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
    lines.push(...rule(slotSel, admitsComponents ? onParent : [...onParent, ...onBox]));
  }
  // Non-inherited: gated on `!admitsComponents` — see the header's BLOCKER note.
  // A mixed slot keeps its correct inlined default and loses only this variant
  // delta, pending the cross-package `data-content` marker noted there.
  if (resolved.$glyph && !admitsComponents) {
    lines.push(...rule(glyphFillSelector(slotSel, rootAs), glyphContentDecls(resolved.$glyph, fmt)));
  }
  return lines;
}

export interface VariantContentStylesInput {
  /** The slot element's selector under each of the variant's root selectors. */
  slotSelectors: string[];
  /** This variant's own contentStyles overlay for the element. */
  delta: PrimitiveContentStyles;
  tokensFormat: string | undefined;
  admitsComponents: boolean;
  rootAs: RootForm;
  /** The comment labelling the variant, as the ordinary element rules spell it. */
  label: string;
}

/**
 * One variant's primitive-content rules for one slot element.
 *
 * The same two selectors the default block writes, at the same ordinary
 * priority: the slot element for text, the glyph span for a glyph. Coming later
 * in the sheet under a more specific variant selector is the whole mechanism —
 * no inline default stands in the way any more (see the header), so nothing here
 * needs to reach past one, and a consumer's own rules still win over both.
 *
 * Text, for a mixed slot: only the inherited properties are emitted, on the slot
 * element. The box-level half is withheld because it would distort a component
 * fill, and the emitter's inline style carries the DEFAULT block's box values
 * there — so a mixed slot's box-level variant delta is the honest residual, the
 * same one the default block's glyph rules accept. Reaching it needs a marker
 * the primitive fill carries and a component root does not, which is a
 * cross-package change (see the header's note).
 */
export function variantContentStylesLines(input: VariantContentStylesInput): string[] {
  const { slotSelectors, delta, admitsComponents, rootAs, label } = input;
  const fmt = input.tokensFormat ?? 'TOKEN';
  const lines: string[] = [];
  const push = (ruleLines: string[]): void => {
    if (ruleLines.length === 0) return;
    lines.push(`/* ${label} */`, ...ruleLines);
  };
  const sel = slotSelectors.join(',\n');

  if (delta.$text) {
    const { onParent, onBox } = textContentDecls(delta.$text, fmt);
    push(rule(sel, admitsComponents ? onParent : [...onParent, ...onBox]));
  }

  // Non-inherited: gated on `!admitsComponents` — see the header's BLOCKER note.
  if (delta.$glyph && !admitsComponents) {
    const gsel = slotSelectors.map(s => glyphFillSelector(s, rootAs)).join(',\n');
    push(rule(gsel, glyphContentDecls(delta.$glyph, fmt)));
  }

  return lines;
}
