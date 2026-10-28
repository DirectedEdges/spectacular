import { describe, it, expect } from 'vitest';
import type { SourceEntry } from '@directededges/specs-schema';
import { normalizeSources, formatSourceKeyProblems } from '../../../src/commands/fetch.js';

const KEY = '4iGnY8NOUerW8APiPI2UJr';
const BRANCH = 'Rfll7JjUgOp3DwoMnUXcxE';

/** `SourceEntry` requires a key; these cases are exactly the configs that do not have one. */
const sources = (raw: Record<string, unknown>) => raw as Record<string, SourceEntry>;

describe('normalizeSources', () => {
  it('passes a bare file key through', () => {
    const { entries, problems } = normalizeSources(sources({ core: { key: KEY, fetch: ['file'] } }));
    expect(problems).toEqual([]);
    expect(entries).toEqual([{ alias: 'core', key: KEY, fetch: ['file'], origin: 'config' }]);
  });

  // The same resolution `--source` does, so a pasted URL works in either place.
  it('reads the key out of a pasted Figma URL', () => {
    const { entries, problems } = normalizeSources(sources({
      core: { key: `https://www.figma.com/design/${KEY}/Library?node-id=1-2`, fetch: ['file'] },
    }));
    expect(problems).toEqual([]);
    expect(entries[0].key).toBe(KEY);
  });

  it('takes the branch key from a branch URL, not the file it branches from', () => {
    const { entries } = normalizeSources(sources({
      core: { key: `https://www.figma.com/design/${KEY}/branch/${BRANCH}/Library`, fetch: ['file'] },
    }));
    expect(entries[0].key).toBe(BRANCH);
  });

  it('trims surrounding whitespace rather than failing on it', () => {
    const { entries, problems } = normalizeSources(sources({ core: { key: `  ${KEY}  `, fetch: [] } }));
    expect(problems).toEqual([]);
    expect(entries[0].key).toBe(KEY);
  });

  // Every shape a settings file produces for "there is no key here". A YAML
  // `key:` with nothing after it parses as null, which is how this reached the
  // API as the string "undefined".
  it.each([
    ['key: with nothing after it', { key: null }],
    ['no key field at all', {}],
    ['an empty string', { key: '' }],
    ['whitespace only', { key: '   ' }],
  ])('refuses %s', (_label, entry) => {
    const { entries, problems } = normalizeSources(sources({ organisms: { ...entry, fetch: ['file'] } }));
    expect(entries).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0].alias).toBe('organisms');
    expect(problems[0].reason).toBe('no key is set');
    expect(problems[0].found).toBe('(empty)');
  });

  it('refuses a key that is not a string', () => {
    const { entries, problems } = normalizeSources(sources({ organisms: { key: 12345, fetch: ['file'] } }));
    expect(entries).toEqual([]);
    expect(problems[0].reason).toContain('found number');
    expect(problems[0].found).toBe('12345');
  });

  it('refuses a string that cannot be a file key or URL', () => {
    const { problems } = normalizeSources(sources({ organisms: { key: 'not a key', fetch: ['file'] } }));
    expect(problems).toHaveLength(1);
    expect(problems[0].found).toBe('not a key');
    expect(problems[0].reason).toContain('Not a Figma file key or URL');
  });

  // One run has to name every source that needs editing: reporting the first and
  // stopping means a second run to discover the second.
  it('reports every unusable source, and still returns the usable ones', () => {
    const { entries, problems } = normalizeSources(sources({
      core: { key: KEY, fetch: ['file'] },
      organisms: { key: null, fetch: ['file'] },
      brand: { key: 'nope', fetch: ['styles'] },
    }));
    expect(entries.map(e => e.alias)).toEqual(['core']);
    expect(problems.map(p => p.alias)).toEqual(['organisms', 'brand']);
  });

  it('is empty for no configured sources', () => {
    expect(normalizeSources(undefined)).toEqual({ entries: [], problems: [] });
  });

  it('keeps only recognised fetch kinds', () => {
    const { entries } = normalizeSources(sources({
      core: { key: KEY, fetch: ['file', 'nonsense', 'styles'] },
    }));
    expect(entries[0].fetch).toEqual(['file', 'styles']);
  });
});

describe('formatSourceKeyProblems', () => {
  const problem = { alias: 'organisms', found: '(empty)', reason: 'no key is set' };

  it('names the field to edit and what is wrong with it', () => {
    const message = formatSourceKeyProblems([problem], 'config/settings.yaml');
    expect(message).toContain('data.sources.organisms.key');
    expect(message).toContain('no key is set');
    expect(message).toContain('config/settings.yaml');
  });

  // The old 404 blamed a key that was never there, which sent a reader looking
  // for a file that had moved (specs#706).
  it('never suggests the key is stale or out of reach', () => {
    const message = formatSourceKeyProblems([problem], null).toLowerCase();
    expect(message).not.toContain('stale');
    expect(message).not.toContain('out of reach');
    expect(message).not.toContain('moved');
    expect(message).not.toContain('404');
  });

  it('says a URL is accepted, since that is the usual fix', () => {
    expect(formatSourceKeyProblems([problem], null)).toContain('Figma URL');
  });

  it('counts the sources it is reporting', () => {
    expect(formatSourceKeyProblems([problem], null)).toContain('A configured source cannot');
    expect(formatSourceKeyProblems([problem, { ...problem, alias: 'brand' }], null))
      .toContain('2 configured sources cannot');
  });

  it('falls back to naming the settings file when no config path was given', () => {
    expect(formatSourceKeyProblems([problem], null)).toContain('config/settings.yaml');
  });
});
