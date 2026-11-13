/**
 * The sections of a style page that place a value in its surroundings rather
 * than describe it: where it sits, which platforms realise it, which elements
 * carry it, what it is resolved alongside, which records decided it, and —
 * for a shared type — which keys reach it.
 *
 * Each one is a function of the node plus the inputs the generator loaded, and
 * each returns markdown or null. None of them knows the page's section order;
 * that is the page template's business.
 */

import { deref } from '../../lib/schema.mjs';
import { kebab, PLATFORM_TITLE } from '../../lib/naming.mjs';
import { decisionBullets } from '../../lib/adr.mjs';
import { DECISIONS_NONE, NO_ELEMENT_TYPE, PATH_ROOT, THEMES_NOTE, TYPE_PAGE_HOME } from '../../content/style-pages.mjs';

/**
 * Whether this node's value can be a token, and so whether the mode in force
 * on the element decides what it resolves to.
 *
 * Asked of the schema, not of a list: `refsOf` already reports the named
 * definitions a node reaches through its wrappers and unions, so a key that
 * gains or loses the form gains or loses the section with it.
 */
export const themeContext = ({ spec }, { tree }) =>
  tree.refsOf(spec).has('TokenReference') ? THEMES_NOTE : null;

/**
 * One `###` subsection per platform rather than a table: the binding's `notes`
 * live here, and a note is a fact about one key on one platform, which is one
 * paragraph here instead of a wall of 46 in a cell.
 *
 * Style keys only. A shared type's canonical page has no disposition of its
 * own — the keys that reach it do.
 */
export const bindingSections = ({ key, isStyleKey }, { bindings }) => {
  if (!isStyleKey) return null;
  return Object.entries(bindings)
    .map(([platform, b]) => {
      const v = b.concepts.styles[key] ?? { disposition: 'unverified' };
      const realises = v.rule
        ? `rule [\`${v.rule}\`](/schema/mappings/${platform}/rules/${kebab(v.rule)}/)`
        : (v.target ? `\`${v.target}\`` : (v.module?.length ? v.module.map((m) => `\`${m}\``).join(', ') : '—'));
      const fields = `**Disposition**: ${v.disposition === 'unverified' ? '**unverified**' : v.disposition} · **Realised by**: ${realises}`;
      return `### [${PLATFORM_TITLE[platform]}](/schema/mappings/${platform}/)\n\n${fields}${v.notes ? `\n\n${v.notes}` : ''}`;
    })
    .join('\n\n');
};

/**
 * Content carried over from the hand-written type page this page replaces.
 *
 * `Properties` is dropped because the value section already lists members from
 * the schema; `Values` and the examples are rendered only when the schema
 * produced none, so a page never shows the same thing twice.
 *
 * Gated on whether the schema carries examples at all, not on whether the
 * scalar table has rows: a page whose examples are all composites has no
 * scalar rows, so the gate opened on `effects`, `typography` and
 * `gradient-value` and rendered the replaced page's 2024 `Values` table
 * beneath the generated one, two sections a heading apart.
 */
export const carriedContent = ({ path, schemaExamples }, { preserved, rehome }) => {
  const homedSlug = Object.entries(TYPE_PAGE_HOME).find(([, p]) => p.join('.') === path.join('.'))?.[0];
  const carried = homedSlug ? (preserved.typePages?.[homedSlug]?.sections ?? {}) : {};

  const sections = [];
  if (!schemaExamples?.length) {
    for (const name of ['Values', 'Examples', 'Example']) {
      if (carried[name]) sections.push(`\n## ${name}\n\n${rehome(carried[name])}\n`);
    }
  }
  const furtherReading = carried['Further Reading']
    ? `\n## Further reading\n\n${rehome(carried['Further Reading'])}\n`
    : '';

  return { sections, furtherReading };
};

/**
 * Which element types carry this key, as links.
 *
 * Capture versus render is an implementation detail of two particular
 * transforms, not a fact about the contract, so the two tables are unioned
 * rather than compared: a reader wants to know whether a glyph can carry this
 * key, not which of two codebases agrees.
 */
export const elementsSupported = ({ key, isStyleKey }, { elementTables }) => {
  if (!isStyleKey || !Object.keys(elementTables).length) return null;
  const union = new Set();
  for (const table of Object.values(elementTables)) {
    for (const [type, keys] of Object.entries(table)) if (keys.includes(key)) union.add(type);
  }
  if (!union.size) return NO_ELEMENT_TYPE;
  // The tables speak the transforms' vocabulary: `frame` is the contract's
  // `container`, and `component` is the root — a real carrier but not an
  // anatomy type, so it renders unlinked.
  const schemaType = (t) => (t === 'frame' ? 'container' : t);
  return [...new Set([...union].map(schemaType))]
    .sort()
    .map((t) => (t === 'component' ? `\`${t}\`` : `[\`${t}\`](/schema/anatomy/${t}/)`))
    .join(' · ');
};

/**
 * Keys this one resolves alongside, grouped by rule.
 *
 * Every rule-governed key belongs to a *different* rule on each platform —
 * `width` is in CSS's `intrinsicSize` and Figma's `autoVsAbsoluteLayout` — so
 * one flat list annotated with platform names merged two unrelated groupings
 * into a set that matched neither. A key appearing under two rules is correct
 * and is repeated.
 */
export const resolvedJointlyWith = ({ key, isStyleKey }, { bindings }) => {
  if (!isStyleKey) return null;
  const groups = [];
  for (const [platform, b] of Object.entries(bindings)) {
    const name = b.concepts.styles[key]?.rule;
    if (!name) continue;
    const others = (b.concepts.styleRules[name].keys ?? []).filter((k) => k !== key);
    if (!others.length) continue;
    groups.push(
      `**[${name}](/schema/mappings/${platform}/rules/${kebab(name)}/)** — ${PLATFORM_TITLE[platform]}\n\n${others
        .sort()
        .map((k) => `- [\`${k}\`](/schema/styles/${kebab(k)}/)`)
        .join('\n')}`
    );
  }
  return groups.length ? groups.join('\n\n') : null;
};

/**
 * The records that decided this path.
 *
 * Shown at every depth, not only on the 46 top-level keys:
 * `effects.backgroundBlur` is decided by the effects record, which names it,
 * and the page said nothing because the section did not run below depth 1. A
 * nested member is as much a decided thing as the key that contains it.
 *
 * Status is omitted — a superseded record would not still be cited, so the
 * column read ACCEPTED on every row and carried no information. `Mentions` is
 * gone too: it listed records matching a key's name without deciding it, which
 * is a statement about a text search rather than about the key.
 */
export const decisionRecords = ({ spec, key, path }, { adrs }) => {
  if (spec.$sharedType) return null;
  // Rooted, because `anatomy` and `props` declare paths in the same field and a
  // bare leaf would not say which tree it belongs to.
  const deciding = adrs.decidedBy(key, `styles.${path.join('.')}`);
  // Said rather than left blank: several keys have no record, and a missing
  // section reads as a render that failed instead of a fact about the key.
  if (!deciding.length) return DECISIONS_NONE;
  return `${decisionBullets(deciding)}\n`;
};

/**
 * The style keys that reach this type. Only shown on a shared type's own page,
 * where it is the inverse of the decision to give it one page rather than a
 * copy under each path.
 */
export const usedBy = ({ spec }, { tree }) => {
  const { nodes, pathsReaching } = tree;
  const t = spec.$sharedType;
  if (!t) return null;
  /**
   * A path is truncated at its deepest segment that has a page, then the
   * duplicates that creates collapse.
   *
   * `pathsReaching` records containment, which is finer than the page tree:
   * `GradientStop` is reached by `backgroundColor.LinearGradient.stops` and two
   * sibling branches, none of which is a page since the branches are documented
   * inline. Rendered whole, the list was twelve links to nine URLs that do not
   * exist and four that do.
   */
  const pages = new Set(nodes.map((n) => n.path.join('.')));
  const paths = [
    ...new Set(
      [...(pathsReaching[t] ?? [])].map((path) => {
        const segs = path.split('.');
        while (segs.length && !pages.has(segs.join('.'))) segs.pop();
        return segs.join('.');
      })
    ),
  ]
    .filter(Boolean)
    .sort();
  if (!paths.length) return null;
  return paths
    .map((path) => `- [\`styles.${path}\`](/schema/styles/${path.split('.').map(kebab).join('/')}/)`)
    .join('\n');
};

/**
 * The access path to this value, as the expression you would write.
 *
 * Every ancestor segment links to its own page, so a reader five levels deep
 * can walk back up without the sidebar. The segments are separate code spans
 * because a link cannot cover part of one. An array segment carries `[]`,
 * which the previous prose trail left out — `styles.effects.shadows.blur`
 * reads as an object walk, and `shadows` is a list.
 *
 * Shown at every depth. This replaced a prose breadcrumb that only existed to
 * name the ancestors, so it was skipped on the 46 top-level keys, which have
 * none. Rooted at `elements` the path says something there too:
 * `elements.<element>.styles.aspectRatio` is where the value is written.
 *
 * A shared type's canonical page is the exception — `ColorObject` sits at depth
 * 1 beside the style keys, but `styles.ColorObject` is not a path.
 */
export const pathSection = ({ spec, path }, { defs, tree }) => {
  const { nodes, urlOf } = tree;
  if (spec.$sharedType) return '';

  const isArray = (prefix) => {
    const node = nodes.find((n) => n.path.join('.') === prefix.join('.'));
    if (!node) return false;
    return deref(defs, node.spec)?.type === 'array';
  };

  const segments = path.map((seg, i) => {
    const prefix = path.slice(0, i + 1);
    const suffix = isArray(prefix) ? '[]' : '';
    const last = i === path.length - 1;
    return `${last ? `\`${seg}\`` : `[\`${seg}\`](${urlOf(prefix)})`}${suffix}`;
  });

  /**
   * Rooted at `elements`, not at `styles`. `styles` is not a top-level key — a
   * style is reached through a named element, so a path starting at `styles` is
   * not an expression anyone can write.
   *
   * `elements` is where styles live: it is a member of a `Variant`, so the same
   * path sits under `default` and under each `variants[]` entry. Those two
   * roots are left off rather than picked between — the leading ellipsis in
   * `PATH_ROOT` stands for them, unbracketed and with no separator of its own
   * so it reads as an elision rather than as a segment named "...". `anatomy`
   * is a different thing — the declared set of available anatomy items — and is
   * not where a style is written.
   *
   * The element segment stays a placeholder because its name is the author's.
   */
  return `## Path\n\n${PATH_ROOT}.${segments.join('.')}\n`;
};
