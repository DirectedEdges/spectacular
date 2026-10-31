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
 * Two things are deliberately not nested:
 *
 *   - **Value-union wrappers** (`*StyleValue`). A key's value may be a literal,
 *     a token, a binding or a conditional; that is the set of forms the value
 *     takes, not a thing it contains. Traversal descends through them.
 *   - **Value forms** themselves — `TokenReference`, `PropBinding`,
 *     `Conditional`. They are reachable from nearly every key, so nesting them
 *     would repeat `$token`, `$type` and `$extensions` under all 46 and inflate
 *     the tree from 113 pages to 307. They are documented once at the schema
 *     root and linked.
 *
 * Usage:  node scripts/build-schema-pages.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const repo = resolve(pkg, '../..');
const docsSchema = resolve(pkg, '../../site/src/content/docs/schema');
const outRoot = join(docsSchema, 'styles');

const defs = JSON.parse(readFileSync(join(pkg, 'schema/styles.schema.json'), 'utf8')).definitions;
const props = defs.Styles.properties;

const preservedFile = join(pkg, 'mappings/_style-page-content.json');
const preserved = existsSync(preservedFile) ? JSON.parse(readFileSync(preservedFile, 'utf8')) : { keys: {}, typePages: {} };

const bindings = Object.fromEntries(
  ['figma', 'css'].map((p) => [p, JSON.parse(readFileSync(join(pkg, `mappings/bindings/${p}.json`), 'utf8'))])
);

const kebab = (s) => s.replace(/^\$/, '').replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, '');
const PLATFORM = { figma: 'Figma', css: 'CSS' };

const isWrapper = (n) => /StyleValue$|^Style$|^StyleKey$/.test(n);

/** Documented once at the schema root; never nested. See the header. */
const VALUE_FORMS = new Set(['TokenReference', 'PropBinding', 'Conditional', 'ReferenceValue', 'VariableStyle', 'StyleIdValue']);

/** Pages written by hand at the schema root, which this must not overwrite. */
const handWritten = new Set(
  readdirSync(docsSchema).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
);

/** Named definitions a node reaches, descending through wrappers and unions. */
const refsOf = (n, depth = 0, out = new Set()) => {
  if (!n || depth > 6) return out;
  if (n.$ref) {
    const t = n.$ref.replace('#/definitions/', '');
    if (isWrapper(t) && defs[t]) return refsOf(defs[t], depth + 1, out);
    out.add(t);
    return out;
  }
  if (n.items) refsOf(n.items, depth + 1, out);
  for (const b of ['oneOf', 'anyOf', 'allOf']) if (Array.isArray(n[b])) n[b].forEach((x) => refsOf(x, depth + 1, out));
  return out;
};

/** The types a value admits, named rather than collapsed to primitives. */
const namedTypes = (node, depth = 0, out = []) => {
  if (!node || depth > 5) return out;
  const push = (s) => { if (!out.includes(s)) out.push(s); };
  if (node.$ref) {
    const name = node.$ref.replace('#/definitions/', '');
    if (isWrapper(name) && defs[name]) return namedTypes(defs[name], depth + 1, out);
    push(typeLabel(name));
    return out;
  }
  if (node.const !== undefined) push(`\`${JSON.stringify(node.const)}\``);
  else if (Array.isArray(node.enum)) node.enum.forEach((e) => push(`\`${JSON.stringify(e)}\``));
  else if (typeof node.type === 'string') push(node.type === 'array' ? '`array`' : `\`${node.type}\``);
  else if (Array.isArray(node.type)) node.type.forEach((t) => push(`\`${t}\``));
  if (node.items) namedTypes(node.items, depth + 1, out);
  for (const b of ['oneOf', 'anyOf', 'allOf']) if (Array.isArray(node[b])) node[b].forEach((x) => namedTypes(x, depth + 1, out));
  return out;
};

/**
 * A type is linked only when it has a page of its own — a value form or a
 * hand-written type at the schema root. A type whose structure is nested under
 * the current page has no separate page by design: this page *is* its
 * documentation, and the `Contains` section lists its members. Linking it would
 * point at nothing, which is how eight links broke when the flat `types/`
 * folder was removed.
 */
const typeLabel = (name) =>
  handWritten.has(kebab(name)) ? `[\`${name}\`](/schema/${kebab(name)}/)` : `\`${name}\``;

// ── Build the containment tree ───────────────────────────────────────────────
const nodes = [];
const walk = (node, path, seen) => {
  for (const [key, spec] of Object.entries(node.properties ?? {})) {
    const p = [...path, key];
    nodes.push({ path: p, spec, parentDef: node, required: new Set(node.required ?? []) });
    for (const t of refsOf(spec)) {
      if (!defs[t] || seen.has(t) || VALUE_FORMS.has(t)) continue;
      walk(defs[t], p, new Set([...seen, t]));
    }
  }
};
walk(defs.Styles, [], new Set(['Styles']));

const slugPath = (p) => p.map(kebab).join('/');
const urlOf = (p) => `/schema/styles/${slugPath(p)}/`;
const childrenOf = (p) => nodes.filter((n) => n.path.length === p.length + 1 && n.path.slice(0, p.length).join('.') === p.join('.'));

// Replace the previous flat output wholesale, so a renamed page cannot linger.
if (existsSync(outRoot)) rmSync(outRoot, { recursive: true, force: true });
if (existsSync(join(docsSchema, 'types'))) rmSync(join(docsSchema, 'types'), { recursive: true, force: true });

let written = 0;
for (const node of nodes) {
  const { path: p, spec, required } = node;
  const key = p[p.length - 1];
  const isStyleKey = p.length === 1;
  const kept = isStyleKey ? (preserved.keys?.[key] ?? {}) : {};

  const types = namedTypes(spec).join(', ') || '—';
  const hasDefault = Object.prototype.hasOwnProperty.call(spec, 'default');
  const defaultText = !hasDefault
    ? null
    : spec.default === null ? '`null` — apply nothing' : `\`${JSON.stringify(spec.default)}\``;

  // Examples preserved from the replaced pages, rendered as object literals.
  const asObject = (e) =>
    e.includes('<br>') && /`[A-Za-z$]+:/.test(e)
      ? `\`{ ${e.split('<br>').map((x) => x.replace(/`/g, '').trim()).join(', ')} }\``
      : e;
  const examples = (kept.typeExamples ?? []).map((r) => `| ${r.type} | ${asObject(r.example)} |`);

  const kids = childrenOf(p);
  const bindingRows = isStyleKey
    ? Object.entries(bindings).map(([platform, b]) => {
        const v = b.concepts.styles[key] ?? { disposition: 'unverified' };
        const realises = v.cluster
          ? `[\`${v.cluster}\`](/schema/mappings/${platform}/#${v.cluster.toLowerCase()})`
          : (v.target ? `\`${v.target}\`` : (v.module?.length ? v.module.map((m) => `\`${m}\``).join(', ') : '—'));
        return `| [${PLATFORM[platform]}](/schema/mappings/${platform}/) | ${v.disposition === 'unverified' ? '**unverified**' : v.disposition} | ${realises} |`;
      }).join('\n')
    : null;

  const trail = p.length > 1
    ? `Reached as \`styles.${p.join('.')}\`, within ${p.slice(0, -1).map((seg, i) => `[\`${seg}\`](${urlOf(p.slice(0, i + 1))})`).join(' → ')}.\n`
    : '';

  const page = `---
title: "${key}"
description: "${(spec.description ?? kept.intro ?? `The ${key} value`).replace(/"/g, '\\"').slice(0, 300)}"
tableOfContents: false
---

<!-- Generated by packages/schema/scripts/build-schema-pages.mjs from styles.schema.json,
     the platform binding data, and content preserved from the replaced pages. -->

${kept.intro ?? spec.description ?? ''}

${trail}
### Type

${types}${required.has(key) ? ' · required' : ''}
${defaultText ? `\n### Default\n\n${defaultText}, [declared by the schema](/schema/specification/#41a-an-absent-style-key-resolves-to-its-declared-default)\n` : ''}${examples.length ? `\n### Examples\n\n| Type | Example |\n|---|---|\n${examples.join('\n')}\n` : ''}${kids.length ? `\n### Contains\n\n${kids.map((c) => `- [\`${c.path[c.path.length - 1]}\`](${urlOf(c.path)})${c.spec.description ? ` — ${c.spec.description}` : ''}`).join('\n')}\n` : ''}${bindingRows ? `\n### Platform bindings\n\n| Platform | Disposition | Realised by |\n|---|---|---|\n${bindingRows}\n` : ''}${kept.figmaKeyNote ? `\n### Figma key\n\n${kept.figmaKeyNote}\n` : ''}
### Source

| Format | File |
|---|---|
| JSON Schema | [\`packages/schema/schema/styles.schema.json\`](https://github.com/DirectedEdges/spectacular/blob/main/packages/schema/schema/styles.schema.json) |
| Specification | [§4.1a](/schema/specification/), [§11](/schema/specification/) |
`;

  const dir = p.length > 1 ? join(outRoot, ...p.slice(0, -1).map(kebab)) : outRoot;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${kebab(key)}.md`), page);
  written++;
}

console.log(`${written} pages written as a containment tree under site/src/content/docs/schema/styles/`);
const depths = {};
for (const n of nodes) depths[n.path.length] = (depths[n.path.length] ?? 0) + 1;
console.log(`by depth: ${Object.entries(depths).map(([d, c]) => `${d}:${c}`).join('  ')}`);
console.log(`value forms kept at the schema root and linked: ${[...VALUE_FORMS].filter((v) => defs[v]).join(', ')}`);
