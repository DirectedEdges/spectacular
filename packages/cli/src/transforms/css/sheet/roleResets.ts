// Neutralising what a role's emitted element brings with it (specs#691).
//
// A role (ADR-067) can replace a `div` with a real `<button>`, `<a>` or
// `<input>`. The spec's declarations were authored against the plain box, so the
// user-agent styling the new tag carries has to go first — and the rules that do
// that must land before any spec declaration.
import { toKebab } from '../../naming.js';
import { rootSelector } from './selectors.js';
import type { RootForm } from '../types.js';

/**
 * Roles whose emitted element carries user-agent styling a `div` never had.
 *
 * Swapping the tag inherits the UA's own border, background, font and padding,
 * which the spec's declarations were authored without. The most visible symptom
 * is a size change between states: a state block that sets `border-width`
 * suppresses the UA border, and the state that does not set one keeps it, so the
 * control changes size when it changes state.
 */
export const UA_STYLED_ROLES = new Set(['button', 'togglebutton', 'link', 'disclosure', 'textbox']);

/** Neutralize the emitted element's UA styling so the spec's declarations govern. */
export function uaResetDecls(role: string): string[] {
  const decls = [
    'appearance: none',
    '-webkit-appearance: none',
    'background: none',
    'border: 0',
    'margin: 0',
    'padding: 0',
    'font: inherit',
    'color: inherit',
    'text-align: inherit',
  ];
  // An anchor is not a button: it carries link decoration rather than a border.
  if (role === 'link') decls.push('text-decoration: none');
  return decls;
}

/**
 * Every reset and injected-control rule the component's roles call for, in the
 * order the stylesheet needs them: non-root elements first, then proxy inputs,
 * then the root.
 */
export function roleResetLines(
  componentClass: string,
  rootAs: RootForm,
  elemRoles: Record<string, string>,
): string[] {
  const rootSel = rootSelector(componentClass, rootAs);
  const lines: string[] = [];

  // A non-root element whose role emits a native control needs the same
  // neutralization, scoped to its own selector — a disclosure trigger layer
  // becomes a real <button>, and browser chrome would paint over the design.
  for (const [elemKey, elemRole] of Object.entries(elemRoles)) {
    if (elemKey === 'root' || !UA_STYLED_ROLES.has(elemRole)) continue;
    lines.push(
      `/* ${elemRole} role: neutralize user-agent styling for the emitted element. */`,
      `.${componentClass}__${toKebab(elemKey)} {`,
      ...uaResetDecls(elemRole).map(d => `  ${d};`),
      '}',
      '',
    );
  }

  // A proxy-input role injects a hidden native control beside the visual
  // proxy, which is itself the click-target <label htmlFor> — its whole
  // footprint activates the input with no positioning involved. The input is
  // visually hidden but still focusable and announceable.
  for (const [elemKey, elemRole] of Object.entries(elemRoles)) {
    if (elemRole !== 'checkbox' && elemRole !== 'switch') continue;
    const base = `.${componentClass}__${toKebab(elemKey)}`;
    lines.push(
      `/* ${elemRole} role: the click-target proxy label and its injected input. */`,
      `${base} {`,
      '  cursor: pointer;',
      '}',
      `${base}-input {`,
      '  position: absolute;',
      '  width: 1px;',
      '  height: 1px;',
      '  margin: -1px;',
      '  padding: 0;',
      '  overflow: hidden;',
      '  clip: rect(0 0 0 0);',
      '  white-space: nowrap;',
      '  border: 0;',
      '}',
      // The platform focus ring draws around the focused element — the hidden
      // input, which has no visible box. Re-draw it on the visible proxy: the
      // input is injected immediately before the proxy, so the adjacent-sibling
      // selector holds by construction, and `outline-style: auto` asks for the
      // platform's own ring rather than imitating it.
      `${base}-input:focus-visible + ${base} {`,
      '  outline: auto;',
      '  outline-offset: 2px;',
      '}',
      '',
    );
  }

  const rootRole = elemRoles.root;
  if (rootRole && UA_STYLED_ROLES.has(rootRole)) {
    if (rootAs === 'host') {
      // The shadow root renders a real interactive element wrapping the root's
      // content, so the platform supplies keyboard activation and `disabled`.
      // It is styled to nothing and takes no box: the host keeps the root's
      // layout and appearance exactly as the rules below describe them.
      lines.push(
        `/* ${rootRole} role: the inner semantic element carries behavior, not appearance. */`,
        '[part="button"] {',
        ...uaResetDecls(rootRole).map(d => `  ${d};`),
        '  display: contents;',
        '}',
        '',
      );
    } else {
      lines.push(
        `/* ${rootRole} role: neutralize user-agent styling for the emitted element. */`,
        `${rootSel()} {`,
        ...uaResetDecls(rootRole).map(d => `  ${d};`),
        '}',
        '',
      );
    }
  }

  return lines;
}
