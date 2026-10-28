/**
 * ImageFillsResolver - resolves unresolved registry images (ADR-063)
 *
 * Purpose: the second phase of the two-phase image model. Generation (detect)
 * emits component `images` registries whose entries carry only the Figma
 * identity (`$extensions['com.figma'].imageHash`, no `src`). This resolver —
 * run by `specs generate --get-images` — turns those into emitted asset files:
 *
 * 1. Collect every distinct unresolved hash across the generated components.
 * 2. Call Figma's Get Image Fills endpoint (`GET /v1/files/:key/images`),
 *    which returns temporary S3 download URLs (~14-day expiry).
 * 3. Download each image's bytes, detect the format from magic bytes, and
 *    write `{workspace}/assets/images/{imageHash}.{ext}` — hash-named so the same
 *    image used by many components dedups to one file and re-runs are
 *    idempotent. A sibling of specs/ rather than a folder inside it: an image
 *    is consumed by every target and produced by none (project 024).
 * 4. ADD `src` to each entry — a path relative to the referencing spec file
 *    (`../assets/images/...`, deeper when component subfolders are in use).
 *    The Figma identity survives for reverse-direction tooling.
 *
 * The temporary S3 URLs are never persisted — only the downloaded bytes and
 * the relative file path survive (ADR-063 runtime notes).
 */

import fs from 'fs-extra';
import path from 'path';
import type { ImageData } from '@directededges/specs-schema';

/** Figma Get Image Fills response shape. */
interface GetImageFillsResponse {
  error?: boolean;
  status?: number;
  meta?: { images?: Record<string, string> };
}

/** The Figma image hash of a registry entry, or undefined. */
function imageHashOf(entry: unknown): string | undefined {
  return (entry as ImageData | undefined)?.$extensions?.['com.figma']?.imageHash;
}

/** Named guard: a registry entry that is still awaiting resolution. */
function isUnresolved(entry: unknown): entry is ImageData {
  return typeof entry === 'object' && entry !== null
    && (entry as ImageData).src === undefined
    && imageHashOf(entry) !== undefined;
}

/**
 * Where resolved image files are written, relative to the specs directory.
 *
 * A sibling of specs/ rather than a `_`-prefixed pseudo-component inside it: an
 * image is consumed by every target and produced by none (project 024).
 */
export const IMAGES_DIR_NAME = path.join('..', 'assets', 'images');

export class ImageFillsResolver {
  /**
   * Yield every `images` registry in a component spec: the component's own,
   * and one per subcomponent (subcomponents run the same detection pipeline
   * with their own registry, serialized inside the parent's spec file).
   */
  private static *registries(spec: Record<string, unknown>): IterableIterator<Record<string, unknown>> {
    if (spec.images) yield spec.images as Record<string, unknown>;
    const subcomponents = spec.subcomponents as Record<string, Record<string, unknown>> | undefined;
    if (!subcomponents) return;
    for (const subcomponent of Object.values(subcomponents)) {
      if (subcomponent?.images) yield subcomponent.images as Record<string, unknown>;
    }
  }

  /**
   * Collect every distinct unresolved hash from the components' `images`
   * registries (including subcomponent registries). Entries that already
   * carry a `src` are ignored.
   */
  public static collectUnresolvedHashes(components: Array<{ spec: Record<string, unknown> }>): Set<string> {
    const hashes = new Set<string>();
    for (const { spec } of components) {
      for (const images of ImageFillsResolver.registries(spec)) {
        for (const value of Object.values(images)) {
          if (isUnresolved(value)) hashes.add(imageHashOf(value)!);
        }
      }
    }
    return hashes;
  }

  /**
   * Find hashes whose files already exist in the images directory — those
   * are reused as-is (hash-named files are content-addressed, so an existing
   * file is by definition current). Returns hash → existing filename.
   * Callers only call Get Image Fills / download for the remainder, so a
   * fully-resolved re-run needs no token and no network at all.
   */
  public static async findExisting(hashes: Set<string>, outputDir: string): Promise<Map<string, string>> {
    const existing = new Map<string, string>();
    const imagesDir = path.join(outputDir, IMAGES_DIR_NAME);
    if (!(await fs.pathExists(imagesDir))) return existing;

    const files = await fs.readdir(imagesDir);
    for (const hash of hashes) {
      const match = files.find(f => f.startsWith(`${hash}.`));
      if (match) existing.set(hash, match);
    }
    return existing;
  }

  /**
   * Fetch the hash → temporary-S3-URL map for a file via Get Image Fills.
   * Throws with an actionable message on auth/permission failures.
   */
  public static async fetchImageUrls(fileKey: string, token: string): Promise<Record<string, string>> {
    const response = await fetch(`https://api.figma.com/v1/files/${fileKey}/images`, {
      headers: { 'X-Figma-Token': token },
    });

    if (response.status !== 200) {
      const body = await response.text();
      throw new Error(`Get Image Fills failed for file ${fileKey} (HTTP ${response.status}): ${body.slice(0, 200)}`);
    }

    const json = await response.json() as GetImageFillsResponse;
    return json.meta?.images ?? {};
  }

  /** Concurrent download limit — parallel enough to hide S3 latency, polite enough not to hammer it. */
  private static readonly DOWNLOAD_CONCURRENCY = 6;

  /**
   * Download each requested hash's bytes and write hash-named files into
   * the images directory. Downloads run concurrently (bounded pool) —
   * hash-named files make completion order irrelevant. Returns hash →
   * filename for the rewrite step. Hashes missing from the URL map (e.g. an
   * image deleted from the file since generation) are skipped with a warning
   * — their placeholders remain. `onProgress` fires after each completed
   * download (success or failure) with the running count.
   */
  public static async downloadAndWrite(
    hashes: Set<string>,
    urls: Record<string, string>,
    outputDir: string,
    onProgress?: (completed: number, total: number) => void
  ): Promise<Map<string, string>> {
    const imagesDir = path.join(outputDir, IMAGES_DIR_NAME);
    const written = new Map<string, string>();
    if (hashes.size === 0) return written;
    await fs.ensureDir(imagesDir);

    const queue: string[] = [];
    for (const hash of hashes) {
      if (urls[hash]) {
        queue.push(hash);
      } else {
        console.warn(`Warning: image ${hash} was not returned by Get Image Fills — entry left unresolved`);
      }
    }

    const total = queue.length;
    let completed = 0;

    const worker = async (): Promise<void> => {
      for (let hash = queue.shift(); hash !== undefined; hash = queue.shift()) {
        try {
          const response = await fetch(urls[hash]);
          if (response.status !== 200) {
            console.warn(`Warning: image ${hash} download failed (HTTP ${response.status}) — entry left unresolved`);
          } else {
            const bytes = Buffer.from(await response.arrayBuffer());
            const filename = `${hash}.${ImageFillsResolver.detectExtension(bytes)}`;
            await fs.writeFile(path.join(imagesDir, filename), bytes);
            written.set(hash, filename);
          }
        } catch (error) {
          console.warn(`Warning: image ${hash} download failed (${error instanceof Error ? error.message : String(error)}) — entry left unresolved`);
        }
        completed++;
        onProgress?.(completed, total);
      }
    };

    const workers = Array.from(
      { length: Math.min(ImageFillsResolver.DOWNLOAD_CONCURRENCY, total) },
      () => worker()
    );
    await Promise.all(workers);

    return written;
  }

  /**
   * ADD `src` to unresolved registry entries in place — resolution never
   * replaces the entry, so the Figma identity in `$extensions` survives.
   * `relativePrefix` is the path from the referencing spec file's directory
   * to the images directory (e.g. `../assets/images/` from the output root,
   * one level deeper from a component subfolder).
   */
  public static applyResolvedSources(
    components: Array<{ spec: Record<string, unknown> }>,
    hashToFilename: Map<string, string>,
    relativePrefix: string
  ): number {
    let resolved = 0;
    for (const { spec } of components) {
      for (const images of ImageFillsResolver.registries(spec)) {
        for (const [key, value] of Object.entries(images)) {
          if (!isUnresolved(value)) continue;
          const filename = hashToFilename.get(imageHashOf(value)!);
          if (!filename) continue;
          // Rebuild with src first so it serializes ahead of $extensions.
          images[key] = { src: `${relativePrefix}${filename}`, ...value };
          resolved++;
        }
      }
    }
    return resolved;
  }

  /**
   * Detect the image format from magic bytes. Figma image fills are PNG,
   * JPEG, GIF, or WebP; anything unrecognized falls back to `png` with a
   * warning rather than an extension-less file.
   */
  public static detectExtension(bytes: Buffer): string {
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
    if (bytes.length >= 4 && bytes.toString('ascii', 0, 4) === 'GIF8') return 'gif';
    if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    console.warn('Warning: unrecognized image format — writing with .png extension');
    return 'png';
  }
}
