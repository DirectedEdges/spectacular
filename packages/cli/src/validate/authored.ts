// Shape checks for the two authored documents beside a spec (ADR-118).
//
// Both contracts are published by `@directededges/specs-schema`, and the
// compiled validators come from `@directededges/specs-schema-core` — the same
// engine the concern documents use, so there is one ajv registry rather than
// two that could drift.
//
// Where the documents live is `utilities/authoredScopes.ts`, shared with the two
// analyzers that read the same files.

import { authoredValidator as coreAuthoredValidator, type ValidateFunction } from '@directededges/specs-schema-core';
import { AUTHORED_KINDS, type AuthoredKind } from '../utilities/authoredScopes.js';

export { AUTHORED_KINDS };
export type { AuthoredKind };
export {
  authoredFilesIn,
  authoredScopes,
  workspaceAuthoredFiles,
  type AuthoredFile,
  type AuthoredScope,
} from '../utilities/authoredScopes.js';

/** The compiled validator for one authored document kind. */
export function authoredValidator(kind: AuthoredKind): ValidateFunction {
  return coreAuthoredValidator(kind);
}
