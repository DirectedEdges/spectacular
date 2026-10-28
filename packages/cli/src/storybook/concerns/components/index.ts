// The components concern: tabs.json, the navigation contract between what the
// workspace emitted and what the scaffolded manager registers (specs#642/#631).
// Specs is always present — it is the one view that needs no transform.
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import type { Concern, BuiltFile } from '../types.js';
import type { Workspace } from '../../workspace.js';
import { resolveSpecsLayout } from '../../../utilities/specsLayout.js';
import { kebabizePath } from '../../../transforms/css/values/tokens.js';

export type TabId = 'react' | 'webcomponents' | 'specs';

export interface TabsJson {
  /** In fixed order: react, webcomponents, specs — absent platforms produce no tab. */
  tabs: TabId[];
  /** What the built-in canvas shows: the first tree that exists, else specs. */
  canvas: TabId;
}

export function deriveTabs(ws: Workspace): TabsJson {
  const tabs: TabId[] = [];
  if (ws.hasReact) tabs.push('react');
  if (ws.hasWebComponents) tabs.push('webcomponents');
  tabs.push('specs');
  return { tabs, canvas: tabs[0] };
}

export interface ModeControl {
  /** Collection name, as the cssvars modes manifest keys it. */
  name: string;
  /** The data attribute the stylesheet switches on. */
  attr: string;
  /** Display name → the attribute value the stylesheet's mode block uses. */
  modes: Array<{ name: string; value: string }>;
  default: string;
}

export interface ModesJson {
  controls: ModeControl[];
}

/**
 * A mode name as the attribute value the stylesheet selects on.
 *
 * This calls the cssvars emitter's own kebabization rather than restating it.
 * The two must agree exactly: cssvars writes the rule as
 * `:root[data-<collection>="<kebabizePath(mode)>"]`, and this value is what the
 * toolbar stamps onto the root — so a disagreement produces a control that sets
 * an attribute no selector matches, and the mode silently never switches.
 *
 * It was a hand-written copy held in step by a comment, and it had drifted: the
 * copy split camelCase (`darkMode` → `dark-mode`) and left `/` alone, where this
 * strips the case boundary (`darkmode`) and turns `/` into `-`. Any camelCase or
 * slashed mode name was a dead toolbar entry (specs#689).
 */
function kebabMode(name: string): string {
  return kebabizePath(name.trim());
}

/**
 * Mode toolbar controls (specs#636): the author lists collections in
 * conventions/storybook.yaml under `modes.collections`, and each becomes a
 * toolbar dropdown driving the attribute the emitted stylesheet already
 * switches on. Nothing is inferred — no list, no controls; a listed name the
 * manifest does not carry warns by name (ADR-098).
 */
export function deriveModes(ws: Workspace, modesConventions: Record<string, unknown> | undefined): ModesJson {
  const where = 'conventions/storybook.yaml modes';
  const controls: ModeControl[] = [];
  if (!modesConventions) return { controls };
  for (const key of Object.keys(modesConventions)) {
    if (key !== 'collections') console.warn(`⚠ ${where}: unknown feature "${key}" ignored (known: collections)`);
  }
  const list = modesConventions.collections;
  if (list === undefined) return { controls };
  if (!Array.isArray(list) || !list.every((n) => typeof n === 'string')) {
    console.warn(`⚠ ${where}.collections: expected an ordered list of collection names. Ignoring.`);
    return { controls };
  }
  const manifestPath = path.join(ws.assetsDir, 'cssvars', 'modes.json');
  const manifest: Record<string, { attr?: string; modes?: string[]; default?: string }> =
    fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) : {};
  for (const name of list as string[]) {
    const entry = manifest[name];
    if (!entry?.attr || !Array.isArray(entry.modes) || entry.modes.length < 2 || !entry.default) {
      console.warn(`⚠ ${where}.collections: "${name}" has no switchable modes in assets/cssvars/modes.json — ignored.`);
      continue;
    }
    controls.push({
      name,
      attr: entry.attr,
      modes: entry.modes.map((m) => ({ name: m, value: kebabMode(m) })),
      default: entry.default,
    });
  }
  return { controls };
}

/** One composition, and the components it is built from. */
export interface CompositionEntry {
  /** Spec folder key — the same key the emitted story directory is named for. */
  key: string;
  /** `title` from the spec, which is what the sidebar shows. */
  title: string;
  /** Component keys this composition instances, sorted, deduplicated. */
  composes: string[];
}

export interface CompositionsJson {
  compositions: CompositionEntry[];
}

/** Every `instanceOf` value in a spec document, however deeply nested. */
function instanceRefs(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) instanceRefs(item, into);
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'instanceOf') {
      // A string names a component; a `$ref` points at a subcomponent of this same
      // spec, which is not a separate component and is not what "composes" means.
      if (typeof value === 'string') into.add(value);
      continue;
    }
    instanceRefs(value, into);
  }
}

/**
 * The compositions contract: which compositions exist and what each is built from.
 *
 * Lives beside `tabs.json` rather than in a concern of its own, so the navigation
 * contract between what a workspace emitted and what the manager registers stays in one
 * place. A workspace with no compositions writes an empty list, which is what lets the
 * scaffolded pages treat their absence as ordinary rather than as a missing file.
 *
 * "What it composes" is read from the spec's own `instanceOf` references, which is the
 * question a screen actually raises — and the one thing the composition pipeline produces
 * that a component page has no equivalent of.
 */
export function deriveCompositions(ws: Workspace): CompositionsJson {
  const layout = resolveSpecsLayout(ws.specsDir);
  const components = new Set(ws.componentKeys);
  const compositions: CompositionEntry[] = [];

  for (const key of ws.compositionKeys) {
    const folder = layout.folderFor('composition', key);
    const refs = new Set<string>();
    let title = key;
    for (const concern of ['api', 'variants', 'examples']) {
      const doc = readSpecDoc(folder, concern);
      if (!doc) continue;
      if (concern === 'api' && typeof doc.title === 'string') title = doc.title;
      instanceRefs(doc, refs);
    }
    compositions.push({
      key,
      title,
      // Only references that resolve to a component in this workspace: an unresolved
      // one is a library component the workspace does not hold, and listing it as
      // something the reader can navigate to would be a dead end.
      composes: [...refs].filter((r) => components.has(r)).sort(),
    });
  }
  return { compositions };
}

/** One concern document of a spec folder, parsed, or undefined when absent. */
function readSpecDoc(folder: string, concern: string): Record<string, unknown> | undefined {
  for (const ext of ['yaml', 'yml', 'json'] as const) {
    const file = path.join(folder, `${concern}.${ext}`);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf-8');
    try {
      return ext === 'json' ? JSON.parse(raw) : (yaml.parse(raw) as Record<string, unknown>);
    } catch {
      // A spec that does not parse is the generator's problem, not the nav contract's —
      // the composition still gets a row, with whatever the other concerns yielded.
      return undefined;
    }
  }
  return undefined;
}

export const components: Concern = {
  name: 'components',

  // tabs.json must always exist: the scaffolded manager imports it at build
  // time, and the Specs view exists in every workspace.
  detect(): boolean {
    return true;
  },

  async build(ws: Workspace): Promise<BuiltFile[]> {
    return [
      { path: 'tabs.json', content: JSON.stringify(deriveTabs(ws), null, 2) + '\n' },
      {
        path: 'modes.json',
        content: JSON.stringify(deriveModes(ws, ws.config.conventions.storybook?.modes), null, 2) + '\n',
      },
      // Always written, empty list included: the scaffolded docs page imports it at
      // build time, exactly as it does tabs.json.
      { path: 'compositions.json', content: JSON.stringify(deriveCompositions(ws), null, 2) + '\n' },
    ];
  },
};
