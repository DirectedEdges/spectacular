// The chain itself (ADR-101): which steps exist, what each one reads and writes,
// and when a workspace has something for it to do.
//
// This is the single place the order lives. It used to live in the order a
// person typed commands, which is why a forgotten `specs react` left Storybook
// showing the previous emission with nothing to say so.
//
// `specs fetch` is deliberately absent. Its input is the Figma file, which the
// CLI cannot watch, so no change could ever start it — it is something a person
// runs, and what it writes into `data/` is picked up from `scan` onward.
import fs from 'fs-extra';
import path from 'path';
import type { Step, StepContext, StepInput } from './types.js';
import { StepError } from './types.js';
import type { Workspace } from '../storybook/workspace.js';
import { resolveSpecsLayout, SPEC_KINDS, dirNameFor } from '../utilities/specsLayout.js';

/**
 * The component key a changed spec file belongs to, or null when the change is
 * not confined to one component.
 *
 * Only paths *inside* a spec folder scope. A file sitting loose at the specs
 * root belongs to no component, and guessing one would emit the wrong thing.
 */
function specScope(specsDir: string, changed: string): string[] | null {
  const relative = path.relative(specsDir, changed);
  if (!relative || relative.startsWith('..')) return null;

  const segments = relative.split(path.sep);
  const layout = resolveSpecsLayout(specsDir);

  if (layout.legacy) {
    // Flat layout: specs/<key>/api.yaml
    return segments.length >= 2 ? [segments[0]] : null;
  }

  // specs/<kind>/<key>/api.yaml
  const kindDirs = SPEC_KINDS.map(dirNameFor);
  if (segments.length >= 3 && kindDirs.includes(segments[0])) return [segments[1]];
  return null;
}

/** Data sources with a file payload on disk, in either the split or single-file shape. */
function filePayloads(ws: Workspace): Array<{ alias: string; input: string; manifest: string }> {
  return ws.sources
    .filter(source => source.fetch.includes('file'))
    .map(source => {
      const splitDir = path.join(ws.dataDir, `${source.alias}.file`);
      const single = path.join(ws.dataDir, `${source.alias}.file.json`);
      return {
        alias: source.alias,
        input: fs.existsSync(splitDir) ? splitDir : single,
        manifest: path.join(ws.dataDir, `${source.alias}.manifest.md`),
      };
    })
    .filter(entry => fs.existsSync(entry.input));
}

/**
 * `config/`, watched by every step that reads conventions or settings.
 *
 * `ws.configDir`, never `ws.config.configDir` — the latter is the directory
 * *containing* config/, which is the workspace root. Watching that put every
 * emitted tree under the watcher, so hand-editing a generated file kicked off
 * a full re-emit that overwrote it.
 */
function configInput(ws: Workspace): StepInput[] {
  const dir = ws.configDir;
  // A config change decides the shape of every component's output, so it is
  // never scoped to one of them.
  return dir && fs.existsSync(dir) ? [{ path: dir, scope: () => null }] : [];
}

/**
 * The glyph SVGs `specs fetch --only <alias>,icons` writes, which the targets read to
 * emit icon components.
 *
 * A fetch that adds or changes an icon changes what the targets should emit, with no
 * spec having changed — so without this a newly declared `glyphs` convention lands the
 * SVGs and nothing re-emits. The symptom is a Storybook showing the icons it had before.
 *
 * Matched by directory name rather than built from `ws.sources`, because an ad-hoc
 * source writes to `icons-<alias>` and the library to `icons`.
 *
 * Scoped to the icons directories, never `assets/` itself: the targets write
 * `assets/cssvars/`, so watching the parent would make each pass start the next one.
 */
function glyphAssetInputs(ws: Workspace): StepInput[] {
  if (!fs.existsSync(ws.assetsDir)) return [];
  return fs
    .readdirSync(ws.assetsDir)
    .filter(entry => entry === 'icons' || entry.startsWith('icons-'))
    .map(entry => path.join(ws.assetsDir, entry))
    .filter(dir => fs.statSync(dir).isDirectory())
    // A glyph is referenced by any component, so a change here is never one component's.
    .map(dir => ({ path: dir, scope: () => null }));
}

const scan: Step = {
  id: 'scan',
  label: 'scan',
  active: ws => filePayloads(ws).length > 0,
  inactiveBecause: () => 'no fetched Figma payload in data/',
  // `config/` is an input because the `glyphs` convention decides what this step
  // excludes. Declaring a convention has to re-scan, or the manifest keeps counting
  // glyphs as components.
  inputs: ws => [
    ...filePayloads(ws).map(p => ({ path: p.input, scope: () => null as string[] | null })),
    ...configInput(ws),
  ],
  // The manifest is this step's output, so writing it must not start it again.
  // It is also `generate`'s input, which is what makes ticking a checkbox
  // regenerate what it selected.
  outputs: ws => filePayloads(ws).map(p => p.manifest),
  async run(context) {
    const { runScan } = await import('../commands/scan.js');
    const payloads = filePayloads(context.workspace);
    for (const payload of payloads) {
      await runScan(undefined, {
        source: payload.alias,
        config: context.configPath,
        verbose: context.verbose,
        includeAll: false,
        keepChecks: false,
        resetChecks: false,
      });
    }
    return { detail: `${payloads.length} source${payloads.length === 1 ? '' : 's'}` };
  },
};

const generate: Step = {
  id: 'generate',
  label: 'generate',
  active: ws => filePayloads(ws).some(p => fs.existsSync(p.manifest)),
  inactiveBecause: ws => filePayloads(ws).length === 0
    ? 'no fetched Figma payload in data/'
    : 'no manifest yet — scan writes it',
  // `config/` decides the shape of everything this step writes — keys, naming, slots,
  // glyphs. Without it here, a convention change re-ran `analyze` and both platform
  // trees while the specs they read stayed as they were, so the pass printed a clean
  // run over stale input. That is how a newly declared `glyphs` convention left glyph
  // names out of the specs until someone ran `specs generate` by hand.
  inputs: ws => [
    ...filePayloads(ws).map(p => ({ path: p.manifest, scope: () => null as string[] | null })),
    ...configInput(ws),
  ],
  outputs: ws => [ws.specsDir],
  async run(context) {
    const { runGenerate } = await import('../commands/generate.js');
    const result = await runGenerate(undefined, {
      config: context.configPath,
      verbose: context.verbose,
      component: context.components.length === 1 ? context.components[0] : undefined,
    });
    return { detail: result.detail };
  },
};

/**
 * The analyzers, writing their reports into `specs/analysis/`.
 *
 * Sits between `generate` and the target stages, which is where both its edges
 * put it: it reads `specs/`, so it cannot precede `generate`, and
 * `storybook publish` publishes a page per report, so it cannot follow the step
 * that consumes what it writes. That makes it the only edge in the chain between
 * two local steps — everything else reads `specs/` or `data/` directly.
 *
 * Being ahead of `react` and `webcomponents` is not a dependency — neither reads
 * an analysis — but it is not arbitrary either. The styling analyzer writes a
 * `styling.*` document into each spec folder, and the spec folder is what the
 * targets watch. Running first means everything this pass will write into a spec
 * folder is already there by the time a target reads it, so one change settles in
 * one pass.
 */
const analyze: Step = {
  id: 'analyze',
  label: 'analyze',
  active: ws => ws.hasSpecs,
  inactiveBecause: () => 'no specs/ yet — generate writes them',
  inputs: ws => [
    // Scoped the same way the targets are, even though this step ignores the
    // scope. `analyze` is now the earliest step a spec change enters, and the
    // entry is where the pass learns which component changed — declaring this
    // unscoped would widen every spec edit to a full re-emit of both platform
    // trees. So the keys are resolved here and passed down; what this step does
    // with them is its own business, and what it does is ignore them.
    { path: ws.specsDir, scope: changed => specScope(ws.specsDir, changed) },
    ...configInput(ws),
    // Variables and styles are the token universe the unused-token report needs.
    // A fetch that refreshes them changes what the report should say, with no
    // spec having changed at all.
    ...ws.sources.flatMap(source =>
      (['variables', 'styles'] as const)
        .filter(kind => source.fetch.includes(kind))
        .map(kind => path.join(ws.dataDir, `${source.alias}.${kind}.json`))
        .filter(file => fs.existsSync(file))
        .map(file => ({ path: file, scope: () => null })),
    ),
  ],
  // Both of its writes land under `specs/`: the reports in `analysis/`, and a
  // `styling.*` document in each spec folder. Declaring the specs directory
  // covers both, and is what stops the pass from re-triggering itself on its own
  // output mid-flight.
  outputs: ws => [ws.specsDir],
  async run(context) {
    const { runAnalyze } = await import('../commands/analyze.js');
    // `context.components` is deliberately not passed on. Each analyzer's
    // `finalize()` aggregates only the specs it visited, so a scoped analyze
    // would overwrite a catalogue-wide report with a one-component one and
    // report success. The reports are shared output even though the input is read
    // per spec, which is the same reason `config/` never scopes a target.
    const result = await runAnalyze([], {
      config: context.configPath,
      verbose: context.verbose,
    });
    return { detail: result.detail };
  },
};

/** `react` and `webcomponents` differ only in which tree they emit into. */
function targetStep(id: 'react' | 'webcomponents', tree: string): Step {
  return {
    id,
    label: id,
    active: ws => (id === 'react' ? ws.hasReact : ws.hasWebComponents),
    inactiveBecause: () => `no ${tree}/ tree`,
    inputs: ws => [
      { path: ws.specsDir, scope: changed => specScope(ws.specsDir, changed) },
      ...configInput(ws),
      ...glyphAssetInputs(ws),
    ],
    outputs: ws => [path.join(ws.root, tree, 'src')],
    async run(context) {
      const { emitTarget } = await import('../emit/targets.js');
      const result = await emitTarget(id, {
        config: context.configPath,
        components: context.components.length > 0 ? context.components : undefined,
        verbose: context.verbose,
      });
      if (result.failed > 0) {
        throw new StepError(`${result.failed} component${result.failed === 1 ? '' : 's'} failed to emit`);
      }
      return { detail: `${result.succeeded} component${result.succeeded === 1 ? '' : 's'}` };
    },
  };
}

const storybook: Step = {
  id: 'storybook',
  label: 'storybook publish',
  active: ws => ws.scaffolded,
  inactiveBecause: () => 'no Storybook host scaffolded',
  inputs: ws => {
    // `content-overrides/` is an input, not just somewhere a person keeps
    // files. Publish decides whether to write a generated page by whether an
    // override shadows it, so adding one has to re-run publish — otherwise the
    // page it replaces sits there stale until something else happens to
    // trigger a pass.
    const overrides = path.join(ws.storybookDir, 'content-overrides');
    return [
      { path: ws.specsDir, scope: () => null },
      ...configInput(ws),
      ...(fs.existsSync(ws.assetsDir) ? [{ path: ws.assetsDir, scope: () => null }] : []),
      ...(fs.existsSync(overrides) ? [{ path: overrides, scope: () => null }] : []),
    ];
  },
  outputs: ws => [path.join(ws.storybookDir, 'content')],
  async run(context) {
    const { publish } = await import('../storybook/publish.js');
    const result = await publish(context.workspace);
    const changed = Object.values(result.concerns).reduce((sum, counts) => sum + counts.changed, 0);
    return { detail: changed > 0 ? `${changed} file${changed === 1 ? '' : 's'} changed` : 'already current' };
  },
};

/**
 * Rendering specs back into the connected Figma file.
 *
 * The only step that writes somewhere other than disk, which is why it is off
 * unless asked for. Two consequences follow from that, and both are deliberate:
 *
 *  - It is last. Nothing reads what it writes, so nothing depends on it.
 *  - It does not overwrite in a one-shot build. Overwriting deletes an existing
 *    same-titled page component first, which is the normal case when a watch
 *    loop re-renders the component you just edited, and a destructive surprise
 *    in a build someone ran once. `specs render --overwrite` is still there for
 *    doing it on purpose.
 */
const render: Step = {
  id: 'render',
  label: 'render',
  active: ws => ws.hasSpecs,
  inactiveBecause: () => 'no specs/ to render',
  inputs: ws => [{ path: ws.specsDir, scope: changed => specScope(ws.specsDir, changed) }],
  // Writes to Figma, not to disk. Nothing local to suppress.
  outputs: () => [],
  async run(context) {
    const { runRender } = await import('../commands/render.js');
    const result = await runRender({
      config: context.configPath,
      components: context.components.length > 0 ? context.components : undefined,
      overwrite: context.watching,
      file: context.fileKey,
    });
    if (result.skipped) return { skipped: true, detail: result.skipped };
    return { detail: `${result.rendered} component${result.rendered === 1 ? '' : 's'}` };
  },
};

/** Every step, in dependency order. */
export const STEPS: readonly Step[] = [
  scan,
  generate,
  analyze,
  targetStep('react', 'react'),
  targetStep('webcomponents', 'webcomponents'),
  storybook,
  render,
];

/** The steps off unless asked for by name — see `render` above. */
export const OPT_IN: ReadonlySet<string> = new Set<string>(['render']);

export function stepById(id: string): Step | undefined {
  return STEPS.find(step => step.id === id);
}

export type { Step, StepContext };
