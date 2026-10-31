/**
 * Generates the per-style-key reference pages from the JSON Schema, the
 * platform binding declarations, and the declared element tables the transforms
 * ship, and the content preserved from the pages these replace.
 *
 *
 * Structure first. Every section is a table or a link list; prose appears only
 * where the schema's own `description` carries it. Nothing here is written by
 * hand, so nothing here can drift from what it describes.
 *
 * Writes all 46 pages into site/src/content/docs/schema/styles/, replacing the
 * hand-written ones. Those pages held 111 type examples and 15 Figma-key notes
 * that nothing else carried; extract-style-page-content.mjs captured them first.
 *
 * Usage:  node scripts/build-style-pages.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const repo = resolve(pkg, '../..');
const outDir = resolve(pkg, '../../site/src/content/docs/schema/styles');

/**
 * Preserved content from the hand-written pages these replace: type examples,
 * Figma-key divergence notes, and each page's own intro line. Extracted once by
 * scripts/extract-style-page-content.mjs. `typeExamples` are display strings,
 * not schema values — epic step 2 converts them into real `examples`.
 */
const preserved = (() => {
  const p = join(pkg, 'mappings/_style-page-content.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).keys : {};
})();

const styles = JSON.parse(readFileSync(join(pkg, 'schema/styles.schema.json'), 'utf8'));
const defs = styles.definitions;
const props = defs.Styles.properties;

const bindings = Object.fromEntries(
  ['figma', 'css'].map((p) => [p, JSON.parse(readFileSync(join(pkg, `mappings/bindings/${p}.json`), 'utf8'))])
);

// Strips the leading hyphen a capitalised name would otherwise produce. The two
// page generators defined this differently once, which put a stray `-` in front
// of every member slug and broke 20 links.
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, '');
const PLATFORM = { figma: 'Figma', css: 'CSS' };

/**
 * Where a named type's page lives. Hand-written pages sit at the schema root;
 * the rest are generated under `types/` by build-type-pages.mjs. Assuming one
 * location for both is how six links came to point at pages that do not exist.
 */
const docsRoot = resolve(pkg, '../../site/src/content/docs/schema');
const handWritten = new Set(
  existsSync(docsRoot)
    ? readdirSync(docsRoot).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
    : []
);
const linkTo = (name) => {
  const slug = kebab(name).replace(/^-/, '');
  return handWritten.has(slug) ? `/schema/${slug}/` : `/schema/types/${slug}/`;
};

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

/** Every primitive JSON type a node admits, following refs and unions. */
const admits = (n, depth = 0, acc = new Set()) => {
  if (!n || depth > 5) return acc;
  if (n.$ref) return admits(defs[n.$ref.replace('#/definitions/', '')], depth + 1, acc);
  if (typeof n.type === 'string') acc.add(n.type);
  if (Array.isArray(n.type)) n.type.forEach((t) => acc.add(t));
  if (n.properties || n.patternProperties) acc.add('object');
  for (const b of ['oneOf', 'anyOf', 'allOf']) if (Array.isArray(n[b])) n[b].forEach((x) => admits(x, depth + 1, acc));
  return acc;
};

/**
 * Whether a composite is one value with facets, or a set of distinct properties.
 *
 * The discriminant is whether its members all admit the same value shape.
 * `Sides` and `Corners` hold four members of one shape: `top` is not a concept,
 * it is a side, so the whole object reads inline and a link would cost a hop for
 * nothing. `Typography` holds thirteen members across five different shapes —
 * `fontFamily` is a string, `fontSize` a number, `textCase` an enum — and each
 * is a property with its own semantics worth its own row.
 *
 * Member count alone would misclassify: `Effects` has three members and must
 * link, `Corners` has four and must not.
 */
const memberShape = (name) => {
  const def = defs[name];
  if (!def?.properties) return null;
  const members = Object.entries(def.properties);
  const shapes = new Set(members.map(([, v]) => [...admits(v)].sort().join('+')));
  return { members, homogeneous: shapes.size === 1 };
};

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
      push(`\`${name}\``, linkTo(name));
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

for (const key of Object.keys(props)) {
  const prop = props[key];
  if (!prop) { console.error(`unknown style key: ${key}`); process.exit(1); }

  const hasDefault = Object.prototype.hasOwnProperty.call(prop, 'default');
  const defaultCell = !hasDefault
    ? '**none declared**'
    : prop.default === null ? '`null` — apply nothing' : `\`${JSON.stringify(prop.default)}\``;

  const kept = preserved[key] ?? {};

  /**
   * Types with their examples where the replaced page carried them. A key with
   * examples gets a table, because type-and-example is repeated shape; a key
   * without gets the comma list, because a one-column table is noise.
   */
  const derived = typeRows(prop).map(([label, link]) => (link ? `[${label}](${link})` : label));
  const byType = new Map((kept.typeExamples ?? []).map((r) => [r.type, r.example]));

  /**
   * An extracted example whose type label does not match a derived one is kept
   * as its own row rather than dropped. The labels legitimately differ: a
   * replaced page named the union type — `AspectRatioValue`, `Position` — while
   * this derives the primitives inside it. Appending guarantees no example is
   * lost to a label mismatch, which is how 18 of 111 went missing first time.
   */
  const matched = new Set(derived.filter((t) => byType.has(t)));
  const extra = [...byType.entries()].filter(([t]) => !matched.has(t));

  /**
   * An example of an object shape reads as an object. The replaced pages showed
   * members line by line with no braces, which reads as a list of unrelated
   * values rather than one value.
   */
  const asObject = (e) =>
    e.includes('<br>') && /`[A-Za-z$]+:/.test(e)
      ? `\`{ ${e.split('<br>').map((part) => part.replace(/`/g, '').trim()).join(', ')} }\``
      : e;

  const types = byType.size
    ? `| Type | Example |\n|---|---|\n${[
        ...derived.map((t) => `| ${t} | ${byType.has(t) ? asObject(byType.get(t)) : ''} |`),
        ...extra.map(([t, e]) => `| ${t} | ${asObject(e)} |`),
      ].join('\n')}`
    : derived.join(', ');

  /**
   * A composite whose members are distinct properties gets them listed and
   * linked. One whose members are facets of a single value does not — the shape
   * is already visible in the example above.
   */
  const memberList = (() => {
    /**
     * `TokenReference`, `PropBinding` and `Conditional` appear in nearly every
     * key's union because nearly every value is bindable. They are value
     * *forms*, documented once on their own pages, not the key's own composite —
     * and they are heterogeneous, so without this exclusion every key would
     * expand `TokenReference`'s members instead of its own.
     */
    const VALUE_FORMS = ['TokenReference', 'PropBinding', 'Conditional', 'ImageValue'];
    const named = typeRows(prop)
      .map(([label]) => label.replace(/^\[?`([^`]+)`.*$/, '$1'))
      .filter((n) => defs[n] && !VALUE_FORMS.includes(n));
    for (const name of named) {
      const shape = memberShape(name);
      if (!shape || shape.homogeneous) continue;
      /**
       * A member has no page of its own, so it links to its composite's
       * reference page, where the Properties table documents it. The member's
       * *type* links separately when that type is itself a named definition.
       */
      /**
       * A list, not a table. The type belongs on the member's own page; naming
       * it here duplicates that page's job and leaves two places to keep true.
       *
       * No "documented in full on X" line either: where the composite shares its
       * name with this style key — `typography`, `effects` — X *is* this page,
       * and the sentence was a self-reference.
       */
      const memberLink = (m) => `/schema/types/${kebab(name)}-${kebab(m).replace(/^\$/, '')}/`;
      return `### Members\n\n${shape.members
        .map(([m, v]) => `- [\`${m}\`](${memberLink(m)})${v.description ? ` — ${v.description}` : ''}`)
        .join('\n')}\n`;
    }
    return '';
  })();

  /**
   * Which element types carry this key, as links. Capture versus render is an
   * implementation detail of two particular transforms, not a fact about the
   * contract, so it is deliberately not shown: a reader wants to know whether
   * a glyph can carry this key, not which of two codebases agrees.
   */
  const elementList = (() => {
    if (!Object.keys(tables).length) return null;
    const union = new Set();
    for (const table of Object.values(tables)) {
      for (const [type, keys] of Object.entries(table)) if (keys.includes(key)) union.add(type);
    }
    if (!union.size) return '*No element type carries this key.*';
    return [...union].sort().map((t) => `- [\`${t}\`](/schema/anatomy/#elementtype)`).join('\n');
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
  const siblingList = [...siblings.entries()].sort()
    .map(([k, ps]) => `- [\`${k}\`](/schema/styles/${kebab(k)}/) — ${ps.join(', ')}`).join('\n');

  const adrs = adrsFor(key);
  // Status is omitted: a superseded ADR would not still be cited, so the column
  // read ACCEPTED on every row and carried no information.
  const item = (a) => `- [ADR-${a.num}](/adr/${a.file.replace(/\.md$/, '')}/) — ${a.title}`;
  const decides = adrs.filter((a) => a.decides);
  const mentions = adrs.filter((a) => !a.decides);
  const adrRows = adrs.length
    ? `${
        decides.length
          ? `**Decisions**\n\n${decides.map(item).join('\n')}\n`
          : '**Decisions.** None.\n'
      }${
        mentions.length
          ? `\n**Mentions**\n\n${mentions.map(item).join('\n')}\n`
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

${kept.intro ?? prop.description ?? ''}

### Type

${types}
${memberList}

### Default

${defaultCell}${hasDefault ? ', [declared by the schema](/schema/specification/#41a-an-absent-style-key-resolves-to-its-declared-default)' : ''}

### Supported on

${elementList ?? '*Not available in this checkout.*'}

### Platform bindings

| Platform | Disposition | Realised by |
|---|---|---|
${bindingRows}

${siblingList ? `### Resolved jointly with\n\nThis key does not map on its own. Its cluster's ordered case table is linked above.\n\n${siblingList}\n` : ''}
${kept.figmaKeyNote ? `### Figma key\n\n${kept.figmaKeyNote}\n` : ''}
${adrRows ? `### Decision records\n\n${adrRows}` : ''}
### Rules

| Rule | Statement |
|---|---|
| [DSPEC-44](/schema/specification/#9-rule-catalogue) | Every \`Styles\` property declares a \`default\` valid against its own schema |
| [DSPEC-45](/schema/specification/#9-rule-catalogue) | A declared \`default\` is a literal, never a reference or conditional |
${siblingList ? `| [DSPEC-47](/schema/specification/#9-rule-catalogue) | Jointly resolved keys are stated as an ordered case table, not prose |\n` : ''}
### Source

| Format | File |
|---|---|
| JSON Schema | [\`packages/schema/schema/styles.schema.json\`](https://github.com/DirectedEdges/spectacular/blob/main/packages/schema/schema/styles.schema.json) |
| TypeScript | [\`packages/schema/types/Styles.ts\`](https://github.com/DirectedEdges/spectacular/blob/main/packages/schema/types/Styles.ts) |
| Specification | [§4.1a](/schema/specification/), [§11](/schema/specification/) |
`;

  writeFileSync(join(outDir, `${kebab(key)}.md`), page);
  console.log(`style page: ${kebab(key)}.md — ${adrs.length} ADRs, ${siblings.size} sibling keys`);
}

console.log(`\n${Object.keys(props).length} pages written to site/src/content/docs/schema/styles/`);
