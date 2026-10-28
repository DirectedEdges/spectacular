// Horizontal text alignment (specs#691).
//
// ADR-064 logical directions — the transform speaks only the current schema.
const TEXT_ALIGN_MAP: Record<string, string> = {
  START: 'start', CENTER: 'center', END: 'end', JUSTIFY: 'justify',
};

export function textAlignDecls(styles: Record<string, unknown>): string[] {
  if (!('textAlignHorizontal' in styles) || styles.textAlignHorizontal === undefined) return [];
  const v = styles.textAlignHorizontal;
  if (typeof v === 'string' && TEXT_ALIGN_MAP[v]) return [`text-align: ${TEXT_ALIGN_MAP[v]}`];
  return [];
}
