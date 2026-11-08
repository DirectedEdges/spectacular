// What an `image` role does to the stylesheet (/roles/image/).
//
// `image` is the first role whose element swap moves a DECLARED style rather
// than adding one. Every other swap leaves the styling where it was and only
// changes the tag; this one takes the element's image fill onto a `src`
// attribute, so the stylesheet must stop painting it as a background or the
// picture is fetched twice and `object-fit` is handed two different boxes.
//
// The path test below is a deliberate second statement of `resolveImageForm` in
// `@directededges/from-specs`, for the same reason `specsLayout.ts` is
// duplicated: this package must not depend on the emitters, and neither depends
// on it. The docs page is the specification both sides follow, and both pin the
// rule with tests. When they disagree, the page is right and one of them is a bug.

/**
 * Whether an `image` role on this element took its fill onto a source attribute.
 *
 * True only on the element path. A drawing (`glyph`/`vector`) is already its own
 * element and has no fill to move, and an image painted behind content keeps its
 * tag — and therefore keeps its background exactly as before.
 */
export function imageRoleTakesFill(
  elemKey: string,
  elemRoles: Record<string, string>,
  elemTypes: Record<string, string>,
  styles: Record<string, unknown>,
  parentOf: Map<string, string>,
): boolean {
  if (elemRoles[elemKey] !== 'image') return false;
  const type = elemTypes[elemKey];
  if (type === 'glyph' || type === 'vector') return false;
  if (!('backgroundImage' in styles)) return false;
  // Children have nowhere to go inside a void image tag, so an element that has
  // any keeps its tag and its background with it.
  for (const parent of parentOf.values()) if (parent === elemKey) return false;
  return true;
}

/**
 * The fit declarations for a picture that is now an element rather than a layer
 * behind one.
 *
 * The same two facts `backgroundImageDecls` states — how the picture is fitted
 * and where it sits — spelled against the content box. No `background-image`:
 * the picture arrives through `src`. No `background-repeat` either, because a
 * replaced element draws its content once by definition.
 */
export function imageElementFitDecls(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const objectFit = (value as Record<string, unknown>).objectFit;
  return [
    'object-position: center',
    `object-fit: ${objectFit === 'CONTAIN' ? 'contain' : 'cover'}`,
  ];
}
