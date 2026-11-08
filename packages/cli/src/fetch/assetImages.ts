/**
 * Image assets a library lays out on a page (ADR-117).
 *
 * The third way a library holds an image, beside a fill style and a component
 * fill: a frame on a page, named to a pattern, that *is* an image — the way a
 * page of icons holds glyph components. `images.match` declares the pattern,
 * `{i}` capturing the name, exactly as `glyphs.match` does.
 *
 * Unlike a fill style, whose paint needs a node request because the style's
 * defining node is not in the document tree, an asset frame **is** in the file
 * payload and carries its own `fills`. So detection costs no request at all —
 * only the bytes are downloaded, through the same endpoint the other two paths
 * use.
 *
 * The position rule (DSPEC-54) is what separates a curated grid from an image
 * used incidentally: a qualifying frame is a direct child of a page, or a direct
 * child of a section that is itself a direct page child. Matching at any depth
 * would extract a placeholder inside a component as a library asset.
 */

import { matchNamePattern } from '../utilities/glyphConvention.js';
import { imageHashOfNode } from './styleImages.js';

/** An image asset found on a page: the captured name, its node, and its image. */
export interface ImageAsset {
  name: string;
  nodeId: string;
  imageHash: string;
}

/** Node kinds that can hold an image fill and sit where the position rule allows. */
const ASSET_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'RECTANGLE', 'GROUP']);

interface RawNode {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  children?: unknown;
}

/** Direct children of a node, or nothing. */
function childrenOf(node: unknown): RawNode[] {
  const children = (node as RawNode | null)?.children;
  return Array.isArray(children) ? children as RawNode[] : [];
}

/**
 * The pages of a monolithic file payload — the document's own children. The
 * page-split artifact hands its pages over one at a time instead, so callers
 * reading that form pass them directly.
 */
export function pagesOf(payload: unknown): unknown[] {
  return childrenOf((payload as { document?: unknown } | null)?.document);
}

/**
 * One page's qualifying frames: its direct children, plus the direct children of
 * any section among them. Two levels, never a full page walk.
 */
function* candidates(page: unknown): IterableIterator<RawNode> {
  for (const child of childrenOf(page)) {
    yield child;
    if (child?.type === 'SECTION') {
      for (const inSection of childrenOf(child)) yield inSection;
    }
  }
}

/**
 * Every image asset on the given pages, in page order then layout order.
 *
 * A frame matching the pattern but painting no image is skipped rather than
 * reported: the pattern describes a naming convention, and a library may well
 * name a label or a spacer frame the same way. A frame that paints an image and
 * does not match the pattern is equally not an asset — the declaration is what
 * makes the set curated.
 */
export function collectImageAssets(pages: unknown[], pattern: string): ImageAsset[] {
  const found: ImageAsset[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    for (const node of candidates(page)) {
      if (typeof node?.name !== 'string' || typeof node?.id !== 'string') continue;
      if (node.type !== undefined && typeof node.type === 'string' && !ASSET_TYPES.has(node.type)) continue;

      const name = matchNamePattern(node.name, pattern);
      if (!name) continue;

      const imageHash = imageHashOfNode(node);
      if (!imageHash) continue;

      // First occurrence of a name wins, as glyph collection does: a library
      // that repeats an asset name across pages means one image, not two.
      if (seen.has(name)) continue;
      seen.add(name);
      found.push({ name, nodeId: node.id, imageHash });
    }
  }

  return found.sort((a, b) => a.name.localeCompare(b.name));
}
