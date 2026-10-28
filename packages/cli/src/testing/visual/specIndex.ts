// The spec artifacts the harness joins against, discovered through the layout
// seam (ADR-096) — never a flat directory read, which finds nothing under the
// current components/ + compositions/ layout and was why the predecessor
// harness went blind on every regenerated workspace (specs#711).
import fs from 'fs-extra';
import path from 'path';
import YAML from 'yaml';
import { resolveSpecsLayout, SPEC_KINDS, type SpecKind } from '../../utilities/specsLayout.js';

export interface SpecRef {
  kind: SpecKind;
  key: string;
  title: string;
  nodeId: string;
  pageId: string | null;
  nodeType: string | null;
  props: Record<string, any>;
  dir: string;
}

/** A spec folder on disk the index could not carry, and why. */
export interface UnsourcedSpec {
  kind: SpecKind;
  key: string;
  reason: string;
}

/**
 * Every spec of both kinds carrying a source nodeId, keyed kind-first.
 *
 * `skipped` collects the specs on disk this index cannot carry, in the same
 * out-collector style as the manifest's `problems`. A spec whose api declares
 * no `metadata.source.nodeId` has no Figma node to shoot against and cannot
 * enter the manifest — but dropping it in silence makes a whole kind look
 * unsupported rather than unsourced, which is how four hand-authored
 * compositions disappeared from a workspace's manifest with "no mapping
 * problems" reported.
 */
export function loadSpecIndex(
  specsDir: string,
  skipped?: UnsourcedSpec[],
): Map<SpecKind, Map<string, SpecRef>> {
  const layout = resolveSpecsLayout(specsDir);
  const index = new Map<SpecKind, Map<string, SpecRef>>();
  for (const kind of SPEC_KINDS) {
    const byKey = new Map<string, SpecRef>();
    index.set(kind, byKey);
    for (const key of layout.folderNames(kind)) {
      const dir = layout.folderFor(kind, key);
      const apiPath = ['yaml', 'yml', 'json']
        .map((ext) => path.join(dir, `api.${ext}`))
        .find((p) => fs.existsSync(p));
      // Not reported: the layout seam only names folders that hold an `api.*`,
      // so reaching here means the file vanished mid-run.
      if (!apiPath) continue;
      const api = apiPath.endsWith('.json')
        ? JSON.parse(fs.readFileSync(apiPath, 'utf8'))
        : YAML.parse(fs.readFileSync(apiPath, 'utf8'));
      const source = api?.metadata?.source;
      if (!source?.nodeId) {
        skipped?.push({
          kind,
          key,
          reason: 'api.yaml declares no metadata.source.nodeId — no Figma node to shoot against',
        });
        continue;
      }
      byKey.set(key, {
        kind,
        key,
        title: String(api.title ?? key),
        nodeId: String(source.nodeId),
        pageId: source.pageId ? String(source.pageId) : null,
        nodeType: source.nodeType ?? null,
        props: api.props ?? {},
        dir,
      });
    }
  }
  return index;
}

/**
 * The emitted tree directory for one spec: react/src/<kind-dir>/<Folder>.
 * The emitters Pascal-case the spec key; when that guess misses (a key whose
 * casing the emitter normalized differently), a case-insensitive scan of the
 * kind directory settles it from what is actually on disk.
 */
export function emittedDirFor(
  workspaceRoot: string,
  target: 'react' | 'webcomponents',
  kind: SpecKind,
  key: string,
): string | null {
  const kindTree = kind === 'composition' ? 'compositions' : 'components';
  const base = path.join(workspaceRoot, target, 'src', kindTree);
  const pascal = key.charAt(0).toUpperCase() + key.slice(1);
  const direct = path.join(base, pascal);
  if (fs.existsSync(direct)) return direct;
  if (!fs.existsSync(base)) return null;
  const lower = key.toLowerCase();
  const match = fs
    .readdirSync(base, { withFileTypes: true })
    .find((e) => e.isDirectory() && e.name.toLowerCase() === lower);
  return match ? path.join(base, match.name) : null;
}

export interface Contract {
  props: Set<string>;
  defaults: Record<string, unknown>;
  enumOptions: Record<string, string[]>;
}

/**
 * Parse the emitted contract for the render-time prop surface. A prop declared
 * in api.yaml but absent here does not exist at render time (e.g. `state` —
 * hover/pressed styling is CSS pseudo-classes, not a prop).
 */
export function loadContract(emittedDir: string | null): Contract | null {
  if (!emittedDir || !fs.existsSync(emittedDir)) return null;
  const file = fs
    .readdirSync(emittedDir)
    .find((f) => f === 'contract.ts' || f.endsWith('.contract.ts'));
  if (!file) return null;
  const src = fs.readFileSync(path.join(emittedDir, file), 'utf8');

  // String-literal union aliases — the contract's enum casing is authoritative
  // for arg values; the spec carries Figma's casing and the emitters normalize
  // it (enumCase contract).
  const unions = new Map<string, string[]>();
  for (const m of src.matchAll(/export type (\w+) =([^;]+);/g)) {
    const literals = [...m[2].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((l) => l[1]);
    if (literals.length && !/[{}]/.test(m[2])) unions.set(m[1], literals);
  }

  const props = new Set<string>();
  const enumOptions: Record<string, string[]> = {};
  const propsBlock = src.match(/export interface \w+Props \{([\s\S]*?)\n\}/);
  if (propsBlock) {
    for (const line of propsBlock[1].split('\n')) {
      const m = line.match(/^\s*(\w+)\??:\s*([^;]+);/);
      if (!m) continue;
      props.add(m[1]);
      const typeExpr = m[2].trim();
      if (unions.has(typeExpr)) {
        enumOptions[m[1]] = unions.get(typeExpr)!;
      } else {
        const inline = [...typeExpr.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((l) => l[1]);
        if (inline.length) enumOptions[m[1]] = inline;
      }
    }
  }

  const defaults: Record<string, unknown> = {};
  const defaultsBlock = src.match(/export const \w+Defaults = \{([\s\S]*?)\n\}/);
  if (defaultsBlock) {
    for (const line of defaultsBlock[1].split('\n')) {
      const m = line.match(/^\s*(\w+):\s*(.+?),?\s*$/);
      if (!m) continue;
      defaults[m[1]] = parseScalar(m[2]);
    }
  }

  return { props, defaults, enumOptions };
}

export function parseScalar(raw: string): unknown {
  const t = raw.trim().replace(/,$/, '');
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  const q = t.match(/^"(.*)"$|^'(.*)'$/);
  if (q) return q[1] ?? q[2];
  return undefined; // non-scalar (JSX, object) — caller ignores
}

/** SENTENCE-cased Figma prop name → camelCase spec prop key candidate. */
export function camelize(name: string): string {
  const words = String(name)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  if (!words.length) return '';
  return words
    .map((w, i) =>
      i === 0
        ? w.charAt(0).toLowerCase() + w.slice(1)
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join('');
}
