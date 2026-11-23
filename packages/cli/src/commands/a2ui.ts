import { Command } from 'commander';
import { A2uiTransformer, proEntitled } from '@directededges/a2ui-from-specs';
import { runEmitters, type EmitOptions } from '../emit/run.js';

export const A2ui = new Command('a2ui')
  .description('Emit the A2UI target — a runtime catalog and one surface payload per composition — into a2ui/')
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
        label: 'a2ui',
        // The transformer needs the promotion table to lower un-promoted layers
        // (a composition's root frame) to a configured primitive component.
        transformers: (config) => [new A2uiTransformer({ primitives: config.conventions.primitives })],
        proEntitled,
      },
      options,
    );
  });
