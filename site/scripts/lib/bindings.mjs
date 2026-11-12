/**
 * Reading the platform binding files, and rendering the per-platform section
 * that the prop and anatomy pages both carry.
 *
 * Those two sections were written twice, identically except for which concept
 * key they read and which tree their sibling links point into. The same
 * generalisation already exists one level up in `build-mappings.mjs`, whose
 * `renderUnitSurface` renders props, references and element types from one
 * function with three configs — found once there and not reused here.
 *
 * No sentences in this file. The field labels are passed in by the caller,
 * which reads them from `content/`, so prose stays on one side of the line and
 * structure on the other.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bindingsDir } from './paths.mjs';
import { kebab, PLATFORMS, PLATFORM_TITLE } from './naming.mjs';

/**
 * The binding files that exist, keyed by platform.
 *
 * A platform with no file is omitted rather than defaulted: a missing binding
 * file means nobody has stated how that platform realises anything, which is
 * not the same as stating that it realises nothing.
 */
export const loadBindings = (platforms = PLATFORMS) =>
  Object.fromEntries(
    platforms
      .filter((p) => existsSync(join(bindingsDir, `${p}.json`)))
      .map((p) => [p, JSON.parse(readFileSync(join(bindingsDir, `${p}.json`), 'utf8'))])
  );

/**
 * What realises a bound concept, in the first form the binding states it.
 *
 * `target` is a single named thing, `module` a list of them, `realises` a
 * free-text fallback. An empty `module` is explicit emptiness and renders as
 * the absent marker, which is why the list check is on `length` rather than on
 * the field being present.
 */
export const realisedBy = (v, absent) =>
  v.target
    ? `\`${v.target}\``
    : v.module
      ? (v.module.length ? v.module.map((m) => `\`${m}\``).join(', ') : absent)
      : (v.realises ?? absent);

/**
 * A disposition, with `unverified` emphasised.
 *
 * Nobody has checked an unverified binding, so it is the one value that is a
 * question rather than an answer, and it reads as one.
 */
export const disposition = (d) => (d === 'unverified' ? '**unverified**' : d);

/**
 * One `###` subsection per platform, carrying the whole per-platform story:
 * the binding's fields, every rule the unit participates in on that platform
 * with the units it resolves alongside, and the binding's notes.
 *
 * `conceptKey` and `rulesKey` name where this tree's units live in a binding
 * file (`props`/`propRules`, `anatomy`/`anatomyRules`); `siblingBase` is the
 * URL prefix for the other units a rule names.
 */
export const platformBindingSections = ({
  bindings,
  unit,
  conceptKey,
  rulesKey,
  siblingBase,
  labels,
}) =>
  Object.entries(bindings)
    .map(([platform, b]) => {
      const v = b.concepts?.[conceptKey]?.[unit] ?? { disposition: 'unverified' };
      const fields = `${labels.disposition}${disposition(v.disposition)}${labels.realisedBy}${realisedBy(v, labels.absent)}`;

      const ruleEntries = Object.entries(b.concepts?.[rulesKey] ?? {})
        .filter(([, c]) => (c.keys ?? []).includes(unit))
        .map(([name, c]) => {
          const others = c.keys.filter((k) => k !== unit);
          return `[${name}](/schema/mappings/${platform}/rules/${kebab(name)}/)${
            others.length
              ? `${labels.withSiblings}${others.map((k) => `[\`${k}\`](${siblingBase}${k}/)`).join(', ')}`
              : ''
          }`;
        });
      const ruleLine = ruleEntries.length ? `\n\n${labels.rules}${ruleEntries.join(' · ')}` : '';

      return `### [${PLATFORM_TITLE[platform]}](/schema/mappings/${platform}/)\n\n${fields}${ruleLine}${
        v.notes ? `\n\n${v.notes}` : ''
      }`;
    })
    .join('\n\n');
