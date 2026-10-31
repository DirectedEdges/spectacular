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

/**
 * Preserved content was written when the type pages lived at the schema root,
 * so its links point at pages that no longer exist. Rewriting them here keeps
 * the capture file verbatim — it is the archive of what those pages said, and
 * editing it to track a move would make it a worse record.
 */
const REHOMED = {
  'color-object': '/schema/styles/color-object/',
  'gradient-value': '/schema/styles/gradient-value/',
  sides: '/schema/styles/sides/',
  typography: '/schema/styles/typography/',
  effects: '/schema/styles/effects/',
  corners: '/schema/styles/corner-radius/',
};
const rehome = (s) =>
  typeof s === 'string'
    ? s.replace(/\/schema\/([a-z-]+)\//g, (m, slug) => REHOMED[slug] ?? m)
    : s;

/** Documented once at the schema root; never nested. See the header. */
const VALUE_FORMS = new Set(['TokenReference', 'PropBinding', 'Conditional', 'ReferenceValue', 'VariableStyle', 'StyleIdValue']);

/**
 * The hand-written type pages at the schema root were redundant with the
 * generated tree — `/schema/typography/` and `/schema/styles/typography/`
 * documented the same type. The generated page wins, so each hand-written
 * page's non-derivable content (its decision records, and its examples where
 * the schema carries none) is rendered onto the generated page that supersedes
 * it. `corners` has no page of its own because `Corners` is reached by exactly
 * one path, so its home is that path's page.
 */
const TYPE_PAGE_HOME = {
  'color-object': ['ColorObject'],
  'gradient-value': ['GradientValue'],
  sides: ['Sides'],
  typography: ['typography'],
  effects: ['effects'],
  corners: ['cornerRadius'],
};

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
  handWritten.has(kebab(name))
    ? `[\`${name}\`](/schema/${kebab(name)}/)`
    : SHARED.has(name) && isDocumentable(name)
      ? `[\`${name}\`](/schema/styles/${kebab(name)}/)`
      : `\`${name}\``;

/**
 * A shared type earns a page whether it is an object or a union. `GradientValue`
 * and `PositionOffset` are `oneOf` with no direct properties, and requiring
 * `properties` left both unpaged while four style pages still linked to them.
 */
const isDocumentable = (t) => Boolean(defs[t] && (defs[t].properties || defs[t].oneOf || defs[t].anyOf));

/**
 * A type reached by more than one path gets ONE page, not a copy under each
 * path. `ColorObject` is reachable from `backgroundColor`, `fillColor`,
 * `textColor`, `strokes` and `effects.shadows.color`; nesting it under all five
 * put a `Contains` list on `backgroundColor` that was not backgroundColor's
 * structure at all — it was ColorObject's, said five times.
 *
 * A type reached by exactly one path still nests, because there the containment
 * path and the type are the same thing.
 */
const pathsReaching = {};
{
  const probe = (node, path, seen) => {
    for (const [key, spec] of Object.entries(node.properties ?? {})) {
      const p = [...path, key];
      for (const t of refsOf(spec)) {
        if (!defs[t] || VALUE_FORMS.has(t)) continue;
        (pathsReaching[t] ??= new Set()).add(p.join('.'));
        if (!seen.has(t)) probe(defs[t], p, new Set([...seen, t]));
      }
    }
  };
  probe(defs.Styles, [], new Set(['Styles']));
}
const SHARED = new Set(Object.entries(pathsReaching).filter(([, s]) => s.size > 1).map(([t]) => t));

// ── Build the containment tree ───────────────────────────────────────────────
const nodes = [];
const walk = (node, path, seen) => {
  for (const [key, spec] of Object.entries(node.properties ?? {})) {
    const p = [...path, key];
    nodes.push({ path: p, spec, parentDef: node, required: new Set(node.required ?? []) });
    for (const t of refsOf(spec)) {
      if (!defs[t] || seen.has(t) || VALUE_FORMS.has(t) || SHARED.has(t)) continue;
      walk(defs[t], p, new Set([...seen, t]));
    }
  }
};
walk(defs.Styles, [], new Set(['Styles']));

/**
 * A shared type without a hand-written page gets a canonical one under
 * `styles/`, with its own children nested beneath it. One whose page already
 * exists at the schema root is linked there instead.
 */
const sharedRoots = [...SHARED].filter((t) => !handWritten.has(kebab(t)) && isDocumentable(t));
for (const t of sharedRoots) {
  nodes.push({ path: [t], spec: { ...defs[t], $sharedType: t }, parentDef: defs.Styles, required: new Set() });
  walk(defs[t], [t], new Set(['Styles', t]));
}

const slugPath = (p) => p.map(kebab).join('/');
const urlOf = (p) => `/schema/styles/${slugPath(p)}/`;
const childrenOf = (p) => nodes.filter((n) => n.path.length === p.length + 1 && n.path.slice(0, p.length).join('.') === p.join('.'));

// Replace the previous flat output wholesale, so a renamed page cannot linger.
if (existsSync(outRoot)) rmSync(outRoot, { recursive: true, force: true });
// Folders this tree supersedes. `types/` was the flat catch-all; `typography/`
// and `effects/` were sibling folders holding the same member pages the tree
// now emits under the path that reaches them.
for (const stale of ['types', 'typography', 'effects']) {
  if (existsSync(join(docsSchema, stale))) rmSync(join(docsSchema, stale), { recursive: true, force: true });
}

let written = 0;
for (const node of nodes) {
  const { path: p, spec, required } = node;
  const key = p[p.length - 1];
  const isStyleKey = p.length === 1;
  const kept = isStyleKey
    ? (preserved.keys?.[key] ?? {})
    : (preserved.memberPages?.[p.join('.')] ?? {});

  const types = namedTypes(spec).join(', ') || '—';
  const hasDefault = Object.prototype.hasOwnProperty.call(spec, 'default');
  const defaultText = !hasDefault
    ? null
    : spec.default === null ? '`null` (nothing)' : `\`${JSON.stringify(spec.default)}\``;

  // Examples preserved from the replaced pages, rendered as object literals.
  const asObject = (e) =>
    e.includes('<br>') && /`[A-Za-z$]+:/.test(e)
      ? `\`{ ${e.split('<br>').map((x) => x.replace(/`/g, '').trim()).join(', ')} }\``
      : e;
  // A `Settings` cell names the config that selects between forms, so the
  // column appears only on the keys that have one.
  const exampleRows = kept.typeExamples ?? [];
  const anySettings = exampleRows.some((r) => r.settings);
  const examples = exampleRows.map(
    (r) => `| ${rehome(r.type)} | ${rehome(asObject(r.example))} |${anySettings ? ` ${rehome(r.settings) ?? '—'} |` : ''}`
  );
  const exampleHead = anySettings ? '| Type | Example | Settings |\n|---|---|---|' : '| Type | Example |\n|---|---|';

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

  /**
   * Content carried over from the hand-written type page this page replaces.
   * `Properties` is dropped because `Contains` already lists them from the
   * schema; `Values` and the examples are rendered only when the schema
   * produced none, so a page never shows the same thing twice.
   */
  const homedSlug = Object.entries(TYPE_PAGE_HOME).find(([, path]) => path.join('.') === p.join('.'))?.[0];
  const carried = homedSlug ? (preserved.typePages?.[homedSlug]?.sections ?? {}) : {};
  const carriedSections = [];
  if (!examples.length) {
    for (const name of ['Values', 'Examples', 'Example']) {
      if (carried[name]) carriedSections.push(`\n### ${name}\n\n${rehome(carried[name])}\n`);
    }
  }
  const furtherReading = carried['Further Reading']
    ? `\n### Further reading\n\n${rehome(carried['Further Reading'])}\n`
    : '';

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

${rehome(kept.intro) ?? spec.description ?? ''}

${trail}
### Type

${types}${required.has(key) ? ' · required' : ''}
${defaultText ? `\n### Default\n\n${defaultText}\n` : ''}${examples.length ? `\n### Examples\n\n${exampleHead}\n${examples.join('\n')}\n` : ''}${kids.length ? `\n### Contains\n\n${kids.map((c) => `- [\`${c.path[c.path.length - 1]}\`](${urlOf(c.path)})`).join("\n")}\n` : ''}${bindingRows ? `\n### Platform bindings\n\n| Platform | Disposition | Realised by |\n|---|---|---|\n${bindingRows}\n` : ''}${kept.figmaKeyNote ? `\n### Figma key\n\n${kept.figmaKeyNote}\n` : ''}${carriedSections.join('')}${furtherReading}
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
