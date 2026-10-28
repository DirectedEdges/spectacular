// `specs testing visual accept` — promote the current run's renders into the
// accepted/ tree, the regression baseline. Regression mode only by
// construction: accept writes accepted/ and can never touch figma/ — in
// fidelity mode the Figma export IS the design, and a render that disagrees
// with it is wrong by definition, so there is nothing to "accept".
//
// Scope is explicit: --components or --all, never everything by default.
import fs from 'fs-extra';
import path from 'path';
import type { VisualWorkspace } from './paths.js';
import { readJson, writeJson } from './paths.js';
import { manifestEntries, DEFAULT_TARGET, type Manifest, type Target } from './types.js';

export function runAccept(
  vw: VisualWorkspace,
  opts: { components?: string[]; all?: boolean; target?: Target },
): { promoted: number } | null {
  if (!opts.all && !opts.components?.length) {
    console.error(
      '✗ accept needs an explicit scope: --components <keys...> or --all.\n' +
        '  Promoting everything silently would bless renders nobody reviewed.',
    );
    process.exitCode = 2;
    return null;
  }
  const manifest = readJson<Manifest>(vw.manifestPath);
  const only = opts.components?.length ? new Set(opts.components) : null;
  // One platform at a time. Promoting both from one call would bless whichever
  // renders happened to be on disk, including a platform nobody just shot.
  const target: Target = opts.target ?? DEFAULT_TARGET;

  let promoted = 0;
  for (const [kind, key] of manifestEntries(manifest, only)) {
    const renderDir = vw.dirFor('render', kind, key, target);
    if (!fs.existsSync(renderDir)) continue;
    const acceptedDir = vw.dirFor('accepted', kind, key, target);
    const files = fs.readdirSync(renderDir).filter((f) => f.endsWith('.png'));
    if (!files.length) continue;
    fs.mkdirSync(acceptedDir, { recursive: true });
    for (const file of files) {
      fs.copyFileSync(path.join(renderDir, file), path.join(acceptedDir, file));
      promoted += 1;
    }
    // Provenance: which run these came from, and how each shot was produced.
    const shotsPath = path.join(renderDir, '.shots.json');
    writeJson(path.join(acceptedDir, '.accepted.json'), {
      acceptedAt: new Date().toISOString(),
      from: fs.existsSync(shotsPath) ? readJson(shotsPath) : null,
    });
  }

  if (!promoted) {
    console.error(
      `✗ nothing to promote — no ${target} renders in scope. ` +
        `Shoot first: \`specs testing visual shoot --target ${target}\`.`,
    );
    process.exitCode = 1;
    return null;
  }
  console.log(`✓ accepted ${promoted} ${target} render(s) → testing/visual/accepted/${target}/`);
  return { promoted };
}
