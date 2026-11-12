// Where the authored documents live outside a spec folder (ADR-118).
//
// `supplemental.yaml` and `guidelines.yaml` are written at three scopes. Two of
// them — the catalogue and each foundation concern — sit outside the per-spec
// folders, so nothing that walks specs ever visits them. Both the validator and
// the two authored-input analyzers need the same list, and each had its own copy
// of the walk until this file existed.
//
// The scopes are additive: an entry at a broader scope applies alongside one at
// a narrower scope rather than being overridden (DSPEC-56), so every consumer
// treats them identically and only the label differs.

import fs from 'fs-extra';
import path from 'path';
import { COMPONENTS_DIR, FOUNDATIONS_DIR } from './specsLayout.js';

/** The two authored document kinds, and the filename each is written as. */
export type AuthoredKind = 'supplemental' | 'guidelines';

export const AUTHORED_KINDS: readonly AuthoredKind[] = ['supplemental', 'guidelines'];

/** One directory that may hold authored documents, and how to name it in output. */
export interface AuthoredScope {
  /** Absolute path to the directory. */
  dir: string;
  /** Specs-relative label, used as the spec name in a finding or a report row. */
  label: string;
}

/** One authored document found on disk. */
export interface AuthoredFile extends AuthoredScope {
  /** Absolute path to the file. */
  file: string;
  kind: AuthoredKind;
  /**
   * How to name the file in output: the scope label plus the filename. For a
   * per-spec document the scope label is empty, so this is just
   * `supplemental.yaml` — the spec name is reported separately and prefixing it
   * twice reads as a path that does not exist.
   */
  fileLabel: string;
}

/**
 * The authored scopes outside the per-spec folders, in reading order: the
 * catalogue first, then one per foundation concern directory.
 *
 * A directory that does not exist is simply absent from the list — most
 * workspaces have no catalogue-scope document and few foundation concerns, and
 * their absence is ordinary rather than a gap.
 */
export function authoredScopes(specsRoot: string): AuthoredScope[] {
  const scopes: AuthoredScope[] = [];

  const catalogue = path.join(specsRoot, COMPONENTS_DIR);
  if (fs.existsSync(catalogue)) {
    scopes.push({ dir: catalogue, label: `${COMPONENTS_DIR}/` });
  }

  const foundations = path.join(specsRoot, FOUNDATIONS_DIR);
  if (fs.existsSync(foundations)) {
    for (const entry of fs.readdirSync(foundations).sort()) {
      const dir = path.join(foundations, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
      scopes.push({ dir, label: `${FOUNDATIONS_DIR}/${entry}/` });
    }
  }

  return scopes;
}

/** Whichever of the two documents exist in one directory. */
export function authoredFilesIn(scope: AuthoredScope): AuthoredFile[] {
  const found: AuthoredFile[] = [];
  if (!fs.existsSync(scope.dir)) return found;
  for (const kind of AUTHORED_KINDS) {
    for (const ext of ['yaml', 'yml'] as const) {
      const file = path.join(scope.dir, `${kind}.${ext}`);
      if (!fs.existsSync(file)) continue;
      found.push({ ...scope, file, kind, fileLabel: `${scope.label}${kind}.${ext}` });
      break;
    }
  }
  return found;
}

/** Every authored document outside the per-spec folders. */
export function workspaceAuthoredFiles(specsRoot: string): AuthoredFile[] {
  return authoredScopes(specsRoot).flatMap(authoredFilesIn);
}
