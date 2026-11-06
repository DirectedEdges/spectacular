/**
 * The generated reference pages, checked for the sections they must carry.
 *
 * This exists because a generator rewrite silently dropped five sections —
 * `Elements Supported`, `Resolved jointly with`, `Decision records`, `Rules`, and the
 * TypeScript source row — and nothing failed. A page that loses a section still
 * builds, still renders, and still reads as complete, so the loss is only
 * visible to someone who remembers what used to be there.
 *
 * It asserts the sections exist, not what they say. What they say is the
 * generator's business and changes with the schema; that they exist at all is a
 * contract with the reader.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const pkg = resolve(__dirname, '..');
const pagesRoot = resolve(pkg, '../../site/src/content/docs/schema/styles');
const styleKeys = Object.keys(
  JSON.parse(readFileSync(join(pkg, 'schema/styles.schema.json'), 'utf8')).definitions.Styles.properties
);

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, '');

/** Every generated page, as a path relative to the tree root. */
const allPages = (): string[] => {
  if (!existsSync(pagesRoot)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith('.md')) out.push(relative(pagesRoot, p));
    }
  };
  walk(pagesRoot);
  return out;
};

const sectionsOf = (rel: string) =>
  readFileSync(join(pagesRoot, rel), 'utf8')
    .split('\n')
    // Sections are h2 — h3 is the platform names, h4 the value-form branches.
    .filter((l) => l.startsWith('## ') && !l.startsWith('### '))
    .map((l) => l.slice(3).trim());

describe('generated schema reference pages', () => {
  const pages = allPages();

  it('exist', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it('cover every style key at the top level', () => {
    const missing = styleKeys.filter((k) => !pages.includes(`${kebab(k)}.md`));
    expect(missing).toEqual([]);
  });

  /**
   * Sections every style key page carries unconditionally.
   *
   * `Value` replaced `Type`: the page lists what may be written here, and a
   * union, a closed option set and a single type were three section names for
   * one question.
   *
   * `Default` is no longer a section. DSPEC-44 still requires one on all 46
   * properties, and the page now marks it on the value that carries it —
   * `(default)` on an option or `null` arm, `(default: 0)` where the form
   * admits many — so a lost default shows as a missing marker. That is
   * asserted below against the schema rather than by section name.
   */
  for (const section of ['Value', 'Platform bindings', 'Elements Supported', 'Rules', 'Decisions', 'Source']) {
    it(`renders "${section}" on every style key page`, () => {
      const missing = styleKeys
        .map((k) => `${kebab(k)}.md`)
        .filter((f) => pages.includes(f) && !sectionsOf(f).includes(section));
      expect(missing).toEqual([]);
    });
  }

  /**
   * The declared default reaches the page, now that it is a marker on a value
   * rather than a section. This is what the `Default` section assertion used
   * to catch: a default lost from the schema, or a render that stopped
   * emitting it.
   */
  it('marks the declared default on every style key page', () => {
    const missing = styleKeys
      .map((k) => `${kebab(k)}.md`)
      .filter((f) => pages.includes(f) && !/\(default[:)]/.test(readFileSync(join(pagesRoot, f), 'utf8')));
    expect(missing).toEqual([]);
  });

  it('renders the TypeScript source row', () => {
    const missing = styleKeys
      .map((k) => `${kebab(k)}.md`)
      .filter((f) => pages.includes(f) && !readFileSync(join(pagesRoot, f), 'utf8').includes('| TypeScript |'));
    expect(missing).toEqual([]);
  });

  /**
   * Sections that appear only where the thing they describe exists. Asserting a
   * count rather than a set keeps the test from restating the data, while still
   * failing if a whole section stops rendering.
   */
  const conditional: Record<string, number> = {
    'Resolved jointly with': 1,
    Examples: 1,
    'Figma key': 1,
    'Used by': 1,
  };
  for (const [section, atLeast] of Object.entries(conditional)) {
    it(`renders "${section}" somewhere`, () => {
      const count = pages.filter((f) => sectionsOf(f).includes(section)).length;
      expect(count).toBeGreaterThanOrEqual(atLeast);
    });
  }

  it('links no page that does not exist', () => {
    const slugs = new Set(pages.map((f) => `/schema/styles/${f.replace(/\.md$/, '')}/`));
    // The tree's own root. `schema/styles.md` is hand-written and sits beside
    // this folder rather than in it, so it is not among `pages` — and every
    // page's `Path` section links it as the `styles` segment.
    slugs.add('/schema/styles/');
    const broken: string[] = [];
    for (const f of pages) {
      const src = readFileSync(join(pagesRoot, f), 'utf8');
      for (const m of src.matchAll(/\]\((\/schema\/styles\/[^)#\s]*)\)/g)) {
        const url = m[1].endsWith('/') ? m[1] : `${m[1]}/`;
        if (!slugs.has(url)) broken.push(`${f} -> ${m[1]}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
