/**
 * Generates a reference page for each named type in styles.schema.json that
 * does not already have a hand-written one — Shadow, Blur, GradientStop,
 * AspectRatioValue and the rest.
 *
 * These existed only as link targets before: the style pages referenced
 * `/schema/blur/` and `/schema/gradient-stop/` and nothing was there. A link to
 * a page that does not exist is worse than no link, so every type a generated
 * page names now has somewhere to land.
 *
 * `*StyleValue` wrappers are excluded. They are the value union for a key —
 * literal, token, binding, conditional — not a type a reader names, and the
 * style pages already descend through them to the types inside.
 *
 * Usage:  node scripts/build-type-pages.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const docsDir = resolve(pkg, '../../site/src/content/docs/schema');
const outDir = join(docsDir, 'types');

const defs = JSON.parse(readFileSync(join(pkg, 'schema/styles.schema.json'), 'utf8')).definitions;
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, '');

/** A value-union wrapper, or the key enum — not a type a reader names. */
const isWrapper = (n) => /StyleValue$|^Style$|^StyleKey$/.test(n);

/** Pages written by hand, which this must not overwrite. */
const handWritten = new Set(
  readdirSync(docsDir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
);

const admits = (n, depth = 0, acc = new Set()) => {
  if (!n || depth > 5) return acc;
  if (n.$ref) return admits(defs[n.$ref.replace('#/definitions/', '')], depth + 1, acc);
  if (typeof n.type === 'string') acc.add(n.type);
  if (Array.isArray(n.type)) n.type.forEach((t) => acc.add(t));
  if (n.properties || n.patternProperties) acc.add('object');
  for (const b of ['oneOf', 'anyOf', 'allOf']) if (Array.isArray(n[b])) n[b].forEach((x) => admits(x, depth + 1, acc));
  return acc;
};

/** Where a type's page lives — hand-written at the root, generated under types/. */
const linkTo = (name) =>
  handWritten.has(kebab(name)) ? `/schema/${kebab(name)}/` : `/schema/types/${kebab(name)}/`;

/**
 * The types a value admits, **named**. Collapsing a union to its primitives
 * hides the useful half: `Typography.fontSize` is
 * `oneOf: [number, "mixed", TokenReference]`, and reporting that as
 * `number, object, string` loses the fact that a font size is token-bindable —
 * which is most of what a reader wants to know.
 */
const namedTypes = (node, depth = 0, out = []) => {
  if (!node || depth > 4) return out;
  const push = (s) => { if (!out.includes(s)) out.push(s); };
  if (node.$ref) {
    const name = node.$ref.replace('#/definitions/', '');
    if (isWrapper(name) && defs[name]) return namedTypes(defs[name], depth + 1, out);
    push(`[\`${name}\`](${linkTo(name)})`);
    return out;
  }
  if (node.const !== undefined) push(`\`${JSON.stringify(node.const)}\``);
  else if (Array.isArray(node.enum)) node.enum.forEach((e) => push(`\`${JSON.stringify(e)}\``));
  else if (typeof node.type === 'string') push(`\`${node.type}\``);
  else if (Array.isArray(node.type)) node.type.forEach((t) => push(`\`${t}\``));
  for (const b of ['oneOf', 'anyOf', 'allOf']) {
    if (Array.isArray(node[b])) node[b].forEach((x) => namedTypes(x, depth + 1, out));
  }
  return out;
};

const typeCell = (v) => namedTypes(v).join(', ') || '—';

mkdirSync(outDir, { recursive: true });

const targets = Object.keys(defs).filter((n) => !isWrapper(n) && !handWritten.has(kebab(n)));
let written = 0;

for (const name of targets) {
  const def = defs[name];
  const required = new Set(def.required ?? []);

  const body = def.properties
    ? `## Properties\n\n| Property | Type | Required | Description |\n|---|---|---|---|\n${Object.entries(def.properties)
        .map(([k, v]) => `| \`${k}\` | ${typeCell(v)} | ${required.has(k) ? 'Yes' : 'No'} | ${(v.description ?? '').replace(/\|/g, '\\|')} |`)
        .join('\n')}`
    : Array.isArray(def.oneOf) || Array.isArray(def.anyOf)
      ? `## One of\n\n${(def.oneOf ?? def.anyOf)
          .map((b) => `- ${typeCell(b)}${b.description ? ` — ${b.description}` : ''}`)
          .join('\n')}`
      : `## Type\n\n${[...admits(def)].sort().map((t) => `\`${t}\``).join(', ') || '—'}`;

  // Which style keys admit this type, so the page is reachable in both directions.
  const usedBy = Object.entries(defs.Styles.properties)
    .filter(([, p]) => JSON.stringify(p).includes(`"#/definitions/${name}"`) ||
      [...admits(p, 0, new Set())].length && JSON.stringify(resolveAll(p)).includes(`"#/definitions/${name}"`))
    .map(([k]) => k);

  const page = `---
title: "${name}"
description: "${(def.description ?? `The ${name} type`).replace(/"/g, '\\"').slice(0, 300)}"
tableOfContents: false
---

<!-- Generated by packages/schema/scripts/build-type-pages.mjs from schema/styles.schema.json. -->

${def.description ?? ''}

${body}
${usedBy.length ? `\n## Used by\n\n${usedBy.map((k) => `- [\`${k}\`](/schema/styles/${kebab(k)}/)`).join('\n')}\n` : ''}
## Source

| Format | File |
|---|---|
| JSON Schema | [\`packages/schema/schema/styles.schema.json\`](https://github.com/DirectedEdges/spectacular/blob/main/packages/schema/schema/styles.schema.json) |
| Specification | [§11 — platform bindings](/schema/specification/) |
`;

  writeFileSync(join(outDir, `${kebab(name)}.md`), page);
  written++;
}

/** Follow one level of $ref so "used by" sees through a StyleValue wrapper. */
function resolveAll(node, depth = 0) {
  if (!node || depth > 3) return node;
  if (node.$ref) {
    const t = defs[node.$ref.replace('#/definitions/', '')];
    return t ? resolveAll(t, depth + 1) : node;
  }
  if (Array.isArray(node.oneOf)) return { oneOf: node.oneOf.map((b) => resolveAll(b, depth + 1)) };
  return node;
}

/**
 * A member of a heterogeneous composite gets its own page.
 *
 * `Typography.fontSize` is a property with its own type, units and
 * token-binding behaviour — not a facet of one value the way `Corners.topStart`
 * is — so it is documented rather than listed. A homogeneous composite's
 * members are deliberately skipped: `Sides.top` is a side, not a concept.
 *
 * `Styles` is excluded because its 46 members already have pages: they are the
 * style keys themselves.
 *
 * Slugs are qualified by their composite, because member names collide —
 * `visible` belongs to Shadow, to Blur, and to Styles.
 */
const homogeneous = (def) => {
  if (!def?.properties) return true;
  const shapes = new Set(Object.values(def.properties).map((v) => [...admits(v)].sort().join('+')));
  return shapes.size === 1;
};

let members = 0;
for (const [name, def] of Object.entries(defs)) {
  if (isWrapper(name) || name === 'Styles' || !def.properties || homogeneous(def)) continue;

  const required = new Set(def.required ?? []);
  const parentLink = linkTo(name);

  for (const [member, spec] of Object.entries(def.properties)) {
    const slug = `${kebab(name)}-${kebab(member).replace(/^\$/, '')}`;
    const type = namedTypes(spec).join(", ") || "—";

    const page = `---
title: "${name}.${member}"
description: "${(spec.description ?? `The ${member} member of ${name}`).replace(/"/g, '\\"').slice(0, 300)}"
tableOfContents: false
---

<!-- Generated by packages/schema/scripts/build-type-pages.mjs from schema/styles.schema.json. -->

${spec.description ?? ''}

## Value

| | |
|---|---|
| Type | ${type} |
| Required | ${required.has(member) ? 'Yes' : 'No'} |
| Member of | [\`${name}\`](${parentLink}) |

## Source

| Format | File |
|---|---|
| JSON Schema | [\`packages/schema/schema/styles.schema.json\`](https://github.com/DirectedEdges/spectacular/blob/main/packages/schema/schema/styles.schema.json) |
`;
    writeFileSync(join(outDir, `${slug}.md`), page);
    members++;
  }
}

console.log(`${written} type pages and ${members} member pages written to site/src/content/docs/schema/types/`);
console.log(`skipped ${Object.keys(defs).filter(isWrapper).length} value-union wrappers and ${handWritten.size} hand-written pages`);
