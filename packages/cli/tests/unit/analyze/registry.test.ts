/**
 * An analyzer is single-use, so every run has to get its own.
 *
 * Each one accumulates across the specs it visits and writes the total in
 * `finalize()`. The registry handed out shared instances, which a one-shot
 * command never noticed — the process exits and the next invocation starts clean.
 * `specs run` holds the process open, so every watcher pass accumulated into the
 * same analyzers and wrote the union: a 197-prop catalogue reported
 * `totalProps: 1576` after eight passes, each component listed eight times.
 *
 * Nothing was malformed and nothing warned. `states.setup` reads `props.yaml` as
 * its candidate list, so the inflation reached a judgment pass as fact.
 */
import { describe, it, expect } from 'vitest';
import { allAnalyzers, resolveAnalyzers, availableAnalyzerNames } from '../../../src/analyze/index.js';

describe('the analyzer registry', () => {
  it('hands out a fresh instance per call', () => {
    const first = allAnalyzers();
    const second = allAnalyzers();

    expect(first).toHaveLength(second.length);
    for (let i = 0; i < first.length; i++) {
      expect(
        first[i],
        `${first[i].name} is shared between runs — a second pass would write the union of both`,
      ).not.toBe(second[i]);
    }
  });

  it('hands out a fresh instance for a named analyzer too', () => {
    // The scoped path is the one `specs analyze props` takes, and it used to
    // return the same instance from a lookup map.
    const first = resolveAnalyzers(['props']);
    const second = resolveAnalyzers(['props']);
    expect(first[0]).not.toBe(second[0]);
  });

  it('still reports every analyzer by name', () => {
    expect(availableAnalyzerNames().sort()).toEqual(
      ['dependencies', 'keys', 'props', 'roles', 'styling'].sort(),
    );
  });

  it('keeps declaration order, which is the order a run reports', () => {
    expect(allAnalyzers().map(a => a.name)).toEqual(availableAnalyzerNames());
  });
});
