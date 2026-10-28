// Running the chain (ADR-101) — once for `specs build`, continuously for
// `specs run`.
//
// Both use the same plan and the same step bodies. What differs is only what
// happens at the end: `build` exits with a code, `run` watches and goes again
// from whichever step the change belonged to.
//
// Steps are called as functions in this process, never started as separate
// `specs …` commands. That is what keeps the license to one check per run: the
// answer is remembered for the life of a process, and a chain that spawns a
// process per step throws that away every time.
import fs from 'fs-extra';
import path from 'path';
import { resolveWorkspace, type Workspace } from '../storybook/workspace.js';
import { serveStorybook } from '../storybook/serve.js';
import type { Step, StepContext } from './types.js';
import { StepError } from './types.js';
import { entryFor, fromEntry, resolvePlan, watchPaths, writtenBy, type PlanOptions } from './plan.js';

/**
 * Editors write a file two or three times per save, and a fetch rewrites a
 * whole directory at once. Long enough to turn either into one pass, short
 * enough to stay imperceptible between saving a spec and seeing the story.
 * Matches the existing transform watcher so the two cannot feel different.
 */
const DEBOUNCE_MS = 800;

/**
 * Name the steps this workspace has nothing for, and why.
 *
 * Without this an inactive step is simply absent, and a chain missing half its
 * steps reads as a broken run rather than as a workspace that has not got there
 * yet. A fresh workspace ran three of six steps and said nothing about the
 * other three; the only way to learn the truth was `--dry-run`.
 *
 * `render` is left out: it is opt-in, so its absence is already the default and
 * saying so every run would be noise.
 */
function reportInactive(plan: { inactive: Array<{ step: { id: string }; reason: string }> }, who: string): void {
  const worth = plan.inactive.filter(entry => entry.step.id !== 'render');
  if (worth.length === 0) return;
  const named = worth.map(entry => `${entry.step.id} (${entry.reason})`).join(', ');
  console.log(`[${who}] not in this workspace: ${named}`);
}

export interface DriveOptions extends PlanOptions {
  configPath?: string;
  verbose?: boolean;
  dryRun?: boolean;
  /** `--file`, passed through to the render step. */
  fileKey?: string;
}

export interface PassResult {
  ran: number;
  failed: number;
  /** Steps that could not run for a reason outside the workspace. Not failures. */
  skipped: number;
}

function describe(steps: Step[]): string {
  return steps.map(step => step.label).join(' → ');
}

/** Run a list of steps in order, reporting each. Never throws for a step's own failure. */
async function runSteps(
  steps: Step[],
  context: StepContext,
  prefix: string,
): Promise<PassResult> {
  let ran = 0;
  let failed = 0;
  let skipped = 0;

  for (const step of steps) {
    const started = Date.now();
    try {
      const outcome = await step.run(context);
      if (outcome.skipped) {
        skipped++;
        console.warn(`${prefix}  ⚠ ${step.label} skipped — ${outcome.detail ?? 'not available'}`);
        continue;
      }
      ran++;
      const detail = outcome.detail ? ` — ${outcome.detail}` : '';
      console.log(`${prefix}  ✓ ${step.label}${detail} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    } catch (error) {
      failed++;
      if (error instanceof StepError && error.reported) {
        // The step already said what went wrong, in wording written for it.
        console.error(`${prefix}  ✗ ${step.label} — see above`);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${prefix}  ✗ ${step.label}: ${message}`);
        if (error instanceof StepError && error.tip) console.error(`${prefix}    ${error.tip}`);
      }
      // A step's output is the next step's input, so continuing past a failure
      // would run the rest against stale or missing files and report success.
      break;
    }
  }

  return { ran, failed, skipped };
}

/** `specs build` — one pass, then exit. */
export async function build(workspace: Workspace, options: DriveOptions = {}): Promise<number> {
  const plan = resolvePlan(workspace, options);
  const components = options.components ?? [];

  console.log(`[specs build] ${describe(plan.steps)}`);
  if (components.length > 0) console.log(`[specs build] limited to: ${components.join(', ')}`);
  reportInactive(plan, 'specs build');
  if (plan.excluded.length > 0) {
    console.log(`[specs build] not running: ${plan.excluded.map(s => s.id).join(', ')}`);
  }

  if (options.dryRun) {
    console.log('[specs build] --dry-run, so nothing ran.');
    return 0;
  }

  console.log('');
  const result = await runSteps(
    plan.steps,
    { workspace, components, configPath: options.configPath, verbose: options.verbose ?? false, watching: false, fileKey: options.fileKey },
    '',
  );

  console.log('');
  if (result.failed > 0) {
    console.error(`✗ build failed at step ${result.ran + result.skipped + 1} of ${plan.steps.length}`);
    return 1;
  }
  // A skip is named in the summary as well as where it happened: "build
  // complete" on its own would read as though everything asked for was done.
  const skipNote = result.skipped > 0 ? `, ${result.skipped} skipped` : '';
  console.log(`✓ build complete — ${result.ran} step${result.ran === 1 ? '' : 's'}${skipNote}`);
  return 0;
}

/** `specs run` — one pass, then watch. Returns only if setup fails. */
export async function run(workspace: Workspace, options: DriveOptions = {}): Promise<number> {
  const plan = resolvePlan(workspace, options);
  const components = options.components ?? [];
  const context: StepContext = {
    workspace,
    components,
    configPath: options.configPath,
    verbose: options.verbose ?? false,
    watching: true,
    fileKey: options.fileKey,
  };

  console.log(`[specs run] ${describe(plan.steps)}`);
  reportInactive(plan, 'specs run');
  if (plan.excluded.length > 0) {
    console.log(`[specs run] not running: ${plan.excluded.map(s => s.id).join(', ')}`);
  }

  // Curation is a human decision recorded in the manifest, and a rescan can
  // re-derive it. Said once, at the point someone can still act on it.
  if (plan.steps.some(step => step.id === 'scan') && !workspace.config.settings.curation.preserveManualSelections) {
    console.log(
      '[specs run] note: new data in data/ will re-tick the manifest from Figma\'s dev status. ' +
      'Set settings.curation.preserveManualSelections to keep your own selections.',
    );
  }

  if (options.dryRun) {
    console.log(`[specs run] would watch: ${watchPaths(plan, workspace).map(p => path.relative(workspace.root, p) || '.').join(', ')}`);
    console.log('[specs run] --dry-run, so nothing ran.');
    return 0;
  }

  console.log('');
  await runSteps(plan.steps, context, '');

  // Storybook comes up once the content it serves is current, so it never
  // starts against a half-written tree. Skipping the storybook step skips the
  // server with it — asking not to publish and getting a server anyway would be
  // a server showing content nothing is maintaining.
  const storybookChild = plan.steps.some(step => step.id === 'storybook')
    ? serveStorybook(workspace, 'specs run')
    : null;
  if (storybookChild) {
    const stop = () => {
      storybookChild.kill('SIGINT');
      process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  }

  const watched = watchPaths(plan, workspace);
  console.log('');
  console.log(`[specs run] watching ${watched.map(p => path.relative(workspace.root, p) || '.').join(', ')} — Ctrl-C to stop`);

  // One pass at a time. A change arriving mid-pass is remembered and folded
  // into the next, rather than starting a second pass over the same files.
  //
  // The paths are what is remembered, not the step they resolved to. A
  // workspace changes shape while a session is open — a platform tree deleted,
  // a Storybook scaffolded — and a plan fixed at startup keeps running steps
  // the workspace no longer has. It did exactly that: with `react/` renamed
  // away mid-session, the next pass emitted into it and recreated the whole
  // tree, `package.json` and all. So the plan is re-derived per pass, and the
  // entry step is decided against the plan that is true now.
  let currentWorkspace = workspace;
  let currentPlan = plan;
  let runningSteps: Step[] | null = null;
  let pendingPaths = new Set<string>();
  let timer: NodeJS.Timeout | undefined;

  const drain = async () => {
    if (runningSteps || pendingPaths.size === 0) return;
    const changed = [...pendingPaths];
    pendingPaths = new Set();

    // Re-read the workspace, then the plan. A step whose tree has gone is gone
    // with it; one whose tree has appeared joins in.
    const before = currentPlan.steps.map(s => s.id).join(',');
    try {
      currentWorkspace = resolveWorkspace(options.configPath);
      currentPlan = resolvePlan(currentWorkspace, options);
    } catch (error) {
      // The workspace stopped being one — config deleted, specs directory
      // gone. Say so and keep watching; the next save may put it back.
      console.error(`[specs run] ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    // Name what joined or left, not the whole new list. Printing the full chain
    // here reads as though those steps just ran — it is the line directly above
    // the one that says what *is* running, in the same format.
    const afterIds: string[] = currentPlan.steps.map(s => s.id);
    const beforeIds: string[] = before ? before.split(',') : [];
    const dropped = beforeIds.filter(id => !afterIds.includes(id));
    const added = afterIds.filter(id => !beforeIds.includes(id));
    if (dropped.length > 0 || added.length > 0) {
      console.log('');
      if (dropped.length > 0) {
        console.log(`[specs run] ${dropped.join(' and ')} ${dropped.length === 1 ? 'is' : 'are'} no longer in this workspace — dropped from the chain`);
      }
      if (added.length > 0) {
        console.log(`[specs run] ${added.join(' and ')} ${added.length === 1 ? 'is' : 'are'} back — added to the chain`);
      }

      // Storybook decides which platform trees to glob when it boots, and never
      // again — `main.ts` runs `existsSync` once. So a tree that appears while
      // the server is up gets emitted by the chain and shown by nobody, which
      // reads as the emit having silently failed. The chain cannot fix that from
      // here; say what will.
      const platformChanged = [...added, ...dropped].some(id => id === 'react' || id === 'webcomponents');
      if (platformChanged && storybookChild) {
        console.log('[specs run] Storybook reads which platform trees to show once, at startup — restart `specs run` for this to appear in it');
      }
    }

    // Earliest entry among everything that changed, and the union of what it
    // scopes to. An unscoped change widens the pass to every component, which
    // is what an empty set means.
    let entryStep: Step | null = null;
    let scope: Set<string> | null = new Set();
    for (const file of changed) {
      const entry = entryFor(currentPlan, currentWorkspace, file);
      if (!entry) continue;
      if (!entryStep || currentPlan.steps.indexOf(entry.step) < currentPlan.steps.indexOf(entryStep)) {
        entryStep = entry.step;
      }
      if (entry.components.length === 0) scope = null;
      else if (scope) for (const key of entry.components) scope.add(key);
    }
    if (!entryStep) return;

    const steps = fromEntry(currentPlan, { step: entryStep, components: [] });
    runningSteps = steps;
    const keys = scope ? [...scope] : [];
    const scopeLabel = keys.length > 0 ? ` (${keys.join(', ')})` : '';
    console.log('');
    console.log(`[specs run] ${describe(steps)}${scopeLabel}`);
    try {
      await runSteps(steps, { ...context, workspace: currentWorkspace, components: keys }, '');
    } finally {
      runningSteps = null;
      if (pendingPaths.size > 0) void drain();
    }
  };

  // One save, several events. macOS reports a single write more than once, and
  // the copies arrive far enough apart to land either side of the debounce —
  // one `touch` of the manifest produced two full passes. Modification time
  // tells them apart: duplicates of one write carry the same stamp, while a
  // genuine second edit carries a later one.
  const lastSeen = new Map<string, number>();
  const isRepeat = (file: string): boolean => {
    let mtime: number;
    try {
      mtime = fs.statSync(file).mtimeMs;
    } catch {
      return false; // deleted, or gone before we looked — treat as real
    }
    if (lastSeen.get(file) === mtime) return true;
    lastSeen.set(file, mtime);
    return false;
  };

  const onChange = (changed: string) => {
    if (isRepeat(changed)) return;

    // A step writing its own output mid-pass is the pass talking to itself —
    // `generate` rewrites `specs/`, which the targets watch. Queueing that would
    // run the targets a second time for one change. Only the steps actually
    // running are consulted, so a spec someone edits while an unrelated pass is
    // in flight is still picked up.
    if (runningSteps && writtenBy(runningSteps, currentWorkspace, changed)) return;

    // Which step this becomes is decided at drain time, against the plan that
    // is true then — not here, against the one that was true at startup.
    pendingPaths.add(changed);

    clearTimeout(timer);
    timer = setTimeout(() => void drain(), DEBOUNCE_MS);
  };

  // Never watch a file directly, even when a file is what a step declares.
  //
  // `fs.watch` on a file follows the inode, and a great many editors save by
  // writing a temp file and renaming it over the target — VS Code among them.
  // That replaces the inode, so the watch fires once and is then attached to
  // something nothing will ever write again. The manifest proved it: ticking a
  // checkbox worked, and every edit after it was invisible.
  //
  // So a file input is watched through its directory, filtered to that one
  // name. Directory watches survive the rename.
  const directories = watched.filter(p => fs.existsSync(p) && fs.statSync(p).isDirectory());
  const fileNamesByDirectory = new Map<string, Set<string>>();
  for (const target of watched) {
    if (directories.includes(target)) continue;
    const parent = path.dirname(target);
    // A recursive watch above it already sees this file.
    if (directories.some(dir => parent === dir || parent.startsWith(dir + path.sep))) continue;
    const names = fileNamesByDirectory.get(parent) ?? new Set<string>();
    names.add(path.basename(target));
    fileNamesByDirectory.set(parent, names);
  }

  for (const dir of directories) {
    fs.watch(dir, { recursive: true }, (_event, filename) => {
      if (filename) onChange(path.join(dir, filename.toString()));
    });
  }

  for (const [dir, names] of fileNamesByDirectory) {
    if (!fs.existsSync(dir)) continue;
    fs.watch(dir, { recursive: false }, (_event, filename) => {
      // Only the declared files. The directory holds other things — fetched
      // payloads, caches — and a change to one of those is not this input's.
      if (filename && names.has(path.basename(filename.toString()))) {
        onChange(path.join(dir, path.basename(filename.toString())));
      }
    });
  }

  await new Promise(() => {}); // until Ctrl-C
  return 0;
}
