/**
 * Every doc, guide and schema file a skill names has to exist.
 *
 * The docs are not shipped with the CLI — skills cite them as paths under the public
 * repo, fetched as raw markdown. That makes a stale citation worse than a broken local
 * path, because nothing fails until a customer's agent requests a URL that 404s
 * mid-procedure, and nothing in this repo notices.
 *
 * So the citations are checked here against the site content they name. A page renamed
 * in the site, or a guide cited from memory that never existed, fails this suite
 * instead of a customer's run.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SKILL_ASSETS } from '../../../src/skills/index.js';

const repoRoot = path.resolve(__dirname, '../../../../..');
const docsRoot = path.join(repoRoot, 'site/src/content/docs');
const schemaRoot = path.join(repoRoot, 'packages/schema');

/** `settings/states.md`, `guides/variant-depth.md` — a path under the docs tree. */
const DOC_PATH = /\b((?:settings|guides|schema|roles|cli|versioning)\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\.mdx?)\b/g;

/** A bare guide name cited in the derivations table, e.g. `variant-layering`. */
const GUIDE_NAME = /\`([a-z0-9]+(?:-[a-z0-9]+)+)\`/g;

function docExists(rel: string): boolean {
  const full = path.join(docsRoot, rel);
  if (fs.existsSync(full)) return true;
  // A section cited without a filename resolves to its index page.
  const stem = full.replace(/\.mdx?$/, '');
  return fs.existsSync(`${stem}.mdx`) || fs.existsSync(path.join(stem, 'index.md')) || fs.existsSync(path.join(stem, 'index.mdx'));
}

describe('skill doc citations resolve', () => {
  for (const skill of SKILL_ASSETS) {
    it(`${skill.name} cites only docs that exist`, () => {
      const cited = [...skill.markdown.matchAll(DOC_PATH)].map(m => m[1]);
      const missing = [...new Set(cited)].filter(rel => !docExists(rel));
      expect(missing, `cited but absent from site/src/content/docs: ${missing.join(', ')}`).toEqual([]);
    });
  }

  it('the primer names only guides that exist', () => {
    const primer = SKILL_ASSETS.find(s => s.name === 'specs-cli.primer');
    expect(primer, 'the primer is the prerequisite every other skill names').toBeDefined();

    const guides = new Set(
      fs.readdirSync(path.join(docsRoot, 'guides')).map(f => f.replace(/\.mdx?$/, '')),
    );
    // Only names that look like guide slugs AND appear in the derivations table matter;
    // a hyphenated token elsewhere in the primer (a concept name, a CSS selector) is not
    // a citation. Scope to the table by taking the section between its heading and the next.
    const section = primer!.markdown.split('## Derivations')[1]?.split('\n## ')[0] ?? '';
    const named = [...section.matchAll(GUIDE_NAME)].map(m => m[1]);
    expect(named.length, 'the derivations table should name guides').toBeGreaterThan(0);

    const missing = [...new Set(named)].filter(g => !guides.has(g));
    expect(missing, `named in the derivations table but absent from guides/: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('skill schema citations resolve', () => {
  it('the schema package ships the types and JSON schema the primer points at', () => {
    // The primer tells agents the schema package is the authority on legal spec shape,
    // and that it is always present because the CLI depends on it. Both halves have to
    // stay true: the dependency, and the two directories it ships.
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages/cli/package.json'), 'utf8'));
    expect(pkg.dependencies['@directededges/specs-schema'], 'the primer claims the schema package is always present').toBeDefined();

    const shipped = JSON.parse(fs.readFileSync(path.join(schemaRoot, 'package.json'), 'utf8')).files;
    expect(shipped).toContain('types');
    expect(shipped).toContain('schema');

    for (const f of ['component.schema.json', 'conventions.schema.json', 'settings.schema.json']) {
      expect(fs.existsSync(path.join(schemaRoot, 'schema', f)), `schema/${f} is cited by the primer`).toBe(true);
    }
    for (const t of ['Anatomy.ts', 'Props.ts', 'Variant.ts', 'PropBinding.ts', 'SlotContent.ts', 'Conventions.ts']) {
      expect(fs.existsSync(path.join(schemaRoot, 'types', t)), `types/${t} is cited by the primer`).toBe(true);
    }
  });
});
