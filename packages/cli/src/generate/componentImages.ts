/**
 * What `generate --get-images` found on components, recorded for the cache
 * (specs#902).
 *
 * `fetch` records the images a library holds for its own sake — on fill styles,
 * and laid out on a page. Generate is the only thing that sees the third kind: a
 * fill on a component. Without a record, those images exist on disk and in one
 * component's spec, and the lookup that answers "what images does this library
 * have" is missing a third of its subject.
 *
 * Two rules shape this, both from the design agreed in ADR-117's lane:
 *
 * - **Every image, not only the unresolved ones.** `ImageFillsResolver` collects
 *   hashes that still need bytes, which is the right question for downloading
 *   and the wrong one for recording: once resolved, a second run finds none and
 *   would record nothing.
 * - **Merge by hash, never truncate.** A pass over three components sees fewer
 *   images than a full catalogue pass. An image did not stop existing because
 *   today's run was narrow, so a scoped pass adds and updates but never removes.
 */

import fs from 'fs-extra';
import path from 'path';
import type { ImageData } from '@directededges/specs-schema';

/** One component image, in the shape every images payload producer writes. */
export interface ComponentImage {
  imageHash: string;
  /** Path to the file, relative to the config directory; absent until resolved. */
  src?: string;
  /** Component keys whose registries reference it. */
  usedBy: string[];
  origin: 'component';
}

/** The payload `generate --get-images` writes beside the fetch-written one. */
export interface ComponentImagesPayload {
  fileKey?: string;
  images: ComponentImage[];
}

export function componentImagesFileName(alias: string): string {
  return `${alias}.component-images.json`;
}

/**
 * Every `images` registry in a component spec: the component's own, and one per
 * subcomponent. Mirrors the registries the resolver rewrites, so a
 * subcomponent's image is recorded rather than silently dropped.
 */
function* registries(spec: Record<string, unknown>): IterableIterator<Record<string, unknown>> {
  if (spec.images) yield spec.images as Record<string, unknown>;
  const subcomponents = spec.subcomponents as Record<string, Record<string, unknown>> | undefined;
  if (!subcomponents) return;
  for (const subcomponent of Object.values(subcomponents)) {
    if (subcomponent?.images) yield subcomponent.images as Record<string, unknown>;
  }
}

/**
 * Every image these components reference, resolved or not, with the components
 * that reference each — read after resolution so a `src` the run just added is
 * carried through.
 *
 * `src` is rewritten relative to the config directory. In a spec it is relative
 * to the spec file, which is the right form there and the wrong one for a cache
 * that does not know where the reader is standing.
 */
export function collectComponentImages(
  components: Array<{ name: string; spec: Record<string, unknown> }>,
  imagesDirRelativeToConfig: string,
  /**
   * Raw Figma name → the key a spec is filed under. Components arrive here named
   * as Figma names them (`DE Card`), and every other reference to a component —
   * the spec folder, the Storybook page's own cross-reference — uses the
   * formatted key (`deCard`). Recording the raw name would put two vocabularies
   * for one thing in one lookup.
   */
  toSpecKey: (name: string) => string = (name) => name,
): ComponentImage[] {
  const byHash = new Map<string, { src?: string; usedBy: Set<string> }>();

  for (const { name: rawName, spec } of components) {
    const name = toSpecKey(rawName);
    for (const images of registries(spec)) {
      for (const value of Object.values(images)) {
        const entry = value as ImageData | undefined;
        const imageHash = entry?.$extensions?.['com.figma']?.imageHash;
        if (typeof imageHash !== 'string') continue;

        const existing = byHash.get(imageHash) ?? { usedBy: new Set<string>() };
        existing.usedBy.add(name);
        // The spec's `src` is relative to the spec file; only its filename is
        // stable across layouts, and the directory is known here.
        if (typeof entry?.src === 'string' && !existing.src) {
          existing.src = path.join(imagesDirRelativeToConfig, path.basename(entry.src));
        }
        byHash.set(imageHash, existing);
      }
    }
  }

  return [...byHash.entries()]
    .map(([imageHash, { src, usedBy }]) => ({
      imageHash,
      ...(src ? { src } : {}),
      usedBy: [...usedBy].sort(),
      origin: 'component' as const,
    }))
    .sort((a, b) => a.imageHash.localeCompare(b.imageHash));
}

/**
 * This pass's findings merged over what a previous pass recorded.
 *
 * A hash both passes saw unions their `usedBy` and takes whichever has a `src`,
 * so a scoped run never drops a component a fuller run knew about. A hash only
 * the previous pass recorded survives untouched — that is the never-truncate
 * rule, and it is why removal needs its own deliberate trigger rather than
 * falling out of a narrow run.
 */
export function mergeComponentImages(previous: ComponentImage[], found: ComponentImage[]): ComponentImage[] {
  const merged = new Map<string, ComponentImage>();
  for (const image of previous) {
    if (typeof image?.imageHash === 'string') merged.set(image.imageHash, image);
  }

  for (const image of found) {
    const existing = merged.get(image.imageHash);
    merged.set(image.imageHash, {
      imageHash: image.imageHash,
      ...(image.src ?? existing?.src ? { src: image.src ?? existing!.src } : {}),
      usedBy: [...new Set([...(existing?.usedBy ?? []), ...image.usedBy])].sort(),
      origin: 'component',
    });
  }

  return [...merged.values()].sort((a, b) => a.imageHash.localeCompare(b.imageHash));
}

/** The payload a previous pass wrote, or nothing when there is none to merge over. */
export async function readComponentImages(dataDir: string, alias: string): Promise<ComponentImage[]> {
  const file = path.join(dataDir, componentImagesFileName(alias));
  if (!(await fs.pathExists(file))) return [];
  try {
    const parsed = await fs.readJson(file) as ComponentImagesPayload | null;
    return Array.isArray(parsed?.images) ? parsed.images : [];
  } catch {
    // Unreadable is treated as absent: this pass's findings are then the whole
    // record, which is a loss of history and never a loss of truth.
    return [];
  }
}

/** Write the merged payload. Returns what was written, for reporting. */
export async function writeComponentImages(
  dataDir: string,
  alias: string,
  fileKey: string | undefined,
  images: ComponentImage[],
): Promise<ComponentImage[]> {
  await fs.ensureDir(dataDir);
  await fs.writeFile(
    path.join(dataDir, componentImagesFileName(alias)),
    JSON.stringify({ ...(fileKey ? { fileKey } : {}), images }, null, 2),
    'utf-8',
  );
  return images;
}
