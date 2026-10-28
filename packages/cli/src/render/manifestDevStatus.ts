/**
 * The Dev Mode status render writes back into Figma, read from the scan manifest.
 *
 * `specs scan` already records each component's status in the manifest's Dev Status
 * column, so render does not need to ask Figma for it — the curation file the workspace
 * already keeps is the record. This resolves that file once per run and indexes it by
 * Figma node id, which is what a spec carries at `metadata.source.nodeId`.
 *
 * Only `READY_FOR_DEV` and `COMPLETED` are indexed. `NONE`, an unknown status, a
 * component with no row, and a workspace with no manifest all mean the same thing here:
 * render is given nothing to write, and leaves the node's status alone. Asserting a
 * status the scan never recorded would make a render claim something about the component
 * that no one stated.
 */

import fs from 'fs-extra';
import path from 'path';
import type { CLIConfig } from '../config/types.js';
import { resolveFileSourceAlias } from '../generate/fileSourceAlias.js';
import { ManifestParserV2 } from '../utilities/manifestParserV2.js';

/** The statuses Figma's `devStatus` property accepts — `NONE` is the absence of one. */
export type WritableDevStatus = 'READY_FOR_DEV' | 'COMPLETED';

const WRITABLE: readonly string[] = ['READY_FOR_DEV', 'COMPLETED'];

/**
 * Index the workspace's scan manifest by Figma node id.
 *
 * Returns an empty map for every reason a status could be unavailable — no data
 * directory, no file source, no manifest written yet, or a v1 manifest, which predates
 * the Dev Status column. None of those is an error: render works without a status, and
 * failing a render over a missing curation file would be worse than rendering unmarked.
 */
export function loadDevStatusByNodeId(config: CLIConfig): Map<string, WritableDevStatus> {
  const empty = new Map<string, WritableDevStatus>();

  const dataDirectory = config.settings.data?.directory;
  if (!dataDirectory) return empty;
  const alias = resolveFileSourceAlias(config.settings.data?.sources);
  if (!alias) return empty;

  // ConfigLoader has already resolved data.directory against the config's own location,
  // so this is absolute in a configured workspace and cwd-relative only without one.
  const manifestPath = path.resolve(dataDirectory, `${alias}.manifest.md`);
  if (!fs.existsSync(manifestPath)) return empty;

  const content = fs.readFileSync(manifestPath, 'utf-8');
  if (!ManifestParserV2.isV2(content)) return empty;

  const byNodeId = new Map<string, WritableDevStatus>();
  for (const row of ManifestParserV2.parse(content).components) {
    if (WRITABLE.includes(row.devStatus)) byNodeId.set(row.id, row.devStatus as WritableDevStatus);
  }
  return byNodeId;
}

/**
 * The status to render a given spec under, or undefined when the manifest has nothing
 * to say about it. Matches on the Figma node the spec was generated from — the title
 * would be the wrong key, since it is the formatted spec title rather than the name the
 * manifest recorded, and two sources can produce the same one.
 */
export function devStatusForSpec(
  spec: Record<string, unknown>,
  byNodeId: Map<string, WritableDevStatus> | undefined
): WritableDevStatus | undefined {
  if (!byNodeId || byNodeId.size === 0) return undefined;
  const nodeId = sourceNodeIdOf(spec);
  return nodeId ? byNodeId.get(nodeId) : undefined;
}

/** `metadata.source.nodeId`, read from a bare spec or from the wrapped `{components: {...}}` form. */
function sourceNodeIdOf(spec: Record<string, unknown>): string | undefined {
  type WithSource = { metadata?: { source?: { nodeId?: string } } };
  const direct = (spec as WithSource).metadata?.source?.nodeId;
  if (direct) return direct;
  const components = (spec as { components?: Record<string, WithSource> }).components;
  const first = components ? Object.values(components)[0] : undefined;
  return first?.metadata?.source?.nodeId;
}
