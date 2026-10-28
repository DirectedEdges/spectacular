import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import readline from 'readline';
import { erasePrintedLine, formatElapsed, startSpinner } from '../../../src/utilities/spinner.js';

/**
 * Every elapsed figure the CLI prints goes through here — fetch's stages, render's
 * spinner, version's. Whole seconds reported anything under one as `0s`, which reads
 * as "nothing happened" rather than "too fast to put a figure on".
 */
describe('formatElapsed', () => {
  it('says under a second rather than zero', () => {
    expect(formatElapsed(0)).toBe('<1s');
    expect(formatElapsed(400)).toBe('<1s');
    expect(formatElapsed(999)).toBe('<1s');
  });

  it('truncates to whole seconds from one second up', () => {
    expect(formatElapsed(1_000)).toBe('1s');
    expect(formatElapsed(1_970)).toBe('1s');
    expect(formatElapsed(59_999)).toBe('59s');
  });

  it('splits minutes out past a minute', () => {
    expect(formatElapsed(60_000)).toBe('1m 0s');
    expect(formatElapsed(133_000)).toBe('2m 13s');
  });
});

/**
 * `erasePrintedLine` is how fetch keeps one line per unit of work: the estimate is
 * erased by the readiness line, which is erased by the download line. A wrapped
 * line occupies more than one row, and clearing one row leaves the rest on screen.
 */
describe('erasePrintedLine', () => {
  const original = {
    isTTY: process.stdout.isTTY,
    columns: process.stdout.columns,
  };

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: original.isTTY, configurable: true });
    Object.defineProperty(process.stdout, 'columns', { value: original.columns, configurable: true });
    vi.restoreAllMocks();
  });

  function asTty(columns: number) {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'columns', { value: columns, configurable: true });
    return {
      moveCursor: vi.spyOn(readline, 'moveCursor').mockImplementation(() => true),
      clearLine: vi.spyOn(readline, 'clearLine').mockImplementation(() => true),
      cursorTo: vi.spyOn(readline, 'cursorTo').mockImplementation(() => true),
    };
  }

  it('erases one row for a line that fits the terminal width', () => {
    const cursor = asTty(80);
    erasePrintedLine('✓ Ready: primer.file');
    expect(cursor.moveCursor).toHaveBeenCalledTimes(1);
    expect(cursor.clearLine).toHaveBeenCalledTimes(1);
  });

  it('erases every row a wrapped line occupies', () => {
    const cursor = asTty(40);
    erasePrintedLine('x'.repeat(95));
    expect(cursor.moveCursor).toHaveBeenCalledTimes(3);
    expect(cursor.clearLine).toHaveBeenCalledTimes(3);
  });

  it('leaves the line standing outside a TTY, where there is no cursor to move', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    const moveCursor = vi.spyOn(readline, 'moveCursor').mockImplementation(() => true);
    erasePrintedLine('✓ Ready: primer.file');
    expect(moveCursor).not.toHaveBeenCalled();
  });
});

/**
 * `since` is how a fetch reports a kind as two stages while timing it as one: the
 * download spinner continues the clock the wait spinner started, so the stage
 * boundary does not restart the figure and the surviving line is the kind's total.
 */
describe('startSpinner', () => {
  const original = {
    isTTY: process.stdout.isTTY,
    columns: process.stdout.columns,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(process.stdout, 'isTTY', { value: original.isTTY, configurable: true });
    Object.defineProperty(process.stdout, 'columns', { value: original.columns, configurable: true });
    vi.restoreAllMocks();
  });

  function asTty(interactive: boolean) {
    Object.defineProperty(process.stdout, 'isTTY', { value: interactive, configurable: true });
    Object.defineProperty(process.stdout, 'columns', { value: 80, configurable: true });
  }

  it('measures from its own creation when no origin is given', () => {
    asTty(false);
    const stop = startSpinner('Preparing: primer.styles');
    vi.advanceTimersByTime(4_000);
    expect(stop()).toBe('4s');
  });

  it('measures from the given origin, so an earlier stage is inside the figure', () => {
    asTty(false);
    const origin = Date.now();
    vi.advanceTimersByTime(133_000);
    const stop = startSpinner('Downloading: primer.file', origin);
    vi.advanceTimersByTime(3_000);
    expect(stop()).toBe('2m 16s');
  });

  it('continues the live counter across a stage boundary rather than restarting it', () => {
    asTty(true);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(readline, 'clearLine').mockImplementation(() => true);
    vi.spyOn(readline, 'cursorTo').mockImplementation(() => true);

    const origin = Date.now();
    const stopWaiting = startSpinner('Preparing: primer.file', origin);
    vi.advanceTimersByTime(133_000);
    expect(stopWaiting()).toBe('2m 13s');

    const stopDownload = startSpinner('Downloading: primer.file', origin);
    vi.advanceTimersByTime(2_000);
    const frames = write.mock.calls.map(([text]) => String(text));
    expect(frames.at(-1)).toContain('Downloading: primer.file (2m 15s)');
    // A restarted clock would show the second stage opening at `<1s`.
    expect(frames.some(f => f.includes('Downloading') && f.includes('(<1s)'))).toBe(false);
    stopDownload();
  });
});
