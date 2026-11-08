// A variant that states an aspect ratio has to release the height the default
// block fixed, or the ratio is inert.
//
// `sizeDecls` already applies this rule WITHIN one style set: a style set that
// states a ratio does not also emit its authored height, because "a fixed
// height beats `aspect-ratio` in the cascade" (see `style/size.ts`). That
// reasoning carries across blocks unchanged, and across blocks is where it was
// missing — `sizeDecls` is handed one style set at a time and cannot see that a
// different block already pinned the dimension.
//
// The shape it was found in: a default block declaring `width: 373px` and
// `height: 210px`, and six `aspectRatio` variants each emitting nothing but
// `aspect-ratio: X / Y`. CSS ignores `aspect-ratio` when both dimensions are
// definite, so all six variants rendered identically to the default and the
// control looked dead.
import { hasAspectRatio } from '../style/aspectRatio.js';

/**
 * `height: auto` where this variant states a ratio over a default-block height.
 *
 * Height rather than width, because a ratio derives the dimension the design
 * did not drive: a root sized FILL horizontally and FIXED vertically is stating
 * that width comes from the parent, so the ratio replaces the fixed height.
 *
 * Nothing is released where the default block stated a ratio of its own —
 * `sizeDecls` already withheld that block's height, so there is nothing in the
 * cascade to undo.
 */
export function ratioReleaseDecls(
  variantStyles: Record<string, unknown>,
  defaultElement: Record<string, unknown> | undefined,
): string[] {
  if (!hasAspectRatio(variantStyles)) return [];
  const defaultStyles = (defaultElement?.styles ?? {}) as Record<string, unknown>;
  if (!('height' in defaultStyles) || hasAspectRatio(defaultStyles)) return [];
  return ['height: auto'];
}
