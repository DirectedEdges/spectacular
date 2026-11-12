/**
 * The containment tree the style pages are generated from, and the queries the
 * page assembly makes about it.
 *
 * One pure function of the schema plus the list of hand-written root pages. It
 * decides which pages exist, where each one sits, which types get a page of
 * their own, and how a type is named in running text. Everything here is a
 * question about the schema; nothing here emits a page.
 *
 * Pulled out of the generator because it was 210 lines of traversal sitting
 * above a 736-line page loop, and because it is the one part of that file that
 * can be checked without writing anything: the node count and the depth
 * histogram are a test of the whole traversal, and the generator already
 * printed both.
 */

import { defName } from './schema.mjs';
import { kebab } from './naming.mjs';

/**
 * Build the tree.
 *
 * `handWritten` is the set of page slugs that already exist at the schema root
 * — passed in rather than read here, because it is a fact about the site's
 * directory and this module is about the schema.
 */
export const buildStyleTree = ({ defs, handWritten }) => {
  /**
   * A value-union wrapper: the set of forms a key's value may take, rather
   * than a thing the key contains. Traversal descends through them without
   * giving them pages.
   */
  const isWrapper = (n) => /StyleValue$|^Style$|^StyleKey$/.test(n);

  /**
   * Types documented on their union's page rather than on pages of their own:
   * the named object branches of a union that is itself a thing rather than a
   * set of value forms.
   *
   * `GradientValue`'s three branches differ by one `const` and a
   * centre-or-angle, so a page apiece put three near-identical pages between a
   * reader and the one type they were after, and pushed `stops` down to
   * `styles/background-color/linear-gradient/stops/` — four levels to reach a
   * list of two members. Expanded on the union's page they read as three
   * shapes side by side, which is what distinguishes them, and `GradientStop`
   * is one hop away.
   *
   * Wrapper unions are excluded, because their branches are not shapes of one
   * thing — they are the forms a value may take, and `ColorObject` is a shared
   * type reached from six places with a page it has earned.
   */
  const BRANCH_TYPES = new Set();
  for (const [name, def] of Object.entries(defs)) {
    if (isWrapper(name)) continue;
    const named = (def.oneOf ?? def.anyOf ?? [])
      .map((b) => defName(b.$ref))
      .filter((t) => t && defs[t]?.properties);
    if (named.length > 1) for (const t of named) BRANCH_TYPES.add(t);
  }

  /**
   * A value form — `TokenReference`, `PropBinding`, `Conditional` — is
   * documented once at the schema root and never nested, because it is
   * reachable from nearly every key and nesting it would repeat `$token`,
   * `$type` and `$extensions` under all 46.
   *
   * Derived rather than listed: a value form is a type that already has a
   * hand-written page at the schema root, which is the same fact `handWritten`
   * records. The hardcoded set this replaced named six types, three of which —
   * `ReferenceValue`, `VariableStyle`, `StyleIdValue` — are not reachable from
   * `Styles` at all, so the list had been carrying dead entries.
   *
   * Membership is only ever tested against a type the traversal reached, so a
   * root page whose name happens to match an unreachable definition cannot
   * affect the tree.
   */
  const isValueForm = (name) => handWritten.has(kebab(name));

  /** Named definitions a node reaches, descending through wrappers and unions. */
  const refsOf = (n, depth = 0, out = new Set()) => {
    if (!n || depth > 6) return out;
    if (n.$ref) {
      const t = defName(n.$ref);
      if (isWrapper(t) && defs[t]) return refsOf(defs[t], depth + 1, out);
      out.add(t);
      return out;
    }
    if (n.items) refsOf(n.items, depth + 1, out);
    for (const b of ['oneOf', 'anyOf', 'allOf']) if (Array.isArray(n[b])) n[b].forEach((x) => refsOf(x, depth + 1, out));
    return out;
  };

  const primitiveName = (v) =>
    v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : typeof v;

  /** Whether a value satisfies a node, to the depth needed to tell forms apart. */
  const admitsValue = (n, v, depth = 0) => {
    if (!n || depth > 6) return false;
    if (n.$ref) return admitsValue(defs[defName(n.$ref)], v, depth + 1);
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
      /**
       * A present property has to satisfy its own schema, not merely exist.
       * `LinearGradient`, `RadialGradient` and `AngularGradient` are told apart
       * only by their `type` const — the rest of the shape is identical — so
       * stopping at the key names made all three admit all three, and the
       * ANGULAR example was claimed by whichever branch sorted first.
       */
      for (const [k, sub] of Object.entries(n.properties ?? {})) {
        if (k in v && !admitsValue(sub, v[k], depth + 1)) return false;
      }
      return true;
    }
    return false;
  };

  /**
   * A shared type earns a page whether it is an object or a union.
   * `GradientValue` and `PositionOffset` are `oneOf` with no direct
   * properties, and requiring `properties` left both unpaged while four style
   * pages still linked to them.
   */
  const isDocumentable = (t) => Boolean(defs[t] && (defs[t].properties || defs[t].oneOf || defs[t].anyOf));

  /**
   * A node's children are its properties, or — for a union whose branches are
   * named definitions — those branches. `GradientValue` is a `oneOf` over
   * `LinearGradient`, `RadialGradient` and `AngularGradient`, each with its own
   * properties and description. Without this they had no pages at all, and the
   * union's own page could only name them as plain text.
   *
   * A branch entry's `spec` is the branch's own definition, resolved in place,
   * rather than a property schema pointing at one. `refsOf` reads `$ref`,
   * `items` and the union keywords and never `properties`, so a resolved
   * branch def yielded no refs to follow and traversal stopped on it:
   * `LinearGradient` reached none of `type`, `angle` or `stops`, and nothing
   * anywhere reached `GradientStop`. The third element names the definition to
   * descend into directly, and is null for a plain property.
   */
  const childEntries = (node) => {
    const own = Object.entries(node.properties ?? {});
    if (own.length) return own.map(([k, spec]) => [k, spec, null]);
    return (node.oneOf ?? node.anyOf ?? [])
      .map((b) => defName(b.$ref))
      .filter((t) => t && defs[t]?.properties)
      .map((t) => [t, defs[t], t]);
  };

  /**
   * Every path that reaches each named type, so a type reached by more than one
   * can be told from one reached by exactly one.
   *
   * A type reached by more than one path gets ONE page, not a copy under each.
   * `ColorObject` is reachable from `backgroundColor`, `fillColor`,
   * `textColor`, `strokes` and `effects.shadows.color`; nesting it under all
   * five put a `Contains` list on `backgroundColor` that was not
   * backgroundColor's structure at all — it was ColorObject's, said five times.
   *
   * A type reached by exactly one path still nests, because there the
   * containment path and the type are the same thing.
   */
  const pathsReaching = {};
  {
    const probe = (node, path, seen) => {
      for (const [key, spec, branch] of childEntries(node)) {
        const p = [...path, key];
        if (branch && !seen.has(branch)) probe(defs[branch], p, new Set([...seen, branch]));
        for (const t of refsOf(spec)) {
          if (!defs[t] || isValueForm(t)) continue;
          (pathsReaching[t] ??= new Set()).add(p.join('.'));
          if (!seen.has(t)) probe(defs[t], p, new Set([...seen, t]));
        }
      }
    };
    probe(defs.Styles, [], new Set(['Styles']));
  }
  const SHARED = new Set(Object.entries(pathsReaching).filter(([, s]) => s.size > 1).map(([t]) => t));

  /**
   * A type is linked only when it has a page of its own — a value form or a
   * hand-written type at the schema root, or a shared type's canonical page. A
   * type whose structure is nested under the current page has no separate page
   * by design: that page *is* its documentation, and the `Contains` section
   * lists its members. Linking it would point at nothing, which is how eight
   * links broke when the flat `types/` folder was removed.
   */
  const pageOfType = (name) =>
    handWritten.has(kebab(name))
      ? `/schema/${kebab(name)}/`
      : SHARED.has(name) && isDocumentable(name) && !BRANCH_TYPES.has(name)
        ? `/schema/styles/${kebab(name)}/`
        : null;

  /** A type as a reader sees it: a link where it has a page, code where it does not. */
  const typeLabel = (name) => {
    const page = pageOfType(name);
    return page ? `[\`${name}\`](${page})` : `\`${name}\``;
  };

  /**
   * Which of a property's admitted forms an example value takes, so a reader
   * can tell a literal from a token reference from a composite at a glance.
   * Matched against the union rather than guessed from the value's JavaScript
   * type: a `TokenReference` and a `Corners` object are both objects.
   */
  const formOf = (value, node, depth = 0) => {
    const n = node?.$ref ? defs[defName(node.$ref)] : node;
    if (!n || depth > 6) return '—';

    const branches = n.oneOf ?? n.anyOf;
    if (Array.isArray(branches)) {
      for (const b of branches) {
        const named = defName(b.$ref);
        if (named && admitsValue(defs[named], value)) return typeLabel(named);
        if (!named && admitsValue(b, value)) return `\`${primitiveName(value)}\``;
      }
      return `\`${primitiveName(value)}\``;
    }
    return node?.$ref ? typeLabel(defName(node.$ref)) : `\`${primitiveName(value)}\``;
  };

  /** The types a value admits, named rather than collapsed to primitives. */
  const namedTypes = (node, depth = 0, out = []) => {
    if (!node || depth > 5) return out;
    const push = (s) => { if (!out.includes(s)) out.push(s); };
    if (node.$ref) {
      const name = defName(node.$ref);
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

  // ── The tree itself ────────────────────────────────────────────────────────
  const nodes = [];
  const walk = (node, path, seen) => {
    for (const [key, spec, branch] of childEntries(node)) {
      const p = [...path, key];
      // An inline-documented branch contributes no page and no subtree. The
      // shared types it references are reached by `probe`, which still descends
      // into it, so they keep their canonical pages one level below the union.
      if (branch && BRANCH_TYPES.has(branch)) continue;
      nodes.push({ path: p, spec, parentDef: node, required: new Set(node.required ?? []) });
      if (branch && !seen.has(branch)) walk(defs[branch], p, new Set([...seen, branch]));
      for (const t of refsOf(spec)) {
        if (!defs[t] || seen.has(t) || isValueForm(t) || SHARED.has(t)) continue;
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
  const sharedRoots = [...SHARED].filter(
    (t) => !handWritten.has(kebab(t)) && isDocumentable(t) && !BRANCH_TYPES.has(t)
  );
  for (const t of sharedRoots) {
    nodes.push({ path: [t], spec: { ...defs[t], $sharedType: t }, parentDef: defs.Styles, required: new Set() });
    walk(defs[t], [t], new Set(['Styles', t]));
  }

  const slugPath = (p) => p.map(kebab).join('/');
  const urlOf = (p) => `/schema/styles/${slugPath(p)}/`;
  const childrenOf = (p) =>
    nodes.filter((n) => n.path.length === p.length + 1 && n.path.slice(0, p.length).join('.') === p.join('.'));

  /** Pages per depth — the traversal's shape in one line, which the run reports. */
  const depths = () => {
    const out = {};
    for (const n of nodes) out[n.path.length] = (out[n.path.length] ?? 0) + 1;
    return out;
  };

  return {
    nodes,
    SHARED,
    BRANCH_TYPES,
    pathsReaching,
    // Passed back out as well as in: the page sections ask the same question
    // the tree does — whether a type already has a page at the schema root.
    handWritten,
    isWrapper,
    isValueForm,
    isDocumentable,
    refsOf,
    admitsValue,
    namedTypes,
    formOf,
    typeLabel,
    pageOfType,
    childEntries,
    slugPath,
    urlOf,
    childrenOf,
    depths,
  };
};
