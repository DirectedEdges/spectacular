// What `specs react` and `specs webcomponents` are: one emitted target each.
//
// A target is emitted whole — the component, its contract, its stylesheet and its
// stories — because everything a component needs is decided together. A role
// annotated in Figma changes the element the scaffold emits, the props its contract
// declares, and the user-agent styling its CSS resets. Those were once separate
// transformers a user had to name in the right order.
//
// The two command files are four lines each, calling `targetCommand` here. The
// flags live in one place so the pair cannot drift on what they accept, and
// `emitTarget` is here rather than in a command file so `pipeline/steps.ts` can
// call it without importing a command.
import { Command } from 'commander';
import { CssTransformer } from '../transforms/Css.js';
import { CssvarsTransformer } from '../transforms/Cssvars.js';
import { ReactTransformer, StoriesTransformer, proEntitled as reactProEntitled } from '@directededges/react-from-specs';
import { WebComponentsTransformer, WcStoriesTransformer, proEntitled as wcProEntitled } from '@directededges/webcomponents-from-specs';
import type { Transformer } from '../transforms/transformer.js';
import { runEmitters, emitOnce, type EmitOptions, type EmitResult } from './run.js';

export type TargetId = 'react' | 'webcomponents';

interface TargetOptions extends EmitOptions {
  /** Commander sets this false when `--no-stories` is passed. */
  stories: boolean;
}

/**
 * The transformers one target runs.
 *
 * `CssTransformer` is constructed for this target alone: one pass derives both
 * platforms' stylesheets, and `specs react` must not leave a `webcomponents/` tree
 * behind it. `cssvars` is library-level and platform-neutral — whichever target
 * runs produces the same file, which is why it has no command of its own.
 */
function transformersFor(target: TargetId, stories: boolean): Transformer[] {
  const emit: Transformer[] =
    target === 'react'
      ? [new ReactTransformer(), ...(stories ? [new StoriesTransformer()] : [])]
      : [new WebComponentsTransformer(), ...(stories ? [new WcStoriesTransformer()] : [])];
  return [new CssTransformer(target), new CssvarsTransformer(), ...emit];
}

/** The command surface a target presents. Shared, so the two cannot drift. */
export function targetCommand(target: TargetId, description: string): Command {
  return new Command(target)
    .description(description)
    .option('-o, --output <path>', 'Path to the specs directory (input)')
    .option('--config <path>', 'Path to a config/ directory or legacy specs.config.yaml')
    .option('--components <keys...>', 'Only emit these component folders (default: all)')
    .option('--compositions', 'Emit compositions only, no components')
    .option('--no-compositions', 'Emit components only, skipping compositions')
    .option('--no-stories', 'Emit components without Storybook stories')
    .option('--watch', 'Watch the specs directory and config/ and re-emit on every change')
    .option('--verbose', 'Enable detailed logging', false)
    .action(async (options: TargetOptions) => {
      await runEmitters(
        {
          label: target,
          transformers: transformersFor(target, options.stories),
          proEntitled: target === 'react' ? reactProEntitled : wcProEntitled,
        },
        options,
      );
    });
}

/**
 * Emit one target, without exiting the process (ADR-101).
 *
 * The command bodies exit when they finish; `specs build` and `specs run` need the
 * same work as a call that returns, so the chain can go on to the next step or
 * report which one failed.
 */
export async function emitTarget(
  target: TargetId,
  options: EmitOptions & { stories?: boolean } = {},
): Promise<EmitResult> {
  return emitOnce(
    {
      label: target,
      transformers: transformersFor(target, options.stories !== false),
      proEntitled: target === 'react' ? reactProEntitled : wcProEntitled,
    },
    options,
  );
}
