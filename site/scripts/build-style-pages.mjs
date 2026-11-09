/**
 * Generates the style reference pages as a tree that mirrors the schema's own
 * containment, replacing the flat `styles/` plus `types/` pair.
 *
 * There is no "member" concept here. The schema has nested definitions, and a
 * page's path is the path by which you reach the value it documents, so a URL
 * reads as an access path: `/schema/styles/effects/shadows/offset-x/` is
 * `styles.effects.shadows[].offsetX`. That generalises — a new nested type needs
 * no new vocabulary and no new rule.
 *
 * Three things are deliberately not nested:
 *
 *   - **Value-union wrappers** (`*StyleValue`). A key's value may be a literal,
 *     a token, a binding or a conditional; that is the set of forms the value
 *     takes, not a thing it contains. Traversal descends through them.
 *   - **Value forms** themselves — `TokenReference`, `PropBinding`,
 *     `Conditional`. They are reachable from nearly every key, so nesting them
 *     would repeat `$token`, `$type` and `$extensions` under all 46 and inflate
 *     the tree from 113 pages to 307. They are documented once at the schema
 *     root and linked.
 *   - **A union's named object branches** — see `BRANCH_TYPES`. Three gradient
 *     types differing by one `const` are three shapes of one thing, so they are
 *     expanded side by side on the union's page where the difference is legible,
 *     and the types they reference sit one level below the union rather than
 *     four levels below a style key.
 *
 * Usage:  node scripts/build-style-pages.mjs
 */

import { readFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
// All page copy and migration constants live in content/ — this script holds
// structure only: headings, labels, traversal, and assembly.
import {
  REHOMED, STALE_CONTENT_FOLDERS,
} from './content/style-pages.mjs';
import { loadAdrs } from './lib/adr.mjs';
import { createEmitter } from './lib/emit.mjs';
import { buildStyleTree } from './lib/style-tree.mjs';
import { renderStylePage, pageFileName } from './pages/style-page.mjs';
import { docsSchema, schemaDir, mappingsDir, bindingsDir, adrDir, transforms } from './lib/paths.mjs';

const outRoot = join(docsSchema, 'styles');

/**
 * The style definitions, with `component.schema.json`'s underneath them.
 *
 * A style value may branch to `PropBinding`, which lives in the component
 * schema — a legitimate cross-file `$ref`. Reading only this file left that
 * branch with no title and no description, so `visible` listed a form it could
 * not describe. The styles file wins on any name collision, because this
 * generator documents styles.
 */
const defs = {
  ...JSON.parse(readFileSync(join(schemaDir, 'component.schema.json'), 'utf8')).definitions,
  ...JSON.parse(readFileSync(join(schemaDir, 'styles.schema.json'), 'utf8')).definitions,
};

const preservedFile = join(mappingsDir, '_style-page-content.json');
const preserved = existsSync(preservedFile) ? JSON.parse(readFileSync(preservedFile, 'utf8')) : { keys: {}, typePages: {} };

/**
 * Figma and CSS only, not every platform with a binding file.
 *
 * A style key's binding is a fact about how a visual property is captured and
 * rendered, which is what those two describe. React and Web Components bind
 * props and anatomy, and their style story is the CSS one — so the prop and
 * anatomy pages read all four and these pages read two. Deliberate scope, not
 * an omission: widening it would add two sections per page saying what the CSS
 * section already says.
 */
const STYLE_PLATFORMS = ['figma', 'css'];
const bindings = Object.fromEntries(
  STYLE_PLATFORMS.map((p) => [p, JSON.parse(readFileSync(join(bindingsDir, `${p}.json`), 'utf8'))])
);


const rehome = (s) =>
  typeof s === 'string'
    ? s.replace(/\/schema\/([a-z-]+)\//g, (m, slug) => REHOMED[slug] ?? m)
    : s;

/** Pages written by hand at the schema root, which this must not overwrite. */
const handWritten = new Set(
  readdirSync(docsSchema).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
);

/** The declared element tables the transforms ship. Absent when not checked out. */
const elementTables = (() => {
  const paths = {
    capture: join(transforms, 'packages/specs-from-figma/src/Component/Styles/style-bindings.json'),
    render: join(transforms, 'packages/figma-from-specs/src/Styles/style-bindings.json'),
  };
  const out = {};
  for (const [name, p] of Object.entries(paths)) {
    if (existsSync(p)) out[name] = JSON.parse(readFileSync(p, 'utf8')).elements;
  }
  return out;
})();

const adrs = loadAdrs(adrDir);

const tree = buildStyleTree({ defs, handWritten });
const { nodes, isValueForm, depths } = tree;

for (const stale of STALE_CONTENT_FOLDERS) {
  if (existsSync(join(docsSchema, stale))) rmSync(join(docsSchema, stale), { recursive: true, force: true });
}

const emit = createEmitter({ root: outRoot, label: 'site/src/content/docs/schema/styles/' });

const ctx = { defs, tree, bindings, preserved, elementTables, adrs, rehome };

for (const node of nodes) {
  emit.write(join(outRoot, ...pageFileName(node.path)), renderStylePage(node, ctx));
}

console.log(emit.summary(emit.commit()));
console.log(`by depth: ${Object.entries(depths()).map(([d, c]) => `${d}:${c}`).join('  ')}`);
console.log(
  `value forms kept at the schema root and linked: ${Object.keys(defs).filter(isValueForm).join(', ')}`
);
