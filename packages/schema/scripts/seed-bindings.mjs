/**
 * DEV-ONLY. Seeds a platform binding file from a transform implementation, so the
 * declaration starts from what the code actually does rather than from memory.
 *
 * This script is never part of a build. `spectacular` is the open, published repo
 * and must build with no sibling checkout present; the binding files it writes are
 * checked in and become the source of truth. Derivation happens once, here, and is
 * re-checked by verify-bindings.mjs — which also skips cleanly when the
 * implementation is absent.
 *
 * Figma: reads `figma-from-specs/src/Styles/keys.ts`, whose STYLE_KEYS tuples are a
 * declared, compile-verified per-element-type table. That is real data and is
 * transcribed as `elements`.
 *
 * React: the CSS transform declares nothing — 16 independent `'key' in styles`
 * modules, deliberately not a dispatch (specs#691). Key coverage is recovered by
 * scanning each module for style-key literals, which is partial: a module that
 * reads its keys indirectly yields nothing. Anything not recovered is emitted as
 * `disposition: "unverified"` rather than guessed.
 *
 * Usage:
 *   node scripts/seed-bindings.mjs figma  [path-to-specs-transforms]
 *   node scripts/seed-bindings.mjs react  [path-to-spectacular-root]
 *
 * Output goes to stdout. Review it, then redirect into
 * mappings/bindings/<platform>.json — never overwrite a hand-annotated file blind.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');

const styleKeys = () => {
  const schema = JSON.parse(readFileSync(join(pkg, 'schema/styles.schema.json'), 'utf8'));
  return Object.keys(schema.definitions.Styles.properties);
};

/** STYLE_KEYS tuples in keys.ts → { ELEMENT_TYPE: [key, ...] }, group aliases expanded. */
const figmaElementTable = (source) => {
  const groups = {};
  // `const NAME = [ 'a', 'b', ...SPREAD ] as const satisfies ...`
  const re = /const\s+([A-Z_]+)\s*=\s*\[([\s\S]*?)\]\s*as const/g;
  let m;
  while ((m = re.exec(source))) {
    const [, name, body] = m;
    const literals = [...body.matchAll(/'([a-zA-Z]+)'/g)].map((x) => x[1]);
    const spreads = [...body.matchAll(/\.\.\.([A-Z_]+)/g)].map((x) => x[1]);
    groups[name] = { literals, spreads };
  }
  const seen = new Set();
  const expand = (name) => {
    if (seen.has(name)) return [];
    seen.add(name);
    const g = groups[name];
    if (!g) return [];
    const out = [...g.literals];
    for (const s of g.spreads) out.push(...expand(s));
    seen.delete(name);
    return out;
  };
  const ELEMENT_TYPES = [
    'COMPONENT', 'FRAME', 'SLOT', 'INSTANCE', 'TEXT',
    'VECTOR', 'ELLIPSE', 'STAR', 'POLYGON', 'RECTANGLE', 'LINE', 'GLYPH',
  ];
  const table = {};
  for (const t of ELEMENT_TYPES) {
    if (groups[t]) table[t] = [...new Set(expand(t))];
  }
  return table;
};

const seedFigma = (root) => {
  const keysFile = join(root, 'packages/figma-from-specs/src/Styles/keys.ts');
  if (!existsSync(keysFile)) {
    console.error(`not found: ${keysFile}\nPass the specs-transforms root as the second argument.`);
    process.exit(1);
  }
  const table = figmaElementTable(readFileSync(keysFile, 'utf8'));
  const bindings = {};
  for (const key of styleKeys()) {
    const elements = Object.entries(table)
      .filter(([, keys]) => keys.includes(key))
      .map(([t]) => t.toLowerCase());
    bindings[key] = elements.length
      ? { disposition: 'unverified', elements, target: null, notes: null }
      : { disposition: 'unsupported', elements: [], target: null, notes: 'Not in any STYLE_KEYS list — the writer warns and skips.' };
  }
  return bindings;
};

const seedReact = (root) => {
  const dir = join(root, 'packages/cli/src/transforms/css/style');
  if (!existsSync(dir)) {
    console.error(`not found: ${dir}`);
    process.exit(1);
  }
  const all = styleKeys();
  const byKey = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(join(dir, file), 'utf8');
    for (const key of all) {
      if (new RegExp(`['"\`]${key}['"\`]|\\.${key}\\b`).test(src)) {
        (byKey[key] ??= []).push(file.replace(/\.ts$/, ''));
      }
    }
  }
  const bindings = {};
  for (const key of all) {
    bindings[key] = byKey[key]
      ? { disposition: 'unverified', module: byKey[key], declarations: null, notes: null }
      : { disposition: 'unverified', module: [], declarations: null, notes: 'No module literal matched — coverage not recoverable by scan; confirm by hand.' };
  }
  return bindings;
};

/**
 * Style defaults are NOT a per-platform concern: "an absent key means X" is a
 * statement about the document, and every platform must agree on it or they
 * disagree about what the same spec says.
 *
 * They are nonetheless declared in exactly one place today — STYLE_DEFAULTS in
 * specs-from-figma/src/Component/Styles/defaults.ts — and nowhere in this repo.
 * A consumer outside that package cannot correctly interpret an omitted style
 * key. Seeding them here is the first step to giving them a home in the
 * contract; see the recommendation in the assessment.
 */
const seedDefaults = (root) => {
  const file = join(root, 'packages/specs-from-figma/src/Component/Styles/defaults.ts');
  if (!existsSync(file)) {
    console.error(`not found: ${file}`);
    process.exit(1);
  }
  const src = readFileSync(file, 'utf8');
  const parsed = Object.fromEntries(
    [...src.matchAll(/^\s{2}([a-zA-Z]+):\s*(.+?),\s*$/gm)].map(([, k, v]) => [k, v.trim()])
  );
  const lit = (v) =>
    v === 'null' ? null : v === 'true' ? true : v === 'false' ? false
      : /^-?\d+(\.\d+)?$/.test(v) ? Number(v)
      : v.replace(/^'(.*)'$/, '$1');

  const out = {};
  for (const key of styleKeys()) {
    const has = key in parsed;
    out[key] = {
      assumed: has ? lit(parsed[key]) : null,
      declaredBy: has
        ? 'specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS)'
        : 'none',
      notes: has ? null : 'No declared default — a consumer reading this key as absent is guessing.',
    };
  }
  return out;
};

const [platform, rootArg] = process.argv.slice(2);
const defaults = {
  figma: resolve(pkg, '../../../specs-transforms'),
  react: resolve(pkg, '../..'),
  defaults: resolve(pkg, '../../../specs-transforms'),
};

if (!['figma', 'react', 'defaults'].includes(platform)) {
  console.error('Usage: node scripts/seed-bindings.mjs <figma|react|defaults> [root]');
  process.exit(1);
}

const root = rootArg ? resolve(rootArg) : defaults[platform];

if (platform === 'defaults') {
  console.log(JSON.stringify({
    kind: 'style-defaults',
    seededFrom: root,
    note: 'What a consumer assumes when a style key is ABSENT from a document. Spec-level, not per-platform: platforms that disagree here disagree about what the same document says.',
    caveat: 'Absence is ambiguous today. removeDefaults drops any style whose value is null, so an absent key may mean "equal to the default" OR "evaluated to null for a structural reason" — strokeAlign is forced null when no visible stroke exists, which is not the same as strokeAlign being INSIDE. A consumer cannot tell these apart from the document.',
    homeProblem: 'STYLE_DEFAULTS is declared only in specs-from-figma and is referenced nowhere in the spectacular repo. Until it lives in the contract, no consumer outside that package can interpret an omitted key correctly.',
    defaults: seedDefaults(root),
  }, null, 2));
  process.exit(0);
}

const styles = platform === 'figma' ? seedFigma(root) : seedReact(root);

console.log(JSON.stringify({
  platform,
  seededFrom: root,
  note: 'disposition "unverified" means the scan found coverage but nobody has confirmed the mapping. Fill target/declarations and notes by hand, then set bound | approximated | unsupported.',
  concepts: { styles },
}, null, 2));
