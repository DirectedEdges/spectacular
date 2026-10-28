// Bridge configuration constants and workspace resolution utilities.

import { existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';

export const WS_PORT = 9001;
export const HTTP_PORT = 9002;

// Default render target page — the "Specs 2 Testing" render page.
// Named for the page as it exists in the Figma file; rename there first.
// Override per-request via body.pageId or CLI --pageId.
export const DEFAULT_PAGE_ID = '1462-365';

/**
 * Walk up from `fromPath` to find the workspace home directory:
 * the nearest ancestor that contains both a `specs/` and `data/` subdirectory.
 *
 * Returns the workspace home path, or null if no such directory is found.
 */
export function resolveWorkspaceDir(fromPath: string): string | null {
  let dir = existsSync(fromPath) && statSync(fromPath).isDirectory()
    ? fromPath
    : dirname(fromPath);

  while (true) {
    if (existsSync(resolve(dir, 'specs')) && existsSync(resolve(dir, 'data'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null; // filesystem root
    dir = parent;
  }
}
