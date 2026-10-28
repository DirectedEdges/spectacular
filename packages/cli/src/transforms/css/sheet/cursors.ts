// The cursors a component needs, which Figma has no concept of (specs#691).
import { normalizeEnumValue } from '../values/enumCase.js';
import { attrNameFor } from './hostAttributes.js';
import { declaresState } from '../analysis/readApi.js';
import { disabledSelectorFor, rootSelector } from './selectors.js';
import type { RootForm } from '../types.js';
import type { TransformerContext } from '../../../transforms/transformer.js';

export interface CursorInput {
  componentClass: string;
  rootAs: RootForm;
  context: TransformerContext;
  apiProps: Record<string, Record<string, unknown>>;
  elemRoles: Record<string, string>;
  /** Concepts a role on a nested element announces instead of the root. */
  nestedClaimed: ReadonlySet<string>;
}

/**
 * The press and disabled cursors, read from the declared state classification.
 *
 * A component whose `states` config names a press concept, and which declares
 * the prop that concept is keyed to, is a press target.
 *
 * An earlier version regexed the emitted stylesheet's own text for `:active` and
 * `[aria-pressed]`. That made the cursor depend on whether a pressed state
 * happened to produce any *styling* — a button that looks identical pressed and
 * unpressed silently lost its pointer — and it inferred behavior from output
 * rather than reading what the library declared.
 */
export function cursorLines(input: CursorInput): string[] {
  const { componentClass, rootAs, context, apiProps, elemRoles, nestedClaimed } = input;
  const rootSel = rootSelector(componentClass, rootAs);
  const lines: string[] = [];

  if (declaresState(context, apiProps, 'active') || declaresState(context, apiProps, 'pressed')) {
    lines.push(
      '/* Press affordance: the states convention names an active or pressed concept, so this is a press target. Figma has no cursor. */',
      `${rootSel()} {`, '  cursor: pointer;', '}', '',
    );
  }

  if (declaresState(context, apiProps, 'disabled')) {
    // Where a nested role claims `disabled`, the native control announces it and
    // the root carries only the variant prop's data attribute — so `:disabled`
    // and `[aria-disabled]` both match nothing and the affordance is dead CSS.
    const disabledEntry = (context.processingStates ?? {}).disabled as
      | { prop?: string; value?: string }
      | undefined;
    const disabledSel =
      nestedClaimed.has('disabled') && disabledEntry?.prop
        ? disabledEntry.value === undefined
          ? `[${attrNameFor(disabledEntry.prop, rootAs)}]`
          : `[${attrNameFor(disabledEntry.prop, rootAs)}="${normalizeEnumValue(disabledEntry.value)}"]`
        : disabledSelectorFor(rootAs, elemRoles.root);
    lines.push(
      '/* Disabled affordance: the states convention names a disabled concept. */',
      disabledSel.split(',').map(part => rootSel(part.trim())).join(',\n') + ' {',
      '  cursor: not-allowed;',
      '}',
      '',
    );
  }

  return lines;
}
