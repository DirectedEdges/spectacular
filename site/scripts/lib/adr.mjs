/**
 * Which decision records decide a given schema path.
 *
 * This answers one question, and it is a contract rather than a heuristic: an
 * ADR decides a path if it is ACCEPTED and either declares the path on its
 * `**Decides**` line, or — lacking that line — names the path's last segment
 * as code in its title, Summary, or Decision section.
 *
 * It lived in three copies, one per paged schema tree, and they had already
 * drifted: one escaped `$` in the key and the others did not; one dropped the
 * `declared` flag. The rule took two rounds of corrections to get right (the
 * reasoning is preserved below, because it is the only record of why the
 * obvious implementations were wrong), and a fourth copy would have inherited
 * whichever version it was pasted from.
 *
 * `loadAdrs` parses the corpus once per directory and caches it. The previous
 * shape re-read every record on every query — 111 files × 99 style pages, on
 * every schema keystroke, because the content watcher reruns the generators.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** `**Status**: ACCEPTED — because` → `ACCEPTED` */
export const adrStatus = (src) =>
  src.match(/^\*\*Status\*\*:\s*(\S+)/m)?.[1]?.replace(/[^A-Za-z]/g, '').toUpperCase() ?? null;

/**
 * A DRAFT decision record is not cited anywhere — not as a link, and not as a
 * bare name. A draft is a proposal, so citing one presents an unsettled
 * question as a decision that settles something. The drafts in `adr/` include
 * two whose subject the schema does not yet handle at all.
 *
 * Status is read from the record itself rather than inferred from whether the
 * site published it, so the rule holds even if the site's filter changes.
 */
export const isAccepted = (src) => adrStatus(src) === 'ACCEPTED';

/** `# ADR: Foo Bar` or `# ADR 058: Foo Bar` → `Foo Bar` */
export const adrTitle = (src) => src.match(/^#\s+(?:ADR[\s-]*\d*\s*:\s*)?(.+)$/m)?.[1]?.trim() ?? null;

/**
 * The paths an ADR claims to decide, read from its own `**Decides**` line.
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
 * Until a record carries the line, the old matcher stands in for it — see the
 * derived branch in `decidedBy`. A page losing its decision records the moment
 * this changed would be a worse answer than a page citing a near-miss.
 *
 * `null` and `[]` are different answers: no line means fall back to that
 * matcher, while an explicit "none" means the record decides nothing and must
 * not be matched against at all.
 */
export const declaredDecides = (src) => {
  const line = src.match(/^\*\*Decides\*\*:\s*(.+)$/m)?.[1]?.trim();
  if (!line) return null;
  if (/^(none|—|-|\*\(none\)\*)$/i.test(line)) return [];
  return line
    .replace(/`/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

/** Only the code spans of a passage, joined — see `decidedBy`. */
const codeSpans = (text) => (text.match(/`[^`\n]+`/g) ?? []).join(' ');

const cache = new Map();

/**
 * Parse every ACCEPTED record under `dir` once, and return a queryable index.
 *
 * Cached per directory, so repeated calls across a generator's page loop cost
 * nothing. A missing directory yields an empty index rather than throwing —
 * the generators must still produce pages when the ADR corpus is absent.
 */
export const loadAdrs = (dir) => {
  if (cache.has(dir)) return cache.get(dir);

  const records = [];
  if (existsSync(dir)) {
    for (const file of readdirSync(dir).filter((n) => /^\d{3}-.*\.md$/.test(n))) {
      const src = readFileSync(join(dir, file), 'utf8');
      if (!isAccepted(src)) continue;
      records.push({
        num: file.slice(0, 3),
        file,
        title: adrTitle(src) ?? file,
        declared: declaredDecides(src),
        /**
         * Only the three passages a derived match may consult, reduced to
         * their code spans at parse time.
         *
         * Scoped to title, Summary and Decision because a key appearing
         * anywhere in an ADR's prose is usually incidental — scanning whole
         * files listed six records for `layoutSizingHorizontal`, one of them
         * about icon detection because it quoted a YAML example. The
         * `## Decision` heading is matched on the whole line: `^## Decision\b`
         * also matched `## Decision Drivers`, which 103 records carry and
         * which precedes the real section.
         */
        spans: [
          codeSpans(adrTitle(src) ?? file),
          codeSpans(src.match(/^\*\*Summary\*\*:\s*(.+)$/m)?.[1] ?? ''),
          codeSpans(src.match(/^## Decision[ \t]*\r?\n[\s\S]*?(?=^## |(?![\s\S]))/m)?.[0] ?? ''),
        ],
      });
    }
  }

  /**
   * The records deciding `path`, whose last segment is `key`.
   *
   * A declared record is matched on the path exactly. An undeclared one is
   * matched on the key, and only where the key is written as code.
   *
   * The code-span restriction is the part that is not obvious. Several style
   * keys are ordinary English words, and prose uses them: `\btop\b` matched
   * "top-level" and "the top level", which between them appear in most
   * records. That put five ADRs about element content, code-only props, slots
   * and transform config on `top`'s page as decisions about it. Tightening the
   * boundary to exclude a hyphen fixed the first phrase and not the second,
   * because no rule over bare words can separate "the top level" from the
   * `top` offset. These records backtick identifiers by convention, so the
   * backticks are the signal.
   *
   * `$` is escaped because it is a regex metacharacter and several schema
   * members are `$`-prefixed: unescaped, `$image` reads as "end of input, then
   * image" and can never match. Those members reach their records through the
   * declared path today, so the escape changes nothing now and stops a
   * `$`-prefixed member with no `**Decides**` line from silently finding none.
   */
  const decidedBy = (key, path) => {
    const re = new RegExp(`(?<![\\w-])${key.replace(/\$/g, '\\$')}(?![\\w-])`);
    return records
      .filter((r) => (r.declared ? r.declared.includes(path) : r.spans.some((s) => re.test(s))))
      .map(({ num, file, title, declared }) => ({ num, file, title, declared: Boolean(declared) }));
  };

  /**
   * Ordered once here rather than at each query, so every caller gets records
   * in record-number order and none has to sort. The numeric filename prefix
   * makes lexical order numeric order. One caller needed an explicit sort
   * before, because it merged the results of several queries.
   */
  records.sort((a, b) => a.num.localeCompare(b.num));

  const index = { records, decidedBy };
  cache.set(dir, index);
  return index;
};

/**
 * An ADR link list, one bullet per record, in the order given.
 *
 * The em dash is this site's link-list separator rather than a sentence, so it
 * stays with the link construction instead of moving to a content module.
 */
export const decisionBullets = (adrs) =>
  adrs.map((a) => `- [ADR-${a.num}](/adr/${a.file.replace(/\.md$/, '')}/) — ${a.title}`).join('\n');
