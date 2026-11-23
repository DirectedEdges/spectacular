import { Command } from 'commander';
import { JsonRenderTransformer, proEntitled } from '@directededges/json-render-from-specs';
import { runEmitters, type EmitOptions } from '../emit/run.js';

export const JsonRender = new Command('json-render')
  .description('Emit the json-render target — a Zod catalog, a React registry, and one Spec payload per composition — into json-render/')
  .option('-o, --output <path>', 'Path to the specs directory (input)')
  .option('--config <path>', 'Path to a config/ directory or legacy specs.config.yaml')
  .option('--components <keys...>', 'Only emit these component folders (default: all)')
  .option('--compositions', 'Emit compositions only, no components')
  .option('--no-compositions', 'Emit components only, skipping compositions')
  .option('--watch', 'Watch the specs directory and config/ and re-emit on every change')
  .option('--verbose', 'Enable detailed logging', false)
  .action(async (options: EmitOptions) => {
    await runEmitters(
      {
        label: 'json-render',
        // The promotion table lowers un-promoted layers (a composition's root
        // frame) to a configured primitive component, as every runtime target does.
        transformers: (config) => [new JsonRenderTransformer({ primitives: config.conventions.primitives })],
        proEntitled,
      },
      options,
    );
  });
