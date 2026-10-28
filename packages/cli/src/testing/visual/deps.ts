// The customer's own Playwright, pixelmatch, and pngjs — never ours.
//
// The same contract as the Storybook host (ADR A): `specs testing visual init`
// writes a package.json declaring these in testing/visual/, the customer runs
// the one install it prints, and the CLI ships no browser and no image
// library. `shoot` and `diff` resolve from that directory at runtime; absence
// is a one-line pointer at init, not a module-not-found trace.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'fs-extra';
import path from 'path';
import type { VisualWorkspace } from './paths.js';

function requireFrom(vw: VisualWorkspace) {
  return createRequire(path.join(vw.root, 'package.json'));
}

async function load(vw: VisualWorkspace, name: string): Promise<unknown> {
  const req = requireFrom(vw);
  let resolved: string;
  try {
    resolved = req.resolve(name);
  } catch {
    throw new Error(
      `Visual testing needs ${name}, which is installed by you, not shipped with specs.\n` +
        `  1. specs testing visual init\n` +
        `  2. cd ${path.relative(process.cwd(), vw.root) || '.'} && npm install` +
        (name === 'playwright' ? ' && npx playwright install chromium' : ''),
    );
  }
  let mod: unknown;
  try {
    mod = req(resolved);
  } catch {
    // Older Node: require() of an ESM-only package (pixelmatch ≥6) throws.
    mod = await import(pathToFileURL(resolved).href);
  }
  // Node ≥22 require()s ESM without throwing and hands back the namespace —
  // `{__esModule, default}` — so unwrap a default export on every path.
  const ns = mod as { default?: unknown };
  return ns?.default !== undefined ? ns.default : mod;
}

export async function loadPlaywright(vw: VisualWorkspace): Promise<{ chromium: any }> {
  return (await load(vw, 'playwright')) as { chromium: any };
}

export async function loadPngjs(vw: VisualWorkspace): Promise<{ PNG: any }> {
  const mod = (await load(vw, 'pngjs')) as { PNG?: any };
  if (!mod.PNG) throw new Error('pngjs resolved but exports no PNG constructor');
  return { PNG: mod.PNG };
}

export async function loadPixelmatch(vw: VisualWorkspace): Promise<(...args: unknown[]) => number> {
  return (await load(vw, 'pixelmatch')) as (...args: unknown[]) => number;
}

/** True when the scaffold's install has been run. */
export function depsInstalled(vw: VisualWorkspace): boolean {
  return fs.existsSync(path.join(vw.root, 'node_modules'));
}
