/**
 * Runs `astro dev` with a watcher on the sources the content generators read.
 *
 * The generated markdown under `src/content/docs/` is a build artifact. Astro
 * watches the artifact, not its source, so before this a schema edit changed
 * nothing on screen until someone reran the generator by hand — and the
 * generator is what the dev server is least able to survive.
 *
 * Usage:  node scripts/watch-content.mjs      (this is `npm run dev`)
 */

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, '..');
const repo = resolve(site, '..');

/**
 * Each watched directory and the generators a change in it invalidates.
 *
 * Scoped per directory rather than rerunning `build:content` wholesale: that
 * chain includes the releases, ADR and specification passes, which rewrite
 * several hundred files and have nothing to do with a schema edit.
 */
const WATCHED = [
  {
    dir: resolve(repo, 'packages/schema/schema'),
    match: /\.json$/,
    run: [
      resolve(site, 'scripts/build-mappings.mjs'),
      resolve(site, 'scripts/build-style-pages.mjs'),
    ],
  },
  {
    /**
     * The whole directory, not just `bindings/`. It used to be scoped to the
     * binding JSON because `build-mappings.mjs` wrote its rendered markdown
     * back into `mappings/` and so retriggered itself without end. That
     * markdown stage is gone (#837) — the generator writes straight to the
     * site — so nothing it produces lands in a watched path.
     */
    dir: resolve(repo, 'packages/schema/mappings'),
    match: /\.json$|\.md$/,
    run: [
      resolve(site, 'scripts/build-mappings.mjs'),
      resolve(site, 'scripts/build-style-pages.mjs'),
    ],
  },
  /**
   * `adr/` is deliberately not watched. `build-adrs.mjs` removes its whole
   * output directory and writes it back, which a running `astro dev` does not
   * survive — the same flaw `build-style-pages.mjs` had. Firing it on every
   * ADR keystroke would take the server down repeatedly. Watch it once that
   * generator writes in place.
   */
];

const astro = spawn('npx', ['astro', 'dev'], { cwd: site, stdio: 'inherit' });
astro.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => astro.kill(sig));

/**
 * Generators run one at a time, and a change arriving mid-run queues one more
 * pass rather than starting a second concurrently. Two instances writing the
 * same page is what a half-written file in a watched directory looks like to
 * Astro.
 */
let running = false;
let queued = null;

const runAll = async (scripts, reason) => {
  if (running) {
    queued = { scripts, reason };
    return;
  }
  running = true;
  console.log(`\n[content] ${reason}`);
  for (const script of scripts) {
    await new Promise((done) => {
      const child = spawn(process.execPath, [script], { cwd: site, stdio: 'inherit' });
      child.on('exit', (code) => {
        if (code !== 0) console.error(`[content] ${script} exited ${code}`);
        done();
      });
    });
  }
  running = false;
  const next = queued;
  queued = null;
  if (next) runAll(next.scripts, next.reason);
};

// Editors write a file in several operations, so one save fires more than one
// event. The timer collapses them into a single run.
const debounce = new Map();
for (const { dir, match, run } of WATCHED) {
  try {
    watch(dir, { recursive: true }, (_event, file) => {
      if (!file || !match.test(file)) return;
      clearTimeout(debounce.get(dir));
      debounce.set(
        dir,
        setTimeout(() => runAll(run, `${file} changed — regenerating`), 150)
      );
    });
    console.log(`[content] watching ${dir.replace(repo, '.')}`);
  } catch (err) {
    console.error(`[content] cannot watch ${dir}: ${err.message}`);
  }
}
