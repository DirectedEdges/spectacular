// Image foundations: every image the workspace holds, against what the specs
// reference — the same shape the icons page uses, and for the same reason. An
// image file is named for its content hash, so a grid of files alone says
// nothing; the names come from the fill styles the images were fetched from,
// and the usage from the component registries that point at them.
//
// A spec registry entry whose hash has no file is the failure this page makes
// visible, so images.json carries missing[] beside present[].
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import { resolveSpecsLayout } from '../../../utilities/specsLayout.js';
import { readCacheFile, type ImagesEntry } from '../../../cache/cache.js';

export interface ImagesJson {
  present: Array<{
    /** Asset filename, hash-named with its real extension. */
    file: string;
    hash: string;
    /** The Figma fill style this image was fetched from, when it came that way. */
    styleName?: string;
    /** Component keys whose registries point at this hash. */
    referencedBy: string[];
    bytes: number;
  }>;
  missing: Array<{ hash: string; referencedBy: string[] }>;
}

/** Image file extensions `fetch` and `--get-images` write, per their magic-byte detection. */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.gif', '.webp', '.svg'];

/**
 * Every `images` registry in a component spec document: the component's own and
 * one per subcomponent. Mirrors the registries the resolver walks, so a
 * subcomponent's image is not invisible here.
 */
function* registries(doc: unknown): IterableIterator<Record<string, unknown>> {
  if (!doc || typeof doc !== 'object') return;
  const spec = doc as Record<string, unknown>;
  if (spec.images && typeof spec.images === 'object') yield spec.images as Record<string, unknown>;
  const subcomponents = spec.subcomponents;
  if (subcomponents && typeof subcomponents === 'object') {
    for (const sub of Object.values(subcomponents as Record<string, unknown>)) {
      const images = (sub as Record<string, unknown> | null)?.images;
      if (images && typeof images === 'object') yield images as Record<string, unknown>;
    }
  }
}

/** The Figma image hash a registry entry carries, whether or not it has been resolved. */
function hashOf(entry: unknown): string | undefined {
  const figma = (entry as { $extensions?: Record<string, { imageHash?: unknown }> } | null)
    ?.$extensions?.['com.figma'];
  return typeof figma?.imageHash === 'string' ? figma.imageHash : undefined;
}

/** Every `*.yaml` and `*.json` spec file under a component folder, recursively. */
function specFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...specFiles(full));
    else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

/**
 * hash → component keys referencing it, read from the specs' image registries.
 * A spec file that will not parse is some other command's problem to report.
 */
function referencesByHash(specsDir: string): Map<string, Set<string>> {
  const referenced = new Map<string, Set<string>>();
  if (!fs.existsSync(specsDir)) return referenced;
  // Spec folders live where the layout says they do (ADR-096).
  const layout = resolveSpecsLayout(specsDir);
  for (const kind of ['component', 'composition'] as const) {
    for (const key of layout.folderNames(kind)) {
      const dir = layout.folderFor(kind, key);
      if (!fs.existsSync(dir)) continue;
      for (const file of specFiles(dir)) {
        let doc: unknown;
        try {
          doc = yaml.parse(fs.readFileSync(file, 'utf-8'));
        } catch {
          continue;
        }
        for (const images of registries(doc)) {
          for (const entry of Object.values(images)) {
            const hash = hashOf(entry);
            if (!hash) continue;
            const set = referenced.get(hash) ?? new Set<string>();
            set.add(key);
            referenced.set(hash, set);
          }
        }
      }
    }
  }
  return referenced;
}

/**
 * The library's images: the files on disk, named where a name is known, with
 * the components that reference each one.
 *
 * The files are the ground truth for what is available, and deliberately so —
 * both download paths write here (`fetch` with the `images` kind for the fill
 * styles a library curates, `generate --get-images` for the fills found on
 * components), and a content-addressed name means neither can tell which of
 * them put a given file there. Asking the directory is the only question whose
 * answer covers both.
 */
export function buildImagesData(
  specsDir: string,
  imagesDir: string,
  dataDir: string,
): ImagesJson | null {
  const files = fs.existsSync(imagesDir)
    ? fs.readdirSync(imagesDir)
        .filter(f => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()))
        .sort()
    : [];

  // hash → fill style name, for the images that were fetched from styles.
  const styleNames = new Map<string, string>();
  const cache = readCacheFile<ImagesEntry>(dataDir, 'images');
  for (const [name, entry] of Object.entries(cache?.entries ?? {})) {
    if (entry.imageHash) styleNames.set(entry.imageHash, name);
  }

  const referenced = referencesByHash(specsDir);

  if (files.length === 0 && referenced.size === 0) return null;

  const present = files.map(file => {
    const hash = path.basename(file, path.extname(file));
    return {
      file,
      hash,
      ...(styleNames.has(hash) ? { styleName: styleNames.get(hash)! } : {}),
      referencedBy: [...(referenced.get(hash) ?? [])].sort(),
      bytes: fs.statSync(path.join(imagesDir, file)).size,
    };
  });

  // Named before the unnamed, each group alphabetical: a curated set a reader
  // can scan by name is the point of the page, and a hash sorts as noise.
  present.sort((a, b) =>
    (a.styleName && b.styleName) ? a.styleName.localeCompare(b.styleName)
      : a.styleName ? -1
        : b.styleName ? 1
          : a.hash.localeCompare(b.hash));

  const onDisk = new Set(present.map(p => p.hash));
  return {
    present,
    missing: [...referenced.entries()]
      .filter(([hash]) => !onDisk.has(hash))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hash, by]) => ({ hash, referencedBy: [...by].sort() })),
  };
}
