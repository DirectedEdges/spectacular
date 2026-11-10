// Shape checks for the two authored documents beside a spec (ADR-118).
//
// Both contracts are published by `@directededges/specs-schema` now. This file
// held a private copy of the supplemental schema while the shape was still being
// proved; that copy is gone, so there is one definition of each document rather
// than two that could drift.
//
// Each published schema is self-contained — no `$ref` crosses a file — so each
// compiles on its own with nothing to register alongside it.
//
// Where the documents live is `utilities/authoredScopes.ts`, shared with the two
// analyzers that read the same files.

import fs from 'fs-extra';
import { createRequire } from 'node:module';
import type { ValidateFunction } from 'ajv';
import { AUTHORED_KINDS, type AuthoredKind } from '../utilities/authoredScopes.js';

const req = createRequire(import.meta.url);

export { AUTHORED_KINDS };
export type { AuthoredKind };
export {
  authoredFilesIn,
  authoredScopes,
  workspaceAuthoredFiles,
  type AuthoredFile,
  type AuthoredScope,
} from '../utilities/authoredScopes.js';

const cached: Partial<Record<AuthoredKind, ValidateFunction>> = {};

/** Compile one authored document's validator, once per process. */
export function authoredValidator(kind: AuthoredKind): ValidateFunction {
  const hit = cached[kind];
  if (hit) return hit;

  // ajv ships CJS; require sidesteps the ESM default-interop difference between
  // the esbuild bundle and vitest. Same reasoning as schemas.ts.
  const AjvExport = req('ajv');
  const Ajv = AjvExport.default ?? AjvExport;
  const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });

  const file = req.resolve(`@directededges/specs-schema/schema/${kind}`);
  const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
  const compiled = ajv.compile(schema) as ValidateFunction;
  cached[kind] = compiled;
  return compiled;
}
