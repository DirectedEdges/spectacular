// Truncating text by line count (specs#691).
//
// Figma truncates a text layer by line count, optionally with an ellipsis.
// CSS has two mechanisms and they do not overlap: a single line truncates
// with `text-overflow`, which needs the line held on one line and the
// overflow hidden; more than one line needs the line-clamp box.
//
// Both need `overflow: hidden`, and `clipsContent` may have already said so —
// a duplicate declaration is harmless, and omitting it where clipsContent is
// absent would leave the truncation inert.

export function truncationDecls(styles: Record<string, unknown>): string[] {
  const decls: string[] = [];
  const maxLines = styles.maxLines;
  const ellipsis = styles.textOverflow === 'ELLIPSIS';

  if (typeof maxLines === 'number' && maxLines > 0) {
    if (maxLines === 1) {
      decls.push('white-space: nowrap');
      decls.push('overflow: hidden');
      if (ellipsis) decls.push('text-overflow: ellipsis');
    } else {
      decls.push('display: -webkit-box');
      decls.push('-webkit-box-orient: vertical');
      decls.push(`-webkit-line-clamp: ${maxLines}`);
      decls.push(`line-clamp: ${maxLines}`);
      decls.push('overflow: hidden');
    }
  } else if (ellipsis) {
    // An ellipsis with no line count is a single-line truncation.
    decls.push('white-space: nowrap');
    decls.push('overflow: hidden');
    decls.push('text-overflow: ellipsis');
  }

  return decls;
}
