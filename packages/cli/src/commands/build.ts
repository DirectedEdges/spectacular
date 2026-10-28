// `specs build` — bring the whole workspace up to date once, then exit.
import { Command } from 'commander';
import { resolveWorkspace } from '../storybook/workspace.js';
import { build } from '../pipeline/drive.js';
import { reportFailure, toDriveOptions, withChainOptions, type ChainOptions } from '../pipeline/chainCommand.js';

export const Build = withChainOptions(
  new Command('build').description(
    'Bring the whole workspace up to date once — scan, generate, analyze, emit each platform, publish Storybook — then exit',
  ),
).action(async (options: ChainOptions) => {
  try {
    const workspace = resolveWorkspace(options.config);
    // Exits with the chain's code, which is what makes this usable in CI.
    process.exit(await build(workspace, toDriveOptions(options)));
  } catch (error) {
    reportFailure(error);
  }
});
