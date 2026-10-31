/**
 * PROTOTYPE. Generates a per-style-key reference page from the JSON Schema, the
 * platform binding declarations, and the declared element tables the transforms
 * ship — the shape the hand-written site/src/content/docs/schema/styles/*.md
 * pages would become.
 *
 * Structure first. Every section is a table or a link list; prose appears only
 * where the schema's own `description` carries it. Nothing here is written by
 * hand, so nothing here can drift from what it describes.
 *
 * Deliberately limited to PROTOTYPE_KEYS and written to
 * mappings/_prototype-style-pages/, so it can be read beside the existing pages
 * rather than over them.
 *
 * Usage:  node scripts/build-style-pages.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const repo = resolve(pkg, '../..');
const outDir = join(pkg, 'mappings/_prototype-style-pages');

// One key per interesting shape: independent, cluster-resolved, and declared-unsupported.
const PROTOTYPE_KEYS = ['opacity', 'layoutSizingHorizontal', 'strokeDashPattern'];

const styles = JSON.parse(readFileSync(join(pkg, 'schema/styles.schema.json'), 'utf8'));
const defs = styles.definitions;
const props = defs.Styles.properties;

const bindings = Object.fromEntries(
  ['figma', 'css'].map((p) => [p, JSON.parse(readFileSync(join(pkg, `mappings/bindings/${p}.json`), 'utf8'))])
);

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const PLATFORM = { figma: 'Figma', css: 'CSS' };

/** The declared element tables the transforms ship. Absent when not checked out. */
const elementTables = () => {
  const paths = {
    capture: `${repo}/../specs-transforms/packages/specs-from-figma/src/Component/Styles/style-bindings.json`,
    render: `${repo}/../specs-transforms/packages/figma-from-specs/src/Styles/style-bindings.json`,
  };
  const out = {};
  for (const [name, p] of Object.entries(paths)) {
    if (existsSync(p)) out[name] = JSON.parse(readFileSync(p, 'utf8')).elements;
  }
  return out;
};
const tables = elementTables();

/** Flatten a value union into named types, following local $refs one hop. */
const typeRows = (node) => {
  const rows = [];
  const push = (label, link) => { if (!rows.some((r) => r[0] === label)) rows.push([label, link]); };
  const visit = (n, depth = 0) => {
    if (!n || depth > 3) return;
    if (n.$ref?.startsWith('#/definitions/')) {
      const name = n.$ref.replace('#/definitions/', '');
      const target = defs[name];
      // A *StyleValue wrapper is a union, not a type a reader names — descend.
      if (/StyleValue$/.test(name) && target) return visit(target, depth + 1);
      push(`\`${name}\``, `/schema/${kebab(name).replace(/^-/, '')}/`);
      return;
    }
    if (typeof n.type === 'string') push(`\`${n.type}\``, null);
    if (Array.isArray(n.type)) n.type.forEach((t) => push(`\`${t}\``, null));
    if (Array.isArray(n.enum)) push(n.enum.map((v) => `\`${JSON.stringify(v)}\``).join(' · '), null);
    for (const b of ['oneOf', 'anyOf', 'allOf']) if (Array.isArray(n[b])) n[b].forEach((x) => visit(x, depth + 1));
  };
  visit(node);
  return rows;
};

/**
 * ADRs that *decide* this key — derived, not hand-listed.
 *
 * Scoped to the title, the Summary line, and the Decision section. A key
 * appearing anywhere in an ADR's prose is usually incidental: scanning whole
 * files listed six ADRs for `layoutSizingHorizontal`, including one about icon
 * detection that merely quoted a YAML example. A decision about a key lives in
 * the section named Decision.
 */
const adrsFor = (key) => {
  const dir = join(repo, 'adr');
  if (!existsSync(dir)) return [];
  const re = new RegExp(`\\b${key}\\b`);
  const out = [];
  for (const f of readdirSync(dir).filter((f) => /^\d{3}-.*\.md$/.test(f))) {
    const src = readFileSync(join(dir, f), 'utf8');
    const title = (src.match(/^#\s+(?:ADR[\s-]*\d*\s*:\s*)?(.+)$/m)?.[1] ?? f).trim();
    const summary = src.match(/^\*\*Summary\*\*:\s*(.+)$/m)?.[1] ?? '';
    // The Decision section, up to the next top-level heading.
    const decision = src.match(/^## Decision\b[\s\S]*?(?=^## (?!Decision\b))/m)?.[0] ?? '';

    const decides = re.test(title) || re.test(summary) || re.test(decision);
    const mentions = re.test(src);
    if (!mentions) continue;

    const status = src.match(/^\*\*Status\*\*:\s*(\S+)/m)?.[1]?.replace(/[^A-Z]/gi, '') ?? '';
    out.push({ num: f.slice(0, 3), title, status, file: f, decides });
  }
  return out;
};

mkdirSync(outDir, { recursive: true });

for (const key of PROTOTYPE_KEYS) {
  const prop = props[key];
  if (!prop) { console.error(`unknown style key: ${key}`); process.exit(1); }

  const hasDefault = Object.prototype.hasOwnProperty.call(prop, 'default');
  const defaultCell = !hasDefault
    ? '**none declared**'
    : prop.default === null ? '`null` — apply nothing' : `\`${JSON.stringify(prop.default)}\``;

  const types = typeRows(prop)
    .map(([label, link]) => `| ${link ? `[${label}](${link})` : label} |`)
    .join('\n');

  // Supported on — from the declared tables, showing any capture/render divergence.
  let divergent = false;
  const elementRows = (() => {
    if (!Object.keys(tables).length) return null;
    const all = [...new Set(Object.keys(tables.capture ?? tables.render ?? {}))].sort();
    return all.map((t) => {
      const cap = tables.capture?.[t]?.includes(key);
      const ren = tables.render?.[t]?.includes(key);
      const mark = (b) => (b === undefined ? '—' : b ? 'yes' : 'no');
      const flag = cap !== undefined && ren !== undefined && cap !== ren;
      if (flag) divergent = true;
      return `| \`${t}\` | ${mark(cap)} | ${mark(ren)}${flag ? ' ⚠' : ''} |`;
    }).join('\n');
  })();

  const bindingRows = Object.entries(bindings).map(([platform, b]) => {
    const v = b.concepts.styles[key] ?? { disposition: 'unverified' };
    const disp = v.disposition === 'unverified' ? '**unverified**' : v.disposition;
    const realises = v.cluster
      ? `[\`${v.cluster}\`](/schema/mappings/${platform}/#${v.cluster.toLowerCase()})`
      : (v.target ? `\`${v.target}\`` : (v.module?.length ? v.module.map((m) => `\`${m}\``).join(', ') : '—'));
    return `| [${PLATFORM[platform]}](/schema/mappings/${platform}/) | ${disp} | ${realises} |`;
  }).join('\n');

  // Keys this one resolves alongside, per platform — a link list, not a sentence.
  const siblings = new Map();
  for (const [platform, b] of Object.entries(bindings)) {
    const cl = b.concepts.styles[key]?.cluster;
    if (!cl) continue;
    for (const k of b.concepts.styleClusters[cl].keys) {
      if (k !== key) siblings.set(k, (siblings.get(k) ?? []).concat(PLATFORM[platform]));
    }
  }
  const siblingRows = [...siblings.entries()].sort()
    .map(([k, ps]) => `| [\`${k}\`](/schema/styles/${kebab(k)}/) | ${ps.join(', ')} |`).join('\n');

  const adrs = adrsFor(key);
  const row = (a) => `| [ADR-${a.num}](/adr/${a.file.replace(/\.md$/, '')}/) | ${a.title} | ${a.status} |`;
  const decides = adrs.filter((a) => a.decides);
  const mentions = adrs.filter((a) => !a.decides);
  const adrRows = adrs.length
    ? `${
        decides.length
          ? `**Decides this key** — named in the ADR's title, summary, or Decision section.\n\n| ADR | Title | Status |\n|---|---|---|\n${decides.map(row).join('\n')}\n`
          : '**Decides this key.** None. No ADR names this key in its title, summary, or Decision section.\n'
      }${
        mentions.length
          ? `\n**Mentions it elsewhere** — context or an example, not a decision.\n\n| ADR | Title | Status |\n|---|---|---|\n${mentions.map(row).join('\n')}\n`
          : ''
      }`
    : null;

  const page = `---
title: "${key}"
description: "${(prop.description ?? `The ${key} style key`).replace(/"/g, '\\"').slice(0, 300)}"
tableOfContents: false
---

<!-- PROTOTYPE, generated by packages/schema/scripts/build-style-pages.mjs from
     schema/styles.schema.json, mappings/bindings/*.json, the transforms' declared
     element tables, and the ADR corpus. Not wired into the site. -->

${prop.description ?? ''}

#### Type(s)

| Type |
|---|
${types}

#### Default

| Value | Declared by |
|---|---|
| ${defaultCell} | ${hasDefault ? '[`styles.schema.json`](/schema/specification/#41a-an-absent-style-key-resolves-to-its-declared-default)' : '—'} |

#### Supported on

${elementRows
  ? `| Element | Captured | Rendered |\n|---|---|---|\n${elementRows}${divergent ? '\n\n⚠ Capture and render disagree about this key on that element type.' : ''}`
  : '*The transforms’ declared element tables are not available in this checkout.*'}

#### Platform bindings

| Platform | Disposition | Realised by |
|---|---|---|
${bindingRows}

${siblingRows ? `#### Resolved jointly with\n\nThis key does not map on its own. Its cluster's ordered case table is linked above.\n\n| Key | On |\n|---|---|\n${siblingRows}\n` : ''}
${adrRows ? `#### Decision records\n\n${adrRows}` : ''}
#### Rules

| Rule | Statement |
|---|---|
| [DSPEC-44](/schema/specification/#9-rule-catalogue) | Every \`Styles\` property declares a \`default\` valid against its own schema |
| [DSPEC-45](/schema/specification/#9-rule-catalogue) | A declared \`default\` is a literal, never a reference or conditional |
${siblingRows ? `| [DSPEC-47](/schema/specification/#9-rule-catalogue) | Jointly resolved keys are stated as an ordered case table, not prose |\n` : ''}
#### Source

| Format | File |
|---|---|
| JSON Schema | [\`packages/schema/schema/styles.schema.json\`](https://github.com/DirectedEdges/spectacular/blob/main/packages/schema/schema/styles.schema.json) |
| TypeScript | [\`packages/schema/types/Styles.ts\`](https://github.com/DirectedEdges/spectacular/blob/main/packages/schema/types/Styles.ts) |
| Specification | [§4.1a](/schema/specification/), [§11](/schema/specification/) |
`;

  writeFileSync(join(outDir, `${kebab(key)}.md`), page);
  console.log(`prototype style page: ${kebab(key)}.md — ${adrs.length} ADRs, ${siblings.size} sibling keys`);
}

console.log(`\n${PROTOTYPE_KEYS.length} pages in mappings/_prototype-style-pages/`);
