/**
 * ONE-OFF MIGRATION. Extracts the content the 44 hand-written style pages hold
 * that nothing else does, so generating those pages replaces them without
 * losing it.
 *
 * Two things are at risk:
 *
 *   1. Hand-authored example values, one per type per key — roughly 150 of them.
 *      These belong in the schema as `examples` (epic step 2), but converting a
 *      display string like `$token: DS.Radius.400<br>$type: dimension` into a
 *      JSON value that validates is careful work, and a bad conversion produces
 *      an invalid example that the step-6 test would then enforce. So they are
 *      preserved verbatim as display strings here, and the generator renders
 *      them until step 2 converts them properly.
 *
 *   2. "Figma key" prose on 15 pages, explaining which Figma property a key
 *      reads from and why the names diverge, with ADR links. Not derivable.
 *
 * Output: mappings/_style-page-content.json. Run once; the hand-written pages
 * can then be deleted.
 *
 * Usage:  node scripts/extract-style-page-content.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const pagesDir = resolve(pkg, '../../site/src/content/docs/schema/styles');

if (!existsSync(pagesDir)) {
  console.error(`not found: ${pagesDir}`);
  process.exit(1);
}

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const styleProps = Object.keys(
  JSON.parse(readFileSync(join(pkg, 'schema/styles.schema.json'), 'utf8')).definitions.Styles.properties
);

/** The body of a `#### <name>` section, up to the next heading. */
const section = (src, name) =>
  src.match(new RegExp(`^#### ${name}\\s*\\n([\\s\\S]*?)(?=^#### |\\Z)`, 'm'))?.[1]?.trim() ?? null;

const out = {};
let examples = 0;
let figmaNotes = 0;
const unmatched = [];

for (const file of readdirSync(pagesDir).filter((f) => f.endsWith('.md'))) {
  const key = camel(file.replace(/\.md$/, ''));
  if (!styleProps.includes(key)) { unmatched.push(file); continue; }

  const src = readFileSync(join(pagesDir, file), 'utf8');
  const entry = {};

  // Type(s) table: rows of `| Type | Example |`, keeping both cells verbatim.
  const types = section(src, 'Type\\(s\\)');
  if (types) {
    const rows = [...types.matchAll(/^\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*$/gm)]
      .filter(([, t]) => !/^-+$/.test(t) && t !== 'Type')
      .map(([, type, example]) => ({ type, example }))
      .filter((r) => r.example);
    if (rows.length) { entry.typeExamples = rows; examples += rows.length; }
  }

  const figmaKey = section(src, 'Figma key');
  if (figmaKey) { entry.figmaKeyNote = figmaKey; figmaNotes++; }

  // The intro line — the page's own one-sentence gloss, which may say more than
  // the schema's description.
  const body = src.replace(/^---[\s\S]*?^---\s*/m, '').trimStart();
  const intro = body.split('\n').find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('|'));
  if (intro) entry.intro = intro.trim();

  if (Object.keys(entry).length) out[key] = entry;
}

writeFileSync(
  join(pkg, 'mappings/_style-page-content.json'),
  JSON.stringify(
    {
      $comment:
        'Extracted from the hand-written site/src/content/docs/schema/styles/*.md pages so generating those pages loses nothing. typeExamples are DISPLAY STRINGS, not schema values — epic step 2 converts them into real `examples` on each Styles property, after which this file shrinks to whatever remains unmigrated.',
      extractedFrom: 'site/src/content/docs/schema/styles/',
      keys: out,
    },
    null,
    2
  ) + '\n'
);

console.log(`extracted ${Object.keys(out).length} keys: ${examples} type examples, ${figmaNotes} Figma-key notes`);
const missing = styleProps.filter((k) => !out[k]);
if (missing.length) console.log(`no page existed for: ${missing.join(', ')}`);
if (unmatched.length) console.log(`page matched no style key: ${unmatched.join(', ')}`);
