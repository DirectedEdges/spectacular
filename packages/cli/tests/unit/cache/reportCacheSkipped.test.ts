import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { reportCache } from '../../../src/cache/report.js';
import type { CacheReport } from '../../../src/cache/cache.js';

/**
 * The cache can only see that a source has no payload. That is true both of a
 * source `--only` excluded and of one whose download just failed, and calling
 * both "skipped" put "nothing was tried" directly under the line reporting the
 * failure (specs#708).
 */
function report(over: Partial<CacheReport> = {}): CacheReport {
  return {
    rebuilt: [],
    current: [],
    unfetched: [],
    counts: { components: 0, styles: 0, variables: 0, icons: 0 },
    aliasCounts: {},
    failures: [],
    ...over,
  } as CacheReport;
}

describe('reportCache skipped line', () => {
  let logs: string[];
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logs = [];
    logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
  });
  afterEach(() => logSpy.mockRestore());

  const skippedLine = () => logs.find(l => l.includes('Not fetched, skipped'));

  it('names a source nobody asked for', () => {
    reportCache(report({ unfetched: ['brand'] }));
    expect(skippedLine()).toContain('brand');
  });

  it('says nothing when the only unfetched source was attempted and failed', () => {
    reportCache(report({ unfetched: ['core'] }), ['core']);
    expect(skippedLine()).toBeUndefined();
  });

  it('names only the genuinely skipped source when both kinds are present', () => {
    reportCache(report({ unfetched: ['core', 'brand'] }), ['core']);
    expect(skippedLine()).toContain('brand');
    expect(skippedLine()).not.toContain('core');
  });

  // The run that filed the issue: both sources failed, and the report said both
  // were skipped.
  it('prints no skipped line when every source failed', () => {
    reportCache(report({ unfetched: ['core', 'organisms'] }), ['core', 'organisms']);
    expect(skippedLine()).toBeUndefined();
  });

  it('treats no attempted list as nothing attempted, for callers that do not fetch', () => {
    reportCache(report({ unfetched: ['core', 'brand'] }));
    expect(skippedLine()).toContain('core');
    expect(skippedLine()).toContain('brand');
  });

  it('leaves the rebuilt and current lines alone', () => {
    reportCache(report({ rebuilt: ['core'], current: ['brand'], unfetched: ['stale'] }), ['stale']);
    expect(logs.find(l => l.includes('Cache rebuilt'))).toContain('core');
    expect(logs.find(l => l.includes('Cache current'))).toContain('brand');
    expect(skippedLine()).toBeUndefined();
  });
});
