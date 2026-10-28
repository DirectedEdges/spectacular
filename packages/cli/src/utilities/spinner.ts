/**
 * Inline progress for commands that wait on something slow — a download, a render.
 *
 * The spinner occupies one line and is erased when it stops, so the caller prints the
 * outcome over it rather than under it: one line per unit of work, start to finish.
 *
 * A unit of work may be *reported* as several stages while being *timed* as one — a
 * fetch waits for Figma to build a payload, then downloads it, and the two have
 * different causes and wildly different durations. Each stage gets its own spinner
 * and its own message, so the text always says what is happening now, and every
 * spinner after the first is handed the unit's origin via `since`: a stage boundary
 * must not restart the figure the user is watching, and the figure that survives
 * describes the unit rather than its last stage.
 *
 * Outside a TTY (a pipe, CI, a log file) there is no cursor to move, so the text prints
 * once and the elapsed time is still returned. Nothing writes escape codes into a file.
 *
 * @packageDocumentation
 */

import readline from 'readline';

export function isInteractive(): boolean {
  return Boolean(process.stdout.isTTY);
}

export function renderInlineStatus(text: string): void {
  if (!isInteractive()) {
    console.log(text);
    return;
  }

  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(text);
}

export function clearInlineStatus(): void {
  if (!isInteractive()) return;
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
}

/**
 * Erase a line already committed with `console.log`, so the line that supersedes it
 * can be printed in its place. The caller hands over the exact text it printed
 * because a long line occupies more than one row once the terminal wraps it, and
 * erasing one row leaves the rest of the text on screen.
 *
 * Only correct while the cursor still sits at the start of the row directly below
 * that line — nothing may have been printed since, except an inline status that has
 * cleared itself. Outside a TTY there is no cursor to move, so both lines stand.
 */
export function erasePrintedLine(text: string): void {
  if (!isInteractive()) return;
  const width = process.stdout.columns || 80;
  const rows = Math.max(1, Math.ceil(text.length / width));
  for (let row = 0; row < rows; row++) {
    readline.moveCursor(process.stdout, 0, -1);
    readline.clearLine(process.stdout, 0);
  }
  readline.cursorTo(process.stdout, 0);
}

export function formatElapsed(ms: number): string {
  // Truncating to whole seconds reported a tenth of a second as `0s`, which reads as
  // "nothing happened" rather than "faster than this figure can say".
  if (ms < 1000) return '<1s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

/**
 * Start spinning, and return a stop function that erases the line and reports elapsed time.
 *
 * `since` continues an already-running clock instead of starting a new one, for a
 * later stage of a unit of work whose earlier stage was already being timed.
 */
export function startSpinner(text: string, since?: number): () => string {
  const start = since ?? Date.now();
  if (!isInteractive()) {
    console.log(text);
    return () => formatElapsed(Date.now() - start);
  }
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const id = setInterval(() => {
    const elapsed = formatElapsed(Date.now() - start);
    renderInlineStatus(`${frames[i++ % frames.length]} ${text} (${elapsed})`);
  }, 80);
  return () => {
    clearInterval(id);
    clearInlineStatus();
    return formatElapsed(Date.now() - start);
  };
}
