// The bridge pairing token: a shared secret proving a caller is this machine's user,
// not a web page. The server requires it on every HTTP request and on the plugin's
// WebSocket hello. It exists because header guards (requestGuards.ts) reason about
// what browsers send, and one browser shape they cannot refuse — a sandboxed iframe,
// whose origin serializes as `null` exactly like the Figma plugin's — can only be
// told apart by a credential the filesystem holds and a browser cannot reach.
//
// Persistent rather than per-run, deliberately: the attackers this excludes (web
// pages, other machines) cannot read the file whether it rotates or not, and a
// per-run token would demand a re-paste into the plugin after every bridge restart.
// Rotation is deleting the file and restarting the bridge.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomBytes, timingSafeEqual } from 'crypto';
import { homedir } from 'os';
import { join } from 'path';

export function bridgeTokenFile(specsHome: string = join(homedir(), '.specs')): string {
  return join(specsHome, 'bridge-token');
}

/** The stored token, or null when none has been created yet. Never creates. */
export function readBridgeToken(specsHome?: string): string | null {
  const file = bridgeTokenFile(specsHome);
  if (!existsSync(file)) return null;
  const token = readFileSync(file, 'utf8').trim();
  return token.length > 0 ? token : null;
}

/** The stored token, created on first use — owner-readable only. Server startup path. */
export function loadOrCreateToken(specsHome: string = join(homedir(), '.specs')): string {
  const existing = readBridgeToken(specsHome);
  if (existing) return existing;
  if (!existsSync(specsHome)) mkdirSync(specsHome, { recursive: true });
  const token = randomBytes(16).toString('hex');
  writeFileSync(bridgeTokenFile(specsHome), token, { encoding: 'utf8', mode: 0o600 });
  return token;
}

/** Constant-time comparison, so the check leaks nothing about the token through timing. */
export function tokenMatches(expected: string, presented: unknown): boolean {
  if (typeof presented !== 'string' || presented.length === 0) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
