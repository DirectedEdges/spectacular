/**
 * Git facts at bump time — commit, branch, tag — captured from the workspace's
 * repository. Bump-time capture, not generation-time. Every call degrades to
 * nulls outside a git repo; versioning never requires git.
 */

import { execFileSync } from 'child_process';
import type { LedgerGit } from '../types.js';

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}

export function captureGit(cwd: string): LedgerGit {
  return {
    commit: git(cwd, ['rev-parse', 'HEAD']),
    branch: git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
    tag: git(cwd, ['describe', '--tags', '--exact-match']),
  };
}

export function gitAuthor(cwd: string): string | null {
  return git(cwd, ['config', 'user.name']);
}

/**
 * Annotated library tag `v<version>`, message carrying the per-component
 * roll-up. Never pushed — pushing is a manual act.
 */
export function createAnnotatedTag(cwd: string, version: string, message: string): void {
  execFileSync('git', ['tag', '-a', `v${version}`, '-m', message], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
}

export function tagExists(cwd: string, version: string): boolean {
  return git(cwd, ['tag', '-l', `v${version}`]) === `v${version}`;
}
