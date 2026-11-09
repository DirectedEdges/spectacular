/**
 * One style page: which sections it has, and in what order.
 *
 * This is the only place that knows the page's shape. Each section is computed
 * by `style-sections/` and is either markdown or null, and the template below
 * decides whether a null section means an omitted heading or a fallback.
 *
 * Three rules about the shape are worth stating here, because each replaced a
 * pair of sections that said the same thing twice:
 *
 *   - **One value section, not a type line plus a `Contains`.** Both answer
 *     "what may be written here", once without the meanings and once with
 *     them.
 *   - **No `Default` section anywhere.** The declared default is marked on the
 *     value that carries it — `(default)` on an option or `null` arm,
 *     `(default: 1)` where the form admits more than one value, and on the
 *     type itself where the value is a single plain type. The fact sits with
 *     the value instead of being restated under a heading of its own.
 *   - **`Examples` only where no form list carries them.** A union keys each
 *     example to the form it illustrates, so a separate section would show the
 *     same values a second time.
 */

import { frontmatter } from '../lib/markdown.mjs';
import { kebab } from '../lib/naming.mjs';
import {
  BANNER, JOINTLY_INTRO, RULES, SOURCE_SECTION, fallbackDescription,
} from '../content/style-pages.mjs';
import { exampleParts } from './style-sections/examples.mjs';
import { valueSection as buildValueSection } from './style-sections/value.mjs';
import {
  bindingSections, carriedContent, elementsSupported, resolvedJointlyWith,
  decisionRecords, usedBy, pathSection,
} from './style-sections/context.mjs';

export const renderStylePage = (node, ctx) => {
  const { defs, tree, preserved, rehome } = ctx;
  const { namedTypes, formOf, childrenOf, urlOf } = tree;

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

  const {
    schemaExamples, compositeExamples,
    examples, exampleBlocks, exampleHead, settingsNote,
  } = exampleParts({ spec, kept, namedTypes, formOf, rehome });

  /**
   * A union's branches, each with the description that distinguishes it.
   * `Contains` cannot carry this: a `oneOf` has branches, not members, and
   * `GradientValue` is exactly one of them at a time.
   */
  const kids = childrenOf(p);

  const valueSection = buildValueSection(
    { spec, hasDefault, schemaExamples, settingsNote, kids, key, path: p },
    { defs, tree }
  );

  const unit = { spec, key, path: p, isStyleKey, kids, schemaExamples };

  const bindingRows = bindingSections(unit, ctx);
  const { sections: carriedSections, furtherReading } = carriedContent(unit, ctx);
  const supportedOn = elementsSupported(unit, ctx);
  const siblingList = resolvedJointlyWith(unit, ctx);
  const decisions = decisionRecords(unit, ctx);
  const reachedBy = usedBy(unit, ctx);
  const pathLine = pathSection(unit, ctx);

  return `${frontmatter({
    title: key,
    description: spec.description ?? kept.intro ?? fallbackDescription(key),
  })}

${BANNER}

${spec.description ?? rehome(kept.intro) ?? ""}

${pathLine}${supportedOn ? `\n## Elements Supported\n\n${supportedOn}\n` : ''}
${
  valueSection
    ? `## ${valueSection.heading}\n\n${valueSection.body}\n${required.has(key) ? '\nRequired.\n' : ''}`
    : // `Values` here too — a leaf whose value is a bare `boolean` answers the
      // same question as a five-form union, and two names for it put `Type` on
      // 14 pages and `Values` on the other 85.
      `## Value\n\n${types}${hasDefault ? ` (default: \`${JSON.stringify(spec.default)}\`)` : ''}${
        required.has(key) ? ' · required' : ''
      }\n`
}${
    // Only where there is no form list to carry them — a plain object or array
    // page like `Blur` or `effects.shadows`, which has no form to key by.
    valueSection?.kind !== 'union' && !valueSection?.consumedExamples && (examples.length || exampleBlocks)
      ? `\n## Example${examples.length + compositeExamples.length !== 1 ? 's' : ''}\n\n${examples.length ? `${exampleHead}\n${examples.join('\n')}\n` : ''}${
          exampleBlocks ? `${examples.length ? '\n' : ''}${exampleBlocks}\n` : ''
        }${settingsNote}`
      : ''
  }${
    // Members are listed by `valueSection` — beneath the branch or type that
    // owns them, rather than in a sibling section that attributed them to the
    // page. This is the fallback for a page whose children belong to neither.
    kids.length && !valueSection
      ? `\n## Contains\n\n${kids.map((c) => `- [\`${c.path[c.path.length - 1]}\`](${urlOf(c.path)})`).join('\n')}\n`
      : ''
  }${reachedBy ? `\n## Used by\n\n${reachedBy}\n` : ''}${bindingRows ? `\n## Platform bindings\n\n${bindingRows}\n` : ''}${
    siblingList
      ? `\n## Resolved jointly with\n\n${JOINTLY_INTRO}\n\n${siblingList}\n`
      : ''
  }${kept.figmaKeyNote ? `\n## Figma key\n\n${rehome(kept.figmaKeyNote)}\n` : ''}${carriedSections.join('')}${
    decisions ? `\n## Decisions\n\n${decisions}` : ''
  }${furtherReading}${
    isStyleKey
      ? `\n## Rules\n\n| Rule | Statement |\n|---|---|\n${RULES.dspec44}\n${RULES.dspec45}\n${
          siblingList
            ? `${RULES.dspec47}\n`
            : ''
        }`
      : ''
  }
${SOURCE_SECTION}
`;
};

/** Where a node's page is written, relative to the styles root. */
export const pageFileName = (p) => [...p.slice(0, -1).map(kebab), `${kebab(p[p.length - 1])}.md`];
