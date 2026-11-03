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

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
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

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, '');

/**
 * Style keys that have a generated reference page. Read from the page tree
 * rather than the schema, so a key whose page is missing is never linked.
 */
const STYLE_KEYS = (() => {
  const dir = resolve(root, 'src/content/docs/schema/styles');
  if (!existsSync(dir)) return [];
  const slugs = new Set(
    readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
  );
  const schema = resolve(repo, 'packages/schema/schema/styles.schema.json');
  if (!existsSync(schema)) return [];
  return Object.keys(JSON.parse(readFileSync(schema, 'utf8')).definitions.Styles.properties)
    .filter((k) => slugs.has(kebab(k)))
    // Longest first, so `maxWidth` is not shadowed by a prefix match on `max`.
    .sort((a, b) => b.length - a.length);
})();

if (!existsSync(srcDir)) {
  console.log('mappings pages: no packages/schema/mappings — nothing to render');
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

/**
 * Every source page, as `{ file, out, platform }`. Platform bindings sit at the
 * top of `mappings/`; each binding's clusters sit in `mappings/clusters/<platform>/`
 * and publish under that binding's own route, so a URL reads
 * `/schema/mappings/css/clusters/auto-layout/`.
 */
const sources = (() => {
  const out = readdirSync(srcDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ file: f, abs: join(srcDir, f), out: `${f.replace(/\.md$/, '').toLowerCase()}.md`, platform: f.replace(/\.md$/, '') }));

  const clusterRoot = join(srcDir, 'clusters');
  if (existsSync(clusterRoot)) {
    for (const platform of readdirSync(clusterRoot)) {
      const dir = join(clusterRoot, platform);
      if (!statSync(dir).isDirectory()) continue;
      for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
        out.push({
          file: `clusters/${platform}/${f}`,
          abs: join(dir, f),
          out: `${platform}/clusters/${f}`,
          platform: platform.toUpperCase(),
          isCluster: true,
        });
      }
    }
  }
  return out;
})();

if (!sources.length) {
  console.log('mappings pages: no .md files to render');
  process.exit(0);
}

// Replace wholesale, so a renamed or deleted cluster cannot leave a page behind.
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const source of sources) {
  const { file, abs, platform, isCluster } = source;
  const md = readFileSync(abs, 'utf8');

  // Starlight renders the frontmatter title as the H1; drop the source's own.
  const body = md.replace(/^# .+\n/, '');

  // The package file links to ../SPECIFICATION.md, which is not the site's shape.
  let linked = body.replace(/\]\(\.\.\/SPECIFICATION\.md\)/g, '](/schema/specification/)');

  // A binding page links its clusters as clusters/<platform>/<name>.md; a
  // cluster page links back to its binding as ../<platform>.md.
  linked = linked
    .replace(/\]\(clusters\/([a-z]+)\/([a-z-]+)\.md\)/g, (_, p, c) => `](/schema/mappings/${p}/clusters/${c}/)`)
    .replace(/\]\(\.\.\/([a-z]+)\.md\)/g, (_, p) => `](/schema/mappings/${p}/)`);

  // A dependent binding links its base as CSS.md, and every page links
  // DEFAULTS.md. On the site those are routes under /schema/mappings/.
  linked = linked.replace(/\]\(([A-Z]+)\.md\)/g, (_, p) => `](/schema/mappings/${p.toLowerCase()}/)`);

  // Binding data files are not published; point at the repo instead.
  linked = linked.replace(
    /\]\(bindings\/([A-Za-z_.-]+)\)/g,
    (_, f) => `](https://github.com/DirectedEdges/spectacular/blob/main/packages/schema/mappings/bindings/${f})`
  );

  /**
   * A style key in backticks becomes a link to its reference page. These pages
   * name the same 46 keys dozens of times each and every one was dead text,
   * which made the mapping a dead end rather than a way into the reference.
   *
   * Only bare keys are rewritten. A key already carrying a link, or part of a
   * dotted path like `styles.padding`, is left alone. A key whose own page does
   * not exist is skipped rather than linked to a 404.
   */
  linked = (() => {
    const keys = STYLE_KEYS.filter((k) => !linked.includes(`[\`${k}\``));
    if (!keys.length) return linked;
    const re = new RegExp(`(?<![\\[\`\\w.])\`(${keys.join('|')})\`(?![\\]\`.])`, 'g');
    return linked.replace(re, (_, k) => `[\`${k}\`](/schema/styles/${kebab(k)}/)`);
  })();

  // A cluster's own name is its title, taken from the source H1 the body drops.
  const clusterName = isCluster ? (md.match(/^# (.+)$/m)?.[1] ?? '').trim() : null;
  const title = clusterName ?? TITLES[platform] ?? platform.charAt(0) + platform.slice(1).toLowerCase();
  const description = clusterName
    ? `How the ${TITLES[platform] ?? platform} binding resolves the ${clusterName} cluster — its operand set and ordered case table`
    : (DESCRIPTIONS[platform] ?? `How the ${title} binding realises the Specs schema`);

  const page = `---
title: "${title}"
description: "${description}"
---

<!-- Generated from packages/schema/mappings/${file} by scripts/build-mappings-pages.mjs — edit mappings/bindings/${platform.toLowerCase()}.json, not this file. -->

${linked}`;

  const out = join(outDir, source.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page);
  console.log(`mappings pages: wrote /schema/mappings/${source.out.replace(/\.md$/, '')}`);
}
