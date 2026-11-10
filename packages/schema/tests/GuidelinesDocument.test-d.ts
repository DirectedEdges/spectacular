/**
 * Type-level tests for the guidelines document (ADR-118).
 * These files are intentionally never executed — they are compiled with tsc
 * to assert that the type shape is correct.
 */
import type {
  GuidelineEntry,
  GuidelineReference,
  GuidelinesCheckedBy,
  GuidelinesConcern,
  GuidelinesDocument,
  GuidelinesMeta,
  GuidelinesStatus,
  ObligationLevel,
} from '../types/index.js';

/** A prohibition whose remedy is a thing, so it points rather than describes. */
const pointed: GuidelineEntry = {
  statement: 'Use a badge for a value that changes while on screen.',
  level: 'must-not',
  alternatives: [{ to: 'liveRegion' }],
};

/** A prohibition whose remedy is a rule, which no pointer can hold. */
const prose: GuidelineEntry = {
  statement: 'Style any property from a DE Palette ramp step.',
  level: 'must-not',
  instead: 'Style from the semantic token that aliases the ramp step.',
};

/** RFC 2119's fifth level, which DSDS 0.23.1 does not carry. */
const permission: GuidelineEntry = {
  statement: 'Use the three inverse tokens together on a dark surface.',
  level: 'may',
};

const verified: GuidelineEntry = {
  statement: 'Set accessibilityLabel on a badge whose slot holds no text child.',
  level: 'must',
  instead: 'Give the badge a text child, if the design permits one.',
  refines: { to: 'components/guidelines.yaml#accessibility' },
  evidence: [{ href: 'https://www.w3.org/WAI/WCAG22/Understanding/non-text-content' }],
  checkedBy: 'automated',
  checks: [{ to: 'react/src/components/Badge/a11y.test.tsx' }],
};

const meta: GuidelinesMeta = {
  concern: 'color',
  status: 'proposed',
  updated: '2026-11-06',
  sources: ['analysis/foundations.yaml'],
};

/**
 * A foundation's rules are about how values are applied across the catalogue —
 * not about what any one token is for, which is the tokens document's subject.
 */
const foundation: GuidelinesDocument = {
  meta,
  styles: [prose, permission],
};

const component: GuidelinesDocument = {
  meta: { concern: 'badge', status: 'ratified' },
  accessibility: [verified],
  slotComposition: [pointed],
};

/** A document carrying only a header is valid. */
const headerOnly: GuidelinesDocument = { meta: { status: 'ratified' } };

const levels: ObligationLevel[] = ['must', 'should', 'should-not', 'must-not', 'may'];
const concern: GuidelinesConcern = 'overrides';
const verification: GuidelinesCheckedBy = 'assisted';
const status: GuidelinesStatus = 'deprecated';
const reference: GuidelineReference = { to: 'DE Color/Alert/Error/Background' };

// @ts-expect-error — `never` is the authored word; the level set is RFC 2119's.
const never: ObligationLevel = 'never';

// @ts-expect-error — `warn` is a caution, not an obligation, and has no level.
const warn: ObligationLevel = 'warn';

// @ts-expect-error — `avoid` restates `should-not` in a word RFC 2119 already fixed.
const avoid: ObligationLevel = 'avoid';

// @ts-expect-error — a guideline carries an obligation, so `level` is required.
const unlevelled: GuidelineEntry = { statement: 'Keep a badge label short.' };

// @ts-expect-error — `intent` is the supplemental entry's field; a guideline states a rule.
const wrongField: GuidelineEntry = { intent: 'Keep a badge label short.', level: 'should' };

// @ts-expect-error — guidelines carry no `schemaGap`; the overlay-only gate is the other document's.
const gated: GuidelineEntry = { statement: 'x', level: 'must', schemaGap: { path: 'a', need: 'b' } };

// @ts-expect-error — per-token tables are the tokens document's, never a guidelines section.
const tokenTable: GuidelinesDocument = { useWhen: [{ $token: 'a', $description: 'b' }] };

// @ts-expect-error — and neither is the off-limits table.
const dontTable: GuidelinesDocument = { dontUseWhen: [{ $token: 'a', $description: 'b' }] };

export {
  foundation,
  component,
  headerOnly,
  levels,
  concern,
  verification,
  status,
  reference,
  never,
  warn,
  avoid,
  unlevelled,
  wrongField,
  gated,
  tokenTable,
  dontTable,
};
