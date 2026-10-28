/**
 * The repository README is copied verbatim into the CLI package at build time, so
 * its links have to work from both places.
 *
 * `repository.directory` is `packages/cli`, so npm resolves a relative link against
 * that directory rather than the repo root — `](adr/)` would resolve to
 * `packages/cli/adr/` and 404. The README therefore carries absolute URLs
 * throughout, and this is what keeps it that way: a relative link added later
 * renders fine on GitHub, where it would be reviewed, and breaks only on npm, where
 * nobody is looking.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../../../..');
const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

/** `](target)` where target is neither absolute nor a bare in-page fragment. */
const RELATIVE_LINK = /\]\((?!https?:\/\/|mailto:|#)([^)]+)\)/g;

describe('the repository README', () => {
  it('links absolutely, so the copy in the published package resolves', () => {
    const relative = [...new Set([...readme.matchAll(RELATIVE_LINK)].map(m => m[1]))];
    expect(
      relative,
      'these would 404 from the npm package — make them https://github.com/DirectedEdges/specs/' +
      '{blob,tree}/main/<path> URLs',
    ).toEqual([]);
  });

  it('is listed in the files the CLI package publishes', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages/cli/package.json'), 'utf8'));
    expect(pkg.files, 'the package shipped no README at all until this was checked').toContain('README.md');
  });

  it('is copied into the package by the build', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages/cli/package.json'), 'utf8'));
    expect(
      pkg.scripts.build,
      'listing README.md in `files` without copying it there is what produced an empty npm page',
    ).toContain('README.md');
  });
});
