/**
 * What the bridge asks a plugin to do, and what it does with the answer.
 *
 * These are the wire protocol: a wrong message type or a dropped field means the plugin
 * silently does nothing, and the caller sees a timeout minutes later with no clue why. The
 * operations became testable when the registry, the tracker and the workspace resolver
 * started arriving as constructor arguments instead of being reached for at module scope.
 *
 * The socket is a fake that records what it was sent. Nothing here opens a port.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { ConnectionRegistry } from '../../../src/bridge/connections.js';
import { RequestTracker } from '../../../src/bridge/requestTracker.js';
import { BridgeOperations, type Sendable, type TrackedResult } from '../../../src/bridge/operations.js';
import type { ResolvedWorkspace } from '../../../src/bridge/workspace.js';

/** Records every payload, so a test can assert on the message the plugin would receive. */
class FakeSocket implements Sendable {
  readyState = 1;
  readonly sent: Array<Record<string, unknown>> = [];
  send(payload: string): void { this.sent.push(JSON.parse(payload)); }
  /** The one message sent so far, parsed. */
  get only(): Record<string, unknown> {
    if (this.sent.length !== 1) throw new Error(`expected 1 message, got ${this.sent.length}`);
    return this.sent[0];
  }
}

let dir: string;
let socket: FakeSocket;
let registry: ConnectionRegistry<FakeSocket>;
let requests: RequestTracker<TrackedResult>;
let ops: BridgeOperations<FakeSocket>;

/** Answer the request the operation just sent, as the plugin would. */
function reply(value: unknown) {
  const { requestId } = socket.only as { requestId: string };
  return requests.resolve(requestId, value as TrackedResult);
}

const workspace = (): ResolvedWorkspace => ({
  specsDir: path.join(dir, 'specs'),
  dataDir: path.join(dir, 'data'),
  aliases: ['library'],
});

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-ops-'));
  socket = new FakeSocket();
  registry = new ConnectionRegistry<FakeSocket>();
  registry.register('fileA', socket, 'Design System');
  requests = new RequestTracker<TrackedResult>();
  ops = new BridgeOperations<FakeSocket>({ registry, requests, resolveDirs: workspace });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(dir);
});

describe('the message each operation sends', () => {
  it('asks for the current page', async () => {
    const promise = ops.getCurrentPageId(registry.resolve('fileA'));
    expect(socket.only).toMatchObject({ type: 'getPageId' });
    reply('42:2');
    await expect(promise).resolves.toBe('42:2');
  });

  it('asks to generate from the selection, carrying conventions and settings', async () => {
    // Those travel with the request and govern how the plugin builds this one spec; the
    // plugin must not adopt them as its own settings.
    const conventions = { platforms: { figma: { naming: 'NONE' } } } as never;
    const settings = { spec: { keys: 'CAMEL' } } as never;
    const promise = ops.sendGenerateFromSelection('fileA', '43:2', conventions, settings);
    expect(socket.only).toMatchObject({ type: 'generateFromSelection', nodeId: '43:2', conventions, settings });
    reply({ success: true });
    await promise;
  });

  it('asks to inspect a component, by page and node', async () => {
    const promise = ops.sendInspectComponent('fileA', '42:2', '43:2');
    expect(socket.only).toMatchObject({ type: 'inspectComponent', pageId: '42:2', nodeId: '43:2' });
    reply({ success: true, elements: [] });
    await promise;
  });

  it('asks to annotate one page\'s components', async () => {
    const components = [{ nodeId: '43:2', title: 'checkbox', elements: [{ key: 'control', lines: ['role:checkbox'] }] }];
    const promise = ops.sendAnnotateElements('fileA', '42:2', components);
    expect(socket.only).toMatchObject({ type: 'annotateElements', pageId: '42:2', components });
    reply({ success: true, components: [] });
    await promise;
  });

  it('asks for the file\'s variables', async () => {
    const promise = ops.sendGetVariables('fileA');
    expect(socket.only).toMatchObject({ type: 'getVariables' });
    reply({ success: true });
    await promise;
  });

  it('asks to remove a node', async () => {
    const promise = ops.sendRemoveNode('99:9', 'fileA');
    expect(socket.only).toMatchObject({ type: 'removeNode', nodeId: '99:9' });
    reply({ success: true });
    await promise;
  });

  it('gives every request its own id, so answers cannot cross', async () => {
    const a = ops.sendGetVariables('fileA');
    const b = ops.sendGetVariables('fileA');
    const [first, second] = socket.sent as Array<{ requestId: string }>;
    expect(first.requestId).not.toBe(second.requestId);

    // Answer the second one only. The first must still be waiting.
    requests.resolve(second.requestId, { success: true, meta: undefined } as TrackedResult);
    await expect(b).resolves.toMatchObject({ success: true });
    expect(requests.has(first.requestId)).toBe(true);
    requests.resolve(first.requestId, { success: true } as TrackedResult);
    await a;
  });
});

describe('the answering connection names the file', () => {
  // The caller maps that key back to a source alias, so an operation that omitted it would
  // leave a multi-file session unable to tell which file answered.
  it('stamps fileKey onto an inspect result', async () => {
    const promise = ops.sendInspectComponent(undefined, '42:2', '43:2');
    reply({ success: true, elements: [] });
    await expect(promise).resolves.toMatchObject({ fileKey: 'fileA' });
  });

  it('stamps fileKey onto an annotate result', async () => {
    const promise = ops.sendAnnotateElements(undefined, '42:2', []);
    reply({ success: true, components: [] });
    await expect(promise).resolves.toMatchObject({ fileKey: 'fileA' });
  });

  it('stamps fileKey onto a variables result', async () => {
    const promise = ops.sendGetVariables();
    reply({ success: true });
    await expect(promise).resolves.toMatchObject({ fileKey: 'fileA' });
  });

  it('overrides a fileKey the plugin sent, because the connection is the authority', async () => {
    const promise = ops.sendGetVariables();
    reply({ success: true, fileKey: 'something-else' });
    await expect(promise).resolves.toMatchObject({ fileKey: 'fileA' });
  });
});

describe('resolving which connection to use', () => {
  it('refuses when no plugin is connected', async () => {
    const empty = new BridgeOperations<FakeSocket>({
      registry: new ConnectionRegistry<FakeSocket>(),
      requests,
      resolveDirs: workspace,
    });
    await expect(empty.sendGetVariables()).rejects.toThrow(/No plugin connected/);
  });

  it('requires a fileKey once more than one plugin is connected', async () => {
    registry.register('fileB', new FakeSocket(), 'Brand');
    await expect(ops.sendGetVariables()).rejects.toThrow();
  });

  it('sends to the named connection when several are open', async () => {
    const other = new FakeSocket();
    registry.register('fileB', other, 'Brand');
    const promise = ops.sendGetVariables('fileB');
    expect(socket.sent).toHaveLength(0);
    expect(other.only).toMatchObject({ type: 'getVariables' });
    requests.resolve((other.only as { requestId: string }).requestId, { success: true } as TrackedResult);
    await promise;
  });
});

describe('a request nobody answers', () => {
  it('rejects with the wait it was doing, rather than hanging', async () => {
    vi.useFakeTimers();
    try {
      const promise = ops.sendGetVariables('fileA');
      const assertion = expect(promise).rejects.toThrow(/Timed out waiting for getVariables-result/);
      await vi.advanceTimersByTimeAsync(60_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives a render far longer than a read, because one can take minutes', async () => {
    // A timeout shorter than the render discards a result the plugin actually produced.
    vi.useFakeTimers();
    try {
      await fs.outputFile(path.join(dir, 'specs', 'checkbox', 'api.yaml'), yaml.stringify({ title: 'Checkbox' }));
      await fs.outputFile(path.join(dir, 'data', 'cache', 'components.yaml'), yaml.stringify({ sources: {}, entries: {} }));
      const promise = ops.sendRender(path.join(dir, 'specs', 'checkbox', 'api.yaml'), '42:2', 'fileA');
      const assertion = expect(promise).rejects.toThrow();
      // Still pending at the read timeout; only gives up far later.
      await vi.advanceTimersByTimeAsync(60_000);
      await vi.advanceTimersByTimeAsync(300_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('sendRender', () => {
  async function workspaceWithSpec() {
    const specPath = path.join(dir, 'specs', 'checkbox', 'api.yaml');
    await fs.outputFile(specPath, yaml.stringify({
      components: { checkbox: { title: 'Checkbox', metadata: { settings: { spec: { keys: 'CAMEL' } } } } },
      metadata: { source: { nodeId: '43:2' } },
    }));
    for (const concern of ['components', 'styles', 'variables', 'icons']) {
      await fs.outputFile(path.join(dir, 'data', 'cache', `${concern}.yaml`), yaml.stringify({ sources: {}, entries: {} }));
    }
    return specPath;
  }

  it('sends the spec with every manifest a render needs', async () => {
    const specPath = await workspaceWithSpec();
    const promise = ops.sendRender(specPath, '42:2', 'fileA');
    expect(socket.only).toMatchObject({ type: 'renderComponent', pageId: '42:2' });
    // The four lookups the plugin resolves against. A missing one is a render that
    // silently cannot find a component, a glyph, a style or a token.
    expect(Object.keys(socket.only)).toEqual(expect.arrayContaining([
      'spec', 'instanceIdManifest', 'glyphIdManifest', 'stylesManifest', 'variablesManifest',
    ]));
    reply({ success: true, nodeId: '1:1' });
    await promise;
  });

  it('normalises a page id written with dashes', async () => {
    // Figma URLs carry `1462-365`; node ids are `1462:365`.
    const specPath = await workspaceWithSpec();
    const promise = ops.sendRender(specPath, '1462-365', 'fileA');
    expect(socket.only).toMatchObject({ pageId: '1462:365' });
    reply({ success: true });
    await promise;
  });

  it('asks the plugin for its current page when none is given', async () => {
    const specPath = await workspaceWithSpec();
    const promise = ops.sendRender(specPath, null, 'fileA');
    // First message is the page question; the render follows once it is answered.
    expect(socket.sent[0]).toMatchObject({ type: 'getPageId' });
    requests.resolve((socket.sent[0] as { requestId: string }).requestId, '42:2' as TrackedResult);
    await vi.waitFor(() => expect(socket.sent).toHaveLength(2));
    expect(socket.sent[1]).toMatchObject({ type: 'renderComponent', pageId: '42:2' });
    requests.resolve((socket.sent[1] as { requestId: string }).requestId, { success: true } as TrackedResult);
    await promise;
  });

  it('reports payload size and its own timings alongside the plugin result', async () => {
    const specPath = await workspaceWithSpec();
    const promise = ops.sendRender(specPath, '42:2', 'fileA');
    reply({ success: true, nodeId: '1:1' });
    const result = await promise;
    expect(result.payloadKB).toBeGreaterThanOrEqual(0);
    expect(result.bridgeTimings?.map((t) => t.label)).toEqual(expect.arrayContaining([
      'instance manifest', 'glyph manifest', 'styles manifest', 'variables manifest', 'plugin round-trip',
    ]));
  });

  it('accepts a spec passed in rather than read from disk', async () => {
    // `specs render` may hand over a spec it already parsed; the path is still needed to
    // resolve the workspace.
    const specPath = await workspaceWithSpec();
    const promise = ops.sendRender(specPath, '42:2', 'fileA', { components: { x: { title: 'Passed In' } } });
    expect((socket.only.spec as { components: Record<string, unknown> }).components).toHaveProperty('x');
    reply({ success: true });
    await promise;
  });

  it('names the spec it cannot read', async () => {
    await expect(ops.sendRender(path.join(dir, 'specs', 'nope.yaml'), '42:2', 'fileA'))
      .rejects.toThrow(/Error reading spec/);
  });

  it('refuses when a payload was fetched and its cache was never built', async () => {
    // Render resolves against the caches only. Rebuilding here would parse every fetched
    // payload — the per-render cost the caches exist to remove — and rendering against
    // data that no longer matches what was fetched binds specs to the wrong variables.
    const specPath = path.join(dir, 'specs', 'checkbox', 'api.yaml');
    await fs.outputFile(specPath, yaml.stringify({ title: 'Checkbox' }));
    // A fetched payload with no cache beside it. Without the payload there would be
    // nothing to validate against, which is the case below.
    await fs.outputJson(path.join(dir, 'data', 'library.file', 'manifest.json'), { sourceBytes: 10 });
    await expect(ops.sendRender(specPath, '42:2', 'fileA')).rejects.toThrow();
    expect(socket.sent).toHaveLength(0);
  });

  it('renders when nothing was fetched, because there is no cache to be stale against', async () => {
    // A cache is only missing relative to a payload. With no payload for an alias there is
    // nothing to validate, so render proceeds — and finds nothing to resolve, which it
    // reports as an unusable cache rather than refusing up front.
    const specPath = await workspaceWithSpec();
    await fs.remove(path.join(dir, 'data', 'cache'));
    const promise = ops.sendRender(specPath, '42:2', 'fileA');
    expect(socket.only).toMatchObject({ type: 'renderComponent' });
    reply({ success: true });
    await promise;
  });
});
