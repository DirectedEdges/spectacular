// @directededges/specs-schema-core — the reference validator for the Specs
// document format (SPECIFICATION.md §10).
//
// Two layers, one call: `validateDocument` runs the JSON Schema for the
// document's kind (§2.1), then the semantic rule catalogue (§9), and reports
// every failure by rule identifier — `DSPEC-nn` for a catalogue rule, `schema`
// for a JSON Schema failure. The library API is the whole surface; there is no
// command-line entry point.

import { checkSchema } from './schemas.js';
import { checkRules } from './rules.js';
import type { DocumentKind, RuleContext, ValidateResult, Violation } from './types.js';

export type { DocumentKind, RuleContext, ValidateResult, Violation } from './types.js';
export { DOCUMENT_KINDS } from './types.js';
export { RULES, UNCHECKED_RULES, checkRules, type Rule } from './rules.js';
export {
  authoredValidator,
  concernValidators,
  describeAjvError,
  describeAjvErrors,
  isMissingSourceError,
  schemaDir,
  schemaValidator,
  checkSchema,
  type AuthoredKind,
  type ConcernKind,
  type ConcernName,
  type ConcernValidators,
} from './schemas.js';
export { resolvePointer } from './walk.js';
export {
  concernOfPath,
  mergeConcerns,
  validateConcernSet,
  type ConcernSet,
  type ConcernSetOptions,
  type ConcernSetResult,
  type ConcernViolation,
} from './concerns.js';
// Re-exported so a consumer can type a compiled validator without depending on
// ajv itself.
export type { ValidateFunction, ErrorObject } from 'ajv';

function compare(a: Violation, b: Violation): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0;
}

/**
 * Decide a document's conformance: JSON Schema for its kind, then the
 * semantic rule catalogue. Deterministic — violations sorted by path, then
 * rule — so two runs over the same document report the same lines.
 */
export function validateDocument(doc: unknown, kind: DocumentKind, ctx: RuleContext = {}): ValidateResult {
  const violations = [...checkSchema(doc, kind), ...checkRules(doc, kind, ctx)].sort(compare);
  return { valid: violations.length === 0, violations };
}
