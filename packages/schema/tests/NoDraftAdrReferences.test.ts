/**
 * Nothing published cites a DRAFT decision record.
 *
 * A draft is a proposal. Citing one presents an unsettled question as a
 * decision that settles something, and two of the current drafts cover
 * subjects the schema does not handle at all. The reference is wrong whether
 * it is a link or a bare name, so this checks for the record's number and slug
 * rather than for link syntax.
 *
 * `build-adrs.mjs` already refuses to publish a non-ACCEPTED record, so the
 * gap this closes is the other direction: a page that names one anyway.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const pkg = resolve(__dirname, '..');
const repo = resolve(pkg, '../..');
const adrDir = join(repo, 'adr');

const status = (src: string) =>
  (src.match(/^\*\*Status\*\*:\s*(\S+)/m)?.[1]?.replace(/[^A-Za-z]/g, '').toUpperCase() ?? '');

/** Records that are not ACCEPTED, as `{ num, slug }`. */
const drafts = (): { num: string; slug: string }[] => {
  if (!existsSync(adrDir)) return [];
  return readdirSync(adrDir)
    .filter((f) => /^\d{3}-.+\.md$/.test(f))
    .filter((f) => status(readFileSync(join(adrDir, f), 'utf8')) !== 'ACCEPTED')
    .map((f) => ({ num: f.slice(0, 3), slug: f.replace(/\.md$/, '') }));
};

/**
 * Everything published from this package, plus the generated site pages it
 * writes. The hand-written docs outside the schema's own output are not this
 * test's business.
 */
const publishedFiles = (): string[] => {
  const roots = [
    join(pkg, 'SPECIFICATION.md'),
    join(pkg, 'mappings'),
    join(repo, 'site/src/content/docs/schema'),
  ];
  const out: string[] = [];
  const walk = (p: string) => {
    if (!existsSync(p)) return;
    if (statSync(p).isDirectory()) {
      for (const e of readdirSync(p)) walk(join(p, e));
    } else if (/\.(md|mdx|json)$/.test(p)) {
      out.push(p);
    }
  };
  roots.forEach(walk);
  return out;
};

describe('draft decision records', () => {
  const draftList = drafts();
  const files = publishedFiles();

  it('finds the records to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('are never cited by anything published', () => {
    if (!draftList.length) return;
    // `ADR-020`, `ADR 020` and the slug all count as a citation.
    const patterns = draftList.flatMap(({ num, slug }) => [
      { label: `ADR-${num}`, re: new RegExp(`ADR[\\s-]${num}\\b`) },
      { label: slug, re: new RegExp(slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) },
    ]);

    const hits: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const { label, re } of patterns) {
        if (re.test(src)) hits.push(`${relative(repo, f)} cites ${label}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
