// What a cache refresh is reported as — shared by `specs cache` and by every
// command that refreshes the cache as its last step.
//
// It lived inside CacheCommand.ts, which made three other commands import a
// command file to get at it.

import type { CacheReport } from './cache.js';

/**
 * Print a refresh result. Returns false when any payload failed to read —
 * callers decide the exit code, but the failure is printed here so no caller can
 * lose it.
 *
 * `attempted` names sources the caller tried and could not get this run. The cache
 * sees only that they have no payload, which is exactly what it sees for a source
 * nobody asked for — so calling both "skipped" told a reader nothing had been
 * tried, on the line directly below the one reporting the failure (specs#708).
 */
export function reportCache(report: CacheReport, attempted: readonly string[] = []): boolean {
  const { rebuilt, current, unfetched, counts, aliasCounts, failures } = report;
  if (rebuilt.length > 0) console.log(`  Cache rebuilt: ${rebuilt.join(', ')}`);
  if (current.length > 0) console.log(`  Cache current: ${current.join(', ')}`);
  // Not an error here — only render is in a position to insist a source be fetched.
  // An attempted source is left out entirely: its failure is already reported, in
  // more detail than this line could carry.
  const skipped = unfetched.filter(alias => !attempted.includes(alias));
  if (skipped.length > 0) console.log(`  Not fetched, skipped: ${skipped.join(', ')}`);

  // Per-source contribution, so a source contributing nothing is visible as itself
  // rather than hidden inside a merged total.
  //
  // These are what the cache read from disk, not what any one run downloaded — a
  // source skipped or failed this run still contributes its previous payload. Said
  // plainly, because a reader who has just watched a fetch will otherwise take
  // these for that fetch's results (specs#572).
  const failedAliases = new Set(failures.map(f => f.alias));
  const aliasEntries = Object.entries(aliasCounts);
  if (aliasEntries.length > 0) {
    console.log('  In the render cache (every source, not only this run):');
  }
  for (const [alias, c] of aliasEntries) {
    const line = `${c.components} components, ${c.styles} styles, ${c.variables} variables, ${c.icons} icons`;
    console.log(`    ${alias}: ${failedAliases.has(alias) ? `✗ FAILED — ${line}` : line}`);
  }
  console.log(
    `  Cache entries: ${counts.components} components, ${counts.styles} styles, ` +
    `${counts.variables} variables, ${counts.icons} icons`
  );

  for (const failure of failures) {
    console.error(`✗ Cache could not read ${failure.file} (source "${failure.alias}") — it contributed no entries.`);
    for (const reasonLine of failure.reason.split('\n')) console.error(`  ${reasonLine}`);
  }
  return failures.length === 0;
}
