/**
 * Nothing reaches `main` citing a DRAFT decision record.
 *
 * A draft is a proposal, so a citation on `main` presents an unsettled
 * question as a settled decision — and a draft that has sat for months is how
 * that happens. In-flight work is different: implementing an ADR writes the
 * requirement and its provenance together, and the decision is accepted a step
 * later. Forbidding the citation outright made that order impossible.
 *
 * So the gate is the merge, not the citation. This checks only when `main` is
 * the branch under test or the base of the pull request.
 *
 * The reference is equally wrong as a link or a bare name, so this matches the
 * record's number and slug rather than link syntax.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, relative } from 'node:path';

const pkg = resolve(__dirname, '..');
const repo = resolve(pkg, '../..');
const adrDir = join(repo, 'adr');

/**
 * Whether this run is deciding what lands on `main`.
 *
 * `GITHUB_BASE_REF` is the pull request's base and is the real gate. The
 * branch check catches a local `main` checkout, where the merge has already
 * happened and the report is at least accurate.
 */
const targetsMain = (): boolean => {
  const base = process.env.GITHUB_BASE_REF;
  if (base) return base === 'main';
  try {
    const head = execFileSync('git', ['-C', repo, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    return head === 'main';
  } catch {
    return false;
  }
};

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

  it('are never cited by anything reaching main', () => {
    if (!draftList.length) return;
    if (!targetsMain()) return;
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
