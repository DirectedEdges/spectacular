import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'http';
import { once } from 'events';
import { figmaFetch, FirstByteTimeoutError } from '../../../src/commands/fetch.js';

/**
 * Figma builds a file payload before sending any of it, so a healthy request can
 * sit silent for minutes. The deadline covers only that silence — a transfer that
 * has started is making progress and must not be cut off, however slow it is.
 *
 * Both halves are exercised against a local server that controls exactly when
 * headers and body bytes are released.
 */
describe('figmaFetch first-byte deadline', () => {
  let server: Server | undefined;

  afterEach(async () => {
    server?.closeAllConnections?.();
    if (server) { server.close(); await once(server, 'close').catch(() => {}); }
    server = undefined;
  });

  async function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
    server = createServer(handler);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    return `http://127.0.0.1:${address.port}/`;
  }

  it('gives up when no headers arrive, naming the wait it allowed', async () => {
    // Accepts the socket and never responds — the shape of a build that never finishes.
    const url = await listen(() => { /* deliberately silent */ });

    await expect(figmaFetch(url, 'token', 150)).rejects.toThrow(FirstByteTimeoutError);
    await expect(figmaFetch(url, 'token', 150)).rejects.toThrow(/did not start sending within/);
  });

  it('reports the deadline it was given, so the message can quote it', async () => {
    const url = await listen(() => { /* deliberately silent */ });
    const error = await figmaFetch(url, 'token', 120).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FirstByteTimeoutError);
    expect((error as FirstByteTimeoutError).waitedMs).toBe(120);
  });

  it('does not cut off a body that keeps arriving past the deadline', async () => {
    // Headers immediately, then bytes dribbling out well past the deadline.
    const url = await listen((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"a":');
      setTimeout(() => res.end('1}'), 250);
    });

    const result = await figmaFetch(url, 'token', 100);
    expect(result.status).toBe(200);
    const chunks: string[] = [];
    const reader = result.stream!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value).toString('utf8'));
    }
    expect(chunks.join('')).toBe('{"a":1}');
  });

  it('passes a non-200 through as a body rather than timing out', async () => {
    const url = await listen((_req, res) => {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"err":"Not found"}');
    });

    const result = await figmaFetch(url, 'token', 2000);
    expect(result.status).toBe(404);
    expect(result.body).toContain('Not found');
    expect(result.stream).toBeNull();
  });

  it('lets a real connection error through unchanged, not as a timeout', async () => {
    // Nothing listening on this port, so the connection is refused outright.
    const error = await figmaFetch('http://127.0.0.1:1/', 'token', 5000).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(FirstByteTimeoutError);
  });
});
