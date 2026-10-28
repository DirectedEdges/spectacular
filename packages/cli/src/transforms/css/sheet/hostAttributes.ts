// Which variant props a custom element reflects as a bare attribute, and what
// this stylesheet must therefore select on.
//
// MIRRORED from `@directededges/from-specs`' reflectedAttrs.ts — the CLI cannot
// import the transform packages' source, and both halves need the same answer.
// A change there must land here too, or a rule selects an attribute the element
// never writes and the variant silently loses its styling.
import { toKebab } from '../../naming.js';

/**
 * Attribute names a custom element must not take over.
 *
 * Reflecting a variant prop as a bare attribute is what lets this stylesheet
 * select `:host([appearance="filled"])`. It also means the attribute is a real
 * one on a real element, and a handful of global names already do something —
 * `hidden` would stop the component rendering, `title` would raise a tooltip.
 */
const RESERVED = new Set([
  'accesskey', 'autocapitalize', 'autofocus', 'class', 'contenteditable', 'dir',
  'draggable', 'enterkeyhint', 'exportparts', 'hidden', 'id', 'inert',
  'inputmode', 'is', 'itemid', 'itemprop', 'itemref', 'itemscope', 'itemtype',
  'lang', 'nonce', 'part', 'popover', 'role', 'slot', 'spellcheck', 'style',
  'tabindex', 'title', 'translate', 'writingsuggestions',
]);

/** True when `name` collides with a global attribute that already has behaviour. */
export function isReservedAttribute(name: string): boolean {
  return RESERVED.has(name.toLowerCase()) || name.toLowerCase().startsWith('aria-');
}

/**
 * The attribute a prop is written to, in the root form this sheet targets.
 *
 * A React root carries `data-*` and always has. A custom element host reflects a
 * bare attribute where the name is free, and falls back to `data-*` where it is
 * not.
 */
export function attrNameFor(propName: string, rootAs: 'class' | 'host'): string {
  const kebab = toKebab(propName);
  if (rootAs !== 'host') return `data-${kebab}`;
  return isReservedAttribute(kebab) ? `data-${kebab}` : kebab;
}
