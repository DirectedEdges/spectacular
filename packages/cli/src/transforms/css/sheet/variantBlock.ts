// One rule set per variant, in the order the spec lists them (specs#691).
//
// variants.yaml order is intentional: single-prop variants before multi-prop
// compound ones, matching the layering cascade. Nothing here reorders them.
import { styleToCSS } from '../style/styleToCSS.js';
import { layoutToCSS } from '../style/layoutToCSS.js';
import { parseLayout } from '../style/layoutTree.js';
import { childOrder, collectLayoutKeys } from '../analysis/layoutQueries.js';
import { composedSelector, elemSelector, rootSelector } from './selectors.js';
import { expandVariantSelectors } from './variantSelectors.js';
import { backgroundImageDecls, gradientRingRule, inlineBlockIfBoxed, overlapRule } from './elementRules.js';
import { slotAdmitsComponents, variantContentStylesLines } from './contentRules.js';
import { attrNameFor } from './hostAttributes.js';
import type { ImagesCssContext, RootForm } from '../types.js';
import type { SpecAnalysis } from '../analysis/analyzeSpec.js';
import type { TransformerContext } from '../../../transforms/transformer.js';

/**
 * The spec configuration a rule block came from, as a CSS comment body.
 *
 * Blocks sharing a selector are kept apart rather than merged — each is a
 * separate statement about the component, and merging them would lose which
 * statement a declaration belongs to (and move rules relative to each other,
 * where order is what decides which wins). Labelling each one is what makes the
 * separation readable instead of merely repetitive.
 */
/**
 * Member-keyed object values (ADR-111) flattened to dotted keys
 * (`margin.compact`), nulls dropped — the spelling the emitted trees hook their
 * member data attributes under. A `$`-keyed object (`$binding`, `$slotContent`)
 * is a reference, not a member value, and passes through.
 */
export function flattenMemberValues(configuration: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(configuration)) {
    if (
      !key.startsWith('$') && value !== null && typeof value === 'object' && !Array.isArray(value)
      && Object.keys(value).length > 0 && Object.keys(value).every(k => !k.startsWith('$'))
    ) {
      for (const [memberKey, memberValue] of Object.entries(value)) {
        if (memberValue !== null) flat[`${key}.${memberKey}`] = memberValue;
      }
      continue;
    }
    flat[key] = value;
  }
  return flat;
}

function variantLabel(configuration: Record<string, unknown>): string {
  const pairs = Object.entries(configuration)
    .map(([k, v]) => (v === true ? k : v === false ? `not ${k}` : `${k}=${String(v)}`))
    .join(', ');
  return pairs ? `Variant: ${pairs}` : 'Variant';
}

export interface VariantBlockInput {
  componentClass: string;
  rootAs: RootForm;
  tokensFormat: string | undefined;
  elemTypes: Record<string, string>;
  images: ImagesCssContext | undefined;
  context: TransformerContext;
  facts: SpecAnalysis;
  /** api.yaml's props — a slot's `anyOf` decides where its content rules may land. */
  apiProps: Record<string, Record<string, unknown>>;
  displayedInDefault: ReadonlySet<string>;
  /** Props the states convention routes through real CSS selectors. */
  classifiedProps: ReadonlySet<string>;
  /** `prop::value` → concept name. */
  stateLookup: ReadonlyMap<string, string>;
  /** Pairs declassified because a nested role claims the concept. */
  nestedClaimedPairs: ReadonlySet<string>;
  /** A concept's selector, narrowed to this root and target. */
  selectorFor(concept: string): string | undefined;
  /** Reports a classified value no concept names. De-duplication is the caller's. */
  warnUnnamedValue(prop: string, value: string): void;
}

/** True when the variant's child order is the default's exactly reversed. */
function isReversal(variantOrder: string[], defaultOrder: string[]): boolean {
  if (variantOrder.length !== defaultOrder.length) return false;
  const reversed = [...defaultOrder].reverse();
  return variantOrder.every((key, i) => key === reversed[i]);
}

export function variantBlockLines(input: VariantBlockInput): string[] {
  const {
    componentClass, rootAs, tokensFormat, elemTypes, images, context, facts, apiProps,
    displayedInDefault, classifiedProps, stateLookup, nestedClaimedPairs, selectorFor, warnUnnamedValue,
  } = input;
  const rootSel = rootSelector(componentClass, rootAs);
  const { defaultBlock, defaultElements, defaultKeys, structuralKeys, variantList } = facts;

  const lines: string[] = [];

  for (const [variantIndex, variant] of variantList.entries()) {
    // Member-keyed values (ADR-111) flatten to dotted keys so the expansion sees
    // scalars — and the data attribute each member hooks as matches the emitted
    // scaffolds' spelling (`data-margin-compact`).
    const configuration = flattenMemberValues((variant.configuration ?? {}) as Record<string, unknown>);
    if (Object.keys(configuration).length === 0) continue;

    // What this variant's rule is written against. A pure function, so the
    // expansion can be tested directly; the values it could not name come back
    // rather than being reported there, because the resting-value exemption and
    // the once-per-pair de-duplication belong to the caller.
    const { skip, dataAttrs, stateSelSuffixes, unnamed } = expandVariantSelectors({
      configuration,
      classifiedProps,
      stateLookup,
      nestedClaimedPairs,
      selectorFor,
      attrNameFor: prop => attrNameFor(prop.replace('.', '-'), rootAs),
      guardsDisabled: Boolean(context.processingStates?.['disabled']),
    });
    for (const { prop, value } of unnamed) warnUnnamedValue(prop, value);
    if (skip) continue;

    const dataAttrStr = dataAttrs.join('');
    const rootSelectors = stateSelSuffixes.map(s => rootSel(`${dataAttrStr}${s}`));

    const variantElements = (variant.elements ?? {}) as Record<string, Record<string, unknown>>;

    // Structural layout changes: a variant layout that adds an element
    // un-hides it; one that drops a default element hides it.
    const displayDecls = new Map<string, string>();
    if (variant.layout) {
      const variantKeys = new Set<string>();
      collectLayoutKeys(parseLayout(variant.layout), variantKeys);
      for (const key of variantKeys) {
        if (!structuralKeys.has(key)) continue;
        const styles = (defaultElements[key]?.styles ?? {}) as Record<string, unknown>;
        displayDecls.set(key, `display: ${styles.layoutMode ? 'flex' : 'block'}`);
      }
      for (const key of defaultKeys) {
        if (key !== 'root' && !variantKeys.has(key)) displayDecls.set(key, 'display: none');
      }
    }

    // A variant layout that reverses a flex parent's children is a visual swap,
    // not a structural one — emit the reversal here so the scaffold keeps one
    // copy of each child and DOM order (reading and tab order) stays as
    // authored. Partial reorders are not expressible this way and are handled
    // by the emitters relocating the element instead.
    const reverseDecls = new Map<string, string>();
    if (variant.layout) {
      const defOrder = childOrder(parseLayout(defaultBlock?.layout));
      const varOrder = childOrder(parseLayout(variant.layout));
      for (const [parent, vlist] of varOrder) {
        if (parent === null) continue;
        const dlist = defOrder.get(parent);
        if (!dlist || dlist.length < 2) continue;
        if (!isReversal(vlist, dlist)) continue;
        const mode = ((defaultElements[parent]?.styles ?? {}) as Record<string, unknown>).layoutMode;
        if (mode === 'HORIZONTAL') reverseDecls.set(parent, 'flex-direction: row-reverse');
        else if (mode === 'VERTICAL') reverseDecls.set(parent, 'flex-direction: column-reverse');
      }
    }

    const elemKeys = new Set([...Object.keys(variantElements), ...displayDecls.keys(), ...reverseDecls.keys()]);
    for (const elemKey of elemKeys) {
      // A composed instance's delta lands on the component's own root, beside
      // that component's rules, so it needs the same specificity the element's
      // base rule uses. The root's own deltas carry the variant's qualifiers and
      // already outrank a bare class.
      const elemSuffix = elemKey === 'root'
        ? ''
        : ` ${composedSelector(elemSelector(componentClass, elemKey), elemTypes[elemKey])}`;
      const selector = rootSelectors.map(s => `${s}${elemSuffix}`).join(',\n');

      const styles = (variantElements[elemKey]?.styles ?? {}) as Record<string, unknown>;
      // A variant revealing an element the default hides (`visible: true` over
      // a default `visible: false`) must restore the display the base rule
      // suppressed — the delta itself carries no layoutMode, so nothing else
      // re-emits one, and the element stays display: none (an expando's body
      // never opened). The default's own layout says what to restore; absent
      // one, revert-layer rolls the property back to the element's un-hidden
      // default within the cascade.
      const defaultStyles = (defaultElements[elemKey]?.styles ?? {}) as Record<string, unknown>;
      const revealDecls: string[] = [];
      if (styles.visible === true && defaultStyles.visible === false && !('layoutMode' in styles)) {
        const mode = defaultStyles.layoutMode as string | null | undefined;
        if (mode === 'HORIZONTAL') revealDecls.push('display: flex', 'flex-direction: row');
        else if (mode === 'VERTICAL') revealDecls.push('display: flex', 'flex-direction: column');
        else if (mode === 'NONE' || mode === null) revealDecls.push('display: block');
        else revealDecls.push('display: revert-layer');
      }
      const decls = [
        ...revealDecls,
        ...layoutToCSS(styles, tokensFormat, facts.parentLayoutMode(elemKey), false, facts.parentCrossAxisAlignment(elemKey), elemTypes[elemKey] === 'instance'),
        ...styleToCSS(styles, tokensFormat, elemTypes[elemKey], facts.styleOptions(elemKey)),
      ];
      if ('backgroundImage' in styles) decls.push(...backgroundImageDecls(styles.backgroundImage, images));
      // The inline-block floor belongs to the element's default rule. Re-asserting
      // it here attaches a `display` to a rule whose only job is a size change,
      // and that rule outranks the single-attribute rule that hid the element —
      // so an avatar showing an image also showed its initials, which then took
      // the flex space the image needed.
      if (!displayedInDefault.has(elemKey)) inlineBlockIfBoxed(elemTypes[elemKey], decls);
      const display = displayDecls.get(elemKey);
      if (display && !decls.some(d => d.startsWith('display:'))) decls.push(display);
      const reverse = reverseDecls.get(elemKey);
      if (reverse && !decls.some(d => d.startsWith('flex-direction:'))) decls.push(reverse);

      if (decls.length > 0) {
        lines.push(`/* ${variantLabel(configuration)}${elemKey === 'root' ? '' : ` — ${elemKey}`} */`);
        lines.push(`${selector} {`);
        for (const d of decls) lines.push(`  ${d};`);
        lines.push('}');
        lines.push('');
      }
      lines.push(...overlapRule(selector, styles));
      lines.push(...gradientRingRule(
        selector,
        styles,
        tokensFormat,
        ((defaultElements[elemKey]?.styles ?? {}) as Record<string, unknown>).strokeWeight,
      ));

      // The variant's contentStyles overlay — formatting for the slot's
      // primitive content (ADR-102), riding the same selectors the element's
      // own delta uses. Matched by position in variantsYaml.variants — the
      // same array this loop's own `variantList` reads — rather than by the
      // configuration object's identity, which a future re-parse could break
      // silently (emitting zero content rules with no error).
      const contentRead = facts.contentStylesOf(elemKey);
      const contentDelta = contentRead.variants.find(
        v => v.index === variantIndex,
      )?.contentStyles;
      if (contentDelta && Object.keys(contentDelta).length > 0) {
        lines.push(...variantContentStylesLines({
          slotSelectors: rootSelectors.map(s => `${s}${elemSuffix}`),
          delta: contentDelta,
          tokensFormat,
          admitsComponents: slotAdmitsComponents(
            (defaultElements[elemKey] ?? {}) as Record<string, unknown>,
            apiProps,
          ),
          rootAs,
          label: `${variantLabel(configuration)} — ${elemKey} slot content`,
        }));
      }
    }
  }

  return lines;
}
