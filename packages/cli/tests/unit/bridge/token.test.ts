import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { loadOrCreateToken, readBridgeToken, bridgeTokenFile, tokenMatches } from '../../../src/bridge/token.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-token-'));
});

afterEach(async () => {
  await fs.remove(dir);
});

describe('loadOrCreateToken', () => {
  it('creates a 32-hex-character token readable only by the owner', async () => {
    const token = loadOrCreateToken(dir);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    const stat = await fs.stat(bridgeTokenFile(dir));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('returns the same token on every subsequent start', () => {
    const first = loadOrCreateToken(dir);
    expect(loadOrCreateToken(dir)).toBe(first);
  });

  it('creates the directory when it does not exist yet', () => {
    const fresh = path.join(dir, 'nested', '.specs');
    expect(loadOrCreateToken(fresh)).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('readBridgeToken', () => {
  it('returns null when no token exists, without creating one', async () => {
    expect(readBridgeToken(dir)).toBeNull();
    expect(await fs.pathExists(bridgeTokenFile(dir))).toBe(false);
  });

  it('trims whitespace and treats an empty file as absent', async () => {
    await fs.writeFile(bridgeTokenFile(dir), '  abc123  \n');
    expect(readBridgeToken(dir)).toBe('abc123');
    await fs.writeFile(bridgeTokenFile(dir), '\n');
    expect(readBridgeToken(dir)).toBeNull();
  });
});

describe('tokenMatches', () => {
  it('matches only the exact token string', () => {
    expect(tokenMatches('secret', 'secret')).toBe(true);
    expect(tokenMatches('secret', 'Secret')).toBe(false);
    expect(tokenMatches('secret', 'secret2')).toBe(false);
  });

  it('refuses non-string and empty presentations', () => {
    expect(tokenMatches('secret', undefined)).toBe(false);
    expect(tokenMatches('secret', null)).toBe(false);
    expect(tokenMatches('secret', 42)).toBe(false);
    expect(tokenMatches('secret', '')).toBe(false);
  });
});
