// The operations the bridge performs over the WebSocket: one method per message type the
// plugin answers.
//
// Extracted from server.ts, where the header above them read "Shared render logic" — true
// when render was the only operation, and false once inspect, annotate, variables and
// generate joined it. A label that stops being true is a sign of a file absorbing things.
//
// The connection registry, the request tracker and the workspace resolver arrive as
// constructor arguments rather than module singletons, so these can be exercised against
// a fake socket. Nothing here opens a port.

import type { ResolvedConventions, ResolvedSettings } from '@directededges/specs-schema';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import type { ConnectionRegistry, Connection, ConnectionLike } from './connections.js';
import type { RequestTracker } from './requestTracker.js';
import type { RenderRequestBody } from './client.js';
import type { ResolvedWorkspace } from './workspace.js';
import {
  buildManifest, buildGlyphManifest, buildStylesManifest, buildVariablesManifest,
} from './manifests.js';
import { validateCache, describeProblems } from '../cache/cache.js';

/** The Dev Mode status a render request may carry — the bridge relays it, it does not
 *  derive it. `RenderCommand` reads it from the workspace scan manifest. */
export type DevStatusRequest = RenderRequestBody['devStatus'];

export interface RenderResult {
  success: boolean;
  nodeId?: string;
  error?: string;
  /** Phase durations reported by the plugin render (see figma-from-specs Timings.ts). */
  timings?: { total: number; phases: Array<{ label: string; ms: number; count: number }> };
  /** Phase durations measured here, before and around the plugin round-trip. */
  bridgeTimings?: Array<{ label: string; ms: number }>;
  /** Size of the render payload sent over the socket, in KB. */
  payloadKB?: number;
}

export interface GenerateResult {
  success: boolean;
  nodeId?: string;
  name?: string;
  specData?: unknown;
  error?: string;
}

/** The connected file's variables, read by the plugin and shaped like the REST
 *  variables/local response's `meta` — see bridge/client.ts GetVariablesResponse. */
export interface VariablesResult {
  success: boolean;
  fileKey?: string;
  meta?: { variableCollections: Record<string, unknown>; variables: Record<string, unknown> };
  error?: string;
}

/** The outcome of adding role annotations to one page's components —
 *  see bridge/client.ts AnnotateResponse. */
export interface AnnotateResult {
  success: boolean;
  fileKey?: string;
  components?: Array<{
    title: string;
    elements: Array<{ key: string; nodeId?: string; status: string; detail?: string }>;
  }>;
  error?: string;
}

/** A live component's anatomy elements, keyed as the spec keys them —
 *  see bridge/client.ts InspectResponse for the shape and why each field is there. */
export interface InspectResult {
  success: boolean;
  fileKey?: string;
  name?: string;
  elements?: Array<{
    key: string;
    figmaName: string;
    type: string;
    nodes: Array<{ variant?: string; nodeId: string; annotations: string[] }>;
    signals: { role?: string[]; action?: string[] };
  }>;
  error?: string;
}

/** Everything a tracked request can resolve to. */
export type TrackedResult =
  | string | RenderResult | GenerateResult | VariablesResult | InspectResult | AnnotateResult;

/**
 * The minimum a socket must do for these operations — a real `ws`, or a fake.
 *
 * Extends the registry's own constraint rather than standing beside it: a socket these
 * operations use has to be one the registry will hold *and* one that can be sent to.
 */
export interface Sendable extends ConnectionLike {
  send(payload: string): void;
}

export interface OperationDeps<S extends Sendable> {
  registry: ConnectionRegistry<S>;
  requests: RequestTracker<TrackedResult>;
  /** Already bound to this server's startup overrides — see workspace.ts. */
  resolveDirs: (fromPath: string) => ResolvedWorkspace;
}

export class BridgeOperations<S extends Sendable> {
  private readonly registry: ConnectionRegistry<S>;
  private readonly requests: RequestTracker<TrackedResult>;
  private readonly resolveDirs: (fromPath: string) => ResolvedWorkspace;

  constructor(deps: OperationDeps<S>) {
    this.registry = deps.registry;
    this.requests = deps.requests;
    this.resolveDirs = deps.resolveDirs;
  }

  /**
   * Ask a specific connection's plugin for the current Figma page ID.
   */
  getCurrentPageId(conn: Connection<S>): Promise<string> {
    const { requestId, promise } = this.requests.create(5000, 'Timed out waiting for pageId-result.');
    conn.ws.send(JSON.stringify({ type: 'getPageId', requestId }));
    return promise as Promise<string>;
  }

  /** Testing utility: delete a rendered node so a catalogue sweep leaves the page as it found it. */
  async sendRemoveNode(nodeId: string, fileKey?: string): Promise<{ success: boolean; error?: string }> {
    const conn = this.registry.resolve(fileKey);
    const { requestId, promise } = this.requests.create(30000, 'Timed out waiting for removeNode-result.');
    conn.ws.send(JSON.stringify({ type: 'removeNode', requestId, nodeId }));
    return promise as Promise<{ success: boolean; error?: string }>;
  }

  /**
   * Ask a connection's plugin to describe a live component's anatomy elements.
   *
   * Read-only, and the companion to annotating by anatomy key rather than by node id: the
   * plugin traverses the component set and keys every element the way the reader does, so a
   * caller can name `control` instead of a node id that a layer rebuild would invalidate.
   * The annotations already standing on each element come back with it, which is what tells
   * a caller a role is authored here already.
   *
   * `conventions`/`settings` travel with the request because key derivation depends on them
   * — the same reason `generateFromSelection` carries them. The plugin must not adopt them
   * as its own settings.
   */
  async sendInspectComponent(
    fileKey: string | undefined,
    pageId: string,
    nodeId: string,
    conventions?: ResolvedConventions,
    settings?: ResolvedSettings,
  ): Promise<InspectResult> {
    const conn = this.registry.resolve(fileKey);
    const { requestId, promise } = this.requests.create(60000, 'Timed out waiting for inspectComponent-result.');
    conn.ws.send(JSON.stringify({ type: 'inspectComponent', requestId, pageId, nodeId, conventions, settings }));
    const result = await (promise as Promise<InspectResult>);
    return { ...result, fileKey: conn.fileKey };
  }

  /**
   * Ask a connection's plugin to add role annotations to components on one page.
   *
   * The one mutating operation besides render, and the narrowest possible: it appends an
   * annotation and touches nothing else. Elements are named by anatomy key, and the plugin
   * resolves each key against the live component at write time, so no node id travels and
   * there is no stale-snapshot failure to detect.
   *
   * One page per call. A page is the unit a reviewer can watch and stop at, and the plugin
   * has to load a page to address its subtree, so batching across pages would load the whole
   * file to no purpose.
   */
  async sendAnnotateElements(
    fileKey: string | undefined,
    pageId: string,
    components: unknown[],
    conventions?: ResolvedConventions,
    settings?: ResolvedSettings,
  ): Promise<AnnotateResult> {
    const conn = this.registry.resolve(fileKey);
    const { requestId, promise } = this.requests.create(120000, 'Timed out waiting for annotateElements-result.');
    conn.ws.send(JSON.stringify({ type: 'annotateElements', requestId, pageId, components, conventions, settings }));
    const result = await (promise as Promise<AnnotateResult>);
    return { ...result, fileKey: conn.fileKey };
  }

  /** Ask a connection's plugin for the file's variables, shaped like the REST payload's meta. */
  async sendGetVariables(fileKey?: string): Promise<VariablesResult> {
    const conn = this.registry.resolve(fileKey);
    const { requestId, promise } = this.requests.create(60000, 'Timed out waiting for getVariables-result.');
    conn.ws.send(JSON.stringify({ type: 'getVariables', requestId }));
    const result = await (promise as Promise<VariablesResult>);
    // The answering connection names the file — the caller maps it to a source alias.
    return { ...result, fileKey: conn.fileKey };
  }

  /**
   * Ask a connection's plugin to generate a spec from its current Figma selection, or
   * from an explicit nodeId — the plugin selects that node first.
   */
  async sendGenerateFromSelection(fileKey?: string, nodeId?: string, conventions?: ResolvedConventions, settings?: ResolvedSettings): Promise<GenerateResult> {
    const conn = this.registry.resolve(fileKey);
    const { requestId, promise } = this.requests.create(60000, 'Timed out waiting for generateFromSelection-result.');
    // `conventions`/`settings` travel with the request and govern how the plugin builds
    // this one spec. The plugin must not adopt them as its own settings.
    conn.ws.send(JSON.stringify({ type: 'generateFromSelection', requestId, nodeId, conventions, settings }));
    return promise as Promise<GenerateResult>;
  }

  /**
   * Send a single renderComponent message over the WebSocket and wait for the result.
   */
  async sendRender(specPath: string, rawPageId: string | null, fileKey?: string, preParsedSpec?: Record<string, unknown>, overwrite?: boolean, conventions?: ResolvedConventions, settings?: ResolvedSettings, devStatus?: DevStatusRequest): Promise<RenderResult> {
    const conn = this.registry.resolve(fileKey);

    let spec: Record<string, unknown>;
    if (preParsedSpec) {
      spec = preParsedSpec;
    } else {
      try {
        spec = parse(readFileSync(specPath, 'utf8'));
      } catch (e) {
        throw new Error(`Error reading spec: ${(e as Error).message}`);
      }
    }

    const dirs = this.resolveDirs(specPath);
    const { specsDir, dataDir, aliases, glyphs } = dirs;

    // Render resolves against the caches only. A missing or stale cache is fatal rather
    // than rebuilt here: rebuilding parses every fetched payload, which is exactly the
    // per-render cost the caches exist to remove — and silently rendering against data
    // that no longer matches what was fetched binds specs to the wrong variables.
    const problems = validateCache({ dataDir, aliases, glyphs });
    if (problems.length > 0) throw new Error(describeProblems(problems));

    const bridgeTimings: Array<{ label: string; ms: number }> = [];
    const timed = <T>(label: string, fn: () => T): T => {
      const start = Date.now();
      try { return fn(); } finally { bridgeTimings.push({ label, ms: Date.now() - start }); }
    };

    // A spec generated since the conventions/settings split (ADR-071) records its key
    // format at `metadata.settings.spec.keys`; older specs carry `metadata.config.format.keys`.
    // Read the new key first and fall back so pre-split specs still render.
    type SpecMeta = { settings?: { spec?: { keys?: string } }; config?: { format?: { keys?: string } } };
    const keysOf = (m?: SpecMeta): string | undefined => m?.settings?.spec?.keys ?? m?.config?.format?.keys;
    const componentsOf = (spec as { components?: Record<string, { metadata?: SpecMeta }> })?.components;
    const keyFormat = keysOf((spec as { metadata?: SpecMeta })?.metadata)
      ?? keysOf(componentsOf?.[Object.keys(componentsOf ?? {})[0]]?.metadata);
    const manifest = timed('instance manifest', () => buildManifest(spec, specsDir, dataDir, keyFormat));
    const glyphIdManifest = timed('glyph manifest', () => buildGlyphManifest(dataDir));
    const stylesManifest = timed('styles manifest', () => buildStylesManifest(dataDir));
    const variablesManifest = timed('variables manifest', () => buildVariablesManifest(dataDir));

    // Resolve page ID: use provided value, or ask this connection's plugin for its current page.
    let pageId: string;
    if (rawPageId) {
      pageId = rawPageId.replace(/-/g, ':');
    } else {
      pageId = await this.getCurrentPageId(conn);
      console.log(`  Page ID: ${pageId} (from plugin current page, ${conn.fileKey})`);
    }

    const specTyped = spec as { components?: Record<string, { title?: string }> };
    const componentName = Object.values(specTyped.components ?? {})[0]?.title
      ?? Object.keys(specTyped.components ?? {})[0]
      ?? specPath;

    console.log(`Rendering: ${componentName} → page ${pageId} (${conn.fileKey})`);

    // A large component set against a big library can take minutes today; a timeout
    // shorter than the render discards a result the plugin actually produced.
    const { requestId, promise } = this.requests.create(300000, 'Timed out waiting for renderComponent-result.');
    const payload = JSON.stringify({ type: 'renderComponent', requestId, spec, pageId, instanceIdManifest: manifest, glyphIdManifest, stylesManifest, variablesManifest, overwrite, conventions, settings, devStatus });

    const sentAt = Date.now();
    conn.ws.send(payload);
    const result = await (promise as Promise<RenderResult>);
    bridgeTimings.push({ label: 'plugin round-trip', ms: Date.now() - sentAt });
    return { ...result, bridgeTimings, payloadKB: Math.round(payload.length / 1024) };
  }
}
