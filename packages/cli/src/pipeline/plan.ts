// Working out what should run (ADR-101).
//
// Two questions, both answered here so neither `build` nor `run` can form its
// own opinion: which steps a workspace has, and — for `run` — which step a
// changed file belongs to.
import path from 'path';
import type { Workspace } from '../storybook/workspace.js';
import { STEPS, OPT_IN, type Step } from './steps.js';
import { STEP_IDS, StepError, type StepId } from './types.js';

export interface PlanOptions {
  only?: string[];
  skip?: string[];
  render?: boolean;
  components?: string[];
}

export interface Plan {
  steps: Step[];
  /** Steps a workspace has but this run was told to leave out, for reporting. */
  excluded: Step[];
  /**
   * Steps this workspace has nothing for, each with why.
   *
   * Reported because an absent step is indistinguishable from a broken run.
   * These were dropped before anything could name them, so a fresh workspace
   * ran three of six steps and said nothing about the other three.
   */
  inactive: Array<{ step: Step; reason: string }>;
}

function assertKnown(names: string[], flag: string): void {
  const unknown = names.filter(name => !STEP_IDS.includes(name as never));
  if (unknown.length > 0) {
    throw new StepError(
      `${flag}: unknown step${unknown.length === 1 ? '' : 's'} ${unknown.join(', ')}`,
      2,
      `known steps: ${STEP_IDS.join(', ')}`,
    );
  }
}

/** The steps whose `active` is "this tree exists", which is an opt-out rather than a fact. */
const PLATFORM_STEPS = new Set<StepId>(['react', 'webcomponents']);

/**
 * The steps this run will perform, in order.
 *
 * A step is in when the workspace has something for it to do, it is not opt-in
 * (or was opted into), and `--only`/`--skip` did not remove it.
 *
 * A platform step is the exception, because its `active` reads a directory that
 * means two different things. `react/src` present is "emit React here"; absent is
 * either "this workspace does not want React" or "nothing has ever run" — and the
 * chain cannot tell those apart from the directory alone. Deciding it is an
 * opt-out either way is wrong on a new workspace, where it silently performs three
 * of its six steps and emits no code at all.
 *
 * So the opt-out only counts once there is evidence of a choice. With **specs to
 * emit, no platform tree at all, and no scoping flag**, nothing has expressed a
 * preference, and every platform emits. From the moment one tree exists, the
 * directories are the answer and a missing one means opted out. Deleting a tree
 * still turns that platform off; deleting the last one returns the workspace to
 * "no preference", which is what it meant before the first run.
 *
 * The specs precondition is what keeps a bare directory bare: with nothing to emit
 * from, a platform step is not an unexpressed preference, it is nothing to do.
 */
export function resolvePlan(workspace: Workspace, options: PlanOptions = {}): Plan {
  if (options.only?.length && options.skip?.length) {
    throw new StepError('--only and --skip cannot be used together', 2);
  }
  if (options.only?.length) assertKnown(options.only, '--only');
  if (options.skip?.length) assertKnown(options.skip, '--skip');


  const only = options.only?.length ? new Set(options.only) : null;
  const skip = new Set(options.skip ?? []);

  // Naming any step is itself a preference, so a scoped run never takes this path.
  const noPlatformChosen =
    workspace.hasSpecs && !workspace.hasReact && !workspace.hasWebComponents && !only && skip.size === 0;

  const steps: Step[] = [];
  const excluded: Step[] = [];
  const inactive: Array<{ step: Step; reason: string }> = [];

  for (const step of STEPS) {
    const active = step.active(workspace) || (noPlatformChosen && PLATFORM_STEPS.has(step.id));
    if (!active) {
      inactive.push({ step, reason: step.inactiveBecause(workspace) });
      continue;
    }

    // `--only` names exactly what runs, opt-in steps included: naming `render`
    // is as explicit as `--render`.
    const wanted = only
      ? only.has(step.id)
      : !skip.has(step.id) && (!OPT_IN.has(step.id) || options.render === true);

    (wanted ? steps : excluded).push(step);
  }

  if (steps.length === 0) {
    throw new StepError(
      'nothing to do in this workspace',
      2,
      'run `specs init` to scaffold one, or `specs fetch` to bring in data for `scan` to read',
    );
  }

  return { steps, excluded, inactive };
}

export interface Entry {
  /** The step the change belongs to; everything after it in the plan follows. */
  step: Step;
  /** Component keys to limit the run to, empty for all of them. */
  components: string[];
}

/**
 * Which step a changed file belongs to, or null when nothing watches it.
 *
 * The earliest step in the plan wins: a spec change matches both `react` and
 * `storybook`, and starting at `react` is what makes the publish see the new
 * emission rather than the one before it.
 *
 * Note what this deliberately does *not* do: ignore paths that some step
 * declares as an output. `specs/` is `generate`'s output and the targets'
 * input, and a change there flowing downstream is the entire point of the
 * chain — suppressing it by path would mean a spec edit emitted nothing.
 * Telling the chain's own writes apart from a person's is a question about the
 * pass that is running, not about the path; `writtenBy` answers it.
 */
export function entryFor(plan: Plan, workspace: Workspace, changed: string): Entry | null {
  const absolute = path.resolve(changed);

  for (const step of plan.steps) {
    for (const input of step.inputs(workspace)) {
      if (absolute !== input.path && !absolute.startsWith(input.path + path.sep)) continue;
      const scoped = input.scope?.(absolute) ?? null;
      return { step, components: scoped ?? [] };
    }
  }

  return null;
}

/**
 * Whether one of these steps wrote this path.
 *
 * Used while a pass is in flight: `generate` rewriting `specs/` mid-pass is the
 * pass talking to itself, and queueing another pass for it would run the
 * targets twice for one change. A change under a path that *no* running step
 * writes is a person editing a file, and must not be dropped — which is why
 * this asks about the steps actually running rather than about every step.
 */
export function writtenBy(steps: readonly Step[], workspace: Workspace, changed: string): boolean {
  const absolute = path.resolve(changed);
  return steps.some(step =>
    step.outputs(workspace).some(out => absolute === out || absolute.startsWith(out + path.sep)),
  );
}

/** The entry step and everything after it. */
export function fromEntry(plan: Plan, entry: Entry): Step[] {
  const index = plan.steps.indexOf(entry.step);
  return index === -1 ? [] : plan.steps.slice(index);
}

/** Every distinct path the plan watches. */
export function watchPaths(plan: Plan, workspace: Workspace): string[] {
  const paths = new Set<string>();
  for (const step of plan.steps) {
    for (const input of step.inputs(workspace)) paths.add(input.path);
  }
  return [...paths].sort();
}
