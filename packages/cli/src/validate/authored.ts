// Shape checks for the two authored documents beside a spec (ADR-118).
//
// Both contracts are published by `@directededges/specs-schema` now. This file
// held a private copy of the supplemental schema while the shape was still being
// proved; that copy is gone, so there is one definition of each document rather
// than two that could drift.
//
// Each published schema is self-contained — no `$ref` crosses a file — so each
// compiles on its own with nothing to register alongside it.

import fs from 'fs-extra';
import path from 'path';
import { createRequire } from 'node:module';
import type { ValidateFunction } from 'ajv';

const req = createRequire(import.meta.url);

/** The documents this module checks. Each is authored as `<kind>.yaml`. */
export type AuthoredKind = 'supplemental' | 'guidelines';

export const AUTHORED_KINDS: readonly AuthoredKind[] = ['supplemental', 'guidelines'];

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

/** Where an authored document may be written, and what each path means. */
export interface AuthoredLocation {
  /** Absolute path to the file. */
  file: string;
  /** The document kind the file must validate against. */
  kind: AuthoredKind;
  /** Workspace-relative path, for reporting. */
  label: string;
}

/** `supplemental.yaml` or `guidelines.yaml` in one directory, whichever exist. */
export function authoredFilesIn(dir: string, label: string): AuthoredLocation[] {
  const found: AuthoredLocation[] = [];
  if (!fs.existsSync(dir)) return found;
  for (const kind of AUTHORED_KINDS) {
    for (const ext of ['yaml', 'yml'] as const) {
      const file = path.join(dir, `${kind}.${ext}`);
      if (!fs.existsSync(file)) continue;
      found.push({ file, kind, label: `${label}${kind}.${ext}` });
      break;
    }
  }
  return found;
}

/**
 * Every authored document in a spec tree outside the per-component folders:
 * the catalogue scope (`components/`) and one directory per foundation concern
 * (`foundations/<concern>/`). Per-component documents are found by the spec
 * walk in `run.ts`, which is already visiting those folders.
 *
 * All three scopes are additive — an entry at one does not override an entry at
 * another (DSPEC-56) — so validation treats them identically and only the label
 * differs.
 */
export function workspaceAuthoredFiles(specsDir: string): AuthoredLocation[] {
  const found: AuthoredLocation[] = [
    ...authoredFilesIn(path.join(specsDir, 'components'), 'components/'),
  ];

  const foundationsDir = path.join(specsDir, 'foundations');
  if (fs.existsSync(foundationsDir)) {
    for (const entry of fs.readdirSync(foundationsDir).sort()) {
      const dir = path.join(foundationsDir, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
      found.push(...authoredFilesIn(dir, `foundations/${entry}/`));
    }
  }

  return found;
}
