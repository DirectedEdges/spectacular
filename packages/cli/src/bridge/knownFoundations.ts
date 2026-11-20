// The foundation artifacts this workspace owns, declared to the plugin on a
// bridge request.
//
// A Figma file outlives the libraries it consumes. A collection renamed and
// republished leaves the file still answering for the version it last synced,
// and a file can subscribe to collections no fetched library owns at all.
// Either way the file names a group nothing downstream can account for.
//
// Ownership is the whole rule: a collection counts when a fetched source holds
// it locally, and nothing else counts. A workspace that needs a library's
// foundations fetches that library — there is no override.
//
// Same argument as `conventions` and `settings` on the same request: the
// workspace is the authority, not whatever the file happens to have cached.
import fs from 'fs-extra';
import path from 'path';
import type { ResolvedSettings } from '@directededges/specs-schema';

/** One artifact, by every identifier that might survive (id → key → name). */
interface KnownArtifact {
  id: string;
  key?: string;
  name: string;
}

export interface KnownFoundations {
  tokens?: {
    variableCollections?: KnownArtifact[];
    styles?: KnownArtifact[];
  };
}

/** The `*.variables.json` paths the workspace's sources declare. */
export function variablesPathsFor(settings: ResolvedSettings, dataDir: string): string[] {
  return Object.entries(settings.data?.sources ?? {})
    .filter(([, s]) => Array.isArray(s.fetch) && s.fetch.includes('variables'))
    .map(([alias]) => path.join(dataDir, `${alias}.variables.json`))
    .filter(p => fs.existsSync(p));
}

/**
 * The owned collections across every fetched source, or undefined when the
 * workspace has fetched no variables at all.
 *
 * Undefined is meaningful: it means "I am declaring nothing", and the reader
 * filters nothing. A workspace that has never fetched must not have its every
 * selection discarded as unknown — that is a workspace with no opinion, not a
 * workspace that owns nothing.
 */
export function knownFoundationsFrom(variablesPaths: string[]): KnownFoundations | undefined {
  const owned = new Map<string, KnownArtifact>();
  let fetched = false;

  for (const p of variablesPaths) {
    let parsed: Record<string, any>;
    try {
      parsed = fs.readJsonSync(p);
    } catch {
      continue;
    }
    const declared = parsed?.meta?.variableCollections;
    if (!declared || typeof declared !== 'object') continue;
    fetched = true;
    for (const [id, c] of Object.entries<any>(declared)) {
      // `remote` marks a collection the source subscribes to rather than holds.
      // A subscribed copy is either a past name of something owned elsewhere or
      // a library nobody fetched; neither is this workspace's to name.
      if (!c?.name || c.remote || owned.has(id)) continue;
      owned.set(id, { id, key: c.key, name: c.name });
    }
  }

  if (!fetched) return undefined;
  return { tokens: { variableCollections: [...owned.values()] } };
}
