// Merging a split spec back into the whole document the rule catalogue
// evaluates. A component MAY be written whole or split into concern documents,
// and the two forms carry the same information (§2.1) — but the catalogue's
// rules cross concerns (a configuration in the variants document against a
// prop in the api document), so a validator of the split form needs the merge.
// It lives here so every consumer merges the same way; two implementations
// that merged differently would disagree about conformance while agreeing
// about every file.

import { isObj, type Obj } from './walk.js';
import { checkRules } from './rules.js';
import { describeAjvError, validatorFor, type ConcernName } from './schemas.js';
import type { RuleContext, ValidateResult, Violation } from './types.js';

/** The parsed concern documents of one spec, any of which may be absent. */
export interface ConcernSet {
  api?: Record<string, unknown>;
  variants?: Record<string, unknown>;
  examples?: Record<string, unknown>;
}

const CONCERNS: readonly ConcernName[] = ['api', 'variants', 'examples'];

/**
 * The whole document a concern set carries between its files. `metadata` is
 * dropped — it marks each file's concern, and the merged form is the
 * whole-component shape, which carries none (§2.2). Subcomponents are sliced
 * per concern (ADR-091), so their entries merge per key.
 */
export function mergeConcerns(concerns: ConcernSet): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const subcomponents: Record<string, Record<string, unknown>> = {};
  for (const concern of CONCERNS) {
    const doc = concerns[concern];
    if (!isObj(doc)) continue;
    for (const [key, value] of Object.entries(doc)) {
      if (key === 'metadata') continue;
      if (key === 'subcomponents' && isObj(value)) {
        for (const [name, slice] of Object.entries(value)) {
          if (isObj(slice)) subcomponents[name] = { ...subcomponents[name], ...slice };
        }
        continue;
      }
      merged[key] = value;
    }
  }
  if (Object.keys(subcomponents).length > 0) merged.subcomponents = subcomponents;
  return merged;
}

/** The concern-document schema targets, per spec kind (§2.1). */
const CONCERN_TARGETS: Record<'component' | 'composition', Record<ConcernName, string>> = {
  component: {
    api: 'component-concern.schema.json#/definitions/ComponentApiDocument',
    variants: 'component-concern.schema.json#/definitions/ComponentVariantsDocument',
    examples: 'component-concern.schema.json#/definitions/ComponentExamplesDocument',
  },
  composition: {
    api: 'composition-concern.schema.json#/definitions/CompositionApiDocument',
    variants: 'composition-concern.schema.json#/definitions/CompositionVariantsDocument',
    examples: 'composition-concern.schema.json#/definitions/CompositionExamplesDocument',
  },
};

export interface ConcernSetOptions extends RuleContext {
  /** Which spec kind the folder holds. Default: 'component'. */
  specKind?: 'component' | 'composition';
}

/** A violation from a concern set, naming the concern file it came from where one does. */
export interface ConcernViolation extends Violation {
  /** Absent on a rule violation whose path spans the merged document's root. */
  concern?: ConcernName;
}

export interface ConcernSetResult extends ValidateResult {
  violations: ConcernViolation[];
}

/** Which concern file a merged-document path came from, by its first recognised member. */
const MEMBER_CONCERN: Record<string, ConcernName> = {
  title: 'api', anatomy: 'api', props: 'api', invalidPropCombinations: 'api', description: 'api',
  default: 'variants', variants: 'variants', elements: 'variants', layout: 'variants',
  slotContentExamples: 'examples', instanceExamples: 'examples', images: 'examples', slotContent: 'examples',
};

export function concernOfPath(violationPath: string): ConcernName | undefined {
  for (const segment of violationPath.split('/')) {
    const concern = MEMBER_CONCERN[segment];
    if (concern) return concern;
  }
  return undefined;
}

/**
 * Decide a split spec's conformance: each present concern document against its
 * own schema definition, then the rule catalogue over the merged whole.
 * Violation paths from the schema layer are relative to the concern document
 * they name; rule violations are relative to the merged document, with
 * `concern` attributed by the path's first recognised member.
 */
export function validateConcernSet(concerns: ConcernSet, options: ConcernSetOptions = {}): ConcernSetResult {
  const { specKind = 'component', ...ctx } = options;
  const violations: ConcernViolation[] = [];

  for (const concern of CONCERNS) {
    const doc = concerns[concern];
    if (doc === undefined) continue;
    const validate = validatorFor(CONCERN_TARGETS[specKind][concern]);
    if (!validate(doc)) {
      for (const err of validate.errors ?? []) {
        const { path, message } = describeAjvError(err);
        violations.push({ rule: 'schema', path, message: `${message} (${err.schemaPath})`, concern });
      }
    }
  }

  const merged = mergeConcerns(concerns);
  const kind = specKind === 'component' ? 'component' : 'composition-concern';
  for (const v of checkRules(merged, kind, ctx)) {
    violations.push({ ...v, concern: concernOfPath(v.path) });
  }

  violations.sort((a, b) =>
    (a.concern ?? '').localeCompare(b.concern ?? '') || a.path.localeCompare(b.path) || a.rule.localeCompare(b.rule));
  return { valid: violations.length === 0, violations };
}
