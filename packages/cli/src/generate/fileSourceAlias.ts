/**
 * Which configured data source carries the component file.
 *
 * Shared by every path that needs the file a workspace was scanned and generated
 * from: the default-manifest path, manifest-mode's component file, `--get-images`,
 * and render's dev-status lookup. Kept in its own module so those callers agree on
 * one answer rather than each deciding for itself.
 */

import type { SourceEntry } from '@directededges/specs-schema';

/**
 * Resolve the config source alias that carries the component file: `library`
 * when configured with `fetch: [file]`, else the first source that is.
 */
export function resolveFileSourceAlias(sources: Record<string, SourceEntry> | undefined): string | null {
  const entries = sources ?? {};
  if (entries.library && Array.isArray(entries.library.fetch) && entries.library.fetch.includes('file')) return 'library';
  const candidate = Object.entries(entries).find(([, s]) => Array.isArray(s.fetch) && s.fetch.includes('file'));
  return candidate ? candidate[0] : null;
}
