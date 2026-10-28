import { describe, it, expect } from 'vitest';
import { resolveFigmaFileKey, slugifyBranchName, FigmaKeyError } from '../../../src/fetch/fileKey.js';

/**
 * The input here is whatever a person pasted out of Figma, so the cases that matter
 * are the shapes Figma's own URL bar produces — and the near-misses that should fail
 * loudly rather than resolve to a key that fetches someone else's file.
 */
describe('resolveFigmaFileKey', () => {
  const KEY = 'abcDEF123456789xyz01';

  it('passes a bare file key through', () => {
    expect(resolveFigmaFileKey(KEY)).toBe(KEY);
    expect(resolveFigmaFileKey(`  ${KEY}  `)).toBe(KEY);
  });

  it('extracts the key from both URL shapes Figma serves', () => {
    expect(resolveFigmaFileKey(`https://www.figma.com/design/${KEY}/Design-System`)).toBe(KEY);
    expect(resolveFigmaFileKey(`https://www.figma.com/file/${KEY}/Design-System`)).toBe(KEY);
  });

  it('ignores query strings and fragments, which carry the node id, not the file', () => {
    expect(resolveFigmaFileKey(`https://www.figma.com/design/${KEY}/DS?node-id=1-2&t=abc`)).toBe(KEY);
    expect(resolveFigmaFileKey(`https://figma.com/design/${KEY}`)).toBe(KEY);
  });

  it('takes a branch URL the same way — a branch key is a file key', () => {
    expect(resolveFigmaFileKey(`https://www.figma.com/design/${KEY}/DS?branch=1`)).toBe(KEY);
  });

  it('rejects a Figma URL that is not a file URL', () => {
    expect(() => resolveFigmaFileKey('https://www.figma.com/files/team/123')).toThrow(FigmaKeyError);
    expect(() => resolveFigmaFileKey('https://www.figma.com/files/team/123')).toThrow(/Expected figma.com\/design/);
  });

  it('rejects anything that is neither a key nor a Figma URL', () => {
    expect(() => resolveFigmaFileKey('data/library.file.json')).toThrow(FigmaKeyError);
    expect(() => resolveFigmaFileKey('short')).toThrow(FigmaKeyError);
    expect(() => resolveFigmaFileKey('')).toThrow(FigmaKeyError);
  });
});

/**
 * A branch name becomes a filename stem and a CLI argument, so it has to survive
 * both. Figma puts no constraints on branch names.
 */
describe('slugifyBranchName', () => {
  it('kebab-cases names, including camelCase splits', () => {
    expect(slugifyBranchName('New nav tokens')).toBe('new-nav-tokens');
    expect(slugifyBranchName('newNavTokens')).toBe('new-nav-tokens');
    expect(slugifyBranchName('Fix/Card spacing')).toBe('fix-card-spacing');
  });

  it('strips characters a filename or shell would fight over', () => {
    expect(slugifyBranchName('  v2 — "big" redesign!  ')).toBe('v2-big-redesign');
  });

  it('falls back rather than producing an empty stem', () => {
    expect(slugifyBranchName('///')).toBe('branch');
  });
});

/**
 * The URL bar shows this shape while a branch is open, and it is what gets pasted.
 * Both keys are real files, so reading the wrong one fetches a real document and
 * fails silently — the branch key is the one that means "the file I am looking at".
 */
describe('resolveFigmaFileKey — branch URLs', () => {
  const MAIN = 'MainFileKey0000000001';
  const BRANCH = 'BranchFileKey00000002';

  it('takes the branch key, not the main key it is nested under', () => {
    expect(resolveFigmaFileKey(`https://www.figma.com/design/${MAIN}/branch/${BRANCH}/UI-kit?m=auto`)).toBe(BRANCH);
  });

  it('still takes the only key when the URL is not a branch', () => {
    expect(resolveFigmaFileKey(`https://www.figma.com/design/${MAIN}/UI-kit?m=auto`)).toBe(MAIN);
  });
});
