/**
 * Image fills carried by Figma fill styles (specs#889).
 *
 * A library's curated images live on published FILL styles rather than on any
 * component, so no generated spec points at them and `generate --get-images`
 * — which collects hashes from generated components' fills — never sees them.
 *
 * Reaching them takes a request fetch makes nowhere else. A fill style's paint
 * is not in the file payload at all: the document-level `styles` map carries
 * `name`, `key` and `styleType` only, and the style's defining node is not part
 * of the document tree (searching every page of a 36MB payload for those node
 * ids returns references from consuming nodes and no definition). The paint
 * comes back from Get File Nodes against the `node_id` the styles payload
 * records:
 *
 *   styles payload  FILL style "Images / Wanaka" → node_id 1568:2977
 *   GET /v1/files/:key/nodes?ids=1568:2977       → fills[].imageRef b60ac7bc…
 *   GET /v1/files/:key/images                    → hash → temporary S3 URL
 *
 * This module does the first two steps' reading; the download reuses
 * ImageFillsResolver, so there is one implementation of hash → bytes → file.
 */

/** A published FILL style, as the styles payload records it. */
export interface FillStyleRef {
  /** The style's Figma name, e.g. `Images / Wanaka`. */
  name: string;
  /** Published style key — the join to `styles.yaml`, which records the same value. */
  key: string;
  node_id: string;
}

/** A FILL style whose paint is an image. */
export interface StyleImage extends FillStyleRef {
  imageHash: string;
  /** Path to the downloaded file, relative to the config directory. Absent
   *  until the bytes land — a hash with no file is a known, reportable state. */
  src?: string;
}

/** How many node ids one Get File Nodes request carries, matching the glyph export's chunk. */
export const NODES_CHUNK = 50;

/** Figma Get File Nodes response, narrowed to the paint data this reads. */
interface GetFileNodesResponse {
  err?: string;
  nodes?: Record<string, { document?: { fills?: unknown } } | null>;
}

/**
 * Every published FILL style in a styles payload (`GET /v1/files/:key/styles`).
 * TEXT, EFFECT and GRID styles carry no paint and are dropped here rather than
 * costing a node request each.
 */
export function fillStyleRefs(payload: unknown): FillStyleRef[] {
  const styles = (payload as { meta?: { styles?: unknown } } | null)?.meta?.styles;
  if (!Array.isArray(styles)) return [];
  const refs: FillStyleRef[] = [];
  for (const style of styles as Array<Record<string, unknown>>) {
    if (style?.style_type !== 'FILL') continue;
    const { name, key, node_id: nodeId } = style;
    if (typeof name !== 'string' || typeof key !== 'string' || typeof nodeId !== 'string') continue;
    refs.push({ name, key, node_id: nodeId });
  }
  return refs;
}

/**
 * The Figma image hash of a style node's first visible image paint, or
 * undefined for a style that paints anything else.
 *
 * The REST API names this `imageRef` where the Plugin API names it
 * `imageHash`; they are the same content-hash identity, which is why the
 * downloaded file can be named for it and shared with `--get-images` output.
 */
export function imageHashOfNode(node: unknown): string | undefined {
  const fills = (node as { fills?: unknown } | null)?.fills;
  if (!Array.isArray(fills)) return undefined;
  for (const paint of fills as Array<Record<string, unknown>>) {
    if (paint?.type !== 'IMAGE') continue;
    if (paint.visible === false) continue;
    const ref = paint.imageRef ?? paint.imageHash;
    if (typeof ref === 'string' && ref.length > 0) return ref;
  }
  return undefined;
}

/**
 * Resolve FILL styles to their image hashes, in `NODES_CHUNK`-sized node
 * requests. `getNodes` is injected so the request shape is the caller's
 * concern — fetch passes its own retrying, auth-classifying client, and tests
 * pass a map.
 *
 * Styles whose paint is not an image are simply absent from the result: a
 * colour style is the common case, not a failure.
 */
export async function collectStyleImages(
  refs: FillStyleRef[],
  getNodes: (ids: string[]) => Promise<GetFileNodesResponse>,
): Promise<StyleImage[]> {
  const found: StyleImage[] = [];
  for (let i = 0; i < refs.length; i += NODES_CHUNK) {
    const chunk = refs.slice(i, i + NODES_CHUNK);
    const payload = await getNodes(chunk.map(r => r.node_id));
    if (payload.err) throw new Error(`Get File Nodes returned an error: ${payload.err}`);
    for (const ref of chunk) {
      const imageHash = imageHashOfNode(payload.nodes?.[ref.node_id]?.document);
      if (imageHash) found.push({ ...ref, imageHash });
    }
  }
  // Sorted by name so the payload is byte-identical across runs over unchanged
  // data — the cache reads it, and an mtime bump alone would rebuild for nothing.
  return found.sort((a, b) => a.name.localeCompare(b.name));
}
