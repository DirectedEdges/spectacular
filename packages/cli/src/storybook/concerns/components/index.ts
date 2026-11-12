// The components concern: the views a component offers, and the navigation
// contract between what the workspace emitted and how the host orders it
// (specs#642/#631).
//
// A component is a folder in the sidebar and every view of it is a leaf inside
// it. Two of those leaves are the emitters' — React and Web components — and the
// rest are published here: the spec documents, and one page per platform per
// baseline of the visual diffs. That replaced the two rows of in-page tabs a
// component docs page used to carry, which were built on Storybook's addon tabs,
// deprecated in 10 and removed in 11.
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import type { Concern, BuiltFile } from '../types.js';
import type { Workspace } from '../../workspace.js';
import { resolveSpecsLayout, SPEC_KINDS, type SpecKind } from '../../../utilities/specsLayout.js';
import { kebabizePath } from '../../../transforms/css/values/tokens.js';
import { readTemplate, renderTemplate } from '../../templates.js';
import { reportNameFor } from '../../../testing/visual/types.js';
import { PLATFORM_LEAVES, specNavFolder } from './navTitle.js';

/** A spec document published as its own view. `examples` is deliberately not one. */
const SPEC_VIEWS = [
  { leaf: 'API', concern: 'api' },
  { leaf: 'Variants', concern: 'variants' },
] as const;

/**
 * The two questions a diff answers, and the report each writes. Mirrors the
 * Testing section's own pages — same report basenames, same baseline wording,
 * same flag in the empty state — because these show one component's variants in
 * full where those rank every component against each other.
 */
const DIFF_MODES = [
  { mode: 'figma' as const, leaf: 'Testing (Fidelity)', baseline: 'Figma exports', flag: '' },
  { mode: 'accepted' as const, leaf: 'Testing (Changes)', baseline: 'last accepted renders', flag: ' --against accepted' },
];

const PLATFORMS = [
  { target: 'react' as const, leaf: PLATFORM_LEAVES.react, emitted: (ws: Workspace) => ws.hasReact },
  { target: 'webcomponents' as const, leaf: PLATFORM_LEAVES.webcomponents, emitted: (ws: Workspace) => ws.hasWebComponents },
];

export interface ViewsJson {
  /** Every view leaf a component can carry, in the order the sidebar shows them. */
  views: string[];
}

/**
 * The sidebar's reading order for the leaves under a component.
 *
 * Published so the host has one copy of it: the scaffolded preview imports this
 * to sort by, because alphabetical order on these names puts API first and
 * splits the two platforms apart.
 *
 * This is an ordering, not an inventory — a testing leaf is listed for every
 * emitted platform whether or not a report exists to publish a page from, and a
 * leaf with no page simply never appears.
 */
export function deriveViews(ws: Workspace): ViewsJson {
  const views: string[] = [];
  for (const platform of PLATFORMS) {
    if (!platform.emitted(ws)) continue;
    views.push(platform.leaf);
    for (const mode of DIFF_MODES) views.push(`${platform.leaf} — ${mode.leaf}`);
  }
  views.push(...SPEC_VIEWS.map((v) => v.leaf));
  return { views };
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

/** Every spec in the workspace, with the sidebar folder its views sit in. */
function specFolders(ws: Workspace): Array<{ kind: SpecKind; key: string; navFolder: string }> {
  const layout = resolveSpecsLayout(ws.specsDir);
  const out: Array<{ kind: SpecKind; key: string; navFolder: string }> = [];
  for (const kind of SPEC_KINDS) {
    const keys = kind === 'component' ? ws.componentKeys : ws.compositionKeys;
    for (const key of keys) {
      const api = readSpecDoc(layout.folderFor(kind, key), 'api');
      const title = typeof api?.title === 'string' ? api.title : undefined;
      out.push({ kind, key, navFolder: specNavFolder(kind, key, title) });
    }
  }
  return out;
}

/**
 * The report basenames one platform's page tries, in order.
 *
 * Reports written before the platform split carry no target and held React
 * results, so React falls back to the untargeted name. Web Components never had
 * an untargeted report and must not read React's.
 */
function reportCandidates(mode: 'figma' | 'accepted', target: 'react' | 'webcomponents'): string[] {
  const targeted = reportNameFor(mode, target);
  return target === 'react' ? [targeted, mode === 'accepted' ? 'regression' : 'fidelity'] : [targeted];
}

/** Which of a platform's testing pages have a report to read. */
function hasReport(ws: Workspace, candidates: string[]): boolean {
  return candidates.some((name) => fs.existsSync(path.join(ws.root, 'testing', 'visual', 'report', `${name}.json`)));
}

/**
 * One file per view leaf, per spec. The directory mirrors the spec's own kind and
 * folder key rather than its title, so a retitled component moves its sidebar
 * entry without moving the file publish compares against.
 */
function viewPages(ws: Workspace): BuiltFile[] {
  const specTemplate = readTemplate('pages/SpecConcern.stories.tsx.tpl');
  const testingTemplate = readTemplate('pages/ComponentTesting.stories.tsx.tpl');
  const files: BuiltFile[] = [];

  for (const spec of specFolders(ws)) {
    // The kind as the host reads it off a story id, and as the specs/ directory
    // names it — plural, where SpecKind is singular.
    const kindDir = spec.kind === 'component' ? 'components' : 'compositions';
    const dir = path.join(spec.kind, spec.key);

    for (const view of SPEC_VIEWS) {
      files.push({
        path: path.join(dir, `${view.leaf}.stories.tsx`),
        content: renderTemplate(specTemplate, {
          NAV_TITLE: `${spec.navFolder}/${view.leaf}`,
          KIND: kindDir,
          SLUG: spec.key,
          CONCERN: view.concern,
        }),
      });
    }

    for (const platform of PLATFORMS) {
      if (!platform.emitted(ws)) continue;
      for (const mode of DIFF_MODES) {
        const candidates = reportCandidates(mode.mode, platform.target);
        // A page publishes only when its report exists, so a workspace that has
        // never run a diff shows the four views it can actually answer.
        if (!hasReport(ws, candidates)) continue;
        const leaf = `${platform.leaf} — ${mode.leaf}`;
        files.push({
          path: path.join(dir, `${platform.target}-${mode.mode}.stories.tsx`),
          content: renderTemplate(testingTemplate, {
            NAV_TITLE: `${spec.navFolder}/${leaf}`,
            KIND: kindDir,
            SLUG: spec.key,
            REPORT_CANDIDATES: JSON.stringify(candidates),
            BASELINE_LABEL: mode.baseline,
            DIFF_FLAG: `${mode.flag} --target ${platform.target}`,
          }),
        });
      }
    }
  }
  return files;
}

export const components: Concern = {
  name: 'components',

  // views.json must always exist: the scaffolded preview imports it at build
  // time, and a workspace with no specs still has an ordering.
  detect(): boolean {
    return true;
  },

  async build(ws: Workspace): Promise<BuiltFile[]> {
    return [
      { path: 'views.json', content: JSON.stringify(deriveViews(ws), null, 2) + '\n' },
      {
        path: 'modes.json',
        content: JSON.stringify(deriveModes(ws, ws.config.conventions.storybook?.modes), null, 2) + '\n',
      },
      // Always written, empty list included: a consumer importing it at build
      // time must resolve before the workspace has a composition.
      { path: 'compositions.json', content: JSON.stringify(deriveCompositions(ws), null, 2) + '\n' },
      ...viewPages(ws),
    ];
  },
};
