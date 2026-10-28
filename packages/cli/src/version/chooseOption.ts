/**
 * An arrow-key menu for a question the caller cannot answer for the user —
 * ported from the chooser in the premerge-run.sh this command replaces.
 *
 * The first option is always the safe one: enter on an untouched menu picks it,
 * and outside a TTY the menu never renders and that same first option is
 * returned. A scheduled or piped run therefore never blocks on a prompt it has
 * no way to answer.
 *
 * The menu is drawn on stderr so a command's own output stays pipeable.
 */

import readline from 'readline';

const ESC = '\u001b';
const CURSOR_HIDE = `${ESC}[?25l`;
const CURSOR_SHOW = `${ESC}[?25h`;
const CLEAR_LINE = `${ESC}[2K`;
const CYAN = `${ESC}[36m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;

export interface ChooseOptionInput {
  /** Override interactivity detection (for tests). Defaults to real stdin/stdout TTY state. */
  isTTY?: boolean;
}

/** The chosen index, or -1 when the user cancelled with q or ctrl-c. */
export function chooseOption(labels: string[], opts: ChooseOptionInput = {}): Promise<number> {
  const interactive = opts.isTTY ?? (Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY));
  if (!interactive || labels.length === 0) return Promise.resolve(0);

  return new Promise(resolve => {
    let selected = 0;
    let first = true;

    const render = (): void => {
      if (first) first = false;
      else process.stderr.write(`${ESC}[${labels.length}A`);
      labels.forEach((label, i) => {
        process.stderr.write(i === selected
          ? `${CLEAR_LINE}${CYAN} ❯ ${label}${RESET}\n`
          : `${CLEAR_LINE}   ${DIM}${label}${RESET}\n`);
      });
    };

    const finish = (index: number): void => {
      process.stdin.off('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write(CURSOR_SHOW);
      resolve(index);
    };

    const onKey = (_str: string, key: { name?: string; ctrl?: boolean }): void => {
      if (key.name === 'up' || key.name === 'k') selected = selected > 0 ? selected - 1 : labels.length - 1;
      else if (key.name === 'down' || key.name === 'j') selected = (selected + 1) % labels.length;
      else if (key.name === 'return') return finish(selected);
      else if (key.name === 'q' || (key.ctrl && key.name === 'c')) return finish(-1);
      else if (key.name && /^[1-9]$/.test(key.name) && Number(key.name) <= labels.length) return finish(Number(key.name) - 1);
      else return;
      render();
    };

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', onKey);
    process.stderr.write(CURSOR_HIDE);
    render();
  });
}
