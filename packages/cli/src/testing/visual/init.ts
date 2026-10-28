// `specs testing visual init` — scaffold testing/visual/, declaring the
// customer-installed dependencies. The same contract as `specs storybook
// init` (ADR A): we write a package.json naming Playwright, pixelmatch and
// pngjs; the customer runs the one install this prints; the CLI ships none
// of them and the published package gains no dependency.
//
// --force rewrites the scaffold's own files only — it never touches
// visual-ignore.yaml or anything else hand-kept beside them. The ignore file
// is seeded once, when it does not exist: it holds the workspace's own
// scoring judgments, and every one of them is a decision --force has no
// business discarding.
import fs from 'fs-extra';
import path from 'path';
import type { VisualWorkspace } from './paths.js';
import { SCORING_DEFAULTS } from './ignore.js';

const PACKAGE_JSON = {
  name: 'specs-visual-testing',
  private: true,
  version: '0.0.0',
  description:
    'Dependencies for `specs testing visual` — installed by you, resolved by the CLI at runtime.',
  devDependencies: {
    pixelmatch: '^7.2.0',
    playwright: '^1.63.0',
    pngjs: '^7.0.0',
  },
};

const GITIGNORE = `# Per-run outputs, rebuilt on demand.
node_modules/
render/
diff/
# Figma baselines: durable but large, reproducible via \`specs testing visual baseline\`.
figma/
`;

// Seeded, not enforced: the defaults are the ones the diff already applies,
// written out so the file exists and its shape is obvious before the first
// judgment goes in. The note rule is stated here because it is the one thing
// about this file that is not self-evident from its keys.
const IGNORE_SEED = (defaults: typeof SCORING_DEFAULTS) =>
  `# What this workspace's fixtures cannot settle — and why.
#
# Rendering engines never fully agree: Chrome and Figma rasterize the same
# text differently, and a design file has quirks no tool should silently
# absorb. Record those judgments here.
#
# Every entry needs a note: saying why. These entries suppress real signal,
# and the note is what lets the next person tell a permanent measurement fact
# from a temporary allowance — an entry without one is indistinguishable from
# a bug someone hid. The diff warns when it is missing.
#
# Prefer the narrowest key that works: a raised passPct over skipVariants,
# skipVariants over skip. A skipped component can regress invisibly.

# The diff's own defaults, written out. Raise them per workspace if its
# fixtures need it, or delete this block to keep the shipped values.
$defaults:
  passPct: ${defaults.passPct}
  dimTolerancePx: ${defaults.dimTolerancePx}
  threshold: ${defaults.threshold}

# Scoring keys re-score on a diff alone — seconds, no browser:
#   passPct, dimTolerancePx, threshold, skip, skipVariants
#
# These two are read when the manifest is built, so they need a rebuild and a
# re-shoot before they mean anything:
#   sampleVariants, pinWidth
#
# components:
#   badge:
#     passPct: 8
#     note: letterform-only noise until the licensed fonts land
#
# compositions:
#   homeSmall:
#     skip: true
#     note: awaiting image fixtures
`;

export function runInit(vw: VisualWorkspace, opts: { force?: boolean }): void {
  const pkgPath = path.join(vw.root, 'package.json');
  if (fs.existsSync(pkgPath) && !opts.force) {
    seedIgnore(vw);
    console.log('✓ testing/visual/ is already scaffolded (--force rewrites the scaffold).');
    printInstall(vw);
    return;
  }
  fs.mkdirSync(vw.root, { recursive: true });
  fs.writeFileSync(pkgPath, JSON.stringify(PACKAGE_JSON, null, 2) + '\n');
  const giPath = path.join(vw.root, '.gitignore');
  if (!fs.existsSync(giPath) || opts.force) fs.writeFileSync(giPath, GITIGNORE);
  seedIgnore(vw);
  console.log('✓ scaffolded testing/visual/ — one install, yours, and it is ready:');
  printInstall(vw);
}

/** Write visual-ignore.yaml only when absent — never on --force. */
function seedIgnore(vw: VisualWorkspace): void {
  if (fs.existsSync(vw.ignorePath)) return;
  fs.mkdirSync(path.dirname(vw.ignorePath), { recursive: true });
  fs.writeFileSync(vw.ignorePath, IGNORE_SEED(SCORING_DEFAULTS));
  console.log(`✓ seeded ${path.basename(vw.ignorePath)} with the diff's own defaults`);
}

function printInstall(vw: VisualWorkspace): void {
  const rel = path.relative(process.cwd(), vw.root) || '.';
  console.log('');
  console.log(`  cd ${rel} && npm install && npx playwright install chromium`);
  console.log('');
  console.log('  Then: manifest → baseline → shoot → diff. `specs testing visual --help` lists the stages.');
}
