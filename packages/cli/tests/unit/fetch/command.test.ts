import { describe, it, expect } from 'vitest';
import { Fetch, formatDuration, formatRateLimitError, formatNotFoundError, formatAuthError, parseAdHocSource, matchBridgeSource } from '../../../src/commands/fetch.js';

describe('FetchCommand', () => {
  it('registers name and description', () => {
    expect(Fetch.name()).toBe('fetch');
    expect(Fetch.description()).toContain('Fetch raw REST payloads');
  });

  it('registers expected options', () => {
    const options = Fetch.options.map(option => option.long).filter(Boolean);

    expect(options).toContain('--config');
    expect(options).toContain('--data-dir');
    expect(options).toContain('--outDir'); // deprecated alias
    expect(options).toContain('--only');
    expect(options).toContain('--from-bridge');
    expect(options).toContain('--file');
    expect(options).toContain('--verbose');
  });
});

describe('matchBridgeSource', () => {
  const sources = [
    { alias: 'library', key: 'AAA111' },
    { alias: 'icons', key: 'BBB222' }
  ];

  it('matches the connected file to its configured source', () => {
    const result = matchBridgeSource(sources, 'AAA111', []);
    expect(result).toEqual({ entry: { alias: 'library', key: 'AAA111' } });
  });

  it('accepts a match that --only also named', () => {
    const result = matchBridgeSource(sources, 'BBB222', ['icons']);
    expect(result).toEqual({ entry: { alias: 'icons', key: 'BBB222' } });
  });

  it('rejects a connected file that is not a configured source', () => {
    const result = matchBridgeSource(sources, 'CCC333', []);
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('CCC333');
    expect((result as { error: string }).error).toContain('library (AAA111)');
  });

  it('rejects a match that --only excluded', () => {
    const result = matchBridgeSource(sources, 'AAA111', ['icons']);
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('"library"');
    expect((result as { error: string }).error).toContain('icons');
  });

  it('rejects a missing fileKey when no alias names the destination', () => {
    const result = matchBridgeSource(sources, undefined, []);
    expect(result).toHaveProperty('error');
  });

  it('falls back to a single --only alias when the key matches nothing', () => {
    // The plugin cannot always read the real file key (unsaved- placeholder).
    const result = matchBridgeSource(sources, 'unsaved-xyz', ['library']);
    expect(result).toEqual({ entry: { alias: 'library', key: 'AAA111' } });
  });

  it('does not fall back when --only names several aliases', () => {
    const result = matchBridgeSource(sources, 'unsaved-xyz', ['library', 'icons']);
    expect(result).toHaveProperty('error');
  });
});

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(45)).toBe('45 seconds');
  });

  it('formats minutes', () => {
    expect(formatDuration(120)).toBe('2 minutes');
  });

  it('formats hours', () => {
    expect(formatDuration(7200)).toBe('2 hours');
  });

  it('formats days', () => {
    expect(formatDuration(172800)).toBe('2 days');
  });

  it('formats months', () => {
    expect(formatDuration(30 * 24 * 60 * 60 * 3)).toBe('3 months');
  });

  it('uses singular when value is 1', () => {
    expect(formatDuration(60)).toBe('1 minute');
    expect(formatDuration(3600)).toBe('1 hour');
    expect(formatDuration(86400)).toBe('1 day');
  });

  it('returns 0 seconds for zero', () => {
    expect(formatDuration(0)).toBe('0 seconds');
  });
});

describe('formatRateLimitError', () => {
  it('includes all header details when present', () => {
    const headers = new Headers({
      'retry-after': '30',
      'x-figma-rate-limit-type': 'low',
      'x-figma-plan-tier': 'professional'
    });

    const result = formatRateLimitError('library', 'variables', headers);

    expect(result).toBe([
      'Error: Rate limited (429) while fetching library.variables',
      '  Retry after: 30 seconds',
      '  Seat tier: Viewer / Collab (low)',
      '  Plan: Professional',
      '  See: https://developers.figma.com/docs/rest-api/rate-limits/'
    ].join('\n'));
  });

  it('shows only base error and docs link when no headers present', () => {
    const headers = new Headers();

    const result = formatRateLimitError('kds', 'file', headers);

    expect(result).toBe([
      'Error: Rate limited (429) while fetching kds.file',
      '  See: https://developers.figma.com/docs/rest-api/rate-limits/'
    ].join('\n'));
  });

  it('handles partial headers (only retry-after)', () => {
    const headers = new Headers({ 'retry-after': '60' });

    const result = formatRateLimitError('kds', 'styles', headers);

    expect(result).toBe([
      'Error: Rate limited (429) while fetching kds.styles',
      '  Retry after: 1 minute',
      '  See: https://developers.figma.com/docs/rest-api/rate-limits/'
    ].join('\n'));
  });

  it('formats large retry-after as days', () => {
    const headers = new Headers({ 'retry-after': '254598' });

    const result = formatRateLimitError('kds', 'file', headers);

    expect(result).toContain('Retry after: 3 days');
  });

  it('maps high rate-limit type to Dev / Full label', () => {
    const headers = new Headers({ 'x-figma-rate-limit-type': 'high' });

    const result = formatRateLimitError('lib', 'file', headers);

    expect(result).toContain('Seat tier: Dev / Full (high)');
  });

  it('passes through unknown rate-limit type values', () => {
    const headers = new Headers({ 'x-figma-rate-limit-type': 'unknown' });

    const result = formatRateLimitError('lib', 'file', headers);

    expect(result).toContain('Seat tier: unknown');
  });

  it('title-cases plan tier', () => {
    const headers = new Headers({ 'x-figma-plan-tier': 'enterprise' });

    const result = formatRateLimitError('lib', 'file', headers);

    expect(result).toContain('Plan: Enterprise');
  });
});

describe('formatNotFoundError', () => {
  it('points at the configured key and config path', () => {
    const result = formatNotFoundError('library', 'file', '/proj/specs.config.yaml');

    expect(result).toBe([
      'Error: File not found (404) while fetching library.file',
      '  Figma returned 404 for the file key configured for "library".',
      '  This usually means the key in your config is stale or out of reach:',
      '    • The file was moved, deleted, or recreated (keys change on duplicate/recreate)',
      '    • Your FIGMA_TOKEN account cannot open this file',
      '  Check: data.sources.library.key in /proj/specs.config.yaml'
    ].join('\n'));
  });

  it('falls back to a default config name when path is null', () => {
    const result = formatNotFoundError('kds', 'variables', null);

    expect(result).toContain('Check: data.sources.kds.key in the workspace settings (config/settings.yaml)');
  });
});

describe('formatAuthError', () => {
  it('explains where to put the token for 401', () => {
    const result = formatAuthError(401, 'library', 'file', '/proj/specs.config.yaml');

    expect(result).toBe([
      'Error: Authentication failed (401) while fetching library.file',
      '  Your FIGMA_TOKEN is missing, invalid, or expired.',
      '  Add it to a .env file as FIGMA_TOKEN=your_token_here',
      '  Create a new token: https://www.figma.com/developers/api#access-tokens'
    ].join('\n'));
  });

  it('points 403 at file access and the configured key', () => {
    const result = formatAuthError(403, 'library', 'styles', '/proj/specs.config.yaml');

    expect(result).toBe([
      'Error: Access denied (403) while fetching library.styles',
      '  Your FIGMA_TOKEN is valid but cannot access this file.',
      '    • Confirm your Figma account can open the file for data.sources.library.key',
      '    • Personal access tokens only reach files your account can view',
      '    • If your org enforces SAML/SSO, personal access tokens are blocked',
      '      Use an OAuth token or ask your admin to allow PATs',
      '      See: https://www.figma.com/developers/api#oauth2',
      '    • The file may be in personal drafts or a restricted team (403 = exists but no access)',
      '  Check: data.sources.library.key in /proj/specs.config.yaml'
    ].join('\n'));
  });
});

/**
 * `--source` is what a diff run pastes a branch URL into, so the parse has to accept
 * what Figma's URL bar produces and refuse anything that would name a file on disk.
 */
describe('parseAdHocSource', () => {
  const KEY = 'abcDEF123456789xyz01';

  it('takes a bare URL and leaves the alias to be derived from the branch', () => {
    expect(parseAdHocSource(`https://www.figma.com/design/${KEY}/DS?node-id=1-2`)).toEqual({
      alias: undefined,
      key: KEY,
      raw: `https://www.figma.com/design/${KEY}/DS?node-id=1-2`
    });
  });

  it('takes an explicit alias before the first =', () => {
    expect(parseAdHocSource(`library-branch=${KEY}`)).toMatchObject({ alias: 'library-branch', key: KEY });
  });

  it('does not read a URL\'s query string as an alias', () => {
    expect(parseAdHocSource(`https://www.figma.com/design/${KEY}/DS?t=a=b`)).toMatchObject({ alias: undefined, key: KEY });
  });

  it('rejects an alias that would not survive as a filename', () => {
    expect(() => parseAdHocSource(`my branch=${KEY}`)).toThrow(/usable source alias/);
  });

  it('rejects a target that is neither a key nor a Figma URL', () => {
    expect(() => parseAdHocSource('branch=data/library.file.json')).toThrow(/Figma file key or URL/);
  });
});

/**
 * An ad-hoc source has no config entry, so the config-shaped remedies in these errors
 * would send the reader somewhere that says nothing about the key that failed.
 */
describe('error messages for ad-hoc sources', () => {
  it('404 points at the pasted URL, not data.sources', () => {
    const result = formatNotFoundError('library-branch', 'file', '/proj/config', 'adhoc');

    expect(result).toContain('the key passed as --source library-branch');
    expect(result).not.toContain('data.sources');
  });

  it('403 drops the config check and keeps the token remedies', () => {
    const result = formatAuthError(403, 'library-branch', 'file', '/proj/config', undefined, 'adhoc');

    expect(result).toContain('cannot access the file passed as --source');
    expect(result).not.toContain('data.sources');
    expect(result).toContain('SAML/SSO');
  });
});
