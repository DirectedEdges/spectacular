/**
 * `watch` has to produce the same artifact `build` does.
 *
 * Both run esbuild over the same entry to the same output, and the only
 * differences that are allowed are the watch flag itself and the build's
 * trailing shell — chmod, the template copies, the README copy, the second
 * bundle. Every flag that shapes the file must match, because `dist/specs.js` is
 * what every workspace invocation runs and the watcher is what writes it all day.
 *
 * Both failures this caught were silent and identical in shape: a flag added to
 * one script and not the other. The `--loader` flags went to `build` while the
 * watcher kept failing on every rebuild, and the `--banner` carrying the shebang
 * went missing from `watch`, so the rebuilt binary ran as a shell script and
 * printed `var: command not found`. Nothing in either case reported a problem —
 * the build simply produced the wrong file.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
);

/** The first esbuild invocation in a script, without the shell chained after it. */
function esbuildFlags(script: string): string[] {
  const invocation = script.split('&&')[0];
  return invocation.match(/--[^\s]+(?:='[^']*'|="[^"]*")?/g) ?? [];
}

/** Flags that legitimately differ: how the run ends, not what it writes. */
const RUN_MODE = ['--watch', '--watch=forever'];

describe('the build and watch scripts', () => {
  it('write dist/specs.js with the same flags', () => {
    const build = esbuildFlags(pkg.scripts.build).filter(f => !RUN_MODE.includes(f));
    const watch = esbuildFlags(pkg.scripts.watch).filter(f => !RUN_MODE.includes(f));

    const missingFromWatch = build.filter(f => !watch.includes(f));
    const missingFromBuild = watch.filter(f => !build.includes(f));

    expect(
      missingFromWatch,
      'the watcher would write a different file than a build does — in `watch`, add: ' +
      missingFromWatch.join(' '),
    ).toEqual([]);
    expect(
      missingFromBuild,
      'a released build would differ from what was developed against — in `build`, add: ' +
      missingFromBuild.join(' '),
    ).toEqual([]);
  });

  it('declares the shebang, so the output is executable as a binary', () => {
    // Without it the file is valid ESM that a shell tries to interpret, and the
    // first line reported is `var: command not found`.
    for (const name of ['build', 'watch'] as const) {
      expect(pkg.scripts[name], `${name} must carry the shebang banner`).toContain(
        "--banner:js='#!/usr/bin/env node'",
      );
    }
  });

  it('declares a text loader for every format a skill or scaffold is authored in', () => {
    for (const name of ['build', 'watch'] as const) {
      expect(pkg.scripts[name], `${name} must load skills as text`).toContain('--loader:.md=text');
      expect(pkg.scripts[name], `${name} must load config scaffolds as text`).toContain('--loader:.yaml=text');
    }
  });
});
