/**
 * The one section of a style page that says what may be written at that path.
 *
 * It is one section rather than two on purpose: the page used to carry both a
 * `Type` line and a sibling `Contains`, which state the same fact — what goes
 * here — once without the meanings and once with them.
 *
 * There are three shapes, and which one applies is a fact about the schema
 * node rather than a choice:
 *
 *   - a union of value forms, each form a `####` with its gloss, members and
 *     examples beneath it;
 *   - a union of `const` options, which stays a bulleted list because a quoted
 *     literal is not a heading;
 *   - a value that is not a union at all — an array of a named type, an object
 *     whose members are the page's own, or a single `$ref` elsewhere.
 *
 * `unionValueSection` is tried first and `plainValueSection` answers only when
 * it declines, which is what `valueSection` composes.
 */

import { defName, deref } from '../../lib/schema.mjs';
import { toYaml, yamlScalar } from '../../lib/yaml.mjs';
import { kebab } from '../../lib/naming.mjs';
import { ARRAY_OF } from '../../content/style-pages.mjs';

/**
 * The branch of a union that declares a given value, so a default can be
 * described in the schema's own words.
 *
 * Recognises a `const` or `null` arm only, because its other job is to find
 * the gloss a declaring branch carries and a plain `number` arm has none. The
 * generator used to hardcode "`null` (nothing)" for every null default, which
 * was one gloss on 19 properties that mean 19 different things by it.
 */
export const branchFor = (defs, node, value, depth = 0) => {
  if (!node || depth > 5) return null;
  if (node.$ref) {
    const t = defName(node.$ref);
    return defs[t] ? branchFor(defs, defs[t], value, depth + 1) : null;
  }
  const branches = node.oneOf ?? node.anyOf;
  if (!Array.isArray(branches)) return null;
  for (const b of branches) {
    if (b.const !== undefined && b.const === value) return b;
    if (value === null && b.type === 'null') return b;
    const nested = branchFor(defs, b, value, depth + 1);
    if (nested) return nested;
  }
  return null;
};

/**
 * A type's own members, indented one level.
 *
 * Listing them in a sibling `Contains` section stated them as the page's
 * members, which they are not: `effects` holds a token reference, an `Effects`
 * object or `null`, and `shadows` belongs to the middle one only. The indent
 * is the attribution.
 *
 * Where a member's page lives depends on whether its owning type is reached by
 * more than one key — a shared type's members sit under the type's own
 * canonical page, everything else under the path that reaches it. That is the
 * same split the traversal made when it emitted them.
 */
export const membersOf = (t, indent, { defs, tree, path }) => {
  const { SHARED, BRANCH_TYPES, handWritten, nodes, urlOf, refsOf, pageOfType } = tree;
  const owned = Object.entries(defs[t]?.properties ?? {});
  if (!owned.length) return '';
  const base = SHARED.has(t) && !handWritten.has(kebab(t)) && !BRANCH_TYPES.has(t) ? [t] : path;
  return owned
    .map(([m, sub]) => {
      const p = [...base, m];
      const own = nodes.some((n) => n.path.join('.') === p.join('.')) ? urlOf(p) : null;
      /**
       * A member of an inline-documented branch has no page of its own, so the
       * only route onward is its type's. Linking the member name to that page
       * is what lets `stops` reach `GradientStop` in one hop instead of through
       * a branch page that exists only to hold the link.
       */
      const viaType = own ? null : [...refsOf(sub)].map(pageOfType).find(Boolean) ?? null;
      const url = own ?? viaType;
      const name = url ? `[\`${m}\`](${url})` : `\`${m}\``;
      /**
       * The gloss only where the member has no page to carry it — a linked
       * member page states its own value and description, and repeating them in
       * the list made the parent page a second copy of its children.
       *
       * A discriminant's value says more than its description does: every
       * gradient type's `type` is described as "Discriminant", and which
       * constant to write is the fact a reader came for.
       */
      const gloss = own
        ? ''
        : sub.const !== undefined
          ? `\`${JSON.stringify(sub.const)}\``
          : sub.description ?? '';
      return `${indent}- ${name}${gloss ? ` — ${gloss}` : ''}`;
    })
    .join('\n');
};

/**
 * The union case: one `####` per form, or a bulleted list for an option set.
 *
 * Returns null when the node is not a union, which is the signal for
 * `plainValueSection` to answer instead.
 */
const unionValueSection = (page, ctx) => {
  const { spec, hasDefault, schemaExamples, settingsNote, kids, path } = page;
  const { defs, tree } = ctx;
  const {
    SHARED, BRANCH_TYPES, handWritten, isValueForm, isDocumentable,
    admitsValue, namedTypes, typeLabel, urlOf,
  } = tree;

  /**
   * The union is usually on the definition the property references, not on the
   * property — `position` is a `$ref` to `PositionStyleValue`, and the branches
   * live there. Descending through the value-union wrappers is the same
   * traversal `namedTypes` does.
   */
  const union = (node, depth = 0) => {
    if (!node || depth > 5) return null;
    if (Array.isArray(node.oneOf) || Array.isArray(node.anyOf)) return node;
    if (node.$ref) {
      const t = defName(node.$ref);
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
   * Tested with `some` rather than `every`, because every enum union here also
   * admits `null`.
   */
  const hasConst = branches.some((br) => br.const !== undefined);

  /**
   * Branches read most to least sophisticated, not in schema order.
   *
   * The schema's order is whatever each definition happened to be written in,
   * so `backgroundColor` led with a bare `string` and `effects` led with a
   * token reference while `cornerRadius` led with a number. A reader scanning
   * for the richest form they could use was scanning an arbitrary list.
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
    const t = defName(br.$ref);
    if (t && isValueForm(t)) return t === 'TokenReference' ? 1 : 1.5;
    if (t && defs[t]?.properties) return 3;
    if (t && (defs[t]?.oneOf || defs[t]?.anyOf)) return 2;
    if (br.type === 'null') return 5;
    return 4;
  };
  const ordered = [...branches].sort((a, b) => tierOf(a) - tierOf(b));

  /**
   * Members are listed beneath their branch in two cases: where exactly one
   * branch has any, and where the branches are inline-documented, which is the
   * only place their members are stated at all.
   *
   * Not wherever several branches happen to be objects: a union mixing a
   * shared type with a local one would print the shared type's member list a
   * second time, under a page that is not its canonical one.
   */
  const expandable = ordered.filter((br) => {
    const t = defName(br.$ref);
    return t && !isValueForm(t) && Object.keys(defs[t]?.properties ?? {}).length;
  });
  const expandAll =
    expandable.length > 1 && expandable.every((br) => BRANCH_TYPES.has(defName(br.$ref)));
  const expandOnly = !expandAll && expandable.length === 1 ? expandable[0] : null;

  /**
   * Each example assigned to the one form it illustrates, first match wins.
   *
   * The page had a `Type` list and an `Examples` section enumerating the same
   * forms in two different shapes — a table for the scalars, fenced blocks for
   * the composites. One section keyed by form removes both the repetition and
   * the mixed formatting, and a form's examples sit under it.
   *
   * `claimed` is read by `tailOf` after every branch has had its turn, so the
   * order of the two calls below matters and is why they stay in one function.
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
   * `branchFor` only recognises a `const` or `null` arm, because its other job
   * is to find the gloss a declaring branch carries. A default like `opacity`'s
   * `1` belongs to the plain `number` arm, which has no gloss and which that
   * function never returns — so without the fallback the marker never rendered
   * and, with the `Default` section gone, the value was lost from the page
   * entirely.
   */
  const defaultBranch = hasDefault
    ? (branchFor(defs, spec, spec.default) ?? ordered.find((br) => admitsValue(br, spec.default)) ?? null)
    : null;

  /**
   * `(default)` alone where the branch's name IS the value — an option, or
   * `null`. Where the branch admits many values, the marker has to carry which
   * one, or removing the `Default` section would lose it: `number (default)`
   * does not say `1`.
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
   * canonical page that lists its own members, so repeating them here is noise
   * and the expanded example says more. A singly-reached type — `Effects`,
   * `Corners`, `Typography`, `ImageValue` — has no page, and this list is the
   * only route to its member pages. Dropping it there would orphan them, as
   * suppressing `Contains` once did.
   */
  const hasOwnPage = (t) => Boolean(t && (handWritten.has(kebab(t)) || (SHARED.has(t) && isDocumentable(t))));

  const asScalar = (ex) => (typeof ex === 'string' ? JSON.stringify(ex) : yamlScalar(ex));

  /**
   * Any example no branch claimed, plus the note saying which form a run emits.
   *
   * Both close the section rather than trailing the page: the note had been
   * landing after `Default`, where it read as a statement about the default, and
   * an unclaimed example would vanish with nothing saying so — which is itself
   * the signal, since an example matching none of its own property's branches
   * is a bad example or a gap in the union.
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
    return { kind: 'union', heading: 'Value', body: [rows.join('\n'), tailOf()].filter(Boolean).join('\n\n') };
  }

  const sections = ordered.map((br) => {
    const named = defName(br.$ref);
    const child = kids.find((c) => c.path[c.path.length - 1] === named);
    const linked = child ? `[\`${named}\`](${urlOf(child.path)})` : named ? typeLabel(named) : null;
    // `namedTypes` returns its entries already backticked, so this must not
    // wrap them again.
    const label = linked ?? (namedTypes(br).join(', ') || '—');

    /**
     * One clause saying when a reader would write this form — not the type's
     * full description, which is written for the type's own page.
     * `TokenReference`'s runs 200 characters about `$extensions` and appears on
     * 40 pages; under a heading that is noise.
     */
    const gloss =
      br.description ?? (named ? (defs[named]?.title ?? defs[named]?.description) : null) ?? br.title ?? '';

    const members =
      (expandAll && BRANCH_TYPES.has(named)) || (br === expandOnly && !hasOwnPage(named))
        ? membersOf(named, '', { defs, tree, path })
        : '';

    const mine = examplesFor(br);
    const shown = mine.length
      ? mine.every((ex) => ex === null || typeof ex !== 'object')
        ? mine.map((ex) => `- \`${asScalar(ex)}\``).join('\n')
        : mine.map((ex) => `\`\`\`yaml\n${toYaml(ex)}\n\`\`\``).join('\n\n')
      : '';

    // `####`, a level below the `###` sections, so a value reads as
    // subordinate to `Values` rather than competing with it.
    return [`#### ${label}${defaultMark(br)}`, gloss, members, shown].filter(Boolean).join('\n\n');
  });

  return { kind: 'union', heading: 'Value', body: [sections.join('\n\n'), tailOf()].filter(Boolean).join('\n\n') };
};

/**
 * The same one-section shape for the values that are not unions.
 *
 * `shadows` is an array of `Shadow` and `Blur` is a plain object, so both fell
 * through to a `Type` line reading `array, Shadow` or `object` plus a sibling
 * `Contains`. That is the pair this page shape replaced for unions, left
 * standing on four pages because the rule was written about `oneOf` rather than
 * about having members.
 */
const plainValueSection = (page, ctx) => {
  const { spec, schemaExamples, kids, key, path } = page;
  const { defs, tree } = ctx;
  const { isWrapper, typeLabel, urlOf } = tree;

  const node = deref(defs, spec);
  if (!node) return null;

  // An array of a named type: the item type carries the members.
  const itemType = node.type === 'array' ? defName(node.items?.$ref) : null;
  if (itemType && Object.keys(defs[itemType]?.properties ?? {}).length) {
    const why = defs[itemType].title ?? node.description ?? defs[itemType].description ?? '';
    return {
      kind: 'plain',
      heading: 'Value',
      body: `${ARRAY_OF}\n\n#### ${typeLabel(itemType)}\n\n${[why, membersOf(itemType, '', { defs, tree, path })].filter(Boolean).join('\n\n')}`,
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
      kind: 'plain',
      heading: 'Contains',
      body: kids.map((c) => `- [\`${c.path[c.path.length - 1]}\`](${urlOf(c.path)})`).join('\n'),
    };
  }

  /**
   * A single named type whose page is elsewhere — `effects.backgroundBlur` is a
   * bare `$ref` to `Blur`, which is shared and so does not nest, leaving
   * nothing to list and the page on the bare fallback reading `Type: Blur`.
   *
   * Rendered in the same shape a union branch gets, so one value and five read
   * alike.
   */
  const only = defName(spec.$ref);
  if (only && defs[only] && !isWrapper(only)) {
    const gloss = spec.description ?? defs[only].title ?? defs[only].description ?? '';
    const shown = (schemaExamples ?? [])
      .map((ex) => (ex !== null && typeof ex === 'object' ? `\`\`\`yaml\n${toYaml(ex)}\n\`\`\`` : `- \`${yamlScalar(ex)}\``))
      .join('\n\n');
    return {
      kind: 'plain',
      heading: 'Value',
      body: [`#### ${typeLabel(only)}`, gloss, shown].filter(Boolean).join('\n\n'),
      consumedExamples: true,
    };
  }
  return null;
};

/** The union shape where there is one, the plain shape otherwise. */
export const valueSection = (page, ctx) => unionValueSection(page, ctx) ?? plainValueSection(page, ctx);
