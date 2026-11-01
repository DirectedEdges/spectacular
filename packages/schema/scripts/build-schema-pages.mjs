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

/** The declared element tables the transforms ship. Absent when not checked out. */
const elementTables = (() => {
  const paths = {
    capture: `${repo}/../specs-transforms/packages/specs-from-figma/src/Component/Styles/style-bindings.json`,
    render: `${repo}/../specs-transforms/packages/figma-from-specs/src/Styles/style-bindings.json`,
  };
  const out = {};
  for (const [name, p] of Object.entries(paths)) {
    if (existsSync(p)) out[name] = JSON.parse(readFileSync(p, 'utf8')).elements;
  }
  return out;
})();

/**
 * A DRAFT decision record is not cited anywhere — not as a link, and not as a
 * bare name. A draft is a proposal, so citing one presents an unsettled
 * question as a decision that settles something. The four drafts in `adr/`
 * include two whose subject the schema does not yet handle at all.
 *
 * Status is read from the record itself rather than inferred from whether the
 * site published it, so the rule holds even if the site's filter changes.
 */
const isAccepted = (src) =>
  (src.match(/^\*\*Status\*\*:\s*(\S+)/m)?.[1]?.replace(/[^A-Za-z]/g, '').toUpperCase() ?? '') === 'ACCEPTED';

/**
 * ADRs that *decide* a key — derived, not hand-listed.
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
  for (const f of readdirSync(dir).filter((n) => /^\d{3}-.*\.md$/.test(n))) {
    const src = readFileSync(join(dir, f), 'utf8');
    if (!re.test(src) || !isAccepted(src)) continue;
    const title = (src.match(/^#\s+(?:ADR[\s-]*\d*\s*:\s*)?(.+)$/m)?.[1] ?? f).trim();
    const summary = src.match(/^\*\*Summary\*\*:\s*(.+)$/m)?.[1] ?? '';
    const decision = src.match(/^## Decision\b[\s\S]*?(?=^## (?!Decision\b))/m)?.[0] ?? '';
    out.push({
      num: f.slice(0, 3),
      title,
      file: f,
      decides: re.test(title) || re.test(summary) || re.test(decision),
    });
  }
  return out;
};

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

/**
 * Which of a property's admitted forms an example value takes, so a reader can
 * tell a literal from a token reference from a composite at a glance. Matched
 * against the union rather than guessed from the value's JavaScript type: a
 * `TokenReference` and a `Corners` object are both objects.
 */
const formOf = (value, node, depth = 0) => {
  const n = node?.$ref ? defs[node.$ref.replace('#/definitions/', '')] : node;
  if (!n || depth > 6) return '—';

  const branches = n.oneOf ?? n.anyOf;
  if (Array.isArray(branches)) {
    for (const b of branches) {
      const named = b.$ref?.replace('#/definitions/', '');
      if (named && admitsValue(defs[named], value)) return typeLabel(named);
      if (!named && admitsValue(b, value)) return `\`${primitiveName(value)}\``;
    }
    return `\`${primitiveName(value)}\``;
  }
  return node?.$ref ? typeLabel(node.$ref.replace('#/definitions/', '')) : `\`${primitiveName(value)}\``;
};

const primitiveName = (v) =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : typeof v;

/** Whether a value satisfies a node, to the depth needed to tell forms apart. */
const admitsValue = (n, v, depth = 0) => {
  if (!n || depth > 6) return false;
  if (n.$ref) return admitsValue(defs[n.$ref.replace('#/definitions/', '')], v, depth + 1);
  const branches = n.oneOf ?? n.anyOf;
  if (Array.isArray(branches)) return branches.some((b) => admitsValue(b, v, depth + 1));
  if (Array.isArray(n.enum)) return n.enum.includes(v);
  if (n.type === 'null') return v === null;
  if (n.type === 'string') return typeof v === 'string';
  if (n.type === 'number' || n.type === 'integer') return typeof v === 'number';
  if (n.type === 'boolean') return typeof v === 'boolean';
  if (n.type === 'array') return Array.isArray(v);
  if (n.type === 'object' || n.properties) {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
    for (const req of n.required ?? []) if (!(req in v)) return false;
    if (n.additionalProperties === false) {
      for (const k of Object.keys(v)) if (!n.properties?.[k]) return false;
    }
    return true;
  }
  return false;
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
/**
 * A node's children are its properties, or — for a union whose branches are
 * named definitions — those branches. `GradientValue` is a `oneOf` over
 * `LinearGradient`, `RadialGradient` and `AngularGradient`, each with its own
 * properties and description. Without this they had no pages at all, and the
 * union's own page could only name them as plain text.
 */
const childEntries = (node) => {
  const own = Object.entries(node.properties ?? {});
  if (own.length) return own;
  return (node.oneOf ?? node.anyOf ?? [])
    .map((b) => b.$ref?.replace('#/definitions/', ''))
    .filter((t) => t && defs[t]?.properties)
    .map((t) => [t, defs[t]]);
};

const pathsReaching = {};
{
  const probe = (node, path, seen) => {
    for (const [key, spec] of childEntries(node)) {
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
  for (const [key, spec] of childEntries(node)) {
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
  // A shared type's canonical page also sits at depth 1, but it is a type, not
  // a style key: it has no disposition, no element scope, and no default.
  const isStyleKey = p.length === 1 && !spec.$sharedType;
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
  /**
   * Examples come from the schema's own `examples` keyword where it has one.
   * Those are real JSON values, validated against the property they sit on, so
   * a reader can copy one into a document. The preserved display strings are
   * the fallback for anything the schema does not yet carry — they were a
   * rendering of a value rather than the value, and could not be checked.
   */
  const schemaExamples = Array.isArray(spec.examples) ? spec.examples : null;
  const exampleRows = kept.typeExamples ?? [];
  const anySettings = !schemaExamples && exampleRows.some((r) => r.settings);
  const examples = schemaExamples
    ? schemaExamples.map((ex) => `| \`${JSON.stringify(ex)}\` | ${formOf(ex, spec)} |`)
    : exampleRows.map(
        (r) => `| ${rehome(r.type)} | ${rehome(asObject(r.example))} |${anySettings ? ` ${rehome(r.settings) ?? '—'} |` : ''}`
      );
  const exampleHead = schemaExamples
    ? '| Example | Form |\n|---|---|'
    : anySettings
      ? '| Type | Example | Settings |\n|---|---|---|'
      : '| Type | Example |\n|---|---|';

  /**
   * The config that selects between a key's value forms, where one does. It
   * annotated the replaced pages' example table and is not derivable, so it
   * survives as a line under the table rather than as a column the schema's
   * own examples have no cell for.
   */
  const settingsNote =
    schemaExamples && exampleRows.some((r) => r.settings)
      ? `\nWhich form is emitted is selected by ${[...new Set(exampleRows.filter((r) => r.settings).map((r) => rehome(r.settings)))].join(' and ')}.\n`
      : '';

  /**
   * A union's branches, each with the description that distinguishes it.
   * `Contains` cannot carry this: a `oneOf` has branches, not members, and
   * `GradientValue` is exactly one of them at a time.
   */
  const kids = childrenOf(p);

  const oneOfBranches = (() => {
    const branches = spec.oneOf ?? spec.anyOf;
    if (!branches?.length) return null;
    const rows = branches
      .map((br) => {
        const named = br.$ref?.replace('#/definitions/', '');
        const child = kids.find((c) => c.path[c.path.length - 1] === named);
        const label = child ? `[\`${named}\`](${urlOf(child.path)})` : namedTypes(br).join(', ') || '—';
        // A bare `$ref` carries no description; the one that distinguishes the
        // branch sits on the definition it points at.
        const why = (br.description ?? (named ? defs[named]?.description : '') ?? '').replace(/\|/g, '\\|');
        return `| ${label} | ${why} |`;
      })
      .join('\n');
    return `| Form | When |\n|---|---|\n${rows}`;
  })();

  const bindingRows = isStyleKey
    ? Object.entries(bindings).map(([platform, b]) => {
        const v = b.concepts.styles[key] ?? { disposition: 'unverified' };
        const realises = v.cluster
          ? `[\`${v.cluster}\`](/schema/mappings/${platform}/clusters/${kebab(v.cluster)}/)`
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

  /**
   * Which element types carry this key, as links. Capture versus render is an
   * implementation detail of two particular transforms, not a fact about the
   * contract, so the two tables are unioned rather than compared: a reader
   * wants to know whether a glyph can carry this key, not which of two
   * codebases agrees.
   */
  const supportedOn = (() => {
    if (!isStyleKey || !Object.keys(elementTables).length) return null;
    const union = new Set();
    for (const table of Object.values(elementTables)) {
      for (const [type, keys] of Object.entries(table)) if (keys.includes(key)) union.add(type);
    }
    if (!union.size) return '*No element type carries this key.*';
    return [...union].sort().map((t) => `- [\`${t}\`](/schema/anatomy/#elementtype)`).join('\n');
  })();

  /**
   * Keys this one resolves alongside, grouped by cluster.
   *
   * Every clustered key belongs to a *different* cluster on each platform —
   * `width` is in CSS's `intrinsicSize` and Figma's `autoVsAbsoluteLayout` — so
   * one flat list annotated with platform names merged two unrelated groupings
   * into a set that matched neither. A key appearing under two clusters is
   * correct and is repeated.
   */
  const siblingList = (() => {
    if (!isStyleKey) return null;
    const groups = [];
    for (const [platform, b] of Object.entries(bindings)) {
      const name = b.concepts.styles[key]?.cluster;
      if (!name) continue;
      const others = (b.concepts.styleClusters[name].keys ?? []).filter((k) => k !== key);
      if (!others.length) continue;
      groups.push(
        `**[${name}](/schema/mappings/${platform}/clusters/${kebab(name)}/)** — ${PLATFORM[platform]}\n\n${others
          .sort()
          .map((k) => `- [\`${k}\`](/schema/styles/${kebab(k)}/)`)
          .join('\n')}`
      );
    }
    return groups.length ? groups.join('\n\n') : null;
  })();

  /**
   * Decision records. Status is omitted: a superseded ADR would not still be
   * cited, so the column read ACCEPTED on every row and carried no information.
   */
  const decisionRecords = (() => {
    if (!isStyleKey) return null;
    const adrs = adrsFor(key);
    // Said rather than left blank: three keys have no ADR, and a missing
    // section reads as a render that failed instead of a fact about the key.
    if (!adrs.length) return '**Decisions.** None.\n\n**Mentions.** None.\n';
    const item = (a) => `- [ADR-${a.num}](/adr/${a.file.replace(/\.md$/, '')}/) — ${a.title}`;
    const decides = adrs.filter((a) => a.decides);
    const mentions = adrs.filter((a) => !a.decides);
    return `${decides.length ? `**Decisions**\n\n${decides.map(item).join('\n')}\n` : '**Decisions.** None.\n'}${
      mentions.length ? `\n**Mentions**\n\n${mentions.map(item).join('\n')}\n` : ''
    }`;
  })();

  /**
   * The style keys that reach this type. Only shown on a shared type's own
   * page, where it is the inverse of the decision to give it one page rather
   * than a copy under each path.
   */
  const usedBy = (() => {
    const t = spec.$sharedType;
    if (!t) return null;
    const paths = [...(pathsReaching[t] ?? [])].sort();
    if (!paths.length) return null;
    return paths.map((path) => `- [\`styles.${path}\`](/schema/styles/${path.split('.').map(kebab).join('/')}/)`).join('\n');
  })();

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
${defaultText ? `\n### Default\n\n${defaultText}\n` : ''}${examples.length ? `\n### Examples\n\n${exampleHead}\n${examples.join("\n")}\n${settingsNote}` : ""}${oneOfBranches ? `\n### One of\n\n${oneOfBranches}\n` : ''}${
    // On a union page the branches ARE the children, so `One of` has already
    // listed them with the description that tells them apart.
    kids.length && !oneOfBranches
      ? `\n### Contains\n\n${kids.map((c) => `- [\`${c.path[c.path.length - 1]}\`](${urlOf(c.path)})`).join('\n')}\n`
      : ''
  }${bindingRows ? `\n### Platform bindings\n\n| Platform | Disposition | Realised by |\n|---|---|---|\n${bindingRows}\n` : ''}${usedBy ? `\n### Used by\n\n${usedBy}\n` : ''}${supportedOn ? `\n### Supported on\n\n${supportedOn}\n` : ''}${
    siblingList
      ? `\n### Resolved jointly with\n\nThis key does not map on its own. Its cluster's ordered case table is linked above.\n\n${siblingList}\n`
      : ''
  }${kept.figmaKeyNote ? `\n### Figma key\n\n${rehome(kept.figmaKeyNote)}\n` : ''}${carriedSections.join('')}${
    decisionRecords ? `\n### Decision records\n\n${decisionRecords}` : ''
  }${furtherReading}${
    isStyleKey
      ? `\n### Rules\n\n| Rule | Statement |\n|---|---|\n| [DSPEC-44](/schema/specification/#9-rule-catalogue) | Every \`Styles\` property declares a \`default\` valid against its own schema |\n| [DSPEC-45](/schema/specification/#9-rule-catalogue) | A declared \`default\` is a literal, never a reference or conditional |\n${
          siblingList
            ? '| [DSPEC-47](/schema/specification/#9-rule-catalogue) | Jointly resolved keys are stated as an ordered case table, not prose |\n'
            : ''
        }`
      : ''
  }
### Source

| Format | File |
|---|---|
| JSON Schema | [\`packages/schema/schema/styles.schema.json\`](https://github.com/DirectedEdges/spectacular/blob/main/packages/schema/schema/styles.schema.json) |
| TypeScript | [\`packages/schema/types/Styles.ts\`](https://github.com/DirectedEdges/spectacular/blob/main/packages/schema/types/Styles.ts) |
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
