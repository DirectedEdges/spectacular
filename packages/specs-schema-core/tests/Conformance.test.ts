/**
 * The conformance suite (SPECIFICATION.md §10).
 *
 * Positive fixtures MUST validate. Negative fixtures MUST be rejected, and —
 * the bar §10 sets — rejected for the rule each is paired with: every reported
 * violation names the expected rule, so a fixture that happens to violate two
 * rules is caught as defective rather than passed as stronger.
 *
 * Completeness closes the loop against the catalogue itself: every
 * validator-class row in SPECIFICATION.md §9 is either implemented or named in
 * UNCHECKED_RULES with its reason, and every implemented rule has a negative
 * fixture. Adding a rule without either fails here.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { RULES, UNCHECKED_RULES, validateDocument, type DocumentKind, type RuleContext } from '../src/index.js';

interface Fixture {
  name: string;
  kind: DocumentKind;
  expect?: string;
  document: unknown;
  ctx: RuleContext;
}

function fixturesIn(dir: string): Fixture[] {
  const base = resolve(__dirname, 'fixtures', dir);
  return readdirSync(base)
    .filter(f => f.endsWith('.yaml'))
    .sort()
    .map(name => {
      const raw = parseYaml(readFileSync(join(base, name), 'utf8'));
      return {
        name,
        kind: raw.kind,
        expect: raw.expect,
        document: raw.document,
        ctx: { documentPath: raw.path, settings: raw.settings },
      };
    });
}

const positive = fixturesIn('positive');
const negative = fixturesIn('negative');

describe('positive fixtures', () => {
  it.each(positive.map(f => [f.name, f] as const))('%s validates', (_name, fixture) => {
    const result = validateDocument(fixture.document, fixture.kind, fixture.ctx);
    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('negative fixtures', () => {
  it.each(negative.map(f => [f.name, f] as const))('%s is rejected for its paired rule', (_name, fixture) => {
    expect(fixture.expect, 'a negative fixture declares the rule it violates').toBeTruthy();
    const result = validateDocument(fixture.document, fixture.kind, fixture.ctx);
    expect(result.valid).toBe(false);
    const rules = [...new Set(result.violations.map(v => v.rule))];
    // Rejected for the stated rule, and for nothing else — a fixture violating
    // two rules is defective rather than stronger.
    expect(rules).toEqual([fixture.expect]);
  });
});

describe('catalogue completeness', () => {
  const specification = readFileSync(resolve(__dirname, '../../schema/SPECIFICATION.md'), 'utf8');
  const validatorRows = [...specification.matchAll(/^\| (DSPEC-\d+) \|.*?\| validator \|/gm)].map(m => m[1]);
  const implemented = new Set(RULES.map(r => r.id));

  it('finds the catalogue', () => {
    expect(validatorRows.length).toBeGreaterThan(0);
  });

  it.each(validatorRows)('%s is implemented or accounted for', id => {
    expect(implemented.has(id) || UNCHECKED_RULES.has(id)).toBe(true);
  });

  it('no rule is both implemented and listed unchecked', () => {
    for (const id of UNCHECKED_RULES.keys()) expect(implemented.has(id)).toBe(false);
  });

  it('every implemented rule has a negative fixture', () => {
    const covered = new Set(negative.map(f => f.expect));
    for (const rule of RULES) expect(covered, `negative fixture for ${rule.id}`).toContain(rule.id);
  });

  it('rule ids are unique', () => {
    expect(new Set(RULES.map(r => r.id)).size).toBe(RULES.length);
  });
});
