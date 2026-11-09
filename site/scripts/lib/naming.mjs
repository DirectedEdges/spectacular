/**
 * The vocabulary the generated trees share: URL slugs and platform names.
 */

/**
 * A schema name as a URL segment.
 *
 * The leading `$` is stripped because several schema members carry one —
 * `$image`, `$token`, `$extensions` — and a `$` in a path is noise in a URL
 * rather than a distinction a reader needs. Two of the four copies of this
 * function omitted the strip, which was dormant only because the keys they
 * were handed happened never to start with one.
 */
export const kebab = (s) =>
  s.replace(/^\$/, '').replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, '');

/**
 * The platforms a binding file may exist for, in the order their sections are
 * rendered.
 *
 * A generator still loads only the binding files that are present, so this is
 * the set of names it may look for rather than a claim that all four exist.
 */
export const PLATFORMS = ['figma', 'css', 'react', 'webcomponents'];

/** Platform id → the name a reader sees. */
export const PLATFORM_TITLE = {
  figma: 'Figma',
  css: 'CSS',
  react: 'React',
  webcomponents: 'Web Components',
};
