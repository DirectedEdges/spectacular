#!/usr/bin/env node
// Bridge server — persistent WebSocket server for the Spectacular CLI bridge.
// Stays running until Ctrl+C (or SIGTERM from `specs bridge stop`). Accepts
// multiple renderComponent/generateFromSelection commands per session, and
// multiple simultaneously connected Figma files (each with its own plugin
// connection).
//
// Ports:
//   9001 — WebSocket, for plugin connections (ui.html) — one per open Figma file
//   9002 — HTTP, control endpoint for the CLI (`specs render` / `specs generate`) or scripts
//
// HTTP API:
//   POST http://localhost:9002/render
//   Body: { "specPath": "/abs/path/to/spec.yaml", "pageId": "1462-365", "fileKey": "..." }
//   fileKey is optional when exactly one plugin is connected; required (and
//   validated) when more than one is connected.
//   Response: { "success": true, "nodeId": "..." }  (round-trip spec read is
//   an explicit second call — POST /generate — not a render side effect)
//   POST http://localhost:9002/generate
//   Body: { "fileKey": "..." }  (fileKey optional under the same single-connection rule)
//   Generates a spec from the plugin's current Figma selection — no REST fetch needed.
//   Response: { "success": true, "nodeId": "...", "name": "...", "specData": {...} }
//   POST http://localhost:9002/variables
//   Body: { "fileKey": "..." }  (fileKey optional under the same single-connection rule)
//   Reads the connected file's variables via the Plugin API, shaped like the REST
//   variables/local response's meta — no REST call, no Enterprise plan needed.
//   Response: { "success": true, "fileKey": "...", "meta": { "variableCollections": {...}, "variables": {...} } }
//   POST http://localhost:9002/inspect
//   Body: { "pageId": "42:2", "nodeId": "43:2", "fileKey": "...", "conventions": {...}, "settings": {...} }
//   Describes a live component's anatomy elements, keyed the way the spec keys them, with
//   the annotations already standing on each. Read-only. pageId and nodeId come from the
//   spec's metadata.source; conventions/settings are needed for key derivation.
//   Response: { "success": true, "name": "Checkbox", "elements": [
//     { "key": "fieldLabel", "figmaName": "Field.Label", "type": "TEXT",
//       "nodes": [{ "variant": "checked=false, …", "nodeId": "42:6", "annotations": ["role:label"] }],
//       "signals": { "role": ["label"] } } ] }
//   POST http://localhost:9002/annotate
//   Body: { "pageId": "42:2", "components": [{ "nodeId": "43:2", "title": "checkbox",
//            "elements": [{ "key": "control", "lines": ["role:checkbox"] }] }],
//          "conventions": {...}, "settings": {...} }
//   Adds role annotations to components on one page. Elements are named by anatomy key,
//   never by node id — the plugin resolves each key against the live component at write
//   time. Appends; never assigns over an existing annotation, and refuses an element that
//   already carries a role on any variant.
//   Response: { "success": true, "components": [{ "title": "checkbox", "elements": [
//     { "key": "control", "nodeId": "42:4", "status": "applied" } ] }] }
//   GET  http://localhost:9002/status
//   Response: { "connections": [{ "fileKey": "...", "fileName": "...", "connected": true }] }
//
// CLI (one-shot render, then stays running):
//   node bridge-server.js [--workspace /path/to/workspace] --render path/to/spec.yaml [--pageId 1462-365]
//
// Workspace resolution (in order of precedence):
//   1. --workspace <path> CLI flag
//   2. WORKSPACE_DIR env var
//   3. Derived per-request from the specPath (walks up to find specs/ + data/ sibling dirs)
//   4. SPECS_DIR / DATA_DIR env vars as explicit overrides for non-standard layouts
//
// Multi-connection protocol:
//   Each plugin connection sends { type: 'hello', fileKey, fileName? } immediately
//   on connect. The server tracks connections in a Map keyed by fileKey — this
//   replaces a single "activeSocket" variable, which had a real bug: with only
//   one tracked socket, an older connection's close event would null out a
//   newer, still-live connection's reference. Every request (getPageId,
//   renderComponent) carries a generated requestId; the plugin must echo it
//   back on the matching result message, so responses route to the right
//   caller even with multiple connections and requests in flight.

import type { ResolvedConventions, ResolvedSettings } from '@directededges/specs-schema';
import { WebSocketServer, type WebSocket } from 'ws';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { isAbsolute } from 'path';
import { parse } from 'yaml';
import { WS_PORT, HTTP_PORT, DEFAULT_PAGE_ID } from './config.js';
import { ConnectionRegistry } from './connections.js';
import { RequestTracker } from './requestTracker.js';
import {
  resolveDirs as resolveWorkspaceDirs,
  type WorkspaceOverrides,
} from './workspace.js';
import {
  BridgeOperations,
  type TrackedResult, type DevStatusRequest,
  type RenderResult, type GenerateResult, type VariablesResult,
  type InspectResult, type AnnotateResult,
} from './operations.js';


// ── Startup workspace (optional) ──────────────────────────────────────────────
// If set, all requests use this workspace. If not set, workspace is derived per-request.

const workspaceIdx = process.argv.indexOf('--workspace');
const startupWorkspaceDir: string | null =
  process.env.WORKSPACE_DIR ??
  (workspaceIdx !== -1 ? process.argv[workspaceIdx + 1] : null);

if (startupWorkspaceDir) {
  console.log(`  Workspace : ${startupWorkspaceDir}`);
} else {
  console.log(`  Workspace : (derived per-request from spec path)`);
}

/**
 * The startup answers every request resolves against: the pinned workspace above, and
 * the SPECS_DIR / DATA_DIR overrides for a layout that does not put `specs/` and `data/`
 * side by side. Read once here, because they are a property of how this process was
 * started rather than of any one request.
 */
const workspaceOverrides: WorkspaceOverrides = {
  startupWorkspaceDir,
  envSpecsDir: process.env.SPECS_DIR ?? null,
  envDataDir: process.env.DATA_DIR ?? null,
};

const resolveDirs = (fromPath: string) => resolveWorkspaceDirs(fromPath, workspaceOverrides);

console.log(`\nSpectacular — CLI bridge`);
console.log(`  WebSocket : ws://localhost:${WS_PORT}  (plugin)`);
console.log(`  HTTP      : http://localhost:${HTTP_PORT}/render  (control)`);
console.log(`  Enable the CLI Bridge in the Figma plugin to connect.`);
console.log(`  Ctrl+C to stop.\n`);

// ── WebSocket server (plugin connections) ─────────────────────────────────────

const wss = new WebSocketServer({ port: WS_PORT });

// Keyed by Figma file key. One entry per connected plugin instance.
const registry = new ConnectionRegistry<WebSocket>();

// Pending requests keyed by a generated requestId, so responses route to the
// right caller regardless of which connection they came from.
const requests = new RequestTracker<TrackedResult>();

// What this server can ask a plugin to do. The registry, the tracker and the bound
// workspace resolver are handed over rather than reached for, so the operations can be
// exercised against a fake socket — see operations.ts.
const ops = new BridgeOperations<WebSocket>({ registry, requests, resolveDirs });

wss.on('connection', (ws: WebSocket) => {
  // This connection's fileKey isn't known until its 'hello' message arrives.
  let thisFileKey: string | null = null;
  console.log('Plugin socket opened, awaiting hello…');

  ws.on('message', (data: Buffer) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'hello') {
      thisFileKey = msg.fileKey as string;
      const fileName = msg.fileName as string | undefined;
      registry.register(thisFileKey, ws, fileName);
      console.log(`Plugin connected: ${thisFileKey}${fileName ? ` (${fileName})` : ''}`);
      return;
    }

    if (msg.type === 'pageId-result' || msg.type === 'renderComponent-result' || msg.type === 'generateFromSelection-result' || msg.type === 'removeNode-result' || msg.type === 'getVariables-result' || msg.type === 'inspectComponent-result' || msg.type === 'annotateElements-result') {
      const requestId = msg.requestId as string | undefined;
      if (!requestId) return; // no way to route this response

      if (msg.type === 'pageId-result') {
        requests.resolve(requestId, msg.pageId as string);
        return;
      }

      if (msg.type === 'annotateElements-result') {
        if (msg.success) {
          const components = msg.components as AnnotateResult['components'];
          const tally = { applied: 0, conflict: 0, unresolved: 0, unsupported: 0 } as Record<string, number>;
          for (const component of components ?? []) {
            for (const element of component.elements) tally[element.status] = (tally[element.status] ?? 0) + 1;
          }
          const parts = Object.entries(tally).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
          console.log(`✓ Annotated ${components?.length ?? 0} component(s) — ${parts.join(', ') || 'nothing to do'}`);
          requests.resolve(requestId, { success: true, components });
        } else {
          console.error(`✗ Annotate failed: ${msg.error}`);
          requests.resolve(requestId, { success: false, error: msg.error as string });
        }
        return;
      }

      if (msg.type === 'inspectComponent-result') {
        if (msg.success) {
          const elements = msg.elements as InspectResult['elements'];
          const annotated = (elements ?? []).filter((e) => (e.signals.role?.length ?? 0) > 0).length;
          console.log(`✓ Inspected ${msg.name ?? 'component'} — ${elements?.length ?? 0} elements, ${annotated} already carrying a role`);
          requests.resolve(requestId, { success: true, name: msg.name as string, elements });
        } else {
          console.error(`✗ Inspect failed: ${msg.error}`);
          requests.resolve(requestId, { success: false, error: msg.error as string });
        }
        return;
      }

      if (msg.type === 'getVariables-result') {
        if (msg.success) {
          const meta = msg.meta as VariablesResult['meta'];
          console.log(`✓ Variables read from plugin (${Object.keys(meta?.variables ?? {}).length} variables)`);
          requests.resolve(requestId, { success: true, meta });
        } else {
          console.error(`✗ Get variables failed: ${msg.error}`);
          requests.resolve(requestId, { success: false, error: msg.error as string });
        }
        return;
      }

      if (msg.type === 'generateFromSelection-result') {
        if (msg.success) {
          const nodeId = msg.nodeId as string;
          const name = msg.name as string | undefined;
          console.log(`✓ Generated from selection. nodeId: ${nodeId}`);
          requests.resolve(requestId, { success: true, nodeId, name, specData: msg.specData ?? null });
        } else {
          console.error(`✗ Generate from selection failed: ${msg.error}`);
          requests.resolve(requestId, { success: false, error: msg.error as string });
        }
        return;
      }

      // renderComponent-result
      if (msg.success) {
        const nodeId = msg.nodeId as string;
        const warnings = Array.isArray(msg.warnings) && msg.warnings.length > 0 ? (msg.warnings as string[]) : undefined;
        console.log(`✓ Rendered in Figma. nodeId: ${nodeId}`);
        for (const w of warnings ?? []) console.warn(`  ⚠ ${w}`);
        const timings = msg.timings as RenderResult['timings'];
        requests.resolve(requestId, { success: true, nodeId, ...(warnings ? { warnings } : {}), ...(timings ? { timings } : {}) });
      } else {
        console.error(`✗ Render failed: ${msg.error}`);
        requests.resolve(requestId, { success: false, error: msg.error as string });
      }
    }
  });

  ws.on('close', () => {
    if (thisFileKey) {
      registry.unregister(thisFileKey);
      console.log(`Plugin disconnected: ${thisFileKey}`);
    } else {
      console.log('Plugin socket closed before hello.');
    }
  });

  ws.on('error', (e: Error) => console.error('Socket error:', e.message));
});

wss.on('error', (e: NodeJS.ErrnoException) => {
  console.error(`WebSocket server error: ${e.message}`);
  if (e.code === 'EADDRINUSE') console.error(`Port ${WS_PORT} already in use.`);
  process.exit(1);
});

// ── HTTP control server ───────────────────────────────────────────────────────

/** Callers prefix what they print with "Error: ", so report the bare message. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * A request this server will not act on, as opposed to one that failed while it tried.
 * `withJsonBody` answers it 400; anything else is a 500.
 */
class BadRequest extends Error {}

/**
 * Read a JSON body, hand it to one operation, and answer with whatever comes back.
 *
 * Every endpoint below used to carry its own copy of this: an accumulator, a parse
 * guarded by try/catch, and the two response branches — five near-identical blocks whose
 * only differences were the variable name and which operation ran. The envelope is the
 * same for all of them, so it lives here and each endpoint is left saying what it needs
 * and what it calls.
 *
 * A handler reports a bad request by throwing `BadRequest`, which is the one thing the
 * previous shape did inline with an early `return` — and the reason it could not be
 * factored out before.
 */
function withJsonBody<P>(
  req: IncomingMessage,
  res: ServerResponse,
  handle: (params: P) => Promise<unknown>,
): void {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let params: P;
    try {
      params = (body ? JSON.parse(body) : {}) as P;
    } catch {
      respond(res, 400, { success: false, error: 'Invalid JSON body.' });
      return;
    }
    // `Promise.resolve().then(…)` rather than calling `handle` directly: a validator that
    // throws does so synchronously, and a synchronous throw inside this listener escapes
    // before any `.catch` is attached — which takes the whole server down with it rather
    // than answering 400. Wrapping turns it into a rejection, so a handler is free to
    // throw or to reject and neither can kill the process.
    Promise.resolve()
      .then(() => handle(params))
      .then((result) => respond(res, 200, result))
      .catch((err) => respond(
        res,
        err instanceof BadRequest ? 400 : 500,
        { success: false, error: errorMessage(err) },
      ));
  });
}

function respond(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const http = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/status') {
    respond(res, 200, { connections: registry.list() });
    return;
  }

  if (req.method === 'POST' && req.url === '/generate') {
    type P = { fileKey?: string; nodeId?: string; conventions?: ResolvedConventions; settings?: ResolvedSettings; remove?: boolean };
    withJsonBody<P>(req, res, async (p) => {
      const result = await ops.sendGenerateFromSelection(p.fileKey, p.nodeId, p.conventions, p.settings);
      // The spec is in hand before the node goes, so a failed removal cannot cost the read.
      if (p.remove && result.success && result.nodeId) {
        try { await ops.sendRemoveNode(result.nodeId, p.fileKey); } catch { /* reported by the caller's next read */ }
      }
      return result;
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/variables') {
    withJsonBody<{ fileKey?: string }>(req, res, (p) => ops.sendGetVariables(p.fileKey));
    return;
  }

  if (req.method === 'POST' && req.url === '/inspect') {
    type P = { fileKey?: string; pageId?: string; nodeId?: string; conventions?: ResolvedConventions; settings?: ResolvedSettings };
    withJsonBody<P>(req, res, (p) => {
      if (!p.pageId || !p.nodeId) {
        throw new BadRequest("pageId and nodeId are required — both come from the spec's metadata.source.");
      }
      return ops.sendInspectComponent(p.fileKey, p.pageId, p.nodeId, p.conventions, p.settings);
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/annotate') {
    type P = { fileKey?: string; pageId?: string; components?: unknown; conventions?: ResolvedConventions; settings?: ResolvedSettings };
    withJsonBody<P>(req, res, (p) => {
      if (!p.pageId || !Array.isArray(p.components) || p.components.length === 0) {
        throw new BadRequest('pageId and a non-empty components array are required.');
      }
      return ops.sendAnnotateElements(p.fileKey, p.pageId, p.components, p.conventions, p.settings);
    });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/render') {
    respond(res, 405, { error: 'Only POST /render, POST /generate, POST /variables, POST /inspect, POST /annotate, or GET /status is supported.' });
    return;
  }

  type RenderParams = { specPath?: string; spec?: Record<string, unknown>; pageId?: string | null; fileKey?: string; overwrite?: boolean; conventions?: ResolvedConventions; settings?: ResolvedSettings; devStatus?: DevStatusRequest };
  withJsonBody<RenderParams>(req, res, (p) => {
    const { specPath: specArg, spec: preParsedSpec, pageId = null, fileKey, overwrite, conventions, settings, devStatus } = p;
    // Absolute, because workspace derivation walks up from a real path. The previous
    // shape tested `!specArg` twice, the second time unreachably.
    if (!specArg) throw new BadRequest('specPath is required.');
    if (!isAbsolute(specArg)) {
      throw new BadRequest('specPath must be absolute when no startup workspace is configured.');
    }
    return ops.sendRender(specArg, pageId, fileKey, preParsedSpec, overwrite, conventions, settings, devStatus);
  });
});

http.listen(HTTP_PORT);
http.on('error', (e: NodeJS.ErrnoException) => {
  console.error(`HTTP server error: ${e.message}`);
  if (e.code === 'EADDRINUSE') console.error(`Port ${HTTP_PORT} already in use.`);
  process.exit(1);
});

// ── CLI: --render flag ────────────────────────────────────────────────────────
//
// node bridge-server.js --render /abs/path/to/spec.yaml [--pageId 1462-365]
// Debug shortcut — only works when exactly one plugin is connected.

const renderIdx = process.argv.indexOf('--render');
if (renderIdx !== -1) {
  const specArg = process.argv[renderIdx + 1];
  const pageIdIdx = process.argv.indexOf('--pageId');
  const rawPageId = pageIdIdx !== -1 ? process.argv[pageIdIdx + 1] : DEFAULT_PAGE_ID;

  if (!specArg) { console.error('--render requires a spec path'); process.exit(1); }
  if (!isAbsolute(specArg)) { console.error('--render path must be absolute'); process.exit(1); }

  const tryRender = (): void => {
    if (registry.size > 0) {
      ops.sendRender(specArg, rawPageId)
        .catch((e) => console.error((e as Error).message));
    } else {
      console.log('Waiting for plugin to connect…');
      setTimeout(tryRender, 1000);
    }
  };
  setTimeout(tryRender, 500);
}
