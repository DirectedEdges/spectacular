// Names the spec carries that CSS cannot use, collected as emission runs and
// summarised once at the end (specs#691).
//
// Collected rather than printed where they happen: a single invalid character in
// a token path recurs on every component that references it, and one line per
// occurrence would bury everything else a run says.

/** type → (original name → occurrences). */
const nameWarnings = new Map<string, Map<string, number>>();

/** One warning type for every unresolved token, however it was written out. */
export const UNRESOLVED_WARNING = 'unresolved variable — no value emitted for this property';
export const UNRESOLVED_RAW_WARNING = 'unresolved variable — captured raw value emitted as a literal';

/**
 * Name warnings describe the spec's own names, so a second emission of the same
 * component — the shadow-tree form of the same rules — must not report them
 * again. Suppressed for the duration of that pass.
 */
let suppressed = false;

export function withNameWarningsSuppressed<T>(fn: () => T): T {
  const previous = suppressed;
  suppressed = true;
  try {
    return fn();
  } finally {
    suppressed = previous;
  }
}

export function recordNameWarning(type: string, name: string): void {
  if (suppressed) return;
  const byName = nameWarnings.get(type) ?? new Map<string, number>();
  byName.set(name, (byName.get(name) ?? 0) + 1);
  nameWarnings.set(type, byName);
}

/** Return all collected name warnings and reset the collector. */
export function drainNameWarnings(): Map<string, Map<string, number>> {
  const drained = new Map(nameWarnings);
  nameWarnings.clear();
  return drained;
}

/**
 * Drain collected name warnings and print a per-type count summary.
 * Called from a transformer's finalize(); the label names the transform.
 * No-op when nothing was collected.
 */
export function reportNameWarnings(label: string): void {
  const warnings = drainNameWarnings();
  if (warnings.size === 0) return;
  console.warn('');
  console.warn(`⚠ [${label}] name warnings:`);
  for (const [type, names] of warnings) {
    const total = [...names.values()].reduce((a, b) => a + b, 0);
    console.warn(`  ${type} — ${total} occurrence${total === 1 ? '' : 's'} across ${names.size} name${names.size === 1 ? '' : 's'}:`);
    const shown = [...names.entries()].slice(0, 10);
    for (const [name, count] of shown) console.warn(`    "${name}" ×${count}`);
    if (names.size > shown.length) console.warn(`    …and ${names.size - shown.length} more`);
  }
}
