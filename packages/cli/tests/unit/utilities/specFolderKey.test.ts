import { describe, it, expect } from 'vitest';
import { specFolderKey } from '../../../src/utilities/specFolderKey.js';
import { allAnalyzers } from '../../../src/analyze/index.js';

/**
 * One derivation for the key a spec is written under. Two were the bug: the guard that
 * rejects an unusable name used a different function than the writer that names the
 * folder, so a whitespace-named frame passed the guard and the writer put it in a folder
 * called `component`.
 */
describe('specFolderKey', () => {
  it('camelCases a Figma name, dropping separators', () => {
    expect(specFolderKey('DS Button')).toBe('dsButton');
    expect(specFolderKey('Home / Large')).toBe('homeLarge');
    expect(specFolderKey('Checkout / Small')).toBe('checkoutSmall');
  });

  it('returns null for a name with no letters or digits', () => {
    // Null, not a fallback: inventing a key gives two such specs the same folder.
    expect(specFolderKey(' ')).toBeNull();
    expect(specFolderKey('')).toBeNull();
    expect(specFolderKey('/ - /')).toBeNull();
    expect(specFolderKey('///')).toBeNull();
  });

  it('keeps a single already-camelCase word recognisable', () => {
    expect(specFolderKey('dsButton')).toBe('dsbutton');
  });

  it('is independent of the spec.keys setting', () => {
    // spec.keys governs keys inside a spec and the formatted instanceOf values the
    // bridge matches; the folder has always been camelCase. This function takes no
    // format argument precisely so that cannot drift.
    expect(specFolderKey.length).toBe(1);
  });
});

/**
 * ADR-096: what each analysis reads is its own declaration, defaulting to components
 * only — so an analysis that has not considered compositions never silently gets them.
 */
describe('analyzer kind declarations', () => {
  const kindsOf = (name: string) =>
    allAnalyzers().find(a => a.name === name)?.readsKinds ?? ['component'];

  it('reads compositions where a composition has something to contribute', () => {
    expect(kindsOf('dependencies')).toEqual(['component', 'composition']);
    expect(kindsOf('styling')).toEqual(['component', 'composition']);
  });

  it('stays component-only where a composition declares nothing', () => {
    expect(kindsOf('props')).toEqual(['component']);
    expect(kindsOf('keys')).toEqual(['component']);
  });
});
