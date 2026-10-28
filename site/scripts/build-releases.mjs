/**
 * Reads CHANGELOG.md from each package and assembles a single
 * Starlight MDX page with tabs.  Run before `astro dev` or `astro build`.
 *
 * Usage:  node scripts/build-releases.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const repo = resolve(root, '..');

const schemaLog = readFileSync(resolve(repo, 'packages/schema/CHANGELOG.md'), 'utf-8');
const cliLog = readFileSync(resolve(repo, 'packages/cli/CHANGELOG.md'), 'utf-8');

/** Strip preamble and downshift headings so ## becomes ###, ### becomes #### */
function stripPreamble(md) {
  const lines = md.split('\n');
  const firstVersion = lines.findIndex(l => /^## \[/.test(l));
  const content = firstVersion >= 0 ? lines.slice(firstVersion).join('\n') : md;
  return content.replace(/^(#{2,}) /gm, '#$1 ');
}

/**
 * Replicate github-slugger's algorithm (used by Astro/Starlight for heading IDs).
 * 1. Lowercase  2. Strip non-alphanumeric except spaces & hyphens  3. Spaces → hyphens
 */
function githubSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]/gu, '')
    .replace(/ /g, '-');
}

/**
 * Extract version entries from a changelog.
 * Input: `## [0.18.0] - Unreleased`
 */
function extractVersions(md) {
  const versions = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^## \[([^\]]+)\]\s*-?\s*(.*)/);
    if (m) {
      const ver = m[1];
      const suffix = m[2]?.trim();
      const label = suffix ? `${ver} — ${suffix}` : ver;
      // Build the heading text as it appears after downshift: [ver] - suffix
      const headingText = suffix ? `[${ver}] - ${suffix}` : `[${ver}]`;
      const slug = githubSlug(headingText);
      versions.push({ slug, label });
    }
  }
  return versions;
}

/** Build a sticky nav column as JSX-compatible HTML */
function buildTocNav(versions) {
  if (versions.length === 0) return '';
  const items = versions.map(v =>
    `<li><a href="#${v.slug}">${v.label}</a></li>`
  ).join('\n');
  return `<nav className="releases-toc" aria-label="Version navigation">
<p className="releases-toc-title">Versions</p>
<ul>
${items}
</ul>
</nav>`;
}

const schemaContent = stripPreamble(schemaLog);
const cliContent = stripPreamble(cliLog);

const schemaVersions = extractVersions(schemaLog);
const cliVersions = extractVersions(cliLog);

const outDir = resolve(root, 'src/content/docs/overview');
mkdirSync(outDir, { recursive: true });

const page = `---
title: "Releases"
description: "Changelog for @directededges/specs-schema and @directededges/specs-cli"
tableOfContents: false
---

import { Tabs, TabItem } from '@astrojs/starlight/components';

Version history for both Spectacular packages. Each release follows [Semantic Versioning](https://semver.org/).

<Tabs>
<TabItem label="@specs-schema">
<div className="releases-grid">
<div className="releases-body">

${schemaContent}

</div>
${buildTocNav(schemaVersions)}
</div>
</TabItem>
<TabItem label="@specs-cli">
<div className="releases-grid">
<div className="releases-body">

${cliContent}

</div>
${buildTocNav(cliVersions)}
</div>
</TabItem>
</Tabs>
`;

writeFileSync(resolve(outDir, 'releases.mdx'), page);
console.log('✓ Built site/src/content/docs/overview/releases.mdx');
