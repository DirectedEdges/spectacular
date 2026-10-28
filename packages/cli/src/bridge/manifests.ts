// Manifest builders for a render payload.
//
// Every library-side lookup a render needs is read from the caches under
// {dataDir}/cache/ (see src/cache/cache.ts). They are built by `specs fetch` and
// `specs cache` from the fetched payloads, so no payload is parsed here — a file
// payload can be hundreds of megabytes and used to be parsed three times per render.
// Only the spec-side half of the instance manifest is derived at render time, since
// it reflects the workspace's specs rather than the library.
//
// Extracted from server.ts, where none of it could be reached by a test: that module
// opens a WebSocket on import, so importing it to call a pure function starts a server.
// Nothing here touches a socket, a connection or a request — it reads the caches and
// the workspace's specs and returns plain objects.

import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve as pathResolve, basename } from 'path';
import { parse } from 'yaml';
import { countUnpublished, type VariablesIndex } from '../utilities/variablesIndex.js';
import { formatKey } from '../utilities/formatKey.js';
import { specFolderKey } from '../utilities/specFolderKey.js';
import {
  readCacheFile,
  type ComponentsEntry, type StylesEntry, type VariablesEntry, type IconsEntry,
} from '../cache/cache.js';

/** id = same-file node id (fast path); key = published cross-file key (fallback import). */
export type ComponentEntry = { id: string; key?: string };
export type Manifest = Record<string, ComponentEntry>;
export type GlyphManifest = Record<string, ComponentEntry>;
/** Token name → the handles that name resolves to. A spec references a variable by name only,
 *  so this is what gives the name meaning on the render side. */
export type VariablesManifest = VariablesIndex;

// Every library-side lookup a render needs is read from the caches under
// {dataDir}/cache/ (see src/cache/cache.ts). They are built by `specs fetch` and
// `specs cache` from the fetched payloads, so no payload is parsed here — a file
// payload can be hundreds of megabytes and used to be parsed three times per render.
// Only the spec-side half of the instance manifest is derived at render time, since
// it reflects the workspace's specs rather than the library.

/**
 * Build a flat manifest of spec key → component entry by scanning specsDir.
 * Also layers in subcomponent ref aliases from the current spec. Published
 * cross-file keys come from the components cache, which records them per node id
 * across every fetched library.
 */
export function buildManifest(spec: Record<string, unknown>, specsDir: string, dataDir: string, keyFormat?: string): Manifest {
  const manifest: Manifest = {};

  const cache = readCacheFile<ComponentsEntry>(dataDir, 'components');
  const entryFor = (id: string): ComponentEntry => {
    const key = cache?.entries[id]?.key;
    return key ? { id, key } : { id };
  };

  const specFiles = collectSpecFiles(specsDir);
  // Deduplicate by key: first nodeId found wins (variants.yaml before api.yaml, etc.)
  for (const { key, path } of specFiles) {
    if (manifest[key]) continue; // already have a nodeId for this key
    try {
      const s = parse(readFileSync(path, 'utf8')) as { metadata?: { source?: { nodeId?: string } } };
      const nodeId = s.metadata?.source?.nodeId;
      if (nodeId) manifest[key] = entryFor(nodeId);
    } catch {
      // Skip unreadable or non-spec files silently
    }
  }

  // Layer 2: alias subcomponent ref keys from the current spec.
  //
  // A subcomponent with no node id of its own is matched by title against the keys
  // layer 1 collected, which are spec folder names — so the title goes through
  // `specFolderKey`, the one derivation of those names. Not `formatKey`: that answers
  // what `settings.spec.keys` asks for, and a folder name has always been camelCase
  // regardless of the setting.
  const specTyped = spec as {
    subcomponents?: Record<string, { source?: { nodeId?: string }; title?: string }>;
    components?: Record<string, { subcomponents?: Record<string, { source?: { nodeId?: string }; title?: string }> }>;
  };
  const subcomponents = specTyped.subcomponents ?? Object.values(specTyped.components ?? {})[0]?.subcomponents;
  if (subcomponents) {
    for (const [refKey, sub] of Object.entries(subcomponents)) {
      if (sub.source?.nodeId) {
        manifest[refKey] = entryFor(sub.source.nodeId);
      } else if (sub.title) {
        const titleKey = specFolderKey(sub.title);
        if (titleKey && manifest[titleKey]) manifest[refKey] = manifest[titleKey];
      }
    }
  }

  // Layer 3: the components the workspace has no spec for.
  //
  // A spec names an instance's component with a formatted key, and that transform is lossy
  // — "DS Link/On overlay/M/False/Rest/Start" formats to "dsLinkOnOverlayMFalseRestStart"
  // with the separators gone — so the name cannot be reconstructed from the key. It can be
  // recognised, though: format the library's own component names the same way and compare.
  // These resolve by published key on the render side, which is what makes a component from
  // another file placeable at all.
  //
  // Only names this spec actually references are added, so the payload does not grow by the
  // library's entire component list. Spec-derived entries always win — a workspace component
  // is the more specific answer, and its node id is local to the file being rendered into.
  const referenced = collectComponentNames(spec);
  if (referenced.size > 0 && cache) {
    const byFormattedName = new Map<string, ComponentEntry>();
    for (const [id, entry] of Object.entries(cache.entries)) {
      if (!entry.name) continue;
      const formatted = formatKey(entry.name, keyFormat);
      // First occurrence wins. Distinct components can format to the same key (the transform
      // is lossy), and nothing in the payload says which one a spec meant.
      if (!byFormattedName.has(formatted)) byFormattedName.set(formatted, { id, key: entry.key });
    }
    let added = 0;
    for (const name of referenced) {
      if (manifest[name]) continue;
      const found = byFormattedName.get(name);
      if (found) { manifest[name] = found; added++; }
    }
    if (added > 0) console.log(`  Manifest: +${added} from library components with no spec`);
  }

  console.log(`  Manifest: ${Object.keys(manifest).length} entries`);
  return manifest;
}

/**
 * Every component name a spec references, at any depth — variants, examples, slot content,
 * subcomponents. `$ref` forms are skipped: those already resolve within the spec.
 *
 * Two surfaces name components. `instanceOf` names the component an element instantiates.
 * A `propConfigurations` value names one too when the property behind it is an instance
 * swap — an icon on an avatar, say — and the spec gives no clue which of its values those
 * are, since it records the property's value, not its Figma type. So every string value is
 * offered up: a name that matches no library component simply finds nothing, and one that
 * does is only ever used by a swap that asked for it.
 */
export function collectComponentNames(node: unknown, acc = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) { for (const item of node) collectComponentNames(item, acc); return acc; }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'instanceOf' && typeof value === 'string') acc.add(value);
    else if (key === 'propConfigurations' && value && typeof value === 'object') {
      collectConfiguredNames(value as Record<string, unknown>, acc);
    }
    else collectComponentNames(value, acc);
  }
  return acc;
}

/**
 * The component names a `propConfigurations` block offers up, at its own level and inside
 * every `$nested` entry.
 *
 * A nested entry is `{ path, <propKey>: value }` (ADR-052): the path addresses a
 * descendant instance and the remaining keys are the configurations applied there. So a
 * configured value names a component at that depth exactly as it does at the top level,
 * and it has to be collected the same way — a component referenced only from a nested
 * entry would otherwise be missing from the manifest, and render would place the
 * descendant without it, silently.
 *
 * `path` is skipped. Its segments are `instanceOf` element keys within the spec, not
 * component names, and offering them up would ask the library for components that were
 * never meant to be found.
 */
function collectConfiguredNames(configs: Record<string, unknown>, acc: Set<string>): void {
  for (const [propKey, configured] of Object.entries(configs)) {
    if (propKey === '$nested') {
      for (const entry of Array.isArray(configured) ? configured : []) {
        if (!entry || typeof entry !== 'object') continue;
        for (const [nestedKey, nestedValue] of Object.entries(entry as Record<string, unknown>)) {
          if (nestedKey === 'path') continue;
          if (typeof nestedValue === 'string') acc.add(nestedValue);
          // An entry may re-declare the key rather than carry props directly; it reads the
          // same way at either depth, so it gets the same dispatch.
          else if (nestedKey === 'propConfigurations' && nestedValue && typeof nestedValue === 'object') {
            collectConfiguredNames(nestedValue as Record<string, unknown>, acc);
          }
          else collectComponentNames(nestedValue, acc);
        }
      }
      continue;
    }
    if (typeof configured === 'string') acc.add(configured);
    else collectComponentNames(configured, acc);
  }
}

/**
 * Glyph name → component entry, straight from the icons cache. The cache is built by
 * matching the configured glyphs convention against the fetched file, so render depends
 * on no scan output: a scan manifest is generated and then authored, which makes it a
 * poor thing to resolve against.
 */
export function buildGlyphManifest(dataDir: string): GlyphManifest {
  const cache = readCacheFile<IconsEntry>(dataDir, 'icons');
  const result: GlyphManifest = {};
  for (const [name, entry] of Object.entries(cache?.entries ?? {})) {
    result[name] = entry.key ? { id: entry.id, key: entry.key } : { id: entry.id };
  }
  console.log(`  Glyph manifest: ${Object.keys(result).length} glyphs`);
  return result;
}

/** Style name → published key, for the style types a spec can reference. */
export function buildStylesManifest(dataDir: string): Record<string, string> {
  const cache = readCacheFile<StylesEntry>(dataDir, 'styles');
  const result: Record<string, string> = {};
  for (const [name, entry] of Object.entries(cache?.entries ?? {})) {
    result[name] = entry.key;
  }
  console.log(`  Styles manifest: ${Object.keys(result).length} entries`);
  return result;
}

/** Token name → the handles it resolves to. */
export function buildVariablesManifest(dataDir: string): VariablesManifest {
  const cache = readCacheFile<VariablesEntry>(dataDir, 'variables');
  const index: VariablesManifest = {};
  for (const [name, entry] of Object.entries(cache?.entries ?? {})) {
    index[name] = { key: entry.key, id: entry.id, published: entry.published };
  }

  const names = Object.keys(index).length;
  if (names === 0) {
    console.warn(`  Variables manifest: no named variables cached — variable binding disabled`);
    return index;
  }

  const unpublished = countUnpublished(index);
  const suffix = unpublished > 0 ? ` (${unpublished} not importable from the library — id fallback only)` : '';
  console.log(`  Variables manifest: ${names} token names${suffix}`);
  return index;
}

/**
 * Collect all spec YAML files from a specs directory.
 * Handles both flat layouts (specsDir/foo.yaml) and subdirectory layouts
 * (specsDir/foo/variants.yaml, specsDir/foo/api.yaml, etc.).
 * Returns an array of { key, path } where key is the camelCase component name.
 */
export function collectSpecFiles(specsDir: string): Array<{ key: string; path: string }> {
  let entries: string[];
  try {
    entries = readdirSync(specsDir);
  } catch (e) {
    throw new Error(`Cannot read specs directory "${specsDir}": ${(e as Error).message}`);
  }

  const files: Array<{ key: string; path: string }> = [];
  for (const entry of entries) {
    const entryPath = pathResolve(specsDir, entry);
    let stat;
    try { stat = statSync(entryPath); } catch { continue; }

    if (stat.isFile() && entry.endsWith('.yaml')) {
      // Flat layout: specsDir/foo.yaml → key "foo"
      files.push({ key: basename(entry, '.yaml'), path: entryPath });
    } else if (stat.isDirectory()) {
      // Subdirectory layout: specsDir/foo/variants.yaml → key "foo"
      // Prefer variants.yaml; also collect api.yaml and others for nodeId scanning.
      let subEntries: string[];
      try { subEntries = readdirSync(entryPath); } catch { continue; }
      for (const sub of subEntries) {
        if (sub.endsWith('.yaml')) {
          files.push({ key: entry, path: pathResolve(entryPath, sub) });
        }
      }
    }
  }

  return files;
}
