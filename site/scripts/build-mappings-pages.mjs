/**
 * Renders packages/schema/mappings/*.md as Starlight pages under
 * /schema/mappings/. The package files are the source of truth and are
 * themselves generated from mappings/bindings/*.json — this script only wraps
 * them in frontmatter, exactly as build-specification.mjs does.
 *
 * Run before `astro dev` or `astro build`, via `build:content`.
 *
 * Usage:  node scripts/build-mappings-pages.mjs
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const repo = resolve(root, '..');

const srcDir = resolve(repo, 'packages/schema/mappings');
const outDir = resolve(root, 'src/content/docs/schema/mappings');

const DESCRIPTIONS = {
  FIGMA: 'How the Figma binding realises the Specs schema — per-style-key disposition, value forms, and declared degradation',
  CSS: 'How the CSS binding realises the Specs schema — per-style-key disposition, ordered case tables for jointly resolved keys, and declared degradation',
  REACT: 'What the React binding adds to the CSS binding — platform surfaces and style overrides',
  WEBCOMPONENTS: 'What the Web Components binding adds to the CSS binding — platform surfaces and style overrides',
  DEFAULTS: 'What a consumer assumes when a style key is absent from a document — the spec-level default table, and why absence is ambiguous',
};

const TITLES = { DEFAULTS: 'Style Defaults', CSS: 'CSS', WEBCOMPONENTS: 'Web Components' };

if (!existsSync(srcDir)) {
  console.log('mappings pages: no packages/schema/mappings — nothing to render');
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

const files = readdirSync(srcDir).filter((f) => f.endsWith('.md'));
if (!files.length) {
  console.log('mappings pages: no .md files to render');
  process.exit(0);
}

for (const file of files) {
  const platform = file.replace(/\.md$/, '');
  const md = readFileSync(join(srcDir, file), 'utf8');

  // Starlight renders the frontmatter title as the H1; drop the source's own.
  const body = md.replace(/^# .+\n/, '');

  // The package file links to ../SPECIFICATION.md, which is not the site's shape.
  let linked = body.replace(/\]\(\.\.\/SPECIFICATION\.md\)/g, '](/schema/specification/)');

  // A dependent binding links its base as CSS.md, and every page links
  // DEFAULTS.md. On the site those are routes under /schema/mappings/.
  linked = linked.replace(/\]\(([A-Z]+)\.md\)/g, (_, p) => `](/schema/mappings/${p.toLowerCase()}/)`);

  // Binding data files are not published; point at the repo instead.
  linked = linked.replace(
    /\]\(bindings\/([A-Za-z_.-]+)\)/g,
    (_, f) => `](https://github.com/DirectedEdges/spectacular/blob/main/packages/schema/mappings/bindings/${f})`
  );

  const title = TITLES[platform] ?? platform.charAt(0) + platform.slice(1).toLowerCase();
  const page = `---
title: "${title}"
description: "${DESCRIPTIONS[platform] ?? `How the ${title} binding realises the Specs schema`}"
---

<!-- Generated from packages/schema/mappings/${file} by scripts/build-mappings-pages.mjs — edit mappings/bindings/${platform.toLowerCase()}.json, not this file. -->

${linked}`;

  writeFileSync(join(outDir, `${platform.toLowerCase()}.md`), page);
  console.log(`mappings pages: wrote /schema/mappings/${platform.toLowerCase()}`);
}
