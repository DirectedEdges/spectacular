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
  it('matches the Web Components composition title the emitter actually writes', () => {
    // `Web Components/` is prefixed onto a title the shared naming code has
    // already prefixed with `Compositions/`, so the real title nests both.
    // Omitting this spelling is why every Web Components composition
    // reported as no-story.
    expect(titleCandidates('webcomponents', 'composition', 'Card')).toContain(
      'Web Components/Compositions/Card',
    );
  });

  it('keeps the platform root on every Web Components title', () => {
    for (const kind of ['component', 'composition'] as const) {
      for (const candidate of titleCandidates('webcomponents', kind, 'Card')) {
        expect(candidate.startsWith('Web Components')).toBe(true);
      }
    }
  });

  it('titles React stories under the kind group, with no platform root', () => {
    expect(titleCandidates('react', 'component', 'Card')).toEqual(['Components/Card']);
    expect(titleCandidates('react', 'composition', 'Card')).toEqual(['Compositions/Card']);
  });
});
