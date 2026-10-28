// Aspect ratio (specs#691).
//
// Exported as a predicate as well as a mapping, because the size mapping has to
// know: an element with a ratio must not also emit the authored height.

/**
 * Whether this style set states a ratio.
 *
 * A style set that sets `aspectRatio: null` is stating it has *no* ratio, so its
 * height is authored and is emitted.
 */
export function hasAspectRatio(styles: Record<string, unknown>): boolean {
  return 'aspectRatio' in styles && styles.aspectRatio !== null && styles.aspectRatio !== undefined;
}

export function aspectRatioDecls(styles: Record<string, unknown>): string[] {
  if (!hasAspectRatio(styles)) return [];
  const v = styles.aspectRatio as Record<string, number>;
  if ('x' in v && 'y' in v) return [`aspect-ratio: ${v.x} / ${v.y}`];
  return [];
}
