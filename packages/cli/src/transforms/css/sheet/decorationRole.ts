// What a `decoration` role does to the stylesheet (/roles/decoration/).
//
// The role states that an element carries no meaning a user needs to perceive,
// and the accessibility tree already honours that through `aria-hidden`. The
// pointer hit-test is the same statement in the other channel: an element that
// means nothing should catch nothing. Without it the role produces an element
// invisible to a screen reader that still blocks clicks aimed at real content —
// the frontmost full-bleed overlay being the case that makes it visible.
//
// Scoped to a childless decoration, which is what an overlay is. The role's
// focusable-content rule bars an interactive element or a slot in the subtree,
// but not ordinary text: a decorative panel wrapping a caption is well-formed,
// and hit-transparency there would make that caption unselectable with nothing
// warning. A decoration with children keeps its hit-test.
//
// The docs page is the specification; it states this scope, and a disagreement
// between the two is a bug here rather than a liberty taken.

/**
 * Whether a `decoration` role on this element makes it hit-transparent.
 *
 * True only where the element has no children. `parentOf` is read the same way
 * `imageRole` reads it, for the same question asked of a different role.
 */
export function decorationIsHitTransparent(
  elemKey: string,
  elemRoles: Record<string, string>,
  parentOf: Map<string, string>,
): boolean {
  if (elemRoles[elemKey] !== 'decoration') return false;
  for (const parent of parentOf.values()) if (parent === elemKey) return false;
  return true;
}

/** The declaration a hit-transparent decoration carries. */
export const DECORATION_HIT_DECL = 'pointer-events: none';
