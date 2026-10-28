// Whether a container clips its content (specs#691).

export function overflowDecls(styles: Record<string, unknown>): string[] {
  if (!('clipsContent' in styles) || styles.clipsContent === undefined) return [];
  if (styles.clipsContent === true) return ['overflow: hidden'];
  if (styles.clipsContent === false) return ['overflow: visible'];
  return [];
}
