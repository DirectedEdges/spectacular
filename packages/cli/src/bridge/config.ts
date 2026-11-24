// Bridge configuration constants and workspace resolution utilities.

import { existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';

export const WS_PORT = 9001;
export const HTTP_PORT = 9002;

/**
 * The server binds 127.0.0.1 (never all interfaces — see server.ts), so clients name
 * that address rather than `localhost`: macOS resolves `localhost` to ::1 first, and
 * Node 18's fetch does not fall back to the other address family — the request would
 * fail, or reach whatever else is squatting on the IPv6 loopback port.
 */
export const HTTP_BASE = `http://127.0.0.1:${HTTP_PORT}`;

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
