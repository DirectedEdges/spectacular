// `specs run` — bring the whole workspace up to date, then watch and redo
// whichever part a change affects.
import { Command } from 'commander';
import { resolveWorkspace } from '../storybook/workspace.js';
import { run } from '../pipeline/drive.js';
import { reportFailure, toDriveOptions, withChainOptions, type ChainOptions } from '../pipeline/chainCommand.js';

export const Run = withChainOptions(
  new Command('run').description(
    'Bring the whole workspace up to date, then keep it that way — watches your specs, data and config and redoes only what a change affects',
  ),
).action(async (options: ChainOptions) => {
  try {
    const workspace = resolveWorkspace(options.config);
    await run(workspace, toDriveOptions(options));
  } catch (error) {
    reportFailure(error);
  }
});
