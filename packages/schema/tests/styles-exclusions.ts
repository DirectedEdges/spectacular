/**
 * The content decisions the schema tests cannot derive.
 *
 * Both lists encode a judgment a person made, which is why no rule produces
 * them. They are here rather than inline in a test so that changing one is an
 * edit to a named list, and so that the fact that these judgments exist is
 * visible from the directory rather than only to whoever opens the test.
 *
 * A test holding a list of decisions is weak — it restates the data instead of
 * checking a property of it. Both are candidates for deletion rather than
 * maintenance; see the note on each.
 *
 * The generator's own lists are in `site/scripts/style-pages-constants.mjs`.
 */

/**
 * Style keys that carry no `examples`, because the value would teach nothing.
 *
 * `height: 44` restates `number`. `opacity: 0.5` does not — it establishes a
 * 0-to-1 range — and that is why no rule derives this: the distinction is
 * whether the number means something, which is editorial.
 *
 * Asserted in both directions, so adding an example to one of these, or
 * dropping one elsewhere, is a deliberate edit.
 *
 * Worth deleting rather than maintaining. The assertions beside it — that an
 * example is a single value, and that it validates against its own property —
 * are rules. "Has an example" is not.
 */
export const KEYS_WITHOUT_EXAMPLES = [
  'clipsContent',
  'height',
  'itemReverseZIndex',
  'locked',
  'maxHeight',
  'maxLines',
  'maxWidth',
  'minHeight',
  'minWidth',
  'visible',
  'width',
  'wrap',
];

/**
 * Optional composite members that declare no `default`, per ADR-116.
 *
 * Four are *unexpressible*: the member means "nothing of this kind applies"
 * and its schema admits no `null` to say so. Three are *undetermined*: a
 * literal would validate, but none follows from the member's own meaning.
 *
 * Asserted in both directions. A member removed from this list must declare a
 * default; a member added to it must be argued for in an ADR first.
 *
 * This one has a reason to exist that `KEYS_WITHOUT_EXAMPLES` does not: JSON
 * Schema has no way to say "deliberately absent", so without the list there is
 * nothing separating a considered omission from an oversight.
 */
export const MEMBERS_WITHOUT_DEFAULTS = [
  'ColorObject.hex',
  'Effects.backgroundBlur',
  'Effects.layerBlur',
  'Effects.shadows',
  'Typography.fontFamily',
  'Typography.fontSize',
  'Typography.fontStyle',
];
