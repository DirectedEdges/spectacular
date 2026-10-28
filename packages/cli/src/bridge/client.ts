// Thin HTTP client for talking to a running bridge server (see bridge/server.ts).

import type { ResolvedConventions, ResolvedSettings } from '@directededges/specs-schema';
import { HTTP_PORT } from './config.js';

export interface BridgeConnection {
  fileKey: string;
  fileName?: string;
  connected: boolean;
}

export interface BridgeStatus {
  connections: BridgeConnection[];
}

export async function getBridgeStatus(timeoutMs = 1500): Promise<BridgeStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://localhost:${HTTP_PORT}/status`, { signal: controller.signal });
    return (await res.json()) as BridgeStatus;
  } finally {
    clearTimeout(timer);
  }
}

export interface RenderRequestBody {
  specPath?: string;
  /** Pre-parsed, pre-merged component spec. When present, the bridge relays
   * it as-is instead of reading/parsing specPath itself. specPath is still
   * required alongside it to derive the workspace (specsDir/dataDir). */
  spec?: Record<string, unknown>;
  pageId?: string;
  fileKey?: string;
  /** Delete a same-titled page node before rendering, instead of erroring on the collision. */
  overwrite?: boolean;
  /**
   * The workspace conventions and settings, as a fallback for a spec that carries no
   * `metadata.conventions`/`metadata.settings` — a hand-authored one, say. The spec's
   * own record still wins: it captures how the spec was produced, which is what render
   * has to reverse.
   */
  conventions?: ResolvedConventions;
  settings?: ResolvedSettings;
  /**
   * The Dev Mode status to stamp on the rendered component, taken from the workspace
   * scan manifest's Dev Status column. Omitted when the manifest has no row for this
   * spec or records no status — render then leaves the node's status untouched rather
   * than asserting one the scan never recorded.
   */
  devStatus?: 'READY_FOR_DEV' | 'COMPLETED';
}

// Render reports success/failure only — the round-trip spec read is a second,
// explicit call (`specs generate --from-bridge`), not a render side effect.
export interface RenderResponse {
  success: boolean;
  nodeId?: string;
  /** Non-fatal render degradations reported by the plugin (font fallbacks, skipped keys). */
  warnings?: string[];
  error?: unknown;
  /** Phase durations inside the plugin render. */
  timings?: { total: number; phases: Array<{ label: string; ms: number; count: number }> };
  /** Phase durations on the bridge — manifest builds and the plugin round-trip. */
  bridgeTimings?: Array<{ label: string; ms: number }>;
  payloadKB?: number;
}

export async function postRender(body: RenderRequestBody): Promise<RenderResponse> {
  const res = await fetch(`http://localhost:${HTTP_PORT}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as RenderResponse;
}

export interface GenerateFromSelectionRequestBody {
  fileKey?: string;
  /** Generate from this node instead of the current selection (the plugin selects it first). */
  nodeId?: string;
  /**
   * The conventions and settings to process the node under. Without them the plugin builds
   * the spec under its own UI settings, so the same node in the same file yields different
   * specs depending on how someone last left the panel — and a round trip compares a
   * baseline made under one configuration against a read made under another. Applies to
   * this request only; it must never be stored as the plugin's settings.
   */
  conventions?: ResolvedConventions;
  settings?: ResolvedSettings;
  /**
   * Testing utility: delete the node once its spec has been read. A catalogue sweep that
   * renders and reads every component otherwise leaves all of them on the page.
   */
  remove?: boolean;
}

export interface GenerateFromSelectionResponse {
  success: boolean;
  nodeId?: string;
  name?: string;
  specData?: unknown;
  error?: unknown;
}

export async function postGenerateFromSelection(body: GenerateFromSelectionRequestBody = {}): Promise<GenerateFromSelectionResponse> {
  const res = await fetch(`http://localhost:${HTTP_PORT}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as GenerateFromSelectionResponse;
}

export interface GetVariablesRequestBody {
  fileKey?: string;
}

/** The variables and collections of the connected file, read by the plugin and
 * shaped like the `meta` of `GET /v1/files/:key/variables/local` — so a file
 * written from this response is indistinguishable from a REST fetch downstream. */
export interface GetVariablesResponse {
  success: boolean;
  /** The connection that answered — identifies the source alias when the request named no fileKey. */
  fileKey?: string;
  meta?: {
    variableCollections: Record<string, unknown>;
    variables: Record<string, unknown>;
  };
  error?: unknown;
}

export async function postGetVariables(body: GetVariablesRequestBody = {}): Promise<GetVariablesResponse> {
  const res = await fetch(`http://localhost:${HTTP_PORT}/variables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as GetVariablesResponse;
}

export interface InspectRequestBody {
  fileKey?: string;
  /** The page holding the component, from the spec's `metadata.source.pageId`. */
  pageId: string;
  /** The component or component set, from the spec's `metadata.source.nodeId`. */
  nodeId: string;
  /** Needed to key elements the way the spec keys them — see `InspectedElement.key`. */
  conventions?: unknown;
  settings?: unknown;
}

/** One variant's copy of an element, and the annotations standing on it. */
export interface InspectedVariantNode {
  /** The variant's Figma name, e.g. `checked=true, disabled=false`. Absent for a lone component. */
  variant?: string;
  nodeId: string;
  /** Annotation labels exactly as they stand, so a caller can see what a write must preserve. */
  annotations: string[];
}

/**
 * An anatomy element as the live component holds it.
 *
 * `key` is produced by the same `getAnatomyElementName` + `KeyGrammar.emit` pair the
 * reader uses, so it matches the key the spec carries — which is what lets a caller name
 * elements by key rather than by node id. `figmaName` is the layer name behind that key,
 * available here whether or not the workspace preserves it in `$extensions`.
 */
export interface InspectedElement {
  key: string;
  figmaName: string;
  /** The Figma node type, e.g. `FRAME`, `TEXT`, `INSTANCE`. */
  type: string;
  /** Every variant carrying this element, in variant order. */
  nodes: InspectedVariantNode[];
  /** Signals parsed from the annotations above: the roles and actions already authored. */
  signals: { role?: string[]; action?: string[] };
}

export interface InspectResponse {
  success: boolean;
  fileKey?: string;
  /** The component set's own name. */
  name?: string;
  /** Element keys in traversal order. */
  elements?: InspectedElement[];
  error?: unknown;
}

export async function postInspect(body: InspectRequestBody): Promise<InspectResponse> {
  const res = await fetch(`http://localhost:${HTTP_PORT}/inspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as InspectResponse;
}

/** One element to annotate, named by anatomy key rather than by node id. */
export interface AnnotateElement {
  /** The anatomy key, as `/inspect` reports it and as the spec carries it. */
  key: string;
  /** Signal lines, already formatted by the shared `annotationLines` grammar. */
  lines: string[];
}

export interface AnnotateComponent {
  /** From the spec's `metadata.source.nodeId`. */
  nodeId: string;
  /** The component's spec key, for reporting. */
  title: string;
  elements: AnnotateElement[];
}

/**
 * A request to add role annotations to components on one page.
 *
 * One page per call, because a page is the unit a reviewer can watch and stop at — and
 * because the plugin loads a page to address its subtree, so batching across pages would
 * load the whole file to no purpose.
 *
 * Elements are named by key, never by node id. The plugin resolves each key against the
 * component as it stands at write time, so nothing depends on an id recorded earlier and
 * there is no stale-snapshot failure mode to detect.
 */
export interface AnnotateRequestBody {
  fileKey?: string;
  pageId: string;
  components: AnnotateComponent[];
  conventions?: unknown;
  settings?: unknown;
}

export type AnnotateElementStatus =
  /** The annotation was appended. */
  | 'applied'
  /** The element already carries a role, on this variant or another. Left alone. */
  | 'conflict'
  /** No element in the live component keys to this name. */
  | 'unresolved'
  /** The element resolved to a node that cannot hold an annotation. */
  | 'unsupported';

export interface AnnotateElementResult {
  key: string;
  /** The node written to, where one resolved. */
  nodeId?: string;
  status: AnnotateElementStatus;
  detail?: string;
}

export interface AnnotateComponentResult {
  title: string;
  elements: AnnotateElementResult[];
}

export interface AnnotateResponse {
  success: boolean;
  fileKey?: string;
  components?: AnnotateComponentResult[];
  error?: unknown;
}

export async function postAnnotate(body: AnnotateRequestBody): Promise<AnnotateResponse> {
  const res = await fetch(`http://localhost:${HTTP_PORT}/annotate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as AnnotateResponse;
}
