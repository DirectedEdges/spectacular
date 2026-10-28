// The base rules: what every element looks like before any variant (specs#691).
import { styleToCSS } from '../style/styleToCSS.js';
import { layoutToCSS } from '../style/layoutToCSS.js';
import { coversParent } from '../analysis/layoutQueries.js';
import { composedSelector, elemSelector, rootSelector } from './selectors.js';
import {
  TEXT_PROPERTIES, backgroundImageDecls, gradientRingRule, inlineBlockIfBoxed, isGlyphLike, overlapRule,
  preserveLineBreaks,
} from './elementRules.js';
import { defaultContentStylesLines, slotAdmitsComponents } from './contentRules.js';
import { resolveContentStyles } from '../analysis/contentStylesRead.js';
import type { ImagesCssContext, RootForm } from '../types.js';
import type { SpecAnalysis } from '../analysis/analyzeSpec.js';

export interface DefaultBlockInput {
  componentClass: string;
  rootAs: RootForm;
  tokensFormat: string | undefined;
  elemTypes: Record<string, string>;
  elemRoles: Record<string, string>;
  images: ImagesCssContext | undefined;
  facts: SpecAnalysis;
  /** api.yaml's props, for an element whose content binds to one. */
  apiProps: Record<string, Record<string, unknown>>;
}

export interface DefaultBlockResult {
  lines: string[];
  /**
   * Elements whose default rule already states a `display`.
   *
   * The variant loop needs this: re-asserting the inline-block floor there
   * attaches a `display` to a rule whose only job is a size change, and that
   * rule then outranks the single-attribute rule that hid the element.
   */
  displayedInDefault: Set<string>;
}

export function defaultBlockLines(input: DefaultBlockInput): DefaultBlockResult {
  const { componentClass, rootAs, tokensFormat, elemTypes, elemRoles, images, facts, apiProps } = input;
  const rootSel = rootSelector(componentClass, rootAs);
  const { defaultElements, parentOf, needsRelative, structuralKeys, consumedByCollapse, collapseControl } = facts;

  const lines: string[] = [];
  const displayedInDefault = new Set<string>();
  const foldedText = new Map<'value' | 'placeholder', string[]>();

  for (const [elemKey, elem] of Object.entries(defaultElements)) {
    const selector = elemKey === 'root'
      ? rootSel()
      : composedSelector(elemSelector(componentClass, elemKey), elemTypes[elemKey]);
    const styles = (elem.styles ?? {}) as Record<string, unknown>;
    const decls = [
      ...layoutToCSS(styles, tokensFormat, facts.parentLayoutMode(elemKey), true, facts.parentCrossAxisAlignment(elemKey), elemTypes[elemKey] === 'instance'),
      ...styleToCSS(styles, tokensFormat, elemTypes[elemKey], { ...facts.styleOptions(elemKey), isDefaultBlock: true }),
    ];
    if ('backgroundImage' in styles) decls.push(...backgroundImageDecls(styles.backgroundImage, images));

    // Ellipses are circular unless the spec sets an explicit radius.
    if (elemTypes[elemKey] === 'ellipse' && !decls.some(d => d.startsWith('border-radius:'))) {
      decls.push('border-radius: 50%');
    }
    // Glyphs/vectors paint their background-color through a mask image the
    // scaffold provides via --glyph (an unresolvable mask renders nothing).
    // Spans need block display; without a fill they tint with the inherited
    // text color.
    //
    // Element type decides this, and nothing else. An `instance` delegates its
    // appearance to the component it instantiates — that component masks its own
    // glyph in its own stylesheet — so a wrapper holding an instance draws
    // nothing and must not be given a mask. An earlier version also treated an
    // instance carrying a `name` propConfiguration as glyph-like, which inferred
    // meaning from a prop name and painted a solid `currentColor` box wherever
    // composition resolved the instance instead.
    inlineBlockIfBoxed(elemTypes[elemKey], decls);
    preserveLineBreaks(elem as Record<string, unknown>, apiProps, decls);
    if (decls.some(d => d.startsWith('display:'))) displayedInDefault.add(elemKey);
    if (isGlyphLike(elemTypes[elemKey])) {
      decls.push('mask: var(--glyph, none) no-repeat center / contain');
      decls.push('-webkit-mask: var(--glyph, none) no-repeat center / contain');
      if (!decls.some(d => d.startsWith('display:'))) decls.push('display: block');
      if (!decls.some(d => d.startsWith('background'))) decls.push('background-color: currentColor');
    }
    // A full-bleed absolute child visually IS its rounded parent's surface —
    // without inheriting the radius, its background paints square corners.
    if (
      !decls.some(d => d.startsWith('border-radius:')) &&
      coversParent(styles, (defaultElements[parentOf.get(elemKey) ?? '']?.styles ?? {}) as Record<string, unknown>) &&
      'cornerRadius' in ((defaultElements[parentOf.get(elemKey) ?? '']?.styles ?? {}) as Record<string, unknown>)
    ) {
      decls.push('border-radius: inherit');
    }
    if (needsRelative.has(elemKey) && !decls.some(d => d.startsWith('position:'))) {
      decls.push('position: relative');
    }
    if (structuralKeys.has(elemKey)) {
      decls.push('display: none');
    }

    const consumed = consumedByCollapse.get(elemKey);
    if (consumed) {
      // Keep the text styling for the control; drop the rest with the element.
      foldedText.set(consumed, decls.filter(d => TEXT_PROPERTIES.has(d.split(':')[0]!.trim())));
      continue;
    }

    if (decls.length > 0) {
      lines.push(`${selector} {`);
      for (const d of decls) lines.push(`  ${d};`);
      lines.push('}');
      lines.push('');
    }
    // No `instanceFitRule` here any more. It pushed the instance node's size onto
    // a child of the wrapper that carried this class; the emitters now put the
    // class on the composed component's own root, so the size is already on the
    // element that needs it and `composedSelector` is what makes it win.
    lines.push(...overlapRule(selector, styles));
    lines.push(...gradientRingRule(selector, styles, tokensFormat));

    // An unfilled slot is still a flex item, so the parent's gap paints as
    // spacing around nothing. `:empty` covers the react scaffold, which renders
    // the slot's children directly; the webcomponents scaffold always holds a
    // `<slot>` element and so is never `:empty`, and sets data-empty instead.
    if (elemTypes[elemKey] === 'slot') {
      lines.push(`${selector}:empty,`);
      lines.push(`${selector}[data-empty] {`);
      lines.push('  display: none;');
      lines.push('}');
      lines.push('');
    }

    // Formatting for the slot's primitive content (ADR-102) — what the removed
    // anatomy children used to carry. See ./contentRules.ts for where each
    // property lands and the component-fill residuals.
    const content = resolveContentStyles(facts.contentStylesOf(elemKey), {});
    if (Object.keys(content).length > 0) {
      lines.push(...defaultContentStylesLines({
        slotSel: selector,
        resolved: content,
        tokensFormat,
        admitsComponents: slotAdmitsComponents(elem as Record<string, unknown>, apiProps),
        rootAs,
        // The element's own rule above already wrote its flex-direction (if
        // any) against this same selector — the vertical-align box must not
        // restate a conflicting one later in the sheet (see contentRules.ts).
        ownHasFlexDirection: decls.some(d => d.startsWith('flex-direction:')),
      }));
    }
  }

  if (collapseControl) {
    const controlSel =
      collapseControl === 'root' ? rootSel() : elemSelector(componentClass, collapseControl);
    const valueText = foldedText.get('value') ?? [];
    if (valueText.length) {
      lines.push(
        `/* ${elemRoles[collapseControl]} role: text styling from the consumed value element. */`,
        `${controlSel} {`,
        ...valueText.map(d => `  ${d};`),
        '}',
        '',
      );
    }
    const placeholderText = foldedText.get('placeholder') ?? [];
    if (placeholderText.length) {
      lines.push(
        `/* ${elemRoles[collapseControl]} role: text styling from the consumed placeholder element. */`,
        `${controlSel}::placeholder {`,
        ...placeholderText.map(d => `  ${d};`),
        '}',
        '',
      );
    }
  }

  return { lines, displayedInDefault };
}
