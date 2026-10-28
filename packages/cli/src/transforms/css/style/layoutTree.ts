// The CSS transformer's read of a spec's layout shape. Mirrors the shared
// emitter core's layoutTree module (`@directededges/from-specs`), which is the
// live home of the wider variant-analysis machinery this file deliberately does
// not carry — keep `parseLayout` identical to that copy.

export interface LayoutNode {
  key: string;
  children: LayoutNode[];
  /**
   * Render condition inferred from variant configurations (state-classified
   * props stripped). Empty array → render always. Each entry is a
   * conjunction (prop → value); entries are OR'd together.
   */
  conditions?: Array<Record<string, unknown>>;
}

/**
 * Parse the YAML layout shape into LayoutNodes. Layout is a list whose items
 * are either a string (leaf element) or a single-key object mapping an element
 * to its children list.
 */
export function parseLayout(layout: unknown): LayoutNode[] {
  if (!Array.isArray(layout)) return [];
  const nodes: LayoutNode[] = [];
  for (const item of layout) {
    if (typeof item === 'string') {
      nodes.push({ key: item, children: [] });
    } else if (item && typeof item === 'object') {
      for (const [key, children] of Object.entries(item as Record<string, unknown>)) {
        nodes.push({ key, children: parseLayout(children) });
      }
    }
  }
  return nodes;
}
