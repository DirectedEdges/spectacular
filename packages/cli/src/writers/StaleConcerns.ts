/**
 * Staling the concern files a run stopped emitting, and un-staling the ones it resumed.
 *
 * A component's concerns are written as separate files, and which of them a run produces
 * depends on what the spec holds: declaring a default-slot convention moves a component's
 * slot content into its own anatomy, so the examples concern has nothing left to carry and
 * is not written. The folder is still written, so the previous `examples.yaml` is not an
 * orphaned *folder* — the thing a full run already names — and it stayed on disk,
 * contradicting the files beside it with nothing to say it was out of date.
 *
 * So a file this run did not write is renamed with a `.stale` suffix appended after the
 * extension, which is what stops it being read: `examples.yaml.stale` no longer matches a
 * `*.yaml` glob, where `examples.stale.yaml` would still be loaded by anything walking the
 * folder. Nothing is deleted — the content stays recoverable.
 *
 * The reverse transition matters as much. A run that emits a concern again clears the
 * `.stale` file beside it, so reverting a convention cannot leave both forms in one folder.
 */

import fs from 'fs-extra';
import path from 'path';

/** The suffix appended after the extension. Chosen so the file stops matching `*.yaml`. */
export const STALE_SUFFIX = '.stale';

/**
 * Concern basenames, and every extension a spec document can carry.
 *
 * Both lists are needed because a run changes format as readily as it changes which
 * concerns it emits: switching to JSON orphans `examples.yaml` exactly as dropping the
 * concern does, and the remedy is the same.
 */
const CONCERN_BASENAMES = ['api', 'variants', 'examples'] as const;
const SPEC_EXTENSIONS = ['yaml', 'yml', 'json'] as const;

/** What a staling pass did, for the caller to report. */
export interface StaleResult {
  /** Files renamed because this run no longer emits them. */
  staled: string[];
  /** `.stale` files removed because this run emits their concern again. */
  cleared: string[];
}

/**
 * Stale the concern files this run did not write, and clear the `.stale` markers of the
 * ones it did, across every directory the run wrote into.
 *
 * Only the three concern basenames are touched. Anything else in the folder — a README, a
 * note, a file a person put there — is not this run's to reason about.
 */
export async function reconcileStaleConcerns(writtenPaths: readonly string[]): Promise<StaleResult> {
  const result: StaleResult = { staled: [], cleared: [] };

  // Group by directory, carrying the basenames written into each, so a folder is examined
  // once however many concerns landed in it.
  const writtenByDir = new Map<string, Set<string>>();
  for (const written of writtenPaths) {
    const dir = path.dirname(written);
    const names = writtenByDir.get(dir) ?? new Set<string>();
    names.add(path.basename(written));
    writtenByDir.set(dir, names);
  }

  for (const [dir, written] of writtenByDir) {
    for (const concern of CONCERN_BASENAMES) {
      for (const ext of SPEC_EXTENSIONS) {
        const name = `${concern}.${ext}`;
        const live = path.join(dir, name);
        const stale = `${live}${STALE_SUFFIX}`;

        if (written.has(name)) {
          // Emitted again: the marker beside it would be a second answer to one question.
          if (await fs.pathExists(stale)) {
            await fs.remove(stale);
            result.cleared.push(stale);
          }
          continue;
        }

        if (!(await fs.pathExists(live))) continue;
        // A previous `.stale` is replaced rather than preserved: it is an older copy of a
        // file that has since been written and dropped again, so the newer one is the one
        // worth keeping.
        await fs.remove(stale).catch(() => undefined);
        await fs.rename(live, stale);
        result.staled.push(stale);
      }
    }
  }

  return result;
}

/** The warnings a staling pass contributes to a write result. */
export function staleWarnings(result: StaleResult): string[] {
  const warnings: string[] = [];
  for (const staled of result.staled) {
    warnings.push(`Note: ${staled.slice(0, -STALE_SUFFIX.length)} is no longer generated — renamed to ${path.basename(staled)}`);
  }
  for (const cleared of result.cleared) {
    warnings.push(`Note: removed ${cleared} — ${path.basename(cleared.slice(0, -STALE_SUFFIX.length))} is generated again`);
  }
  return warnings;
}
