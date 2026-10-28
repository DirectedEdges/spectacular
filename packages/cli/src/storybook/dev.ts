// `specs storybook dev` — Storybook and the things that feed it (specs#644).
//
// You run fetch, generate, and renders yourself; this owns everything that
// reacts from `specs/` onward: the transform watchers re-emit components when
// specs change, the Storybook dev server hot-reloads their output, and its host
// plugin republishes the generated pages when config/, specs/, or assets/ move.
//
//   dev ─┬─ specs react --watch            (when react/ exists)
//        ├─ specs webcomponents --watch    (when webcomponents/ exists)
//        └─ storybook dev server ── publish-on-change (host plugin)
//
// `specs run` covers more — it starts at `data/` and serves Storybook too — and
// shares this command's server through `serveStorybook`. This stays the
// Storybook-scoped way in, for working on Storybook without the rest.
//
// Free and unobfuscated; spawns this same CLI binary for the watchers, so no
// PATH assumptions, and the customer's own Storybook install for the server —
// we never ship or vendor Storybook (ADR A).
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'fs-extra';
import path from 'path';
import type { Workspace } from './workspace.js';
import { publish } from './publish.js';
import { serveStorybook } from './serve.js';

export async function dev(ws: Workspace): Promise<void> {
  if (!ws.scaffolded) {
    throw new Error(
      'No Storybook host here yet. Run `specs storybook init`, then the one install it prints, then `specs storybook dev`.',
    );
  }

  // One publish up front so the server starts against current content — this
  // also prints the stale-scaffold warning when the host needs `init --force`.
  await publish(ws);

  const children: ChildProcess[] = [];

  // The transform watchers own re-emission; their output is in Vite's module
  // graph, so the server hot-reloads it without being told.
  const self = process.argv[1];
  const spawnWatcher = (label: string, args: string[]) => {
    const child = spawn(process.execPath, [self, ...args], { cwd: ws.root, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code !== null && code !== 0) console.warn(`[specs dev] ${label} exited (${code}) — the rest keeps running.`);
    });
    children.push(child);
  };

  if (fs.existsSync(path.join(ws.root, 'react'))) spawnWatcher('react --watch', ['react', '--watch']);
  if (fs.existsSync(path.join(ws.root, 'webcomponents'))) spawnWatcher('webcomponents --watch', ['webcomponents', '--watch']);

  const server = serveStorybook(ws, 'specs dev');
  if (server) children.push(server);

  const stop = () => {
    for (const child of children) child.kill('SIGINT');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  console.log('[specs dev] watching — edit specs or config; fetch, generate, and render are yours to run.');
  await new Promise(() => {}); // runs until Ctrl-C
}
