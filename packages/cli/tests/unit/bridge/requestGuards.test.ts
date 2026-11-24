import { describe, it, expect } from 'vitest';
import { hostAllowed, wsOriginAllowed, httpRejection } from '../../../src/bridge/requestGuards.js';

describe('hostAllowed', () => {
  it('accepts loopback names with and without a port', () => {
    expect(hostAllowed('localhost')).toBe(true);
    expect(hostAllowed('localhost:9002')).toBe(true);
    expect(hostAllowed('127.0.0.1:9002')).toBe(true);
    expect(hostAllowed('[::1]:9002')).toBe(true);
    expect(hostAllowed('LOCALHOST:9002')).toBe(true);
  });

  it('refuses other hosts — the DNS rebinding shape', () => {
    expect(hostAllowed('evil.example:9002')).toBe(false);
    expect(hostAllowed('evil.example')).toBe(false);
    expect(hostAllowed('192.168.1.20:9002')).toBe(false);
    expect(hostAllowed(undefined)).toBe(false);
    expect(hostAllowed('')).toBe(false);
  });
});

describe('wsOriginAllowed', () => {
  it('admits the plugin handshake shapes', () => {
    expect(wsOriginAllowed(undefined)).toBe(true);
    expect(wsOriginAllowed('null')).toBe(true);
    expect(wsOriginAllowed('https://www.figma.com')).toBe(true);
    expect(wsOriginAllowed('https://figma.com')).toBe(true);
  });

  it('refuses web pages', () => {
    expect(wsOriginAllowed('https://evil.example')).toBe(false);
    expect(wsOriginAllowed('http://localhost:8080')).toBe(false);
    expect(wsOriginAllowed('https://notfigma.com')).toBe(false);
    expect(wsOriginAllowed('https://evilfigma.com')).toBe(false);
    expect(wsOriginAllowed('not a url')).toBe(false);
  });
});

describe('httpRejection', () => {
  const TOKEN = 'a'.repeat(32);
  const ok = { host: 'localhost:9002', 'content-type': 'application/json', 'x-bridge-token': TOKEN };

  it('lets the CLI client shape through', () => {
    expect(httpRejection(ok, 'POST', TOKEN)).toBeNull();
    expect(httpRejection({ host: '127.0.0.1:9002', 'x-bridge-token': TOKEN }, 'GET', TOKEN)).toBeNull();
  });

  it('accepts a charset parameter on the content type', () => {
    expect(httpRejection({ ...ok, 'content-type': 'application/json; charset=utf-8' }, 'POST', TOKEN)).toBeNull();
  });

  it('refuses any request carrying an Origin header', () => {
    expect(httpRejection({ ...ok, origin: 'https://evil.example' }, 'POST', TOKEN)).toEqual(
      { status: 403, error: 'Requests from web pages are not accepted.' });
    // Even a localhost origin: no web page has business here, so none is allowlisted.
    expect(httpRejection({ ...ok, origin: 'http://localhost:9002' }, 'GET', TOKEN)?.status).toBe(403);
  });

  it('refuses a non-loopback Host', () => {
    expect(httpRejection({ ...ok, host: 'rebind.evil.example:9002' }, 'POST', TOKEN)?.status).toBe(403);
    expect(httpRejection({ 'content-type': 'application/json', 'x-bridge-token': TOKEN }, 'POST', TOKEN)?.status).toBe(403);
  });

  it('refuses a missing or wrong pairing token', () => {
    expect(httpRejection({ host: 'localhost:9002', 'content-type': 'application/json' }, 'POST', TOKEN)?.status).toBe(401);
    expect(httpRejection({ ...ok, 'x-bridge-token': 'b'.repeat(32) }, 'POST', TOKEN)?.status).toBe(401);
    expect(httpRejection({ ...ok, 'x-bridge-token': '' }, 'GET', TOKEN)?.status).toBe(401);
  });

  it('refuses a POST without application/json — the no-preflight cross-site shape', () => {
    expect(httpRejection({ ...ok, 'content-type': 'text/plain' }, 'POST', TOKEN)?.status).toBe(415);
    expect(httpRejection({ host: 'localhost:9002', 'x-bridge-token': TOKEN }, 'POST', TOKEN)?.status).toBe(415);
  });

  it('does not require a content type on GET', () => {
    expect(httpRejection({ host: 'localhost:9002', 'x-bridge-token': TOKEN }, 'GET', TOKEN)).toBeNull();
  });
});
