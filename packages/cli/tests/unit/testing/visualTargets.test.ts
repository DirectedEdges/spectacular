import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { resolveVisual } from '../../../src/testing/visual/paths.js';
import { titleCandidates } from '../../../src/testing/visual/shoot.js';
import { reportNameFor, TARGETS } from '../../../src/testing/visual/types.js';

/**
 * React and Web Components are two answers to the same question, and before
 * the target split they shared one set of files: a Web Components shoot
 * overwrote the React screenshots in place, the diff scored whichever images
 * were on disk, and one report held both platforms' rows with nothing saying
 * which was which. Every assertion here is a shape that defect could not
 * have satisfied.
 */
describe('per-target artifact trees', () => {
  let root: string;
  let cwd: string;

  beforeEach(() => {
    cwd = process.cwd();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-target-'));
    process.chdir(root);
  });
  afterEach(() => {
    process.chdir(cwd);
    fs.removeSync(root);
  });

  it('keeps the two platforms in separate render, diff and accepted trees', () => {
    const vw = resolveVisual();
    for (const tree of ['render', 'diff', 'accepted'] as const) {
      const react = vw.dirFor(tree, 'component', 'button', 'react');
      const wc = vw.dirFor(tree, 'component', 'button', 'webcomponents');
      expect(react).not.toBe(wc);
      expect(path.relative(vw.root, react).split(path.sep)).toEqual([
        tree,
        'react',
        'components',
        'button',
      ]);
      expect(path.relative(vw.root, wc).split(path.sep)).toEqual([
        tree,
        'webcomponents',
        'components',
        'button',
      ]);
    }
  });

  it('shares one Figma baseline across platforms — the export is the design', () => {
    const vw = resolveVisual();
    expect(path.relative(vw.root, vw.dirFor('figma', 'component', 'button')).split(path.sep)).toEqual(
      ['figma', 'components', 'button'],
    );
  });

  it('still keys kind before key within a platform, for a shared name', () => {
    const vw = resolveVisual();
    expect(vw.dirFor('render', 'component', 'card', 'react')).not.toBe(
      vw.dirFor('render', 'composition', 'card', 'react'),
    );
  });
});

describe('report names', () => {
  it('gives every mode and platform its own file', () => {
    const names = (['figma', 'accepted'] as const).flatMap((mode) =>
      TARGETS.map((t) => reportNameFor(mode, t)),
    );
    expect(names).toEqual([
      'fidelity.react',
      'fidelity.webcomponents',
      'regression.react',
      'regression.webcomponents',
    ]);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('story title candidates', () => {
  it('matches the platform leaf under the component, for both kinds and both targets', () => {
    expect(titleCandidates('react', 'component', 'Card')[0]).toBe('Components/Card/React');
    expect(titleCandidates('react', 'composition', 'Card')[0]).toBe('Compositions/Card/React');
    expect(titleCandidates('webcomponents', 'component', 'Card')[0]).toBe('Components/Card/Web components');
    expect(titleCandidates('webcomponents', 'composition', 'Card')[0]).toBe('Compositions/Card/Web components');
  });

  // A workspace's emitted trees are only as new as its last transform run, so a
  // tree written before the platform leaf existed still has to join.
  it('still matches the retired spellings', () => {
    expect(titleCandidates('react', 'component', 'Card')).toContain('Components/Card');
    expect(titleCandidates('webcomponents', 'component', 'Card')).toContain('Web Components/Card');
    // `Web Components/` was prefixed onto a title the shared naming code had
    // already prefixed with `Compositions/`, so that spelling nests both.
    // Omitting it is why every Web Components composition reported as no-story.
    expect(titleCandidates('webcomponents', 'composition', 'Card')).toContain('Web Components/Compositions/Card');
  });

  it('never offers one target a title the other target writes', () => {
    expect(titleCandidates('react', 'component', 'Card')).not.toContain('Components/Card/Web components');
    expect(titleCandidates('webcomponents', 'component', 'Card')).not.toContain('Components/Card/React');
  });
});
