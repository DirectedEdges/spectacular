/**
 * Type-level tests for the guidelines sidecar (ADR-118).
 * These files are intentionally never executed — they are compiled with tsc
 * to assert that the type shape is correct.
 */
import type {
  GuidelineEntry,
  GuidelinesDocument,
  ObligationLevel,
  Ref,
  SelectionGuidance,
  SelectionSubject,
} from '../types/index.js';

/** A prohibition whose remedy is a thing, so it points rather than describes. */
const pointed: GuidelineEntry = {
  statement: 'Style any property from a DE Palette ramp step.',
  level: 'must-not',
  alternatives: [{ to: 'DE Color/Alert/Error/Background' }],
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
  statement: 'Fill a badge slot with at least one child.',
  level: 'must',
  checkedBy: 'automated',
  checks: [{ to: 'tests/badge.test.tsx' }],
  evidence: [{ href: 'https://example.test/research' }],
  refines: { to: 'components/guidelines.yaml#slotComposition' },
};

/** An off-limits subject with a replacement, and one without — absence is meaningful. */
const dontUseWhen: SelectionGuidance = {
  tokens: [
    {
      $token: 'DE Palette/*',
      $description: 'a raw ramp step — styling from a ramp bypasses the layer carrying intent',
      alternatives: [{ to: 'DE Color/Alert/Error/Background' }],
    },
    {
      $token: 'DE Color/Utility/Figma/*',
      $description: 'Figma plugin and panel chrome, not product surfaces',
    },
  ],
};

const useWhen: SelectionGuidance = {
  tokens: [{ $token: 'DE Color/Text/Primary', $description: 'default body text on a light surface' }],
  props: [{ $name: 'color', $description: 'the status reported, never decoration' }],
  variants: [{ $name: 'XS', $description: 'dense rows only' }],
  slotFills: [{ $name: 'glyph', $description: 'a leading status glyph' }],
};

const sameAs: Ref = { to: 'components/guidelines.yaml#styles', rel: 'same-as' };

const crossScope: SelectionSubject = {
  $name: 'color',
  $description: 'restates the catalogue-scope rule deliberately',
  refs: [sameAs],
};

const document: GuidelinesDocument = {
  meta: { concern: 'color', status: 'proposed', updated: '2026-11-06' },
  useWhen,
  dontUseWhen,
  styles: [pointed, prose, permission],
  slotComposition: [verified],
};

/** A document carrying only a header is valid. */
const headerOnly: GuidelinesDocument = { meta: { status: 'ratified' } };

const levels: ObligationLevel[] = ['must', 'should', 'should-not', 'must-not', 'may'];

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

// @ts-expect-error — a subject says what it is for, so `$description` is required.
const undescribed: SelectionSubject = { $token: 'DE Color/Text/Primary' };

export {
  document,
  headerOnly,
  useWhen,
  dontUseWhen,
  crossScope,
  levels,
  never,
  warn,
  avoid,
  unlevelled,
  wrongField,
  gated,
  undescribed,
};
