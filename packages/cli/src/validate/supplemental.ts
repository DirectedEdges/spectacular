// The supplemental.yaml sidecar's shape check. The contract is experimental and
// CLI-defined (see supplemental.schema.json's description); reference-level
// checks — entries citing anatomy elements and props that exist in api.yaml —
// arrive with the validator's move to specs-schema-core.

import { createRequire } from 'node:module';
import type { ValidateFunction } from 'ajv';
import supplementalSchema from './supplemental.schema.json';

const req = createRequire(import.meta.url);

let cached: ValidateFunction | undefined;

/** Compile the supplemental sidecar validator, once per process. */
export function supplementalValidator(): ValidateFunction {
  if (cached) return cached;
  const AjvExport = req('ajv');
  const Ajv = AjvExport.default ?? AjvExport;
  const ajv = new Ajv({ allErrors: true, strict: false });
  cached = ajv.compile(supplementalSchema) as ValidateFunction;
  return cached;
}
