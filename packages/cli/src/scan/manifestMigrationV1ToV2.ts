/**
 * v1 → v2 manifest migration (ISOLATED LEGACY MODULE).
 *
 * DELETE-WHEN: all known users have re-scanned with the v2 emitter and there
 * are no v1 manifests in the wild. Removal is mechanical:
 *   1. Delete this file.
 *   2. Delete `ManifestParser.ts` (only consumer is this module).
 *   3. Delete the single `isV1Manifest`/`migrateV1ToV2` import + branch in
 *      `ScanCommand.ts` (search for "ManifestMigrationV1ToV2").
 *
 * No other code path imports from here. Keep it that way.
 */

import { ManifestParser } from '../generate/manifestParser.js';
import type { ManifestRowV2 } from '../utilities/manifestParserV2.js';

/** True if the content looks like a v1 manifest (checkbox-list, no scan format version header). */
export function isV1Manifest(content: string): boolean {
  if (/\*\*Scan format version:\*\*/m.test(content)) return false;
  return /^-\s+\[[x ]\]\s+/m.test(content);
}

/**
 * Lift v1 rows into the v2 row shape. devStatus is unknown in v1 so we mark it
 * as 'NONE' — the merge step in ScanCommand treats this as "no transition" so
 * user checkbox state is preserved.
 */
export function migrateV1ToV2(content: string): ManifestRowV2[] {
  const { components } = ManifestParser.parse(content);
  return components.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    included: c.included,
    devStatus: 'NONE'
  }));
}
