// `specs testing visual manifest [--check]` — for every spec of both kinds
// carrying a source nodeId, locate the node in whichever fetched payload holds
// it, enumerate its variant children, and precompute the story-side join
// inputs (mapped args, deferred-interaction classification).
//
// Split payloads are read through SectionedFile — only the pages the specs
// actually live on are loaded, not the whole 700MB document. Monolithic
// payloads keep working as the fallback they are everywhere else.
//
// Deterministic: same inputs, byte-identical manifest. No timestamps.
import { createHash } from 'node:crypto';
import fs from 'fs-extra';
import path from 'path';
import YAML from 'yaml';
import { SectionedFile } from '../../utilities/sectionedFile.js';
import type { VisualWorkspace } from './paths.js';
import { writeJson } from './paths.js';
import { loadSpecIndex, loadContract, emittedDirFor, camelize, type SpecRef, type Contract, type UnsourcedSpec } from './specIndex.js';
import { loadIgnore, manifestKeysFor } from './ignore.js';
import type { Manifest, ManifestEntry, ManifestVariant, PropMapping, SpecKind, VariantStatus } from './types.js';

// Browser-driven state concepts (conventions/specs.yaml states): a value the
// states convention maps to one of these styles via CSS pseudo-classes, so an
// arg cannot express it even when the prop itself stays in the contract.
// Values are the shoot's pose names; null means no pose exists.
const BROWSER_DRIVEN_CONCEPTS: Record<string, string | null> = {
  hover: 'hover',
  active: 'pressed',
  focus: 'focus',
  'focus-visible': 'focus',
  'focus-within': 'focus',
  'placeholder-shown': null,
};

// Figma interaction state names the shoot knows how to pose in a browser.
const PSEUDO_STATES: Record<string, string> = {
  hover: 'hover',
  pressed: 'pressed',
  active: 'pressed',
  focus: 'focus',
};

/** The marker component a library puts in a variant its component declares unsupported. */
const DEFAULT_INVALID_MARKER = 'InvalidState';

interface FigmaNode {
  id?: string;
  name?: string;
  type?: string;
  children?: FigmaNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  absoluteRenderBounds?: { x: number; y: number; width: number; height: number };
  backgroundColor?: { r: number; g: number; b: number };
  layoutMode?: string;
  layoutSizingVertical?: string;
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
}

interface SourceIndex {
  alias: string;
  fileKey: string;
  lastModified: string | null;
  byId: Map<string, FigmaNode>;
  pageCanvas: Map<string, string>;
}

function loadBrowserDrivenStates(vw: VisualWorkspace): Record<string, Record<string, string | null>> {
  const conventionsPath = path.join(
    vw.ws.configDir ?? path.join(vw.ws.root, 'config'),
    'conventions',
    'specs.yaml',
  );
  if (!fs.existsSync(conventionsPath)) return {};
  const states = YAML.parse(fs.readFileSync(conventionsPath, 'utf8'))?.states ?? {};
  const byProp: Record<string, Record<string, string | null>> = {};
  for (const [concept, decl] of Object.entries<any>(states)) {
    if (!(concept in BROWSER_DRIVEN_CONCEPTS) || !decl?.prop) continue;
    const value = String(decl.value ?? 'true').toLowerCase();
    (byProp[decl.prop] ??= {})[value] = BROWSER_DRIVEN_CONCEPTS[concept];
  }
  return byProp;
}

function hexOf(bg: { r: number; g: number; b: number }): string {
  return (
    '#' + [bg.r, bg.g, bg.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
  );
}

function indexPage(page: FigmaNode, byId: Map<string, FigmaNode>): void {
  const stack: FigmaNode[] = [page];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.id) byId.set(node.id, node);
    if (Array.isArray(node.children)) stack.push(...node.children);
  }
}

/**
 * Index only the pages the wanted node ids live on. A split payload locates
 * them by byte search without parsing the rest; a monolithic one is parsed
 * whole, which is what it costs to keep the fallback working.
 */
function loadSource(
  dataDir: string,
  alias: string,
  fileKey: string,
  wantedIds: Set<string>,
): SourceIndex | null {
  const byId = new Map<string, FigmaNode>();
  const pageCanvas = new Map<string, string>();

  const split = SectionedFile.open(dataDir, alias);
  if (split) {
    const root = split.root() as { lastModified?: string };
    const located = split.locatePagesOfNodeIds(wantedIds);
    const pages = new Map<string, any>();
    for (const entry of located.values()) pages.set(entry.id, entry);
    // Page canvas colours come from the page entries themselves — the split
    // manifest's index carries id/name only, so each located page is loaded
    // anyway and its backgroundColor read in passing.
    for (const entry of pages.values()) {
      const page = split.loadPage(entry) as FigmaNode;
      if (page.backgroundColor) pageCanvas.set(page.id!, hexOf(page.backgroundColor));
      indexPage(page, byId);
      split.releasePage(entry.id);
    }
    return { alias, fileKey, lastModified: root.lastModified ?? null, byId, pageCanvas };
  }

  const monolithic = path.join(dataDir, `${alias}.file.json`);
  if (!fs.existsSync(monolithic)) return null;
  const payload = JSON.parse(fs.readFileSync(monolithic, 'utf8'));
  for (const page of payload.document?.children ?? []) {
    if (page.backgroundColor) pageCanvas.set(page.id, hexOf(page.backgroundColor));
    indexPage(page, byId);
  }
  return { alias, fileKey, lastModified: payload.lastModified ?? null, byId, pageCanvas };
}

/** Does this variant's subtree contain the invalid-combination marker? */
function hasInvalidMarker(node: FigmaNode, marker: string | null): boolean {
  if (!marker) return false;
  const stack = [...(node.children ?? [])];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.name === marker) return true;
    if (n.children) stack.push(...n.children);
  }
  return false;
}

/**
 * Where the node's box sits inside its exported image, when the two differ —
 * only a node whose content escapes its frame carries one.
 */
function inkBox(node: FigmaNode): [number, number, number, number] | undefined {
  const box = node.absoluteBoundingBox;
  const render = node.absoluteRenderBounds;
  if (!box || !render) return undefined;
  const dx = box.x - render.x;
  const dy = box.y - render.y;
  const grew = render.width - box.width > 0.5 || render.height - box.height > 0.5;
  if (!grew && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return undefined;
  return [Math.round(dx), Math.round(dy), Math.round(render.width), Math.round(render.height)];
}

/**
 * Does this frame hug its height? Compositions are page frames and always
 * fixed-width (they sit on the page node), but height may hug content.
 * `layoutSizingVertical` answers directly when present; otherwise the
 * auto-layout sizing modes do. A frame with no auto-layout is fixed.
 */
function hugsHeight(node: FigmaNode): boolean {
  if (node.layoutSizingVertical === 'HUG') return true;
  if (node.layoutSizingVertical) return false;
  if (node.layoutMode === 'VERTICAL') return node.primaryAxisSizingMode === 'AUTO';
  if (node.layoutMode === 'HORIZONTAL') return node.counterAxisSizingMode === 'AUTO';
  return false;
}

function parseVariantName(name: string): Record<string, string> | null {
  const config: Record<string, string> = {};
  for (const part of String(name).split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) return null;
    config[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return config;
}

function coerceValue(raw: string, apiProp: any, contractOptions?: string[]): unknown {
  if (apiProp?.type === 'boolean') {
    if (/^true$/i.test(raw)) return true;
    if (/^false$/i.test(raw)) return false;
  }
  if (apiProp?.type === 'number' && /^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  // The spec carries Figma's value casing; the emitted contract's enum casing
  // is what stories, argTypes validation, and CSS selectors actually use.
  if (contractOptions) {
    const match = contractOptions.find((o) => o.toLowerCase() === String(raw).toLowerCase());
    if (match !== undefined) return match;
  }
  return raw;
}

function buildPropMap(
  figmaPropNames: Set<string>,
  apiProps: Record<string, any>,
  contract: Contract | null,
): { propMap: Record<string, PropMapping>; unmapped: string[] } {
  const propMap: Record<string, PropMapping> = {};
  const unmapped: string[] = [];
  for (const figmaName of figmaPropNames) {
    let propKey: string | null = null;
    // A folded member (ADR-111) records its flat Figma name on the member; the
    // mapping answers the member's dotted arg key — the spelling the emitted
    // stories carry their member args under — typed and defaulted by the member.
    let memberDef: Record<string, any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    let contractKey: string | null = null;
    for (const [key, def] of Object.entries(apiProps)) {
      if (def?.$extensions?.['com.figma']?.name === figmaName) {
        propKey = key;
        break;
      }
      if (def?.type === 'object' && def.members && typeof def.members === 'object') {
        for (const [memberKey, member] of Object.entries<any>(def.members)) { // eslint-disable-line @typescript-eslint/no-explicit-any
          if (member?.$extensions?.['com.figma']?.name === figmaName) {
            propKey = `${key}.${memberKey}`;
            memberDef = member;
            contractKey = key;
            break;
          }
        }
        if (propKey) break;
      }
    }
    if (!propKey) {
      const candidate = camelize(figmaName);
      if (candidate in apiProps) propKey = candidate;
    }
    if (!propKey) {
      unmapped.push(figmaName);
      continue;
    }
    const inContract = contract?.props?.has(contractKey ?? propKey) ?? false;
    const def = memberDef ?? apiProps[propKey];
    propMap[figmaName] = {
      prop: propKey,
      type: def?.type ?? null,
      kind: inContract ? 'arg' : 'interaction',
      default:
        !memberDef && contract?.defaults?.[propKey] !== undefined
          ? contract.defaults[propKey]
          : def?.default ?? null,
    };
  }
  return { propMap, unmapped };
}

export interface ManifestResult {
  manifest: Manifest;
  problems: string[];
  totals: { specs: number; variants: number; shootable: number; deferred: number; unsupported: number };
}

export function buildManifest(
  vw: VisualWorkspace,
  opts: { components?: string[]; check?: boolean; kinds?: SpecKind[] } = {},
): ManifestResult {
  const ws = vw.ws;
  const browserDrivenStates = loadBrowserDrivenStates(vw);
  // The index reports what it could not carry: an unsourced spec is a mapping
  // problem, not an absence. Kept out of `problems` until the scope is known,
  // so a run on one component never reports another's.
  const unsourced: UnsourcedSpec[] = [];
  const specIndex = loadSpecIndex(ws.specsDir, unsourced);
  const only = opts.components?.length ? new Set(opts.components) : null;
  const kinds: SpecKind[] = opts.kinds ?? ['component', 'composition'];
  const problems = unsourced
    .filter((u) => kinds.includes(u.kind) && (!only || only.has(u.key)))
    .map((u) => `${u.kind}/${u.key}: ${u.reason}`);
  const ignore = loadIgnore(vw.ignorePath);

  const declaredMarker = ignore.defaults.invalidMarker;
  const invalidMarker: string | null =
    declaredMarker === false
      ? null
      : typeof declaredMarker === 'string' && declaredMarker.trim()
        ? declaredMarker.trim()
        : DEFAULT_INVALID_MARKER;

  // Every wanted node id, across both kinds, so each source loads its pages once.
  const wanted = new Set<string>();
  for (const kind of kinds) {
    for (const spec of specIndex.get(kind)!.values()) {
      if (only && !only.has(spec.key)) continue;
      wanted.add(spec.nodeId);
    }
  }

  const sourceDecls = Object.entries(
    ((ws.config.settings as any).data?.sources ?? {}) as Record<string, { key?: string }>,
  );
  const sources: SourceIndex[] = [];
  for (const [alias, decl] of sourceDecls) {
    const loaded = loadSource(ws.dataDir, alias, decl.key ?? '', wanted);
    if (loaded) sources.push(loaded);
  }
  if (!sources.length) {
    throw new Error(`No fetched file payloads found in ${ws.dataDir} — run \`specs fetch\` first.`);
  }

  const manifest: Manifest = {
    $meta: {
      workspace: path.basename(ws.root),
      scale: 2,
      sources: Object.fromEntries(
        sources.map((s) => [s.alias, { fileKey: s.fileKey, fileLastModified: s.lastModified }]),
      ),
    },
    components: {},
    compositions: {},
  };
  const totals = { specs: 0, variants: 0, shootable: 0, deferred: 0, unsupported: 0 };

  for (const kind of kinds) {
    const { sampleTargets, noPin, driveInteractions } = manifestKeysFor(ignore, kind);
    const target = kind === 'composition' ? manifest.compositions : manifest.components;

    for (const key of [...specIndex.get(kind)!.keys()].sort()) {
      if (only && !only.has(key)) continue;
      const spec = specIndex.get(kind)!.get(key)!;
      const source = sources.find((s) => s.byId.has(spec.nodeId));
      if (!source) {
        problems.push(`${kind}/${key}: node ${spec.nodeId} not found in any source payload`);
        continue;
      }
      const node = source.byId.get(spec.nodeId)!;
      const contract = loadContract(emittedDirFor(ws.root, 'react', kind, key));

      const entry = buildEntry({
        kind, key, spec, node, source, contract, browserDrivenStates,
        invalidMarker, sampleTargets, noPin, driveInteractions, problems,
      });
      target[key] = entry;
      totals.specs += 1;
      for (const v of entry.children) {
        totals.variants += 1;
        if (v.status === 'shootable') totals.shootable += 1;
        else if (v.status === 'unsupported-combination') totals.unsupported += 1;
        else totals.deferred += 1;
      }
      if (entry.unmappedProps.length) {
        problems.push(`${kind}/${key}: unmapped Figma props: ${entry.unmappedProps.join(', ')}`);
      }
    }
  }

  if (!opts.check) writeJson(vw.manifestPath, manifest);
  return { manifest, problems, totals };
}

function buildEntry(ctx: {
  kind: SpecKind;
  key: string;
  spec: SpecRef;
  node: FigmaNode;
  source: SourceIndex;
  contract: Contract | null;
  browserDrivenStates: Record<string, Record<string, string | null>>;
  invalidMarker: string | null;
  sampleTargets: Record<string, number>;
  noPin: Set<string>;
  driveInteractions: Set<string>;
  problems: string[];
}): ManifestEntry {
  const { kind, key, spec, node, source, contract } = ctx;

  const children: FigmaNode[] =
    node.type === 'COMPONENT_SET'
      ? (node.children ?? []).filter((c) => c.type === 'COMPONENT')
      : [node];

  const figmaPropNames = new Set<string>();
  const variants: ManifestVariant[] = [];
  for (const child of children) {
    const config = node.type === 'COMPONENT_SET' ? parseVariantName(child.name ?? '') : {};
    if (config === null) {
      ctx.problems.push(`${kind}/${key}: variant name not Prop=Value form: "${child.name}"`);
      continue;
    }
    for (const p of Object.keys(config)) figmaPropNames.add(p);
    const box = child.absoluteBoundingBox;
    // Components: pinned unless opted out. Compositions: page frames, always
    // fixed-width, so always width-pinned; height pins only when the frame's
    // vertical sizing is FIXED — a hugging frame keeps its natural height, so
    // vertical overflow shows as pixels, not a dimension mismatch.
    const pinWidth = kind === 'composition' ? true : !ctx.noPin.has(key);
    const pinHeight = kind === 'composition' ? !hugsHeight(child) : false;
    const ink = inkBox(child);
    variants.push({
      nodeId: child.id!,
      name: child.name ?? '',
      config,
      ...(hasInvalidMarker(child, ctx.invalidMarker) ? { invalidCombination: true } : {}),
      ...(box ? { size: [Math.round(box.width), Math.round(box.height)] as [number, number] } : {}),
      ...(ink ? { ink } : {}),
      ...(pinWidth ? { pinWidth: true } : {}),
      ...(pinHeight ? { pinHeight: true } : {}),
      args: {},
      status: 'shootable',
    });
  }

  const { propMap, unmapped } = buildPropMap(figmaPropNames, spec.props, contract);

  // Content resets for props the variants don't drive: stories may bake
  // instance-example content into meta args, which the design's variant nodes
  // don't show. Each such prop resets to its contract default (null included),
  // or to its authored example when no default exists.
  const argPropKeys = new Set(
    Object.values(propMap).filter((m) => m.kind === 'arg').map((m) => m.prop),
  );
  const resets: Record<string, unknown> = {};
  const resetScalar = (pk: string, d: Record<string, any>): void => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (argPropKeys.has(pk)) return;
    if (!['string', 'number', 'boolean'].includes(d.type)) return;
    if ('default' in d && d.default !== undefined) resets[pk] = d.default;
    else if (Array.isArray(d.examples) && d.examples.length > 0) resets[pk] = d.examples[0];
  };
  for (const [pk, def] of Object.entries<any>(spec.props)) {
    const d = def ?? {};
    if (d.type === 'slot') {
      if (!argPropKeys.has(pk) && d.default === null) resets[pk] = null;
      continue;
    }
    // An object prop (ADR-111) resets per member, under the dotted arg keys the
    // emitted stories carry.
    if (d.type === 'object' && d.members && typeof d.members === 'object') {
      for (const [memberKey, member] of Object.entries<any>(d.members)) { // eslint-disable-line @typescript-eslint/no-explicit-any
        resetScalar(`${pk}.${memberKey}`, member ?? {});
      }
      continue;
    }
    resetScalar(pk, d);
  }

  for (const variant of variants) {
    const args: Record<string, unknown> = {};
    let status: VariantStatus = 'shootable';
    if (variant.invalidCombination) {
      variant.args = {};
      variant.status = 'unsupported-combination';
      continue;
    }
    for (const [figmaName, raw] of Object.entries(variant.config)) {
      const mapping = propMap[figmaName];
      if (!mapping) {
        status = 'deferred-unmapped';
        continue;
      }
      const value = coerceValue(raw, spec.props[mapping.prop], contract?.enumOptions?.[mapping.prop]);
      if (mapping.kind === 'interaction') {
        // Only the default state is comparable without driving hover/press in
        // the browser; a component that opts in gets the pseudo-state driven
        // at shoot time instead of being deferred.
        if (value === mapping.default) continue;
        const drive = ctx.driveInteractions.has(key)
          ? PSEUDO_STATES[String(value).toLowerCase()]
          : null;
        if (drive) variant.interaction = drive;
        else status = 'deferred-interaction';
        continue;
      }
      if (value !== mapping.default) {
        const pseudo = ctx.browserDrivenStates[mapping.prop]?.[String(value).toLowerCase()];
        if (pseudo !== undefined) {
          const drive = ctx.driveInteractions.has(key) ? pseudo : null;
          if (drive) variant.interaction = drive ?? undefined;
          else status = 'deferred-interaction';
          continue;
        }
        args[mapping.prop] = value;
      }
    }
    variant.args = args;
    variant.status = status;
  }

  // Even-stride sampling for huge matrices (`sampleVariants: N`); deterministic.
  const sampleTarget = ctx.sampleTargets[key];
  if (sampleTarget > 0) {
    const shootable = variants.filter((v) => v.status === 'shootable');
    if (shootable.length > sampleTarget) {
      const stride = Math.ceil(shootable.length / sampleTarget);
      shootable.forEach((v, i) => {
        if (i % stride !== 0) v.status = 'deferred-sampling';
      });
    }
  }

  return {
    kind,
    source: source.alias,
    fileKey: source.fileKey,
    // The subtree as fetched, hashed whole: instance subtrees are inlined in
    // REST payloads, so a leaf edit reaches every spec that contains it.
    nodeHash: createHash('sha256').update(JSON.stringify(node)).digest('hex'),
    setNodeId: spec.nodeId,
    nodeType: node.type ?? 'FRAME',
    pageId: spec.pageId,
    pageCanvas: source.pageCanvas.get(spec.pageId ?? '') ?? '#ffffff',
    // Subcomponent api titles read "Parent / Sub" (hidden ones "Parent / _ /
    // Sub"); the story emitter collapses separators and drops "_" segments.
    // Stored without the platform prefix — shoot composes it per target.
    storyTitle: spec.title
      .split(/\s*\/\s*/)
      .filter((seg) => seg !== '_')
      .join('/'),
    propMap,
    unmappedProps: unmapped,
    resets,
    children: variants,
  };
}
