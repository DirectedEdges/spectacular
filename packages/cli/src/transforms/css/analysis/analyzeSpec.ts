// Reading a whole spec once, and answering the questions both emission passes
// ask of it (specs#691).
//
// Several answers depend on *every* layout in the spec, not just the one being
// emitted: which elements only a variant introduces, and which need
// `position: relative` so stacking follows layout order. Neither can be known
// from the default layout alone. Working them out here once is what lets the
// default block and the variant loop be separate functions at all.
import { impliesAbsolute } from '../style/styleToCSS.js';
import { isGradient, isGradientToken } from '../values/gradients.js';
import { NO_SLOT_DIRECTION, type SlotDirection, type SlotDirectionResolver } from './slotDirection.js';
import { parseLayout } from '../style/layoutTree.js';
import { collectLayoutKeys, collectParents, collectStackingFixes } from './layoutQueries.js';
import { COLLAPSING_ROLES } from '../../states.js';

export interface SpecAnalysis {
  defaultBlock: Record<string, unknown> | undefined;
  defaultElements: Record<string, Record<string, unknown>>;
  variantList: Array<Record<string, unknown>>;
  /** Element keys present in the default layout. */
  defaultKeys: Set<string>;
  /** Keys a variant layout adds that the default has not — hidden at base. */
  structuralKeys: Set<string>;
  /** Keys needing `position: relative` so stacking follows layout order. */
  needsRelative: Set<string>;
  /** Element key → parent key, from the default layout tree. */
  parentOf: Map<string, string>;
  /** Keys whose strokes are a gradient in any layer. */
  gradientStrokeKeys: Set<string>;
  /** The parent's flex direction, for FILL sizing translation. */
  parentLayoutMode(elemKey: string): string | null;
  /** The parent's cross-axis alignment, which decides whether a flex child stretches. */
  parentCrossAxisAlignment(elemKey: string): string | null;
  /** Per-element flags `styleToCSS` needs. */
  styleOptions(elemKey: string): { inferAbsolute: boolean; resetBorderImage: boolean; gradientStroke: boolean };
  /**
   * The one collapsing control, where the component declares exactly one.
   *
   * More than one and the pairing is ambiguous: nothing is folded and nothing
   * suppressed, matching how part ownership resolves for a value-bearing concept.
   */
  collapseControl: string | undefined;
  /** Elements a collapsing role consumes into the emitted control's attributes. */
  consumedByCollapse: Map<string, 'value' | 'placeholder'>;
}

export function analyzeSpec(
  variantsYaml: Record<string, unknown>,
  elemRoles: Record<string, string>,
  /** How a composed instance lays its default-slot content out. */
  slotDirection: SlotDirectionResolver = NO_SLOT_DIRECTION,
): SpecAnalysis {
  const defaultBlock = variantsYaml.default as Record<string, unknown> | undefined;
  const defaultElements = (defaultBlock?.elements ?? {}) as Record<string, Record<string, unknown>>;
  const variantList = (variantsYaml.variants ?? []) as Array<Record<string, unknown>>;

  // Elements absent from the default layout but added by variant layouts are
  // hidden at base and un-hidden under each including variant's selector.
  const defaultKeys = new Set<string>();
  collectLayoutKeys(parseLayout(defaultBlock?.layout), defaultKeys);
  const structuralKeys = new Set<string>();
  // Parents of absolutely-positioned elements must establish a containing
  // block, or inset: 0 resolves against the viewport. Their non-absolute
  // siblings must also be positioned: layout order is Figma children order
  // (first = back-most, last on top), and only positioned siblings paint in
  // DOM order — an absolute element would otherwise jump above static ones.
  const needsRelative = new Set<string>();
  const parentOf = new Map<string, string>();
  {
    const layouts = [parseLayout(defaultBlock?.layout), ...variantList.map(v => parseLayout(v.layout))];
    for (const layout of layouts) {
      collectStackingFixes(layout, defaultElements, needsRelative);
      collectParents(layout, parentOf);
      if (layout !== layouts[0]) {
        const keys = new Set<string>();
        collectLayoutKeys(layout, keys);
        for (const k of keys) if (!defaultKeys.has(k)) structuralKeys.add(k);
      }
    }
  }

  /**
   * How the element's parent lays out, from the three places that can say so.
   *
   * The parent's own styles answer it outright. A promoted container states its
   * direction as a prop instead, with the style the promotion read moved to the
   * provenance record (ADR-084) so the reading reverses — treating such a parent as
   * unlaid-out silently drops every main-axis declaration its children need. And a
   * parent that is a composed instance keeps its direction in its own spec, where
   * the slot element declares it (see ./slotDirection.ts).
   */
  const parentAxes = (elemKey: string): SlotDirection => {
    const parent = parentOf.get(elemKey);
    if (!parent) return {};
    const element = (defaultElements[parent] ?? {}) as Record<string, unknown>;
    const styles = (element.styles ?? {}) as Record<string, unknown>;
    const consumed = ((element.$extensions as Record<string, Record<string, unknown>> | undefined)
      ?.['com.figma']?.styles ?? {}) as Record<string, unknown>;
    const own = (key: 'layoutMode' | 'crossAxisAlignment'): string | undefined => {
      if (typeof styles[key] === 'string') return styles[key] as string;
      return typeof consumed[key] === 'string' ? (consumed[key] as string) : undefined;
    };
    const layoutMode = own('layoutMode');
    if (layoutMode) return { layoutMode, crossAxisAlignment: own('crossAxisAlignment') };

    const instanceOf = element.instanceOf;
    if (typeof instanceOf !== 'string') return {};
    return (
      slotDirection(instanceOf, (element.propConfigurations ?? {}) as Record<string, unknown>) ?? {}
    );
  };
  const parentLayoutMode = (elemKey: string): string | null => parentAxes(elemKey).layoutMode ?? null;
  const parentCrossAxisAlignment = (elemKey: string): string | null =>
    parentAxes(elemKey).crossAxisAlignment ?? null;
  const parentIsAutoLayout = (elemKey: string): boolean => {
    const mode = parentLayoutMode(elemKey);
    return mode === 'HORIZONTAL' || mode === 'VERTICAL';
  };
  // Coordinates imply absolute placement per impliesAbsolute; roots never infer.
  const inferAbsolute = (elemKey: string): boolean =>
    parentOf.has(elemKey) &&
    impliesAbsolute(
      (defaultElements[elemKey]?.styles ?? {}) as Record<string, unknown>,
      parentIsAutoLayout(elemKey)
    );

  // Elements whose strokes are a gradient in any layer. Two things depend on
  // knowing this per element rather than per declaration set:
  //
  // - A solid stroke override has to reset what the gradient painted, or the
  //   earlier layer outranks the later one (see styleToCSS).
  // - A gradient ring takes its thickness from a transparent border, so a
  //   variant restating only `strokeWeight` must put that width on the border
  //   rather than on the outline a solid stroke would use. The variant does not
  //   restate `strokes`, so it cannot tell on its own.
  const gradientStrokeKeys = new Set<string>();
  for (const elements of [defaultElements, ...variantList.map(v => (v.elements ?? {}) as Record<string, Record<string, unknown>>)]) {
    for (const [k, elem] of Object.entries(elements)) {
      const strokes = ((elem.styles ?? {}) as Record<string, unknown>).strokes;
      if (isGradient(strokes) || isGradientToken(strokes)) gradientStrokeKeys.add(k);
    }
  }
  // The ring is an absolutely positioned ::before, so its host has to be the
  // containing block or it would size itself against some ancestor instead.
  for (const k of gradientStrokeKeys) needsRelative.add(k);

  const styleOptions = (elemKey: string) => ({
    inferAbsolute: inferAbsolute(elemKey),
    resetBorderImage: gradientStrokeKeys.has(elemKey),
    gradientStroke: gradientStrokeKeys.has(elemKey),
  });

  // A collapsing role consumes its `value` and `placeholder` parts into the
  // emitted control's attributes, so those elements never reach the page and
  // every declaration written for them is dead. Their TEXT styling is not dead
  // though — it is what the field is supposed to look like — so it moves onto
  // the control, and the placeholder's onto `::placeholder`.
  const collapsingKeys = Object.entries(elemRoles)
    .filter(([, role]) => COLLAPSING_ROLES.has(role))
    .map(([key]) => key);
  const collapseControl = collapsingKeys.length === 1 ? collapsingKeys[0]! : undefined;
  const consumedByCollapse = new Map<string, 'value' | 'placeholder'>();
  if (collapseControl) {
    for (const [elemKey, role] of Object.entries(elemRoles)) {
      if (role === 'value' || role === 'placeholder') consumedByCollapse.set(elemKey, role);
    }
  }

  return {
    defaultBlock,
    defaultElements,
    variantList,
    defaultKeys,
    structuralKeys,
    needsRelative,
    parentOf,
    gradientStrokeKeys,
    parentLayoutMode,
    parentCrossAxisAlignment,
    styleOptions,
    collapseControl,
    consumedByCollapse,
  };
}
