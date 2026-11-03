/**
 * One-off: adds a `**Decides**` line to every ADR's frontmatter.
 *
 * `build-schema-pages.mjs` reads that line to decide which decision records a
 * style page cites. Until a record carries one it falls back to matching the
 * key's name against the record's prose, which is wrong in both directions —
 * several style keys are ordinary English words, and a nested member like
 * `effects.backgroundBlur` is invisible to a search for top-level keys.
 *
 * What this writes is a DRAFT for human review, not an answer. It derives the
 * list the only way a script can — by looking for each path written as code —
 * so it carries that method's errors. The point is to put a reviewable list in
 * the diff rather than to be right.
 *
 * The rule, so a reviewer knows what they are reading:
 *
 *   - Only the title, the `**Summary**` line, and the `## Decision` section are
 *     searched. A key named anywhere else in an ADR is usually incidental.
 *   - Only text inside backticks counts. These records backtick identifiers by
 *     convention, and no rule over bare words separates "the top level" from
 *     the `top` offset.
 *   - A nested path matches on its full dotted form, or on its leaf when its
 *     parent also matched. Without the second half, ADR-002 would not declare
 *     `effects.backgroundBlur` — it writes `backgroundBlur` bare. Without the
 *     first half, every ADR using the word `components` would claim
 *     `backgroundColor.components`.
 *   - Matching a path implies matching its ancestors.
 *
 * Usage:  node scripts/backfill-adr-decides.mjs [--dry]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const adrDir = resolve(pkg, '../../adr');
const dry = process.argv.includes('--dry');

const defs = JSON.parse(readFileSync(join(pkg, 'schema/styles.schema.json'), 'utf8')).definitions;
const isWrapper = (n) => /StyleValue$|^Style$|^StyleKey$/.test(n);
const VALUE_FORMS = new Set(['TokenReference', 'PropBinding', 'Conditional', 'ReferenceValue', 'VariableStyle', 'StyleIdValue']);

/** Every style path, by the same traversal the page generator walks. */
const allPaths = (() => {
  const out = [];
  const childEntries = (node) => {
    const own = Object.entries(node.properties ?? {});
    if (own.length) return own;
    return (node.oneOf ?? node.anyOf ?? [])
      .map((b) => b.$ref?.replace('#/definitions/', ''))
      .filter((t) => t && defs[t]?.properties)
      .map((t) => [t, defs[t]]);
  };
  const refsOf = (n, depth = 0, acc = new Set()) => {
    if (!n || depth > 6) return acc;
    if (n.$ref) {
      const t = n.$ref.replace('#/definitions/', '');
      if (isWrapper(t) && defs[t]) return refsOf(defs[t], depth + 1, acc);
      acc.add(t);
      return acc;
    }
    if (n.items) refsOf(n.items, depth + 1, acc);
    for (const k of ['oneOf', 'anyOf', 'allOf']) for (const x of n[k] ?? []) refsOf(x, depth + 1, acc);
    return acc;
  };
  const walk = (node, path, seen) => {
    for (const [key, spec] of childEntries(node)) {
      const p = [...path, key];
      out.push(p.join('.'));
      for (const t of refsOf(spec)) {
        if (!defs[t] || seen.has(t) || VALUE_FORMS.has(t)) continue;
        walk(defs[t], p, new Set([...seen, t]));
      }
    }
  };
  walk(defs.Styles, [], new Set(['Styles']));
  /**
   * A segment starting with a capital is a type name, not a document key —
   * `GradientValue`'s branches are reached by path as a union, so
   * `backgroundColor.LinearGradient` is not something anyone writes.
   */
  return [...new Set(out)].filter((p) => p.split('.').every((s) => s[0] !== s[0]?.toUpperCase()));
})();

const TOP = allPaths.filter((p) => !p.includes('.'));
const NESTED = allPaths.filter((p) => p.includes('.')).sort((a, b) => a.split('.').length - b.split('.').length);

const codeSpans = (text) => (text.match(/`[^`\n]+`/g) ?? []).join(' ');
const mentions = (token, scope) => new RegExp(`(?<![\\w.-])${token.replace(/\$/g, '\\$')}(?![\\w.-])`).test(scope);

let changed = 0;
let already = 0;
const report = [];

for (const file of readdirSync(adrDir).filter((n) => /^\d{3}-.*\.md$/.test(n))) {
  const path = join(adrDir, file);
  const src = readFileSync(path, 'utf8');
  if (/^\*\*Decides\*\*:/m.test(src)) {
    already++;
    continue;
  }

  // Placed after `**Summary**`, or after `**Status**` on the few records with
  // no summary line, so it sits with the other declarations either way.
  const anchor = src.match(/^\*\*Summary\*\*:.+$/m) ?? src.match(/^\*\*Status\*\*:.+$/m);
  if (!anchor) {
    report.push(`${file}  SKIPPED — no **Summary** or **Status** line to anchor to`);
    continue;
  }

  const title = src.match(/^#\s+(.+)$/m)?.[1] ?? '';
  const decision = src.match(/^## Decision[ \t]*\r?\n[\s\S]*?(?=^## |(?![\s\S]))/m)?.[0] ?? '';
  const scope = [title, anchor[0], decision].map(codeSpans).join(' ');

  const found = new Set(TOP.filter((p) => mentions(p, scope)));
  for (const p of NESTED) {
    const parts = p.split('.');
    const parent = parts.slice(0, -1).join('.');
    if (mentions(p, scope) || (found.has(parent) && mentions(parts[parts.length - 1], scope))) {
      for (let i = 1; i <= parts.length; i++) found.add(parts.slice(0, i).join('.'));
    }
  }

  const list = [...found].sort().join(', ') || 'none';
  /**
   * Replaced with a function, not a string. ADR-023's summary contains
   * `` `$`-prefixed keys ``, and in a replacement string `$&` means the whole
   * match — so the string form spliced the record's own title into its summary
   * line.
   */
  const next = src.replace(anchor[0], () => `${anchor[0]}\n**Decides**: ${list}`);
  if (!dry) writeFileSync(path, next);
  changed++;
  report.push(`${file}  ${list}`);
}

console.log(report.join('\n'));
console.log(
  `\n${changed} record${changed === 1 ? '' : 's'} ${dry ? 'would gain' : 'gained'} a **Decides** line, ${already} already had one`
);
console.log(`${report.filter((r) => r.endsWith('none')).length} of them declare none`);
