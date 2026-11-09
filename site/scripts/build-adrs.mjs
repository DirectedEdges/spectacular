/**
 * Reads ACCEPTED ADRs from adr/ and emits one Starlight page each into
 * site/src/content/docs/adr/, plus an index page.  Run before `astro dev`
 * or `astro build`.
 *
 * Usage:  node scripts/build-adrs.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adrStatus, adrTitle } from './lib/adr.mjs';
import { createEmitter } from './lib/emit.mjs';
import { quoteScalar } from './lib/markdown.mjs';
import { adrDir, docs } from './lib/paths.mjs';

const srcDir = adrDir;
const outDir = join(docs, 'adr');

/** Escape text destined for raw HTML in the generated index. */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Markdown inside a raw HTML block is passed through untouched, so text
 * carrying `code spans` needs them rendered here.
 */
function renderInline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, href) => {
      // Cross-references are bare ADR slugs. Link only to records that are
      // actually published — drafts would 404.
      const slug = href.replace(/^\.?\/?/, '').replace(/\.md$/, '');
      if (/^\d{3}-/.test(slug)) {
        return published.has(slug) ? `<a href="/adr/${slug}/">${label}</a>` : label;
      }
      return `<a href="${href}">${label}</a>`;
    })
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

/** Slugs of the records this build publishes, for cross-reference linking. */
const published = new Set();

/**
 * The `**Summary**:` line from the metadata block, authored at implementation
 * time. There is deliberately no fallback — an unwritten summary shows up as a
 * blank index row rather than as plausible-looking prose lifted from Context.
 */
function extractSummary(md) {
  const m = md.match(/^\*\*Summary\*\*:\s*(.+)$/m);
  if (!m) return null;
  const text = m[1].trim();
  return /^\*\(.*\)\*$/.test(text) ? null : text;
}

/** Drop the H1 — Starlight renders the title from frontmatter. */
function stripTitle(md) {
  return md.replace(/^#\s+.+$/m, '').replace(/^\n+/, '');
}

/**
 * The `**Key**: value` lines opening every ADR are consecutive, so markdown
 * joins them into one run-on paragraph. Render them as a label/value grid
 * instead, and drop the horizontal rule that followed the block.
 *
 * `Branch` is dropped — it names a merged branch that no longer exists.
 * `Created` folds into the Status row, and `Supersedes` appears only when it
 * actually points at a prior record.
 */
function formatMetadata(md) {
  return md.replace(/^((?:\*\*[A-Za-z]+\*\*:.*\n)+)(\n---\n)?/, (match, block) => {
    const fields = Object.fromEntries(
      [...block.matchAll(/^\*\*([A-Za-z]+)\*\*:\s*(.*)$/gm)].map(([, key, value]) => [
        key,
        value.trim(),
      ]),
    );

    const status = [fields.Status, fields.Created].filter(Boolean).join(' · ');
    // Many records use Supersedes for an "(none — extends ADR-0xx)" aside;
    // only a value that actually names a superseded record earns a row.
    const raw = fields.Supersedes ?? '';
    const supersedes = /^\*?\(?\s*none\b/i.test(raw.trim()) || !raw.trim() ? null : raw;

    const rows = [
      ['Summary', fields.Summary],
      ['Status', status],
      ['Deciders', fields.Deciders],
      ['Supersedes', supersedes],
    ]
      .filter(([, value]) => value)
      .map(
        ([label, value]) =>
          `<div class="adr-meta-row"><dt>${label}</dt><dd>${renderInline(value)}</dd></div>`,
      );

    return rows.length ? `<dl class="adr-meta">\n${rows.join('\n')}\n</dl>\n` : match;
  });
}

const files = readdirSync(srcDir)
  .filter(f => /^\d{3}-.+\.md$/.test(f))
  .sort();

const accepted = [];

for (const file of files) {
  const md = readFileSync(join(srcDir, file), 'utf-8');
  if (adrStatus(md) !== 'ACCEPTED') continue;

  const title = adrTitle(md);
  if (!title) {
    console.warn(`⚠ ${file}: no H1 title, skipped`);
    continue;
  }
  const slug = file.replace(/\.md$/, '');
  published.add(slug);
  accepted.push({ file, md, slug, title, number: file.slice(0, 3) });
}

// Bodies are rendered in a second pass so cross-references can be resolved
// against the full set of published records.
const adrs = accepted.map(({ file, md, slug, title, number }) => {
  const summary = extractSummary(md);
  if (!summary) console.warn(`⚠ ${file}: no **Summary** in the metadata block`);
  return { number, slug, title, summary, body: formatMetadata(stripTitle(md)) };
});

// Written in place and swept, not wiped and rebuilt. The wipe is why `adr/`
// could not be watched: removing this whole directory and writing it back takes
// a running `astro dev` down, so an ADR edit could not trigger a rebuild. A
// record that is deleted or moves out of ACCEPTED still loses its page — the
// sweep removes any markdown this run did not write.
const emit = createEmitter({ root: outDir, label: 'site/src/content/docs/adr/' });

for (const adr of adrs) {
  const frontmatter = [
    '---',
    `title: ${quoteScalar(adr.title)}`,
    adr.summary ? `description: ${quoteScalar(adr.summary.replace(/`/g, ''))}` : null,
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  emit.write(join(outDir, `${adr.slug}.md`), `${frontmatter}\n\n${adr.body}`);
}

const rows = [...adrs]
  .reverse()
  .map(a => {
    const summary = a.summary
      ? `\n<p class="adr-summary">${renderInline(a.summary)}</p>`
      : '';
    return `<tr>
<td class="adr-number">${a.number}</td>
<td class="adr-entry"><a href="/adr/${a.slug}/">${renderInline(a.title)}</a>${summary}</td>
</tr>`;
  })
  .join('\n');

const index = `---
title: "Decision Records (ADRs)"
description: "Accepted architecture decisions shaping the Spectacular schema, CLI, and plugin."
tableOfContents: false
---

Every field in the Spectacular schema exists because of a decision about what a design system needs to express and how Figma exposes it. An **Architecture Decision Record** captures one such decision: the problem, the options weighed, the choice made, and the designs rejected along the way.

Where [Schema](/schema/) and [Settings](/settings/) tell you what a field is, an ADR tells you why it looks that way — read one when a field's shape surprises you, or when you're weighing a change. Only accepted decisions appear here, newest first, each left as written, so later records may supersede earlier ones.

<table class="adr-index">
<tbody>
${rows}
</tbody>
</table>
`;

emit.write(join(outDir, 'index.md'), index);
console.log(emit.summary(emit.commit()));
