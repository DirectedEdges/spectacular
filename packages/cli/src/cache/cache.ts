/**
 * Render lookup caches.
 *
 * Render resolves a spec's references — component ids, style names, token names, glyph
 * names — against data fetched from Figma. That data arrives as whole API responses: a
 * file payload can be hundreds of megabytes, of which render needs a few hundred small
 * entries. Re-deriving those entries per render meant parsing the whole payload every
 * time, which cost seconds before any Figma work began.
 *
 * These caches are those entries, extracted once and written to `<dataDir>/cache/` as
 * merged YAML files — one per concern, covering every fetched library:
 *
 * | file              | maps                              | built from             |
 * |-------------------|-----------------------------------|------------------------|
 * | `components.yaml` | node id → published key + name    | `<alias>.file/` (or `.file.json`) |
 * | `styles.yaml`     | style name → key + type           | `<alias>.file/` (or `.file.json`) |
 * | `variables.yaml`  | token name → key, id, published   | `<alias>.variables.json` |
 * | `icons.yaml`      | glyph name → node id + key        | `<alias>.file/` (or `.file.json`) |
 * | `images.yaml`     | image hash → src, style name, usage | `<alias>.images.json` **and** `<alias>.component-images.json` |
 *
 * Merged rather than per-library, because render wants one lookup, not N. Each entry
 * records the alias it came from: node ids are file-scoped, so knowing an entry's origin
 * is what lets render decide whether an id is usable at all — and it lets one library be
 * rebuilt without re-parsing the rest.
 *
 * Every file carries a `sources` block naming the payload each partition was built from,
 * with its size and mtime. That block is the staleness check: a `stat` per source, and any
 * mismatch means the cache no longer describes the data on disk. Render validates and
 * fails; `specs cache` rebuilds.
 *
 * A partition is usually one alias. Images are the exception: two commands find images
 * independently — `fetch` the ones a library carries on fill styles, `generate
 * --get-images` the ones placed on components — so that concern has a partition per
 * producer per alias, and neither producer's rebuild can disturb the other's provenance.
 *
 * @packageDocumentation
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'yaml';
import { buildVariablesIndex } from '../utilities/variablesIndex.js';
import { collectGlyphComponents } from '../utilities/glyphComponents.js';
import { glyphConventionSignature, hasGlyphConvention, type GlyphsConvention } from '../utilities/glyphConvention.js';
import { readJsonPayload } from '../utilities/payloadRead.js';
import { SectionedFile, shadowIngestEnabled, shadowCompare } from '../utilities/sectionedFile.js';

/** The caches, by concern. Order is display order for reporting. */
export const CACHE_CONCERNS = ['components', 'styles', 'variables', 'icons', 'images'] as const;
export type CacheConcern = (typeof CACHE_CONCERNS)[number];

/** What one alias's slice of a cache was built from — the staleness check's input. */
export interface CacheSource {
  /** Payload file name, relative to the data directory. */
  from: string;
  bytes: number;
  mtime: string;
  /** icons.yaml only: signature of the `glyphs` convention the names were extracted
   *  with (ADR-103). A config edit to either form changes what the entries mean, with
   *  no change to any fetched file. */
  glyphConvention?: string;
}

/**
 * Where an image lives in Figma — not which command found it.
 *
 * `style` is a published fill style's paint, `page` an asset frame a library laid
 * out and named to the `images.match` pattern (ADR-117), `component` a fill on a
 * component. One image can be more than one of these.
 */
export type ImageOrigin = 'style' | 'page' | 'component';

const IMAGE_ORIGINS: readonly ImageOrigin[] = ['style', 'page', 'component'];

function isImageOrigin(value: unknown): value is ImageOrigin {
  return typeof value === 'string' && (IMAGE_ORIGINS as readonly string[]).includes(value);
}

export interface CacheFile<E> {
  /**
   * Partition key → the payload those entries came from.
   *
   * The key is the alias for every concern built from a single payload per
   * source. `images.yaml` is built from two — one per producer — so its keys
   * are `<alias>:styles` and `<alias>:components`. Provenance has always been
   * one record per payload file; what images added is a second payload file
   * per alias, not a second kind of record.
   */
  sources: Record<string, CacheSource>;
  entries: Record<string, E>;
}

/** A concern's provenance for one alias: partition key → the payload it was built from. */
export type Provenance = Array<[string, CacheSource]>;

/** The common case — a concern with one payload per alias, keyed by the alias. */
function byAlias(alias: string, source: CacheSource | null): Provenance {
  return source ? [[alias, source]] : [];
}

/**
 * What one alias's payloads on disk say every concern's provenance should be.
 *
 * Shared by the refresh and validate loops so the two cannot disagree about
 * what counts as current — a divergence there would let render accept a cache
 * `specs cache` thinks is stale, or the reverse.
 */
function currentProvenance(
  dataDir: string,
  alias: string,
  glyphSignature: string | undefined,
): Record<CacheConcern, Provenance> {
  const fileSource = fileSourceOf(dataDir, alias);
  return {
    components: byAlias(alias, fileSource),
    styles: byAlias(alias, fileSource),
    variables: byAlias(alias, sourceOf(dataDir, `${alias}.variables.json`)),
    icons: byAlias(alias, fileSourceOf(dataDir, alias, glyphSignature)),
    images: IMAGE_PRODUCERS.flatMap(({ producer, suffix }) => {
      const source = sourceOf(dataDir, `${alias}.${suffix}.json`);
      return source ? [[`${alias}:${producer}`, source] as [string, CacheSource]] : [];
    }),
  };
}

/**
 * Component/component-set node id → its published key and raw Figma name. Keyless nodes are
 * omitted: without a key there is nothing to record beyond the id the caller already holds.
 *
 * The name is what lets the bridge resolve an `instanceOf` value naming a component the
 * workspace has no spec for. A spec records `instanceOf` as a formatted key, and that
 * transform is lossy — "DS Link/On overlay/M" and "DS Link On Overlay M" format
 * identically — so the match is made by formatting these names the same way rather than
 * by inverting the key. Stored raw, and formatted at manifest-build time, so a change to
 * `format.keys` in config needs no cache rebuild.
 */
export interface ComponentsEntry { key: string; name: string; file: string }
export interface StylesEntry { key: string; type: 'FILL' | 'TEXT' | 'EFFECT'; file: string }
export interface VariablesEntry { key: string; id: string; published: boolean; file: string }
export interface IconsEntry { id: string; key?: string; file: string }

/**
 * One image the library holds, keyed by its Figma image hash (specs#889).
 *
 * Keyed by hash because it is the only identifier every image has. A published
 * fill style names its image; a fill found on a component does not — that
 * registry key is derived from a layer and scoped to one component, so there is
 * no library-wide name to promote. Keying by hash is also what makes the two
 * producers' findings merge rather than compete: an image that is both a
 * curated fill style and in use on a component is one file and one entry
 * carrying both facts. `components.yaml` sets the precedent, keying by node id
 * rather than name where the name is not the reliable handle.
 *
 * `src` is what the React and Web Components readers resolve an `$image`
 * pointer from; an entry without one renders nothing, and ADR-063 deliberately
 * removed their ability to guess a filename from the hash. It is relative to
 * the config directory, and absent until the bytes are downloaded — a known,
 * reportable state rather than a failure.
 */
export interface ImagesEntry {
  src?: string;
  /**
   * What Figma calls this image — the name of the fill style carrying it, which
   * is the only name an image ever has. Absent for an image found on a
   * component, whose registry key is derived from a layer and scoped to that
   * component. Not `styleName`: `origin` already says a style carries it, and
   * `name` is what `components.yaml` calls the Figma name of a thing.
   */
  name?: string;
  /** Component keys whose registries reference it, when a component uses it. */
  usedBy?: string[];
  /**
   * Where this image lives in Figma — not which command found it. A list, so
   * an image that is both style-carried and component-used says so rather than
   * one producer having to win.
   */
  origin: ImageOrigin[];
  file: string;
}

export type AnyCacheEntry = ComponentsEntry | StylesEntry | VariablesEntry | IconsEntry | ImagesEntry;

/**
 * One alias's contribution to every cache.
 *
 * `sources` is a list rather than a single record because one concern —
 * images — is built from two payloads per alias. Carrying the list uniformly
 * keeps the refresh and validate loops free of a per-concern branch; every
 * other concern contributes exactly one entry, keyed by the alias.
 */
interface AliasSlice {
  components: { sources: Provenance; entries: Record<string, ComponentsEntry> };
  styles: { sources: Provenance; entries: Record<string, StylesEntry> };
  variables: { sources: Provenance; entries: Record<string, VariablesEntry> };
  icons: { sources: Provenance; entries: Record<string, IconsEntry> };
  images: { sources: Provenance; entries: Record<string, ImagesEntry> };
}

export interface CacheOptions {
  dataDir: string;
  /** Aliases declared in config, in declaration order. */
  aliases: string[];
  /** The library's `glyphs` convention — both forms drive icon extraction (ADR-103). */
  glyphs?: GlyphsConvention;
  /** Rebuild every alias, whether or not its provenance still matches. */
  force?: boolean;
}

/** A payload that exists on disk but could not be read — its alias contributed
 *  nothing, and that absence must be reported, never inferred from counts. */
export interface CacheFailure {
  alias: string;
  /** Payload file name, relative to the data directory. */
  file: string;
  reason: string;
}

export interface CacheReport {
  /** Aliases whose entries were re-derived. */
  rebuilt: string[];
  /** Aliases whose cached provenance still matched the payload on disk. */
  current: string[];
  /** Aliases declared in config with no fetched payload — skipped, not an error here. */
  unfetched: string[];
  /** Entry counts per concern, after the rebuild. */
  counts: Record<CacheConcern, number>;
  /** Entry counts per alias — what each source actually contributed. */
  aliasCounts: Record<string, Record<CacheConcern, number>>;
  /** Payloads on disk that could not be read. Never empty silently: a failed
   *  alias appears here AND contributes zero entries. */
  failures: CacheFailure[];
}

// ── Paths ─────────────────────────────────────────────────────────────────────

export function cacheDir(dataDir: string): string {
  return join(dataDir, 'cache');
}

export function cachePath(dataDir: string, concern: CacheConcern): string {
  return join(cacheDir(dataDir), `${concern}.yaml`);
}

// ── Read / write ──────────────────────────────────────────────────────────────

export function readCacheFile<E>(dataDir: string, concern: CacheConcern): CacheFile<E> | null {
  const path = cachePath(dataDir, concern);
  if (!existsSync(path)) return null;
  try {
    const parsed = parse(readFileSync(path, 'utf8')) as CacheFile<E> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return { sources: parsed.sources ?? {}, entries: parsed.entries ?? {} };
  } catch {
    return null; // unreadable is indistinguishable from absent, and both mean "rebuild"
  }
}

function writeCacheFile<E>(dataDir: string, concern: CacheConcern, data: CacheFile<E>): void {
  mkdirSync(cacheDir(dataDir), { recursive: true });
  const header =
    `# Generated by \`specs cache\` — derived from fetched Figma data, safe to delete.\n` +
    `# Rebuild with \`specs cache\`. Do not edit by hand.\n`;
  writeFileSync(cachePath(dataDir, concern), header + stringify(data, { lineWidth: 0 }), 'utf8');
}

// ── Provenance ────────────────────────────────────────────────────────────────

function sourceOf(dataDir: string, fileName: string, glyphSignature?: string): CacheSource | null {
  const path = join(dataDir, fileName);
  if (!existsSync(path)) return null;
  const stat = statSync(path);
  return {
    from: fileName,
    bytes: stat.size,
    mtime: stat.mtime.toISOString(),
    ...(glyphSignature ? { glyphConvention: glyphSignature } : {}),
  };
}

/** Provenance for an alias's file payload: the monolithic file when present,
 *  else the split artifact (post-flip fetches write only the split — its
 *  manifest carries the original payload's byte count, and the manifest file's
 *  mtime marks the fetch). */
function fileSourceOf(dataDir: string, alias: string, glyphSignature?: string): CacheSource | null {
  const monolithic = sourceOf(dataDir, `${alias}.file.json`, glyphSignature);
  if (monolithic) return monolithic;
  const manifestPath = join(dataDir, `${alias}.file`, 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  const stat = statSync(manifestPath);
  let bytes = stat.size;
  try {
    bytes = (JSON.parse(readFileSync(manifestPath, 'utf8')) as { sourceBytes?: number }).sourceBytes ?? bytes;
  } catch { /* unreadable manifest surfaces later as a read failure */ }
  return {
    from: `${alias}.file/`,
    bytes,
    mtime: stat.mtime.toISOString(),
    ...(glyphSignature ? { glyphConvention: glyphSignature } : {}),
  };
}

/** True when a recorded source still describes the file on disk. A payload that has been
 *  re-fetched, or a glyphs convention that has been edited in config, fails this. */
function matches(recorded: CacheSource | undefined, current: CacheSource | null): boolean {
  if (!recorded || !current) return false;
  return recorded.from === current.from
    && recorded.bytes === current.bytes
    && recorded.mtime === current.mtime
    && recorded.glyphConvention === current.glyphConvention;
}

// ── Builders ──────────────────────────────────────────────────────────────────

/** Read one payload; a failure returns its reason instead of vanishing. */
function readJson(path: string): { data?: Record<string, unknown>; error?: string } {
  try {
    return { data: readJsonPayload(path) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Derive one alias's entries for all four concerns. The file payload is parsed once and
 * feeds three of them; the variables payload is separate and much smaller.
 * A payload that exists but cannot be read lands in `failures` — never a silent skip.
 */
function buildAliasSlice(
  alias: string,
  dataDir: string,
  glyphs: GlyphsConvention | undefined,
  failures: CacheFailure[],
): AliasSlice {
  const glyphSignature = glyphConventionSignature(glyphs);
  const empty: AliasSlice = {
    components: { sources: [], entries: {} },
    styles: { sources: [], entries: {} },
    variables: { sources: [], entries: {} },
    icons: { sources: [], entries: {} },
    images: { sources: [], entries: {} },
  };

  const fileName = `${alias}.file.json`;
  const fileSource = fileSourceOf(dataDir, alias);

  // Sectioned path (specs#561): the page-split artifact serves the root maps
  // without reading the payload as one string, and the glyph walk streams
  // page by page. The monolithic file remains the fallback until the flip.
  let sectioned: SectionedFile | null = null;
  try {
    sectioned = SectionedFile.open(dataDir, alias);
  } catch (error) {
    // e.g. unknown format version — loud, and the monolithic path still runs.
    failures.push({ alias, file: `${alias}.file/`, reason: error instanceof Error ? error.message : String(error) });
  }

  if (sectioned && fileSource) {
    const data = sectioned.root();
    buildFileConcerns(alias, data, empty, glyphSignature, fileSource, dataDir);
    if (hasGlyphConvention(glyphs)) {
      for (const entry of sectioned.pageEntries()) {
        const page = sectioned.loadPage(entry);
        collectGlyphsInto(alias, page, glyphs, empty);
        sectioned.releasePage(entry.id);
      }
    }
    if (shadowIngestEnabled()) {
      const { data: monoData } = readJson(join(dataDir, fileName));
      if (monoData) {
        const shadow: AliasSlice = { components: { sources: [], entries: {} }, styles: { sources: [], entries: {} }, variables: { sources: [], entries: {} }, icons: { sources: [], entries: {} }, images: { sources: [], entries: {} } };
        buildFileConcerns(alias, monoData, shadow, glyphSignature, fileSource, dataDir);
        collectGlyphsInto(alias, (monoData as { document?: unknown }).document, glyphs, shadow);
        shadowCompare(`cache:${alias}:components`, shadow.components.entries, empty.components.entries);
        shadowCompare(`cache:${alias}:styles`, shadow.styles.entries, empty.styles.entries);
        shadowCompare(`cache:${alias}:icons`, shadow.icons.entries, empty.icons.entries);
      }
    }
  } else if (fileSource) {
    const { data, error } = readJson(join(dataDir, fileName));
    if (error) failures.push({ alias, file: fileName, reason: error });
    if (data) {
      buildFileConcerns(alias, data, empty, glyphSignature, fileSource, dataDir);
      collectGlyphsInto(alias, (data as { document?: unknown }).document, glyphs, empty);
    }
  }

  const variablesName = `${alias}.variables.json`;
  const variablesSource = sourceOf(dataDir, variablesName);
  if (variablesSource) {
    const { data, error } = readJson(join(dataDir, variablesName));
    if (error) failures.push({ alias, file: variablesName, reason: error });
    if (data) {
      const index = buildVariablesIndex((data.meta ? data : { meta: data }) as Parameters<typeof buildVariablesIndex>[0]);
      for (const [name, entry] of Object.entries(index)) {
        empty.variables.entries[name] = { ...entry, file: alias };
      }
      empty.variables.sources = byAlias(alias, variablesSource);
    }
  }

  buildImagesConcern(alias, dataDir, empty, failures);

  return empty;
}

/** The two payloads the images concern merges, and the `origin` each contributes. */
const IMAGE_PRODUCERS = [
  { producer: 'styles', suffix: 'images', origin: 'style' },
  { producer: 'components', suffix: 'component-images', origin: 'component' },
] as const;

/**
 * Every image the library holds, merged from both producers (specs#889).
 *
 * `fetch --only <alias>,images` writes the fill-style half and
 * `generate --get-images` writes the component half; each records what it
 * found, because neither can derive the other's. An image both of them found
 * is one entry: keyed by hash, they merge instead of competing for a name.
 *
 * Unlike the other concerns, this one always rebuilds from its payloads rather
 * than carrying entries forward per producer. Carry-forward exists because a
 * file payload runs to hundreds of megabytes; these are a few kilobytes. And an
 * entry can be co-owned — both style-carried and component-used — so carrying
 * one producer's half forward while rebuilding the other's would duplicate or
 * drop it. Re-reading both costs nothing and cannot be wrong.
 */
function buildImagesConcern(
  alias: string,
  dataDir: string,
  slice: AliasSlice,
  failures: CacheFailure[],
): void {
  for (const { producer, suffix, origin } of IMAGE_PRODUCERS) {
    const name = `${alias}.${suffix}.json`;
    const source = sourceOf(dataDir, name);
    if (!source) continue;

    const { data, error } = readJson(join(dataDir, name));
    if (error) failures.push({ alias, file: name, reason: error });
    if (!data) continue;

    for (const image of Array.isArray(data.images) ? data.images as Array<Record<string, unknown>> : []) {
      const { imageHash, src, name, usedBy } = image;
      if (typeof imageHash !== 'string') continue;
      const existing = slice.images.entries[imageHash];
      // An entry states its own origin, because one payload can carry more than
      // one: `fetch` finds images on fill styles and laid out on a page, and the
      // two are different facts about where the image lives. The producer's
      // declared origin is the fallback for a payload that does not say.
      const entryOrigin = isImageOrigin(image.origin) ? image.origin : origin;
      slice.images.entries[imageHash] = {
        // A producer that resolved the bytes wins over one that did not: the
        // path is the same file either way, and an absent src means unresolved.
        ...(typeof src === 'string' ? { src } : existing?.src ? { src: existing.src } : {}),
        ...(typeof name === 'string' ? { name } : existing?.name ? { name: existing.name } : {}),
        ...(mergeUsedBy(existing?.usedBy, usedBy)),
        origin: existing?.origin.includes(entryOrigin)
          ? existing.origin
          : existing ? [...existing.origin, entryOrigin] : [entryOrigin],
        file: alias,
      };
    }
    // Recorded whether or not the payload yielded entries, so "this producer
    // ran and found nothing" stays distinguishable from "it never ran".
    slice.images.sources.push([`${alias}:${producer}`, source]);
  }
}

/** The union of two producers' component lists, sorted, or nothing when neither has one. */
function mergeUsedBy(existing: string[] | undefined, incoming: unknown): { usedBy?: string[] } {
  const next = Array.isArray(incoming) ? incoming.filter((c): c is string => typeof c === 'string') : [];
  const merged = [...new Set([...(existing ?? []), ...next])].sort();
  return merged.length > 0 ? { usedBy: merged } : {};
}

/** The root-map concerns (components, styles, icon provenance) from a payload's
 *  root object — shared verbatim by the sectioned and monolithic paths. */
function buildFileConcerns(
  alias: string,
  data: Record<string, unknown>,
  slice: AliasSlice,
  glyphSignature: string | undefined,
  fileSource: CacheSource,
  dataDir: string,
): void {
  const refs = {
    ...((data.components as Record<string, { key?: string; name?: string }> | undefined) ?? {}),
    ...((data.componentSets as Record<string, { key?: string; name?: string }> | undefined) ?? {}),
  };
  for (const [id, meta] of Object.entries(refs)) {
    if (meta?.key) slice.components.entries[id] = { key: meta.key, name: meta.name ?? '', file: alias };
  }
  slice.components.sources = byAlias(alias, fileSource);

  const styles = (data.styles as Record<string, { styleType?: string; name?: string; key?: string }> | undefined) ?? {};
  for (const meta of Object.values(styles)) {
    const type = meta.styleType;
    if ((type === 'EFFECT' || type === 'TEXT' || type === 'FILL') && meta.name && meta.key) {
      slice.styles.entries[meta.name] = { key: meta.key, type, file: alias };
    }
  }
  slice.styles.sources = byAlias(alias, fileSource);

  // An undeclared convention means this workspace has no glyph convention — the cache
  // is written empty rather than skipped, so "no glyphs" stays distinguishable from
  // "never built".
  slice.icons.sources = byAlias(alias, fileSourceOf(dataDir, alias, glyphSignature));
}

/** Record glyph components found under one document or page node. First
 *  occurrence wins across calls, as scan does — callers may walk page by page. */
function collectGlyphsInto(
  alias: string,
  docOrPage: unknown,
  glyphs: GlyphsConvention | undefined,
  slice: AliasSlice,
): void {
  if (!hasGlyphConvention(glyphs) || !docOrPage) return;
  for (const glyph of collectGlyphComponents(docOrPage, glyphs)) {
    if (slice.icons.entries[glyph.name]) continue; // first occurrence wins, as scan does
    const key = slice.components.entries[glyph.id]?.key;
    slice.icons.entries[glyph.name] = key ? { id: glyph.id, key, file: alias } : { id: glyph.id, file: alias };
  }
}

// ── Refresh ───────────────────────────────────────────────────────────────────

/**
 * Bring the caches in line with the fetched data on disk.
 *
 * An alias whose recorded provenance still matches is left alone — its entries are copied
 * forward untouched — so refreshing after fetching one library parses that library only.
 * An alias with no fetched payload is skipped rather than reported as an error: not having
 * fetched something yet is a normal state for this command, and only render is in a
 * position to call it a problem.
 */
export function refreshCache(options: CacheOptions): CacheReport {
  const { dataDir, aliases, glyphs, force } = options;
  const glyphSignature = glyphConventionSignature(glyphs);

  const existing = {
    components: readCacheFile<ComponentsEntry>(dataDir, 'components'),
    styles: readCacheFile<StylesEntry>(dataDir, 'styles'),
    variables: readCacheFile<VariablesEntry>(dataDir, 'variables'),
    icons: readCacheFile<IconsEntry>(dataDir, 'icons'),
    images: readCacheFile<ImagesEntry>(dataDir, 'images'),
  };

  const next: { [K in CacheConcern]: CacheFile<AnyCacheEntry> } = {
    components: { sources: {}, entries: {} },
    styles: { sources: {}, entries: {} },
    variables: { sources: {}, entries: {} },
    icons: { sources: {}, entries: {} },
    images: { sources: {}, entries: {} },
  };

  const report: CacheReport = {
    rebuilt: [],
    current: [],
    unfetched: [],
    counts: { components: 0, styles: 0, variables: 0, icons: 0, images: 0 },
    aliasCounts: {},
    failures: [],
  };

  for (const alias of aliases) {
    const provenance = currentProvenance(dataDir, alias, glyphSignature);
    if (CACHE_CONCERNS.every(concern => provenance[concern].length === 0)) {
      report.unfetched.push(alias);
      continue;
    }

    const stale = force || CACHE_CONCERNS.some(concern =>
      // A payload that isn't fetched has nothing to be stale about; one that is
      // must match what its partition recorded.
      provenance[concern].some(([key, current]) => !matches(existing[concern]?.sources[key], current)));

    report.aliasCounts[alias] = { components: 0, styles: 0, variables: 0, icons: 0, images: 0 };

    if (!stale) {
      for (const concern of CACHE_CONCERNS) {
        const from = existing[concern];
        if (!from) continue;
        let carried = false;
        for (const [key] of provenance[concern]) {
          if (!from.sources[key]) continue;
          next[concern].sources[key] = from.sources[key];
          carried = true;
        }
        if (!carried) continue;
        for (const [key, entry] of Object.entries(from.entries)) {
          if ((entry as { file?: string }).file === alias) {
            next[concern].entries[key] = entry;
            report.aliasCounts[alias][concern]++;
          }
        }
      }
      report.current.push(alias);
      continue;
    }

    const slice = buildAliasSlice(alias, dataDir, glyphs, report.failures);
    for (const concern of CACHE_CONCERNS) {
      const built = slice[concern];
      report.aliasCounts[alias][concern] = Object.keys(built.entries).length;
      if (built.sources.length === 0) continue;
      for (const [key, source] of built.sources) next[concern].sources[key] = source;
      Object.assign(next[concern].entries, built.entries);
    }
    report.rebuilt.push(alias);
  }

  for (const concern of CACHE_CONCERNS) {
    writeCacheFile(dataDir, concern, next[concern]);
    report.counts[concern] = Object.keys(next[concern].entries).length;
  }

  return report;
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface CacheProblem {
  concern: CacheConcern;
  alias: string;
  reason: 'missing' | 'stale';
}

/**
 * Check the caches against the payloads on disk, without writing anything. Every declared
 * alias must be present and current in every cache whose payload it has fetched — render
 * calls this and refuses to run on any problem, because a stale lookup binds a spec to the
 * wrong variable or drops an instance, which surfaces far from its cause.
 */
export function validateCache(options: Omit<CacheOptions, 'force'>): CacheProblem[] {
  const { dataDir, aliases, glyphs } = options;
  const glyphSignature = glyphConventionSignature(glyphs);
  const problems: CacheProblem[] = [];

  const files = {
    components: readCacheFile<ComponentsEntry>(dataDir, 'components'),
    styles: readCacheFile<StylesEntry>(dataDir, 'styles'),
    variables: readCacheFile<VariablesEntry>(dataDir, 'variables'),
    icons: readCacheFile<IconsEntry>(dataDir, 'icons'),
    images: readCacheFile<ImagesEntry>(dataDir, 'images'),
  };

  for (const alias of aliases) {
    const provenance = currentProvenance(dataDir, alias, glyphSignature);

    for (const concern of CACHE_CONCERNS) {
      const file = files[concern];
      // A payload not fetched for this alias contributes no partition, so there
      // is nothing to validate — not having fetched it is a normal state.
      for (const [key, current] of provenance[concern]) {
        if (!file?.sources[key]) {
          problems.push({ concern, alias, reason: 'missing' });
          continue;
        }
        if (!matches(file.sources[key], current)) {
          problems.push({ concern, alias, reason: 'stale' });
        }
      }
    }
  }

  return problems;
}

/** One line per problem, plus the command that fixes them. */
export function describeProblems(problems: CacheProblem[]): string {
  const lines = problems.map(p => `  - ${p.concern}.yaml: "${p.alias}" is ${p.reason}`);
  return [
    `Render cache is not usable:`,
    ...lines,
    ``,
    `Run \`specs cache\` to rebuild it.`,
  ].join('\n');
}
