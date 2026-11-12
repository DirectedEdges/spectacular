// The components concern: the views a component offers, and the navigation
// contract between what the workspace emitted and how the host orders it
// (specs#642/#631).
//
// A component is a folder in the sidebar and every view of it is a leaf inside
// it. Two of those leaves are the emitters' — React and Web component — and the
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
import { PLATFORM_LEAVES, specDisplayName, specNavFolder } from './navTitle.js';

/**
 * A spec document published as its own view. `examples` is deliberately not one.
 *
 * `api` and `variants` every run generates, so their view is always there and an
 * absent file is a defect worth saying so about. `supplemental` and `guidelines`
 * are authored by hand (ADR-118) — supplemental for whoever builds the
 * component, guidelines for whoever uses it — and most components have neither,
 * so those views appear only where the document does. A view that exists only to
 * report its own emptiness is noise on every component in the catalogue.
 */
const SPEC_VIEWS = [
  { leaf: 'API', concern: 'api', always: true },
  { leaf: 'Variants', concern: 'variants', always: true },
  { leaf: 'Supplemental', concern: 'supplemental', always: false },
  { leaf: 'Guidelines', concern: 'guidelines', always: false },
] as const;

/** The folder the per-component diff pages sit in, below the views themselves. */
const TESTING_FOLDER = 'Testing';

/**
 * The two questions a diff answers, and the report each writes. Mirrors the
 * Testing section's own pages — same report basenames, same baseline wording,
 * same flag in the empty state — because these show one component's variants in
 * full where those rank every component against each other.
 */
const DIFF_MODES = [
  { mode: 'figma' as const, leaf: 'Fidelity', baseline: 'Figma exports', flag: '' },
  { mode: 'accepted' as const, leaf: 'Changes', baseline: 'last accepted renders', flag: ' --against accepted' },
];

const PLATFORMS = [
  { target: 'react' as const, leaf: PLATFORM_LEAVES.react, emitted: (ws: Workspace) => ws.hasReact },
  { target: 'webcomponents' as const, leaf: PLATFORM_LEAVES.webcomponents, emitted: (ws: Workspace) => ws.hasWebComponents },
];

/**
 * Every nav segment below a component, in the order the sidebar reads them: the
 * views themselves, then the Testing folder, then what is inside it.
 *
 * Not published, and that is forced rather than chosen: Storybook's indexer
 * extracts the preview's `storySort` out of its AST and `eval`s it on its own, so
 * that function can reference no import and no module constant. The order lives
 * as a literal inside it. This export exists so a test can hold the two copies
 * to the same names — a segment the preview does not rank sorts alphabetically
 * and lands in the wrong place, which nothing errors on.
 *
 * A subcomponent folder is deliberately absent: it is ranked by not being here,
 * which is what puts it after everything the component itself offers.
 */
export function viewLeaves(): string[] {
  return [
    ...PLATFORMS.map((p) => p.leaf),
    ...SPEC_VIEWS.map((v) => v.leaf),
    TESTING_FOLDER,
    ...PLATFORMS.flatMap((p) => DIFF_MODES.map((m) => `${p.leaf} ${m.leaf}`)),
  ];
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
function specFolders(
  ws: Workspace,
): Array<{ kind: SpecKind; key: string; navFolder: string; folder: string }> {
  const layout = resolveSpecsLayout(ws.specsDir);
  const out: Array<{ kind: SpecKind; key: string; navFolder: string; folder: string }> = [];
  for (const kind of SPEC_KINDS) {
    const keys = kind === 'component' ? ws.componentKeys : ws.compositionKeys;
    for (const key of keys) {
      const folder = layout.folderFor(kind, key);
      const api = readSpecDoc(folder, 'api');
      const title = typeof api?.title === 'string' ? api.title : undefined;
      out.push({ kind, key, navFolder: specNavFolder(kind, key, title), folder });
    }
  }
  return out;
}

/** Whether a spec folder holds one concern document, in any format it may take. */
function hasSpecDoc(folder: string, concern: string): boolean {
  return ['yaml', 'yml', 'json'].some((ext) => fs.existsSync(path.join(folder, `${concern}.${ext}`)));
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

/**
 * Whether one spec has results in the first of these reports that exists.
 *
 * A report covers the specs the visual manifest pinned, which is rarely the whole
 * catalogue: gating on the report file alone published a page for every component
 * and most of them said "this spec isn't in the visual manifest". The reports are
 * keyed by spec folder key — the same key this concern names its pages after — so
 * the check is a lookup, not a match.
 *
 * Only the first existing report is consulted, because that is the one the page
 * will read: a later candidate it never reaches must not decide whether it
 * publishes.
 */
function reportHasSpec(ws: Workspace, candidates: string[], kindDir: string, key: string): boolean {
  for (const name of candidates) {
    const file = path.join(ws.root, 'testing', 'visual', 'report', `${name}.json`);
    if (!fs.existsSync(file)) continue;
    try {
      const report = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, Record<string, unknown> | undefined>;
      return Boolean(report[kindDir]?.[key]);
    } catch {
      // An unreadable report is the diff's problem. Publish nothing from it
      // rather than failing the whole publish over one malformed file.
      return false;
    }
  }
  return false;
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

    const displayName = specDisplayName(spec.navFolder);

    for (const view of SPEC_VIEWS) {
      if (!view.always && !hasSpecDoc(spec.folder, view.concern)) continue;
      files.push({
        path: path.join(dir, `${view.leaf}.stories.tsx`),
        content: renderTemplate(specTemplate, {
          NAV_TITLE: `${spec.navFolder}/${view.leaf}`,
          PAGE_HEADING: JSON.stringify(`${displayName} / ${view.leaf}`),
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
        // A page publishes only when this spec has results to show, so the
        // Testing folder lists what a reader can actually open.
        if (!reportHasSpec(ws, candidates, kindDir, spec.key)) continue;
        const leaf = `${platform.leaf} ${mode.leaf}`;
        files.push({
          path: path.join(dir, `${platform.target}-${mode.mode}.stories.tsx`),
          content: renderTemplate(testingTemplate, {
            NAV_TITLE: `${spec.navFolder}/${TESTING_FOLDER}/${leaf}`,
            PAGE_HEADING: JSON.stringify(`${displayName} / ${leaf}`),
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

  // modes.json and compositions.json must always exist: the scaffolded host
  // imports them at build time, before a workspace has modes or compositions.
  detect(): boolean {
    return true;
  },

  async build(ws: Workspace): Promise<BuiltFile[]> {
    return [
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
