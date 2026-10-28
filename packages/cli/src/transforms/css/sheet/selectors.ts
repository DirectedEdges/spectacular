// Which selector can actually match, given this root and this target (specs#691).
//
// The concept table pairs each state with every selector that *could* carry it.
// Emitting all of them produces rules that can never match — and worse, `:not()`
// guards built from them that always pass. Narrowing happens here, in one place,
// because getting it wrong is invisible: the rule is simply never selected.
import { toKebab } from '../../naming.js';
import type { RootForm } from '../types.js';

/** Roles whose emitted element carries a real `disabled` property. */
const NATIVE_DISABLED_ROLES = new Set(['button', 'togglebutton', 'disclosure']);

/** Roles whose emitted element can itself hold visible focus. */
const NATIVE_FOCUSABLE_ROLES = new Set(['button', 'togglebutton', 'disclosure', 'link', 'textbox']);

/**
 * The disabled selector that can actually match, for this target and this root.
 *
 * `CONCEPT_TABLE` pairs `:disabled` with `[aria-disabled="true"]` because either
 * may carry the state. Emitting both everywhere produces selectors that can never
 * match: a role emitting a native control sets the real `disabled` property and
 * never the ARIA string, and a custom element host can never match `:disabled` at
 * all — that requires form association.
 */
export function disabledSelectorFor(rootAs: RootForm, rootRole: string | undefined): string {
  // A shadow host is not a form control, so `:disabled` cannot match it.
  if (rootAs === 'host') {
    // Where the root's role emits a native control, that control lives INSIDE the
    // shadow root and the host announces nothing — so `[aria-disabled]` never
    // matches either, and every disabled rule is dead while `:not()` guards on
    // hover always pass. The scaffold puts a plain `disabled` attribute on the host
    // for exactly this, and the two spellings must agree: `HOST_STATE_ATTRS` in
    // webcomponents-from-specs' `Emit/rootAttrs.ts`, a different repo.
    if (rootRole && NATIVE_DISABLED_ROLES.has(rootRole)) return '[disabled]';
    return '[aria-disabled="true"]';
  }
  // An anchor has no `disabled` property either — a disabled link is expressed by
  // dropping `href` and announcing `aria-disabled`, so `:disabled` never matches.
  if (rootRole === 'link') return '[aria-disabled="true"]';
  const native = rootRole ? NATIVE_DISABLED_ROLES.has(rootRole) : false;
  return native ? ':disabled' : ':disabled, [aria-disabled="true"]';
}

/**
 * The focus selector that can actually match, for this target and this root.
 *
 * The `focus` concept means the platform's visible-focus heuristic
 * (`:focus-visible`), but that selector only matches a root that can itself
 * hold focus. A wrapper root reaches its control with `:has(:focus-visible)`:
 * a text control matches whenever it is focused, a button-like control only
 * from the keyboard — so click-into-a-field styling survives while a clicked
 * button does not hold its ring. A shadow host matches `:focus-visible`
 * itself when its roled scaffold delegates focus; an un-roled host cannot,
 * and `:focus-within` is the only spelling that can match, because `:has()`
 * does not cross the shadow boundary. A library that declares the
 * `focus-within` concept has said exactly what it means and is never
 * narrowed.
 */
export function focusSelectorFor(rootAs: RootForm, rootRole: string | undefined): string {
  const native = rootRole ? NATIVE_FOCUSABLE_ROLES.has(rootRole) : false;
  if (rootAs === 'host') return native ? ':focus-visible' : ':focus-within';
  return native ? ':focus-visible' : ':has(:focus-visible)';
}

/**
 * The root's selector, in the form this stylesheet is written for.
 *
 * Returned as a function because almost every rule needs the root with a
 * different set of qualifiers, and the `host` form puts them *inside* the
 * functional notation rather than after it.
 */
export function rootSelector(componentClass: string, rootAs: RootForm): (qualifiers?: string) => string {
  return (qualifiers = '') =>
    rootAs === 'host'
      ? (qualifiers ? `:host(${qualifiers})` : ':host')
      : `.${componentClass}${qualifiers}`;
}

/** A non-root element's selector; the root's own block class for `root`. */
export function elemSelector(componentClass: string, elemKey: string): string {
  return elemKey === 'root'
    ? `.${componentClass}`
    : `.${componentClass}__${toKebab(elemKey)}`;
}

/**
 * An element's rule, written so it wins against the component it composes.
 *
 * A composed instance has no wrapper: the emitters put this class on the
 * composed component's own root element, which already carries that component's
 * single-class root rule. Two single-class rules on one element are decided by
 * the order two independently generated stylesheets happen to load in, which is
 * not something either file can state. Doubling the class settles it by
 * specificity instead.
 *
 * Doubling the *last* class is what makes this work inside a variant's
 * descendant selector, where the element's class is the right-hand part and the
 * variant's qualifiers sit on the root to its left.
 *
 * For the custom-element build the composed component's size lives in a `:host`
 * rule, which an outer-tree class already outranks; the doubling is harmless.
 */
export function composedSelector(selector: string, elemType: string | undefined): string {
  if (elemType !== 'instance') return selector;
  const own = selector.split(' ').pop() ?? selector;
  return `${selector}${own}`;
}

