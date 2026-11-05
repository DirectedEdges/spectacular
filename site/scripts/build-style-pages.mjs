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
 * Usage:  node scripts/build-style-pages.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// All page copy and migration constants live in content/ — this script holds
// structure only: headings, labels, traversal, and assembly.
import {
  TYPE_PAGE_HOME, REHOMED, STALE_CONTENT_FOLDERS,
  BANNER, PATH_ROOT, settingsSentence, ARRAY_OF, NO_ELEMENT_TYPE,
  JOINTLY_INTRO, DECISIONS_NONE, fallbackDescription, RULES, SOURCE_SECTION,
} from './content/style-pages.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, '..');
const repo = resolve(site, '..');
const pkg = join(repo, 'packages/schema');
const docsSchema = join(site, 'src/content/docs/schema');
const outRoot = join(docsSchema, 'styles');

/**
 * The style definitions, with `component.schema.json`'s underneath them.
 *
 * A style value may branch to `PropBinding`, which lives in the component
 * schema — a legitimate cross-file `$ref`. Reading only this file left that
 * branch with no title and no description, so `visible` listed a form it could
 * not describe. The styles file wins on any name collision, because this
 * generator documents styles.
 */
const defs = {
  ...JSON.parse(readFileSync(join(pkg, 'schema/component.schema.json'), 'utf8')).definitions,
  ...JSON.parse(readFileSync(join(pkg, 'schema/styles.schema.json'), 'utf8')).definitions,
};
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
 * Strips a `$ref` down to its definition name, across files as well as within
 * one. `component.schema.json#/definitions/PropBinding` is a legitimate
 * cross-file reference, and replacing only the literal `#/definitions/` left
 * the filename glued to the type: `component.schema.jsonPropBinding`.
 */
const DEF_PREFIX = /^.*#\/definitions\//;

const rehome = (s) =>
  typeof s === 'string'
    ? s.replace(/\/schema\/([a-z-]+)\//g, (m, slug) => REHOMED[slug] ?? m)
    : s;

/**
 * YAML for a JSON value, covering the subset `examples` holds: scalars, maps
 * and arrays of them.
 *
 * Examples are STORED as JSON, because that is what makes them trustworthy —
 * each one validates against the property it sits on. They are READ as YAML,
 * because that is the form specs are authored in.
 *
 * Quoting is the part that has to be right rather than merely tidy. A naive
 * dump of `backgroundImage`'s example emits `$image: #/images/hero`, where
 * everything from the `#` is a YAML comment and the value is silently empty.
 * So a string is quoted whenever leaving it bare would change what it parses
 * as.
 */
const yamlScalar = (v) => {
  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return JSON.stringify(v);
  const s = String(v);
  const needsQuote =
    s === '' ||
    // An indicator in first position: comment, anchor, alias, directive, tag,
    // block scalar, flow collection, quote, or the key/item separators.
    /^[#&*!|>%@`\-?:,[\]{}'"]/.test(s) ||
    // Would parse as something other than a string.
    /^(true|false|null|~|yes|no|on|off)$/i.test(s) ||
    /^[+-]?(\d|\.\d)/.test(s) ||
    // Structural characters anywhere.
    /: |\s#|\n|\t/.test(s) ||
    s !== s.trim();
  return needsQuote ? JSON.stringify(s) : s;
};

const toYaml = (value, indent = 0) => {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return `${pad}[]`;
    // A short run of scalars inline. `components: [1, 0.4, 0]` is one colour,
    // and three bullet lines made it look like three of something.
    if (value.length <= 4 && value.every((x) => x === null || typeof x !== 'object')) {
      return `${pad}[${value.map(yamlScalar).join(', ')}]`;
    }
    return value
      .map((item) => {
        if (item !== null && typeof item === 'object') {
          // The dash takes the place of the first two spaces of the item's
          // own indentation, so a nested map hangs off its bullet.
          const body = toYaml(item, indent + 2);
          return `${pad}- ${body.slice(indent + 2)}`;
        }
        return `${pad}- ${yamlScalar(item)}`;
      })
      .join('\n');
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return `${pad}{}`;
    return entries
      .map(([k, v]) => {
        const key = yamlScalar(k);
        if (v !== null && typeof v === 'object' && (Array.isArray(v) ? v.length : Object.keys(v).length)) {
          const body = toYaml(v, indent + 2);
          // A value that rendered to one line belongs on the key's line —
          // `components:` followed by `[1, 0.4, 0]` beneath it read as a
          // block that happened to be short. Arrays only: a single-entry map
          // body is one line too, but inlining it chains the keys into
          // `a: b: c`, which is not YAML.
          if (!body.includes('\n') && Array.isArray(v)) return `${pad}${key}: ${body.trimStart()}`;
          return `${pad}${key}:\n${body}`;
        }
        return `${pad}${key}: ${toYaml(v, 0)}`;
      })
      .join('\n');
  }
  return `${pad}${yamlScalar(value)}`;
};

/**
 * Documented once at the schema root; never nested. See the header.
 *
 * Derived rather than listed: a value form is a type that already has a
 * hand-written page of its own at the schema root, which is the same fact
 * `handWritten` reads off the directory. The hardcoded set it replaces named
 * six types, three of which — `ReferenceValue`, `VariableStyle`,
 * `StyleIdValue` — are not reachable from `Styles` at all, so the list had
 * been carrying dead entries.
 *
 * Membership is only ever tested against a type the traversal reached, so a
 * root page whose name happens to match an unreachable definition cannot
 * affect the tree.
 */
const VALUE_FORMS = {
  has: (name) => handWritten.has(kebab(name)),
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
 * ADRs that decide a path, read from the record's own `**Decides**` line.
 *
 * ```
 * **Decides**: effects, effects.backgroundBlur, effects.layerBlur
 * ```
 *
 * A declaration, not a derivation. Matching key names against prose was wrong
 * in both directions and could not be made right: several style keys are
 * ordinary English words, so `top` matched "the top level" and `components`
 * matched an ADR about the scan manifest, while a nested member like
 * `effects.backgroundBlur` was invisible because the section only ran on
 * top-level keys. The record is the artifact that knows what it decides.
 *
 * Until a record carries the line, the old matcher stands in for it — see
 * `derivedDecides`. A page losing its decision records the moment this
 * changed would be a worse answer than a page citing a near-miss.
 */
const declaredDecides = (src) => {
  const line = src.match(/^\*\*Decides\*\*:\s*(.+)$/m)?.[1]?.trim();
  if (!line) return null;
  if (/^(none|—|-|\*\(none\)\*)$/i.test(line)) return [];
  return line
    .replace(/`/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const adrsFor = (key, path) => {
  const dir = join(repo, 'adr');
  if (!existsSync(dir)) return [];
  /**
   * A style key is matched only where it is written as code.
   *
   * Several keys are ordinary English words, and prose uses them: `\btop\b`
   * matched "top-level" and "the top level", which between them appear in most
   * ADRs. That put five records about element content, code-only props, slots
   * and transform config on `top`'s page as decisions about it. Tightening the
   * boundary to exclude a hyphen fixed the first phrase and not the second,
   * because no rule over bare words can separate "the top level" from the
   * `top` offset.
   *
   * These ADRs backtick identifiers by convention, so the backticks are the
   * signal. Searching only the code spans of a section uses the convention
   * rather than guessing at prose.
   */
  const codeSpans = (text) => (text.match(/`[^`\n]+`/g) ?? []).join(' ');
  const re = new RegExp(`(?<![\\w-])${key}(?![\\w-])`);
  const mentionsKey = (text) => re.test(codeSpans(text));
  const out = [];
  for (const f of readdirSync(dir).filter((n) => /^\d{3}-.*\.md$/.test(n))) {
    const src = readFileSync(join(dir, f), 'utf8');
    if (!isAccepted(src)) continue;
    const title = (src.match(/^#\s+(?:ADR[\s-]*\d*\s*:\s*)?(.+)$/m)?.[1] ?? f).trim();
    const declared = declaredDecides(src);

    /**
     * The stand-in for a record with no `**Decides**` line: the key, written as
     * code, in the title, the Summary, or the Decision section.
     *
     * Scoped to those three because a key appearing anywhere in an ADR's prose
     * is usually incidental — scanning whole files listed six records for
     * `layoutSizingHorizontal`, one of them about icon detection because it
     * quoted a YAML example. The `## Decision` heading is matched on the whole
     * line: `^## Decision\b` matched `## Decision Drivers`, which 103 records
     * carry and which precedes the real section.
     */
    const derivedDecides = () => {
      const summary = src.match(/^\*\*Summary\*\*:\s*(.+)$/m)?.[1] ?? '';
      const decision = src.match(/^## Decision[ \t]*\r?\n[\s\S]*?(?=^## |(?![\s\S]))/m)?.[0] ?? '';
      return mentionsKey(title) || mentionsKey(summary) || mentionsKey(decision);
    };

    const decides = declared ? declared.includes(path) : derivedDecides();
    if (!decides) continue;
    out.push({ num: f.slice(0, 3), title, file: f, declared: Boolean(declared) });
  }
  return out;
};

/** Named definitions a node reaches, descending through wrappers and unions. */
const refsOf = (n, depth = 0, out = new Set()) => {
  if (!n || depth > 6) return out;
  if (n.$ref) {
    const t = n.$ref.replace(DEF_PREFIX, '');
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
  const n = node?.$ref ? defs[node.$ref.replace(DEF_PREFIX, '')] : node;
  if (!n || depth > 6) return '—';

  const branches = n.oneOf ?? n.anyOf;
  if (Array.isArray(branches)) {
    for (const b of branches) {
      const named = b.$ref?.replace(DEF_PREFIX, '');
      if (named && admitsValue(defs[named], value)) return typeLabel(named);
      if (!named && admitsValue(b, value)) return `\`${primitiveName(value)}\``;
    }
    return `\`${primitiveName(value)}\``;
  }
  return node?.$ref ? typeLabel(node.$ref.replace(DEF_PREFIX, '')) : `\`${primitiveName(value)}\``;
};

const primitiveName = (v) =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : typeof v;

/** Whether a value satisfies a node, to the depth needed to tell forms apart. */
const admitsValue = (n, v, depth = 0) => {
  if (!n || depth > 6) return false;
  if (n.$ref) return admitsValue(defs[n.$ref.replace(DEF_PREFIX, '')], v, depth + 1);
  const branches = n.oneOf ?? n.anyOf;
  if (Array.isArray(branches)) return branches.some((b) => admitsValue(b, v, depth + 1));
  // `const` as well as `enum`. Closed value sets are written as `oneOf`
  // branches of `const` (ADR-114), and without this no option branch ever
  // admitted its own value — so `position`'s `"ABSOLUTE"` matched nothing.
  if (n.const !== undefined) return v === n.const;
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
    const name = node.$ref.replace(DEF_PREFIX, '');
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
    .map((b) => b.$ref?.replace(DEF_PREFIX, ''))
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

for (const stale of STALE_CONTENT_FOLDERS) {
  if (existsSync(join(docsSchema, stale))) rmSync(join(docsSchema, stale), { recursive: true, force: true });
}

/**
 * Every file this run is responsible for, so the sweep at the end can delete a
 * page whose key was renamed or removed without deleting the other 98.
 *
 * The previous version removed the whole `styles/` tree first and wrote it back
 * from scratch. Correct output, but a running `astro dev` watches these files:
 * deleting all 99 and recreating them left the server serving 500s for pages
 * whose files were present and valid on disk, and the count grew with each
 * run. A docs change should not cost a dev server restart.
 */
const emitted = new Set();

/**
 * Written only when the bytes differ. An unchanged file keeps its mtime, so a
 * schema edit touching one key triggers one hot reload rather than 99.
 */
const writeIfChanged = (file, contents) => {
  emitted.add(file);
  if (existsSync(file) && readFileSync(file, 'utf8') === contents) return false;
  writeFileSync(file, contents);
  return true;
};

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

  /**
   * What the default value means, in the schema's own words where it has them.
   *
   * The branch declaring a value now carries a `title` and `description`
   * (ADR-114), so a null default reads as whatever that property says null
   * means rather than as a phrase invented here. This generator hardcoded
   * "`null` (nothing)" for every one of them, which was the same gloss on 19
   * properties that mean 19 different things by it.
   */
  const branchFor = (node, value, depth = 0) => {
    if (!node || depth > 5) return null;
    if (node.$ref) {
      const t = node.$ref.replace(DEF_PREFIX, '');
      return defs[t] ? branchFor(defs[t], value, depth + 1) : null;
    }
    const branches = node.oneOf ?? node.anyOf;
    if (!Array.isArray(branches)) return null;
    for (const b of branches) {
      if (b.const !== undefined && b.const === value) return b;
      if (value === null && b.type === 'null') return b;
      const nested = branchFor(b, value, depth + 1);
      if (nested) return nested;
    }
    return null;
  };

  const defaultText = (() => {
    if (!hasDefault) return null;
    const literal = `\`${JSON.stringify(spec.default)}\``;
    const branch = branchFor(spec, spec.default);
    const gloss = branch?.title ?? branch?.description;
    return gloss ? `${literal} — ${gloss.replace(/\.$/, '')}` : literal;
  })();

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
  /**
   * Preserved rows whose `Type` the schema still admits.
   *
   * These came from the hand-written pages and are not validated against
   * anything, so they outlive the contract: `clipsContent` kept a
   * `TokenReference` row after its value narrowed to a bare `boolean`, which
   * is a page advertising a value the schema rejects.
   */
  const admittedTypeNames = new Set(namedTypes(spec).map((t) => t.replace(/`/g, '')));
  const exampleRows = (kept.typeExamples ?? []).filter((r) => {
    const named = String(r.type ?? '').match(/`([^`]+)`|\[`([^`]+)`\]/);
    const name = named?.[1] ?? named?.[2];
    return !name || admittedTypeNames.has(name);
  });
  const anySettings = !schemaExamples && exampleRows.some((r) => r.settings);

  /**
   * A scalar stays a table row; a composite becomes a YAML block.
   *
   * One line of JSON in a table cell is unreadable past about four keys —
   * `shadows`' two-shadow example is 180 characters of punctuation in a cell
   * that cannot wrap. YAML fixes that and cannot go in a cell at all, being
   * multi-line. But eleven fenced blocks for `backgroundColor`, whose examples
   * are mostly colour strings, is a worse page than the table it replaced.
   *
   * So the value's own shape decides, and a page carrying both gets the table
   * first and the blocks after it.
   */
  const isComposite = (v) => v !== null && typeof v === 'object';
  const scalarExamples = (schemaExamples ?? []).filter((ex) => !isComposite(ex));
  const compositeExamples = (schemaExamples ?? []).filter(isComposite);

  const examples = schemaExamples
    ? scalarExamples.map((ex) => `| \`${JSON.stringify(ex)}\` | ${formOf(ex, spec)} |`)
    : exampleRows.map(
        (r) => `| ${rehome(r.type)} | ${rehome(asObject(r.example))} |${anySettings ? ` ${rehome(r.settings) ?? '—'} |` : ''}`
      );

  /**
   * Each composite labelled with the type it is, because that is what the
   * table's `Type` column carried and a fenced block has no columns.
   */
  const exampleBlocks = compositeExamples
    .map((ex) => {
      // The label names which form the value takes, which only means something
      // where there is more than one. On a plain object or array page it read
      // `**object**` or `**array**` above every block.
      const label = Array.isArray(spec.oneOf ?? spec.anyOf) ? `**${formOf(ex, spec)}**\n\n` : '';
      return `${label}\`\`\`yaml\n${toYaml(ex)}\n\`\`\``;
    })
    .join('\n\n');
  const exampleHead = schemaExamples
    // "Type", matching the section above that lists them. The column names
    // which of the admitted types the example value is, and calling the same
    // set "forms" here and "types" there made them read as two taxonomies.
    ? '| Example | Type |\n|---|---|'
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
      ? `\n${settingsSentence([...new Set(exampleRows.filter((r) => r.settings).map((r) => rehome(r.settings)))].join(' and '))}\n`
      : '';

  /**
   * A union's branches, each with the description that distinguishes it.
   * `Contains` cannot carry this: a `oneOf` has branches, not members, and
   * `GradientValue` is exactly one of them at a time.
   */
  const kids = childrenOf(p);

  /**
   * A type's own members, indented one level.
   *
   * Listing them in a sibling `Contains` section stated them as the page's
   * members, which they are not: `effects` holds a token reference, an
   * `Effects` object or `null`, and `shadows` belongs to the middle one only.
   * The indent is the attribution.
   *
   * Where a member's page lives depends on whether its owning type is reached
   * by more than one key — a shared type's members sit under the type's own
   * canonical page, everything else under the path that reaches it. That is the
   * same split `walk` made when it emitted them.
   */
  const membersOf = (t, indent = '  ') => {
    const owned = Object.keys(defs[t]?.properties ?? {});
    if (!owned.length) return '';
    const base = SHARED.has(t) && !handWritten.has(kebab(t)) ? [t] : p;
    return owned
      .map((m) => {
        const path = [...base, m];
        const exists = nodes.some((n) => n.path.join('.') === path.join('.'));
        return `${indent}- ${exists ? `[\`${m}\`](${urlOf(path)})` : `\`${m}\``}`;
      })
      .join('\n');
  };

  const oneOfBranches = (() => {
    /**
     * The union is usually on the definition the property references, not on
     * the property — `position` is a `$ref` to `PositionStyleValue`, and the
     * branches live there. Descending through the value-union wrappers is the
     * same traversal `namedTypes` does.
     */
    const union = (node, depth = 0) => {
      if (!node || depth > 5) return null;
      if (Array.isArray(node.oneOf) || Array.isArray(node.anyOf)) return node;
      if (node.$ref) {
        const t = node.$ref.replace(DEF_PREFIX, '');
        return defs[t] ? union(defs[t], depth + 1) : null;
      }
      return null;
    };
    const owner = union(spec);
    const branches = owner && (owner.oneOf ?? owner.anyOf);
    if (!Array.isArray(branches) || !branches.length) return null;
    /**
     * A union carrying `const` branches is a closed set of options; anything
     * else is the set of forms the value may take. The two read differently
     * enough to earn their own heading, so a reader is not inferring which kind
     * they are looking at from a column label.
     *
     * Tested with `some` rather than `every`, because every enum union here
     * also admits `null`.
     */
    const hasConst = branches.some((br) => br.const !== undefined);

    /**
     * Branches read most to least sophisticated, not in schema order.
     *
     * The schema's order is whatever each definition happened to be written
     * in, so `backgroundColor` led with a bare `string` and `effects` led with
     * a token reference while `cornerRadius` led with a number. A reader
     * scanning for the richest form they could use was scanning an arbitrary
     * list.
     *
     *   1  a token or binding reference — the form to reach for first
     *   2  a named type that is itself a union, e.g. `GradientValue`
     *   3  a named object type, whose members are listed beneath it
     *   4  a literal option, or a raw primitive
     *   5  `null`, always last
     *
     * Sorting is stable, so branches sharing a tier keep the order the schema
     * declares them in — which is what the enum option sets want.
     */
    const tierOf = (br) => {
      const t = br.$ref?.replace(DEF_PREFIX, '');
      if (t && VALUE_FORMS.has(t)) return t === 'TokenReference' ? 1 : 1.5;
      if (t && defs[t]?.properties) return 3;
      if (t && (defs[t]?.oneOf || defs[t]?.anyOf)) return 2;
      if (br.type === 'null') return 5;
      return 4;
    };
    const ordered = [...branches].sort((a, b) => tierOf(a) - tierOf(b));

    /**
     * Members are listed beneath their branch only where exactly one branch
     * has any. `GradientValue` admits three gradient types that each carry a
     * `type`, a centre or an angle, and `stops`; expanding all three repeats
     * near-identical member lists and buries the distinction between them,
     * which is what that page's own branch descriptions are for.
     */
    const expandable = ordered.filter((br) => {
      const t = br.$ref?.replace(DEF_PREFIX, '');
      return t && !VALUE_FORMS.has(t) && Object.keys(defs[t]?.properties ?? {}).length;
    });
    const expandOnly = expandable.length === 1 ? expandable[0] : null;

    /**
     * Each example assigned to the one form it illustrates, first match wins.
     *
     * The page had a `Type` list and an `Examples` section enumerating the same
     * forms in two different shapes — a table for the scalars, fenced blocks
     * for the composites. One section keyed by form removes both the
     * repetition and the mixed formatting, and a form's examples sit under it.
     */
    const claimed = new Set();
    const examplesFor = (br) =>
      (schemaExamples ?? []).filter((ex, i) => {
        if (claimed.has(i)) return false;
        if (!admitsValue(br, ex)) return false;
        claimed.add(i);
        return true;
      });

    /**
     * The branch the declared default belongs to, so the default reads as one
     * of the values rather than as a section of its own. `cornerRadius`'s `0`
     * is a `number`, `backgroundColor`'s is the `null` arm, `position`'s is the
     * `"AUTO"` option.
     */
    /**
     * `branchFor` only recognises a `const` or `null` arm, because its other
     * job is to find the gloss a declaring branch carries. A default like
     * `opacity`'s `1` belongs to the plain `number` arm, which has no gloss
     * and which that function never returns — so without the fallback the
     * marker never rendered and, with the `Default` section gone, the value
     * was lost from the page entirely.
     */
    const defaultBranch = hasDefault
      ? (branchFor(spec, spec.default) ?? ordered.find((br) => admitsValue(br, spec.default)) ?? null)
      : null;
    /**
     * `(default)` alone where the branch's name IS the value — an option, or
     * `null`. Where the branch admits many values, the marker has to carry
     * which one, or removing the `Default` section would lose it: `number
     * (default)` does not say `1`.
     */
    const defaultMark = (br) => {
      if (!defaultBranch || br !== defaultBranch) return '';
      const isTheValue = br.const !== undefined || br.type === 'null';
      return isTheValue ? ' (default)' : ` (default: \`${JSON.stringify(spec.default)}\`)`;
    };

    /**
     * Whether a branch's type has a page of its own, which decides whether its
     * members are listed here.
     *
     * A shared type — `ColorObject`, `GradientValue`, `Sides`, `Blur` — has a
     * canonical page that lists its own members, so repeating them here is
     * noise and the expanded example says more. A singly-reached type —
     * `Effects`, `Corners`, `Typography`, `ImageValue` — has no page, and this
     * list is the only route to its member pages. Dropping it there would
     * orphan them, as suppressing `Contains` once did.
     */
    const hasOwnPage = (t) => Boolean(t && (handWritten.has(kebab(t)) || (SHARED.has(t) && isDocumentable(t))));

    const asScalar = (ex) => (typeof ex === 'string' ? JSON.stringify(ex) : yamlScalar(ex));

    /**
     * Any example no branch claimed, plus the note saying which form a run
     * emits. Both close the section rather than trailing the page: the note
     * had been landing after `Default`, where it read as a statement about the
     * default, and an unclaimed example would vanish with nothing saying so —
     * which is itself the signal, since an example matching none of its own
     * property's branches is a bad example or a gap in the union.
     */
    const tailOf = () => {
      const orphans = (schemaExamples ?? []).filter((_, i) => !claimed.has(i));
      const block = orphans.length
        ? orphans
            .map((ex) =>
              ex !== null && typeof ex === 'object' ? `\`\`\`yaml\n${toYaml(ex)}\n\`\`\`` : `- \`${asScalar(ex)}\``
            )
            .join('\n')
        : '';
      return [block, settingsNote.trim()].filter(Boolean).join('\n\n');
    };

    /** An option set stays a bulleted list — a quoted literal is not a heading. */
    if (hasConst) {
      const rows = ordered.map((br) => {
        const label = br.const !== undefined ? `\`${JSON.stringify(br.const)}\`` : namedTypes(br).join(', ') || '—';
        const gloss = br.description ?? br.title ?? '';
        // Claimed but not shown: an option's example is the option.
        examplesFor(br);
        return `- **${label}**${defaultMark(br)}${gloss ? ` — ${gloss}` : ''}`;
      });
      return { heading: 'Value', body: [rows.join('\n'), tailOf()].filter(Boolean).join('\n\n') };
    }

    const sections = ordered.map((br) => {
      const named = br.$ref?.replace(DEF_PREFIX, '');
      const child = kids.find((c) => c.path[c.path.length - 1] === named);
      const linked = child ? `[\`${named}\`](${urlOf(child.path)})` : named ? typeLabel(named) : null;
      // `namedTypes` returns its entries already backticked, so this must not
      // wrap them again.
      const label = linked ?? (namedTypes(br).join(', ') || '—');

      /**
       * One clause saying when a reader would write this form — not the type's
       * full description, which is written for the type's own page.
       * `TokenReference`'s runs 200 characters about `$extensions` and appears
       * on 40 pages; under a heading that is noise.
       */
      const gloss =
        br.description ?? (named ? (defs[named]?.title ?? defs[named]?.description) : null) ?? br.title ?? '';

      const members = br === expandOnly && !hasOwnPage(named) ? membersOf(named, '') : '';

      const mine = examplesFor(br);
      const shown = mine.length
        ? mine.every((ex) => ex === null || typeof ex !== 'object')
          ? mine.map((ex) => `- \`${asScalar(ex)}\``).join('\n')
          : mine.map((ex) => `\`\`\`yaml\n${toYaml(ex)}\n\`\`\``).join('\n\n')
        : '';

      // `#####`, a level below the `###` sections, so a value reads as
      // subordinate to `Values` rather than competing with it.
      return [`##### ${label}${defaultMark(br)}`, gloss, members, shown].filter(Boolean).join('\n\n');
    });

    return { heading: 'Value', body: [sections.join('\n\n'), tailOf()].filter(Boolean).join('\n\n') };
  })();

  /**
   * The same one-section shape for the two values that are not unions.
   *
   * `shadows` is an array of `Shadow` and `Blur` is a plain object, so both
   * fell through to a `Type` line reading `array, Shadow` or `object` plus a
   * sibling `Contains`. That is the pair this page shape replaced for unions,
   * left standing on four pages because the rule was written about `oneOf`
   * rather than about having members.
   */
  const memberSection = (() => {
    if (oneOfBranches) return null;

    const resolve = (node, depth = 0) => {
      if (!node || depth > 5) return node;
      if (node.$ref) {
        const t = node.$ref.replace(DEF_PREFIX, '');
        return defs[t] ? resolve(defs[t], depth + 1) : null;
      }
      return node;
    };
    const node = resolve(spec);
    if (!node) return null;

    // An array of a named type: the item type carries the members.
    const itemType = node.type === 'array' ? node.items?.$ref?.replace(DEF_PREFIX, '') : null;
    if (itemType && Object.keys(defs[itemType]?.properties ?? {}).length) {
      const why = defs[itemType].title ?? node.description ?? defs[itemType].description ?? '';
      return {
        heading: 'Value',
        body: `${ARRAY_OF}\n\n##### \`${itemType}\`\n\n${[why, membersOf(itemType, '')].filter(Boolean).join('\n\n')}`,
      };
    }

    /**
     * The page is itself an object type, so its members are not a branch's —
     * they are the page's own. No lead-in and no indent: the heading is
     * `Contains` and the list is flat, which is what it already said. What goes
     * away is the `Type` line above it reading `object`.
     */
    const own = spec.$sharedType ?? (node.properties ? key : null);
    if (own && kids.length) {
      return {
        heading: 'Contains',
        body: kids.map((c) => `- [\`${c.path[c.path.length - 1]}\`](${urlOf(c.path)})`).join('\n'),
      };
    }

    /**
     * A single named type whose page is elsewhere — `effects.backgroundBlur` is
     * a bare `$ref` to `Blur`, which is shared and so does not nest, leaving
     * nothing to list and the page on the bare fallback reading `Type: Blur`.
     *
     * Rendered in the same shape a union branch gets, so one value and five
     * read alike.
     */
    const only = spec.$ref?.replace(DEF_PREFIX, '');
    if (only && defs[only] && !isWrapper(only)) {
      const gloss = spec.description ?? defs[only].title ?? defs[only].description ?? '';
      const shown = (schemaExamples ?? [])
        .map((ex) => (ex !== null && typeof ex === 'object' ? `\`\`\`yaml\n${toYaml(ex)}\n\`\`\`` : `- \`${yamlScalar(ex)}\``))
        .join('\n\n');
      return {
        heading: 'Value',
        body: [`##### ${typeLabel(only)}`, gloss, shown].filter(Boolean).join('\n\n'),
        consumedExamples: true,
      };
    }
    return null;
  })();

  const valueSection = oneOfBranches ?? memberSection;

  /**
   * One subheading per platform rather than a table: the binding's `notes`
   * live here now — a note is a fact about one key on one platform, and this
   * is the page where it is one paragraph instead of a wall of 46.
   */
  const bindingRows = isStyleKey
    ? Object.entries(bindings).map(([platform, b]) => {
        const v = b.concepts.styles[key] ?? { disposition: 'unverified' };
        const realises = v.rule
          ? `rule [\`${v.rule}\`](/schema/mappings/${platform}/rules/${kebab(v.rule)}/)`
          : (v.target ? `\`${v.target}\`` : (v.module?.length ? v.module.map((m) => `\`${m}\``).join(', ') : '—'));
        const fields = `**Disposition**: ${v.disposition === 'unverified' ? '**unverified**' : v.disposition} · **Realised by**: ${realises}`;
        return `##### [${PLATFORM[platform]}](/schema/mappings/${platform}/)\n\n${fields}${v.notes ? `\n\n${v.notes}` : ''}`;
      }).join('\n\n')
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
  /**
   * Gated on whether the schema carries examples at all, not on whether the
   * scalar table has rows.
   *
   * `examples` holds only the scalar rows now — a page whose examples are all
   * composites has none, so the gate opened on `effects`, `typography` and
   * `gradient-value` and rendered the replaced page's hand-written `Values`
   * table beneath the generated `Value` section. Two sections a heading apart,
   * one of them a 2024 snapshot.
   */
  if (!schemaExamples?.length) {
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
    if (!union.size) return NO_ELEMENT_TYPE;
    return [...union].sort().map((t) => `- [\`${t}\`](/schema/anatomy/#elementtype)`).join('\n');
  })();

  /**
   * Keys this one resolves alongside, grouped by rule.
   *
   * Every rule-governed key belongs to a *different* rule on each platform —
   * `width` is in CSS's `intrinsicSize` and Figma's `autoVsAbsoluteLayout` — so
   * one flat list annotated with platform names merged two unrelated groupings
   * into a set that matched neither. A key appearing under two rules is
   * correct and is repeated.
   */
  const siblingList = (() => {
    if (!isStyleKey) return null;
    const groups = [];
    for (const [platform, b] of Object.entries(bindings)) {
      const name = b.concepts.styles[key]?.rule;
      if (!name) continue;
      const others = (b.concepts.styleRules[name].keys ?? []).filter((k) => k !== key);
      if (!others.length) continue;
      groups.push(
        `**[${name}](/schema/mappings/${platform}/rules/${kebab(name)}/)** — ${PLATFORM[platform]}\n\n${others
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
  /**
   * Shown at every depth, not only on the 46 top-level keys.
   *
   * `effects.backgroundBlur` is decided by the effects record, which names it,
   * and the page said nothing because the section did not run below depth 1.
   * A nested member is as much a decided thing as the key that contains it.
   *
   * `Mentions` is gone. It listed records that matched a key's name without
   * deciding it, which is a statement about a text search rather than about
   * the key — and nothing declares a mention, so there is no honest version of
   * it once the records declare what they decide.
   */
  const decisionRecords = (() => {
    if (spec.$sharedType) return null;
    // Rooted, because `anatomy` and `props` will declare paths in the same
    // field and a bare leaf would not say which tree it belongs to.
    const adrs = adrsFor(key, `styles.${p.join('.')}`);
    // Said rather than left blank: several keys have no record, and a missing
    // section reads as a render that failed instead of a fact about the key.
    if (!adrs.length) return DECISIONS_NONE;
    const item = (a) => `- [ADR-${a.num}](/adr/${a.file.replace(/\.md$/, '')}/) — ${a.title}`;
    return `${adrs.map(item).join('\n')}\n`;
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

  /**
   * The access path to this value, as the expression you would write.
   *
   * Every ancestor segment links to its own page, so a reader five levels deep
   * can walk back up without the sidebar. The segments are separate code spans
   * because a link cannot cover part of one.
   *
   * An array segment carries `[]`, which the previous prose trail left out —
   * `styles.effects.shadows.blur` reads as an object walk, and `shadows` is a
   * list.
   */
  const pathSection = (() => {
    /**
     * Shown at every depth. This replaced a prose breadcrumb that only existed
     * to name the ancestors, so it was skipped on the 46 top-level keys, which
     * have none. Rooted at `elements` the path says something there too:
     * `elements.<element>.styles.aspectRatio` is where the value is written.
     *
     * A shared type's canonical page is the exception — `ColorObject` sits at
     * depth 1 beside the style keys, but `styles.ColorObject` is not a path.
     */
    if (spec.$sharedType) return '';
    const isArray = (prefix) => {
      const node = nodes.find((n) => n.path.join('.') === prefix.join('.'));
      if (!node) return false;
      const resolve = (s, depth = 0) => {
        if (!s || depth > 5) return s;
        if (s.$ref) {
          const t = s.$ref.replace(DEF_PREFIX, '');
          return defs[t] ? resolve(defs[t], depth + 1) : null;
        }
        return s;
      };
      return resolve(node.spec)?.type === 'array';
    };
    const segments = p.map((seg, i) => {
      const prefix = p.slice(0, i + 1);
      const suffix = isArray(prefix) ? '[]' : '';
      const last = i === p.length - 1;
      return `${last ? `\`${seg}\`` : `[\`${seg}\`](${urlOf(prefix)})`}${suffix}`;
    });
    /**
     * Rooted at `elements`, not at `styles`. `styles` is not a top-level key —
     * a style is reached through a named element, so a path starting at
     * `styles` is not an expression anyone can write.
     *
     * `elements` is where styles live: it is a member of a `Variant`, so the
     * same path sits under `default` and under each `variants[]` entry. Those
     * two roots are left off rather than picked between. `anatomy` is a
     * different thing — the declared set of available anatomy items — and is
     * not where a style is written.
     *
     * The element segment stays a placeholder because its name is the author's.
     */
    // The leading ellipsis stands for the roots above `elements` — `default`
    // and each `variants[]` entry both carry one, so naming either would be
    // wrong half the time, and starting at `elements` read as a top-level key.
    // Unbacketed and with no separator of its own, so it reads as an elision
    // rather than as a segment named "...".
    return `### Path\n\n${PATH_ROOT}.${segments.join('.')}\n`;
  })();

  const page = `---
title: "${key}"
description: "${(spec.description ?? kept.intro ?? fallbackDescription(key)).replace(/"/g, '\\"').slice(0, 300)}"
---

${BANNER}

${spec.description ?? rehome(kept.intro) ?? ""}

${pathSection}
${
  // One section, not two. The member list and the one-line type list state the
  // same fact — what may be written here — so a page carrying both said it
  // twice, once without the meanings and once with them.
  valueSection
    ? `### ${valueSection.heading}\n\n${valueSection.body}\n${required.has(key) ? '\nRequired.\n' : ''}`
    : // `Values` here too — a leaf whose value is a bare `boolean` answers the
      // same question as a five-form union, and two names for it put `Type` on
      // 14 pages and `Values` on the other 85.
      // The default marks the single type, the way it marks a branch on a
      // union page — otherwise a key whose value is one plain type is the only
      // kind of page with a `Default` section of its own.
      `### Value\n\n${types}${hasDefault ? ` (default: \`${JSON.stringify(spec.default)}\`)` : ''}${
        required.has(key) ? ' · required' : ''
      }\n`
}${
    // No `Default` section anywhere. The declared default is marked on the
    // value that carries it — `(default)` on an option or `null` arm,
    // `(default: 1)` where the form admits more than one value, and on the
    // type itself where the value is a single plain type. The fact sits with
    // the value instead of being restated in a section of its own.
    ''
  }${
    // Only where there is no form list to carry them — a plain object or array
    // page like `Blur` or `effects.shadows`, which has no form to key by.
    !oneOfBranches && !valueSection?.consumedExamples && (examples.length || exampleBlocks)
      ? `\n### Example${examples.length + compositeExamples.length !== 1 ? 's' : ''}\n\n${examples.length ? `${exampleHead}\n${examples.join('\n')}\n` : ''}${
          exampleBlocks ? `${examples.length ? '\n' : ''}${exampleBlocks}\n` : ''
        }${settingsNote}`
      : ''
  }${
    // Members are listed by `valueSection` — beneath the branch or type that
    // owns them, rather than in a sibling section that attributed them to the
    // page. This is the fallback for a page whose children belong to neither.
    kids.length && !valueSection
      ? `\n### Contains\n\n${kids.map((c) => `- [\`${c.path[c.path.length - 1]}\`](${urlOf(c.path)})`).join('\n')}\n`
      : ''
  }${usedBy ? `\n### Used by\n\n${usedBy}\n` : ''}${supportedOn ? `\n### Supported on\n\n${supportedOn}\n` : ''}${bindingRows ? `\n### Platform bindings\n\n${bindingRows}\n` : ''}${
    siblingList
      ? `\n### Resolved jointly with\n\n${JOINTLY_INTRO}\n\n${siblingList}\n`
      : ''
  }${kept.figmaKeyNote ? `\n### Figma key\n\n${rehome(kept.figmaKeyNote)}\n` : ''}${carriedSections.join('')}${
    decisionRecords ? `\n### Decisions\n\n${decisionRecords}` : ''
  }${furtherReading}${
    isStyleKey
      ? `\n### Rules\n\n| Rule | Statement |\n|---|---|\n${RULES.dspec44}\n${RULES.dspec45}\n${
          siblingList
            ? `${RULES.dspec47}\n`
            : ''
        }`
      : ''
  }
${SOURCE_SECTION}
`;

  const dir = p.length > 1 ? join(outRoot, ...p.slice(0, -1).map(kebab)) : outRoot;
  mkdirSync(dir, { recursive: true });
  if (writeIfChanged(join(dir, `${kebab(key)}.md`), page)) written++;
}

/** Pages from an earlier run that this one no longer emits. */
const removed = (() => {
  const out = [];
  const sweep = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) sweep(full);
      else if (entry.name.endsWith('.md') && !emitted.has(full)) {
        rmSync(full);
        out.push(full);
      }
    }
  };
  sweep(outRoot);
  return out;
})();

console.log(
  `${emitted.size} pages under site/src/content/docs/schema/styles/ — ${written} changed, ${emitted.size - written} unchanged, ${removed.length} removed`
);
const depths = {};
for (const n of nodes) depths[n.path.length] = (depths[n.path.length] ?? 0) + 1;
console.log(`by depth: ${Object.entries(depths).map(([d, c]) => `${d}:${c}`).join('  ')}`);
console.log(
  `value forms kept at the schema root and linked: ${Object.keys(defs).filter((n) => VALUE_FORMS.has(n)).join(', ')}`
);
