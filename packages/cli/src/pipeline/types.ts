// What a step is, and what running one means (ADR-101).
//
// A step is a function with its inputs and outputs written down. Everything the
// chain can do — ordering, deciding what a change affects, suppressing a step's
// own writes — reads those declarations rather than knowing about any particular
// command.
import type { Workspace } from '../storybook/workspace.js';

/**
 * The steps, in the order they depend on each other.
 *
 * `render` is in the vocabulary but not yet in the chain — see `STEPS` in
 * `steps.ts` for why. Naming it in `--only` or `--skip` is understood, so the
 * refusal can say what is actually going on rather than "unknown step".
 */
export const STEP_IDS = [
  'scan',
  'generate',
  'analyze',
  'react',
  'webcomponents',
  'storybook',
  'render',
] as const;

export type StepId = (typeof STEP_IDS)[number];

/**
 * A path the chain watches, and what a change there means.
 *
 * `scope` turns a changed file into the component keys the step should be
 * limited to. Returning `null` means the change is not per-component and the
 * step runs over everything — which is the right answer for `config/` and
 * `assets/`, where one file decides the shape of every component's output.
 */
export interface StepInput {
  /** Absolute path to a file or directory to watch. */
  path: string;
  /** Component keys this change is confined to, or null for "all of them". */
  scope?: (changedPath: string) => string[] | null;
}

export interface StepContext {
  workspace: Workspace;
  /** Limit the run to these component folders. Empty means all of them. */
  components: string[];
  /** The `--config` path as given, passed through to each command's own loader. */
  configPath?: string;
  verbose: boolean;
  /**
   * True under `specs run`. Only `render` reads it, and only to decide whether
   * to overwrite: re-rendering the same component is the normal case in a watch
   * loop and a destructive surprise in a one-shot build.
   */
  watching: boolean;
  /** `--file`: which connected Figma file `render` targets. Only `render` reads it. */
  fileKey?: string;
}

export interface StepOutcome {
  /** A short line for the run summary — "12 components", "4 files changed". */
  detail?: string;
  /**
   * The step did not run, and that is not a failure.
   *
   * For conditions outside the workspace that mean the work cannot happen
   * rather than that something is wrong: no bridge for `render` to talk to,
   * more than one Figma file connected with no way to tell which was meant.
   * Reported loudly, counted separately, and never allowed to decide an exit
   * code — a missing Figma session should not fail a build whose every other
   * step wrote what it was supposed to.
   */
  skipped?: boolean;
}

export interface Step {
  id: StepId;
  /** How the step is named in output. */
  label: string;
  /** False when the workspace has nothing for this step to do. */
  active(workspace: Workspace): boolean;
  /**
   * Why `active` is false, in a few words, for the startup line that names the
   * steps this workspace does not have.
   *
   * An inactive step used to be dropped before anything could report it, so a
   * chain missing half its steps read as a broken run rather than as a workspace
   * that has not got there yet. Written as the condition, not the remedy —
   * "nothing scaffolded", not "run storybook init".
   */
  inactiveBecause(workspace: Workspace): string;
  /** Paths that, when changed, mean this step should run. */
  inputs(workspace: Workspace): StepInput[];
  /**
   * Paths this step writes. A change under one of these is ignored by the
   * watcher — without this, every step would re-trigger itself forever.
   */
  outputs(workspace: Workspace): string[];
  run(context: StepContext): Promise<StepOutcome>;
}

/**
 * A failure that is this step's own, with the exit code the one-shot path uses.
 *
 * Steps throw rather than exiting. `specs build` turns the first one into an
 * exit code; `specs run` reports it and keeps watching, because the fix is the
 * next time a file is saved. Defined in its own module so a command can throw
 * it without importing the workspace types.
 */
export { StepError } from './StepError.js';
