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
//   text paint) change the element's box, which would distort a component fill.
//   For a slot the spec identified no component content for
//   (`slotAdmitsComponents` below) they sit on the slot element itself, as they
//   always have. For a mixed slot they target the text fill's own
//   `data-content="text"` marker — a span the emitters stamp on a primitive
//   text fill and a composed component's root never carries — so the rules
//   reach the primitive fill alone.
//
// - **Glyph properties** (fill color, width, height) are non-inherited and must
//   never reach a component fill. They target `data-content="glyph"` — the
//   marker both emitters stamp on every masked glyph span (`glyphSpan` in each
//   `Emit/compose.ts`, react's `Spec/elements.ts` `glyphSpanExpr`) and on
//   nothing else; a composed component's root (`data-element="root"`,
//   `aria-hidden`) never matches. Ungated: a mixed slot's glyph deltas emit
//   exactly as a primitive-only slot's do (system-owner ruling, Badge round —
//   the emitters stopped inlining ALL contentStyles formatting the same day;
//   see `governedContentKeys` in the shared core).
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
// important it also outranked the consumer. The emitters inline NOTHING the
// sheet governs any more — not even for a component-admitting slot, and not
// even a fallback for a governed key (a fallback is still an inline
// declaration). The stylesheet is the only thing formatting a primitive fill.
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
import {
  primitiveKindsInContentStyles,
  type PrimitiveContentStyles,
  type SlotContentStyles,
} from '../analysis/contentStylesRead.js';

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
 * kinds from the element's `contentStyles` read (../analysis/contentStylesRead.ts
 * `primitiveKindsInContentStyles`, over the CLI's single marker list).
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
 *
 * `content` is the WHOLE read — the default block plus every variant overlay —
 * never the block resolved for one configuration, because the question is about
 * the SLOT and not about a configuration. A spec may state a slot's formatting
 * only under a variant (an emphasized-only label colour on a slot whose default
 * needs no declaration), and reading the default block alone would answer
 * "admits components" for such a slot and so withhold the very rules the overlay
 * exists to emit. The core unions the two records for the same reason.
 */
export function slotAdmitsComponents(
  element: Record<string, unknown>,
  apiProps: Record<string, Record<string, unknown>>,
  content: SlotContentStyles,
): boolean {
  const binding = (element.children as Record<string, unknown> | undefined)?.$binding;
  const prop = typeof binding === 'string' ? binding.match(/^#\/props\/(.+)$/)?.[1] : undefined;
  const anyOf = prop ? apiProps[prop]?.anyOf : undefined;
  if (Array.isArray(anyOf)) {
    return anyOf.some(entry => typeof entry === 'string' && !entry.startsWith('$'));
  }
  return primitiveKindsInContentStyles(content).length === 0;
}

/** The marker both emitters stamp on a masked glyph fill — see the header. */
const GLYPH_FILL = '[data-content="glyph"]';
/** The marker both emitters stamp on a primitive text fill in a mixed slot. */
const TEXT_FILL = '[data-content="text"]';

/** A fill's selector: a direct child for the class form, `::slotted()` for the host. */
function fillSelector(slotSel: string, rootAs: RootForm, marker: string): string {
  return rootAs === 'host'
    ? `${slotSel} > slot::slotted(${marker})`
    : `${slotSel} > ${marker}`;
}

function glyphFillSelector(slotSel: string, rootAs: RootForm): string {
  return fillSelector(slotSel, rootAs, GLYPH_FILL);
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
    // Inherited properties ride the slot element either way. Box-level ones sit
    // there too for a primitive-only slot (as always); a mixed slot's land on
    // the text fill's own marker, where no component fill can match.
    lines.push(...rule(slotSel, admitsComponents ? onParent : [...onParent, ...onBox]));
    if (admitsComponents) {
      lines.push(...rule(fillSelector(slotSel, rootAs, TEXT_FILL), onBox));
    }
  }
  if (resolved.$glyph) {
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
 * Text, for a mixed slot: inherited properties on the slot element, box-level
 * ones against the text fill's `data-content="text"` marker — a component fill
 * matches neither as a box target, so nothing distorts it.
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
    if (admitsComponents) {
      const tsel = slotSelectors.map(s => fillSelector(s, rootAs, TEXT_FILL)).join(',\n');
      push(rule(tsel, onBox));
    }
  }

  if (delta.$glyph) {
    const gsel = slotSelectors.map(s => glyphFillSelector(s, rootAs)).join(',\n');
    push(rule(gsel, glyphContentDecls(delta.$glyph, fmt)));
  }

  return lines;
}
