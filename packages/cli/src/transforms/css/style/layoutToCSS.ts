// Maps the layout group of spec style keys to CSS flex declarations.
// Each key is emitted when present — variant layering mirrors CSS cascading,
// so if a key appears in a variant it means it changed and should be emitted.

import { isTokenRef, resolveTokenVar } from '../values/tokens.js';
import { dimensionValue } from '../values/dimensions.js';

const MAIN_AXIS_MAP: Record<string, string> = {
  START: 'flex-start',
  END: 'flex-end',
  CENTER: 'center',
  SPACE_BETWEEN: 'space-between',
};

const CROSS_AXIS_MAP: Record<string, string> = {
  START: 'flex-start',
  END: 'flex-end',
  CENTER: 'center',
  STRETCH: 'stretch',
  BASELINE: 'baseline',
};

const WRAP_ALIGN_MAP: Record<string, string> = {
  START: 'flex-start',
  SPACE_BETWEEN: 'space-between',
};

export function layoutToCSS(
  styles: Record<string, unknown>,
  tokensFormat = 'TOKEN',
  parentLayoutMode?: string | null,
  isDefaultBlock = false,
  parentCrossAxisAlignment?: string | null,
  /** True for a composed instance, which brings sizing of its own to override. */
  isInstance = false,
): string[] {
  const decls: string[] = [];

  if ('layoutMode' in styles) {
    const layoutMode = styles.layoutMode as string | null;
    // Suppress display when visible: false is present — styleToCSS will emit
    // display: none and a preceding display: flex in the same rule is dead code.
    const hiddenByVisible = styles.visible === false;
    if (!hiddenByVisible) {
      if (layoutMode === 'HORIZONTAL') {
        decls.push('display: flex');
        decls.push('flex-direction: row');
      } else if (layoutMode === 'VERTICAL') {
        decls.push('display: flex');
        decls.push('flex-direction: column');
      } else if (layoutMode === 'NONE' || layoutMode === null) {
        decls.push('display: block');
      }
    }
  }

  if ('mainAxisAlignment' in styles) {
    const v = styles.mainAxisAlignment as string | null;
    if (v && MAIN_AXIS_MAP[v]) decls.push(`justify-content: ${MAIN_AXIS_MAP[v]}`);
  }

  if ('crossAxisAlignment' in styles) {
    const v = styles.crossAxisAlignment as string | null;
    if (v && CROSS_AXIS_MAP[v]) decls.push(`align-items: ${CROSS_AXIS_MAP[v]}`);
  }

  if ('wrap' in styles) {
    decls.push(styles.wrap === true ? 'flex-wrap: wrap' : 'flex-wrap: nowrap');
  }

  if ('wrapAlignment' in styles) {
    const v = styles.wrapAlignment as string | null;
    if (v && WRAP_ALIGN_MAP[v]) decls.push(`align-content: ${WRAP_ALIGN_MAP[v]}`);
  }

  if ('itemSpacing' in styles && styles.itemSpacing !== undefined && styles.itemSpacing !== null) {
    const v = styles.itemSpacing;
    if (typeof v === 'number') {
      // gap does not accept negative values — negative itemSpacing means the
      // children OVERLAP, which CSS expresses as a negative margin on each
      // child after the first. Css.ts emits that rule; here we only skip the
      // gap declaration. (Skipping must not return: the rest of this function
      // still owns FILL translation and the other layout declarations.)
      if (v >= 0) decls.push(`gap: ${v === 0 ? '0' : `${v}px`}`);
    } else if (isTokenRef(v) || (typeof v === 'object' && v !== null && '$cssVar' in (v as object))) {
      const r = resolveTokenVar(v, tokensFormat);
      if (r) decls.push(`gap: ${r}`);
    } else if (typeof v === 'object') {
      const is = v as Record<string, unknown>;
      const h = dimensionValue(is.horizontal, tokensFormat);
      const g = dimensionValue(is.vertical, tokensFormat);
      if (h && g) decls.push(`gap: ${g} ${h}`);
      else if (h) decls.push(`column-gap: ${h}`);
      else if (g) decls.push(`row-gap: ${g}`);
    }
  }

  // FILL translation depends on the parent's flex direction: fill along the
  // parent's main axis grows; fill across it is a plain 100%.
  //
  // Cross-axis FILL is NOT `align-self: stretch`. Stretch means "ignore the
  // parent's alignment, start at the edge and fill", so the moment a min/max
  // constraint stops the child actually filling, the leftover space all lands
  // on one side and the parent's alignment has already been discarded — a
  // dialog's max-width'd body sat against its padding edge where the design
  // centres it. The two are identical while the child does fill, which is most
  // of the time and why this went unseen. `width: 100%` stays right when it
  // does not: a capped child centres under CENTER and sits at the end under END.
  //
  // This mapping is duplicated in the React and Web Components emitters
  // (`Emit/styles.ts` in each, for composed content's inline styles). The three
  // copies must move together.
  // A flex child already behaves two of these four ways without being told, and
  // saying so again is noise that buries the declarations that carry information.
  //
  // - HUG on the parent's MAIN axis: a flex item does not grow, so its main size is
  //   its content size. `fit-content` restates the default.
  // - FILL on the parent's CROSS axis: the default `align-self: stretch` already
  //   fills it — but only while the parent's cross alignment is stretch. Under
  //   CENTER or END the child does not stretch, and `100%` is then the only thing
  //   making it fill, so it has to be said.
  //
  // The other two carry information either way: main-axis FILL is `flex: 1 0 0`,
  // and cross-axis HUG is what stops a child stretching to its tallest sibling.
  // Never for a composed instance. The suppression assumes the element has nothing
  // of its own to override, which is true of a plain box and false of a component:
  // `align-self: stretch` loses to the `width: 320px` that component's own
  // stylesheet puts on its root, so a card told to FILL came out 320 instead of
  // filling. The declaration is what overrides it, and it has to be said.
  const crossStretches =
    !isInstance && (parentCrossAxisAlignment == null || parentCrossAxisAlignment === 'STRETCH');
  // Main-axis HUG is only a no-op while content floors the item. A flex item whose
  // `overflow` is not `visible` has an automatic minimum size of zero instead, so
  // `per night` — clipped to one line — came out 0px wide without it.
  // Nor on a composed instance, for the same reason: the component's own root need
  // not be content-sized, and suppressing `fit-content` let a promoted EgdsText fill
  // its row, leaving the sibling that was meant to fill it 0px wide.
  const mainHugs =
    !isInstance && styles.clipsContent !== true && styles.maxLines === undefined;
  const mainIsHorizontal = parentLayoutMode === 'HORIZONTAL';
  const mainIsVertical = parentLayoutMode === 'VERTICAL';

  if ('layoutSizingHorizontal' in styles) {
    const v = styles.layoutSizingHorizontal as string | undefined;
    if (v === 'HUG') {
      if (!(mainIsHorizontal && mainHugs)) decls.push('width: fit-content');
    } else if (v === 'FILL') {
      if (mainIsHorizontal) decls.push('flex: 1 0 0');
      else if (!(mainIsVertical && crossStretches)) decls.push('width: 100%');
    }
  }

  if ('layoutSizingVertical' in styles) {
    const v = styles.layoutSizingVertical as string | undefined;
    if (v === 'HUG') {
      if (!(mainIsVertical && mainHugs)) decls.push('height: fit-content');
    } else if (v === 'FILL') {
      if (mainIsVertical) decls.push('flex: 1 0 0');
      else if (!(mainIsHorizontal && crossStretches)) decls.push('height: 100%');
    }
  }

  // Only FILL asks for the parent's free space. A spec that declares HUG, or that
  // declares a dimension and no sizing at all, has stated the child's size — and a
  // stated size is not a starting point to negotiate down from. CSS disagrees by
  // default: every flex item shrinks. Four cards each declaring `width: 320` came
  // out 69px in a row the spec sizes at 325.
  //
  // `flex: 1 0 0` above already pins shrink for main-axis FILL, so only the other
  // two need saying. In a variant delta the declaration is emitted only when the
  // delta itself touches main-axis sizing: a rule whose job is a colour change must
  // not restate layout, and the default rule has already said this.
  if (parentLayoutMode === 'HORIZONTAL' || parentLayoutMode === 'VERTICAL') {
    const horizontal = parentLayoutMode === 'HORIZONTAL';
    const axisKey = horizontal ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
    const dimensionKey = horizontal ? 'width' : 'height';
    const stated = isDefaultBlock || axisKey in styles || dimensionKey in styles;
    if (stated && styles[axisKey] !== 'FILL') decls.push('flex-shrink: 0');
  }

  return decls;
}
