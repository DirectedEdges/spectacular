/**
 * The watch loop every `--watch` command runs: debounce a burst of file events
 * into one run, never overlap two runs, and run once more if a change arrived
 * while the last one was still going.
 *
 * `specs react --watch` and `specs render --watch` each had their own copy, with
 * different debounce constants and the same three pieces of state — so a fix to
 * the coalescing logic landed in one and not the other. The debounce stays per
 * caller, because the two are waiting on different things: an editor's save
 * burst before re-emitting a whole catalogue, versus a single spec edit before
 * a round trip to Figma.
 */

import fs from 'fs';
import path from 'path';

export interface WatchLoopOptions {
  /** Files or directories to watch, recursively. All share one debounce. */
  targets: string[];
  /** How long to wait after the last event before running. */
  debounceMs: number;
  /**
   * What a change triggers. Reports its own failures, since only the caller
   * knows how to phrase them; anything that escapes is reported generically
   * rather than ending the session.
   *
   * Receives the relative filenames whose events this run coalesces — empty on
   * the `runOnStart` run — so a caller can scope its work to what changed
   * instead of redoing the whole target.
   */
  run: (changed: string[]) => Promise<void>;
  /**
   * Run once after the watchers are attached. False for a caller that already
   * ran — `specs react` has to, since the run is what tells it what to watch.
   */
  runOnStart: boolean;
  /**
   * Which file events schedule a run, by the event's relative filename; absent
   * means every event does. Added because analysis byproducts land inside the
   * watched tree — `analyze` writes `styling.yaml` into each spec folder and
   * reports under `analysis/` — and a render watch that fires on its own
   * pipeline's output re-renders the catalogue on every analyze pass.
   */
  filter?: (filename: string) => boolean;
}

/**
 * Watch, and never return — the process stays alive until Ctrl-C.
 */
export async function watchLoop({ targets, debounceMs, run, runOnStart, filter }: WatchLoopOptions): Promise<never> {
  let running = false;
  let pending = false;
  let debounceTimer: NodeJS.Timeout | undefined;
  // Filenames whose events the next run coalesces. Drained at run start, so
  // changes arriving mid-run accumulate for the follow-up run `pending` queues.
  let changedFiles = new Set<string>();

  const runOnce = async (): Promise<void> => {
    // A change during a run is remembered rather than queued: however many
    // arrive, one more run covers all of them.
    if (running) {
      pending = true;
      return;
    }
    running = true;
    const changed = [...changedFiles];
    changedFiles = new Set();
    try {
      await run(changed);
    } catch (error) {
      // A watch session that dies on one bad save is worse than one that says so
      // and waits for the next.
      console.error(`✗ ${(error as Error).message}`);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        void runOnce();
      }
    }
  };

  const schedule = (filename?: string) => {
    if (filename) changedFiles.add(filename);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runOnce, debounceMs);
  };

  const label = targets.map(target => path.relative(process.cwd(), target) || '.').join(' and ');
  console.log(`Watching ${label} for changes...`);
  for (const target of targets) {
    fs.watch(target, { recursive: true }, (_event, filename) => {
      if (filter && filename && !filter(filename)) return;
      schedule(filename ?? undefined);
    });
  }

  if (runOnStart) await runOnce();

  await new Promise(() => {}); // keep the process alive until Ctrl-C
  throw new Error('unreachable');
}
