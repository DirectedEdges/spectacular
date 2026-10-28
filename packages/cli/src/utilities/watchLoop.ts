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
   */
  run: () => Promise<void>;
  /**
   * Run once after the watchers are attached. False for a caller that already
   * ran — `specs react` has to, since the run is what tells it what to watch.
   */
  runOnStart: boolean;
}

/**
 * Watch, and never return — the process stays alive until Ctrl-C.
 */
export async function watchLoop({ targets, debounceMs, run, runOnStart }: WatchLoopOptions): Promise<never> {
  let running = false;
  let pending = false;
  let debounceTimer: NodeJS.Timeout | undefined;

  const runOnce = async (): Promise<void> => {
    // A change during a run is remembered rather than queued: however many
    // arrive, one more run covers all of them.
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await run();
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

  const schedule = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runOnce, debounceMs);
  };

  const label = targets.map(target => path.relative(process.cwd(), target) || '.').join(' and ');
  console.log(`Watching ${label} for changes...`);
  for (const target of targets) fs.watch(target, { recursive: true }, schedule);

  if (runOnStart) await runOnce();

  await new Promise(() => {}); // keep the process alive until Ctrl-C
  throw new Error('unreachable');
}
