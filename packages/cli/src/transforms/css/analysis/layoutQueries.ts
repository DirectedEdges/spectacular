// What a layout tree says about its elements (specs#691).
//
// Walks over the parsed layout, kept apart from the rules that consume them:
// each answers one question about structure and none of them emits CSS.
import { impliesAbsolute } from '../style/styleToCSS.js';
import type { LayoutNode } from '../style/layoutTree.js';

/** Every element key the tree mentions, at any depth. */
export function collectLayoutKeys(nodes: LayoutNode[], into: Set<string>): void {
  for (const node of nodes) {
    into.add(node.key);
    collectLayoutKeys(node.children, into);
  }
}

/** Element key → its parent's key. The first parent seen wins. */
export function collectParents(nodes: LayoutNode[], into: Map<string, string>, parent?: string): void {
  for (const node of nodes) {
    if (parent && !into.has(node.key)) into.set(node.key, parent);
    collectParents(node.children, into, node.key);
  }
}

/**
 * True when an absolutely-placed child exactly covers its parent's bounds:
 * either zero insets on all sides, or zero offset with dimensions equal to
 * the parent's.
 */
export function coversParent(styles: Record<string, unknown>, parentStyles: Record<string, unknown>): boolean {
  const n = (v: unknown) => (typeof v === 'number' ? v : undefined);
  const allInsetsZero =
    n(styles.top) === 0 && n(styles.bottom) === 0 && n(styles.start) === 0 && n(styles.end) === 0;
  const sameSizeAtOrigin =
    n(styles.top) === 0 &&
    n(styles.start) === 0 &&
    n(styles.width) !== undefined &&
    n(styles.width) === n(parentStyles.width) &&
    n(styles.height) !== undefined &&
    n(styles.height) === n(parentStyles.height);
  return allInsetsZero || sameSizeAtOrigin;
}

/**
 * Mark elements that need `position: relative` for correct stacking: the
 * layout parent of any absolutely-positioned element (containing block), and
 * that element's non-absolute siblings (so painting follows layout order —
 * last on top — instead of absolute elements covering static siblings).
 */
export function collectStackingFixes(
  nodes: LayoutNode[],
  elements: Record<string, Record<string, unknown>>,
  into: Set<string>,
  parent?: string,
): void {
  const parentStyles = (elements[parent ?? '']?.styles ?? {}) as Record<string, unknown>;
  const parentAutoLayout =
    parentStyles.layoutMode === 'HORIZONTAL' || parentStyles.layoutMode === 'VERTICAL';
  const isAbsolute = (key: string) => {
    if (parent === undefined) return false; // roots never infer
    const styles = (elements[key]?.styles ?? {}) as Record<string, unknown>;
    return impliesAbsolute(styles, parentAutoLayout);
  };

  if (nodes.some(n => isAbsolute(n.key))) {
    if (parent) into.add(parent);
    for (const n of nodes) {
      if (!isAbsolute(n.key)) into.add(n.key);
    }
  }
  for (const node of nodes) {
    collectStackingFixes(node.children, elements, into, node.key);
  }
}

/** Parent key → ordered child keys, for every parent in a layout tree. */
export function childOrder(nodes: LayoutNode[], parent: string | null = null, out?: Map<string | null, string[]>): Map<string | null, string[]> {
  const map = out ?? new Map<string | null, string[]>();
  for (const n of nodes) {
    const list = map.get(parent) ?? [];
    list.push(n.key);
    map.set(parent, list);
    childOrder(n.children, n.key, map);
  }
  return map;
}
