// What `specs build` and `specs run` share as commands (ADR-101).
//
// Both read one chain of steps (`steps.ts`), so they cannot disagree about what
// depends on what. The difference is only what happens at the end: `build` exits
// with a code CI can read, `run` keeps going. That difference is all their command
// files hold; the flags, the option mapping and the failure report are here, so the
// pair cannot drift on what they accept.
import type { Command } from 'commander';
import type { DriveOptions } from './drive.js';
import { StepError } from './StepError.js';

export interface ChainOptions {
  config?: string;
  only?: string[];
  skip?: string[];
  components?: string[];
  render?: boolean;
  file?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

export function toDriveOptions(options: ChainOptions): DriveOptions {
  return {
    configPath: options.config,
    only: options.only,
    skip: options.skip,
    components: options.components,
    render: options.render,
    fileKey: options.file,
    dryRun: options.dryRun,
    verbose: options.verbose ?? false,
  };
}

/** The flags both commands accept. */
export function withChainOptions(command: Command): Command {
  return command
    .option('--config <path>', 'Path to a config/ directory or legacy specs.config.yaml')
    .option('--only <steps...>', 'Run these steps and nothing else')
    .option('--skip <steps...>', 'Run everything except these steps')
    .option('--components <keys...>', 'Limit the run to these component folders')
    .option('--render', 'Also render each spec into the connected Figma file — needs a running bridge. Overwrites existing components under `run`, not under `build`')
    .option('--file <fileKey>', 'With --render: which connected Figma file to render into, when more than one is open')
    .option('--dry-run', 'Print what would run, and run nothing')
    .option('--verbose', 'Enable detailed logging', false);
}

export function reportFailure(error: unknown): never {
  if (error instanceof StepError) {
    if (!error.reported) {
      console.error(`Error: ${error.message}`);
      if (error.tip) console.error(error.tip);
    }
    process.exit(error.code);
  }
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
