// Hiding an element (specs#691).
//
// Only `false` emits. An element that is visible says nothing — `display` is
// whatever its layout decided, and restating it here would outrank the rule that
// set it.

export function visibilityDecls(styles: Record<string, unknown>): string[] {
  return 'visible' in styles && styles.visible === false ? ['display: none'] : [];
}
