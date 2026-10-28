// `specs storybook` — the workspace Storybook as shipped software (ADR A).
//
//   specs storybook init               scaffold the host, once
//   specs storybook                    = publish, all concerns
//   specs storybook publish [concern]  rewrite generated content
//
// Free and unobfuscated: nothing here imports entitlement machinery, and the
// CLI takes on no Storybook, Vite, or Playwright dependency — init writes a
// package.json declaring them and the customer installs in their workspace.
import { Command } from 'commander';
import { resolveWorkspace } from '../storybook/workspace.js';
import { init } from '../storybook/init.js';
import { publish } from '../storybook/publish.js';
import { dev } from '../storybook/dev.js';
import { concernNames } from '../storybook/concerns/registry.js';
import { ERROR_CODES } from '../utilities/errorCodes.js';

interface SharedOptions {
  config?: string;
}

async function runPublish(concern: string | undefined, options: SharedOptions): Promise<void> {
  try {
    const ws = resolveWorkspace(options.config);

    if (!ws.scaffolded) {
      console.error('No Storybook host in this workspace — nothing to publish into.');
      console.error('');
      console.error('  1. specs storybook init          scaffold the host');
      console.error('  2. cd storybook && npm install   install Storybook (the only install)');
      console.error('  3. specs storybook               generate what the host shows');
      process.exit(ERROR_CODES.GENERAL_ERROR);
    }

    const result = await publish(ws, concern);

    let anyChange = false;
    for (const [name, counts] of Object.entries(result.concerns)) {
      if (counts.changed === 0 && counts.removed === 0) continue;
      anyChange = true;
      const removed = counts.removed > 0 ? `, ${counts.removed} removed` : '';
      console.log(`  ${name}: ${counts.written} files (${counts.changed} changed${removed})`);
    }
    if (!anyChange) {
      console.log('✓ Storybook content is current — nothing changed.');
    } else {
      console.log(`✓ Published → storybook/content/`);
    }

    if (result.overrides.length > 0) {
      console.log('');
      console.log('  Overrides in effect (yours, never rewritten):');
      for (const override of result.overrides) console.log(`    ${override}`);
      if (result.divergedOverrides.length > 0) {
        console.log('  Data beneath these overrides changed this run — check they still read it:');
        for (const override of result.divergedOverrides) console.log(`    ${override}`);
      }
    }

    process.exit(ERROR_CODES.SUCCESS);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(message.startsWith('unknown concern') ? ERROR_CODES.INVALID_ARGS : ERROR_CODES.GENERAL_ERROR);
  }
}

const InitCommand = new Command('init')
  .description('Scaffold the Storybook host: package.json, tsconfig.json, .storybook/ — once')
  .option('--force', 'Rewrite host config even if it exists (never touches content-overrides/)', false)
  // No default: absence means "resolve it" — the declaration in
  // conventions/storybook.yaml, else the existing scaffold's port, else 6006.
  // A default of '6006' here is what made `init --force` move a workspace off
  // its own address.
  .option('--port <port>', 'Dev-server port (default: conventions/storybook.yaml host.port, else the existing scaffold, else 6006)')
  .option('--config <path>', 'Path to a config/ directory or legacy specs.config.yaml')
  .action((options: SharedOptions & { force: boolean; port?: string }) => {
    try {
      const ws = resolveWorkspace(options.config);
      const result = init(ws, { force: options.force, port: options.port });

      console.log('✓ Storybook host scaffolded:');
      for (const file of result.written) console.log(`    ${file}`);
      console.log('');
      if (result.portSource === 'declared') {
        console.log(`  Port ${result.port}, from conventions/storybook.yaml (host.port).`);
        console.log('');
      }
      if (result.staleInstall.length > 0) {
        console.log('  ⚠ storybook/package.json changed, but the existing install no longer matches it:');
        for (const line of result.staleInstall) console.log(`      ${line}`);
        console.log('  Storybook will not start until you reinstall. The old lockfile pins');
        console.log('  packages the new host no longer declares, so clear both first:');
        console.log('    cd storybook && rm -rf node_modules package-lock.json && npm install');
        console.log('');
      }
      console.log('  Next (needs Node 20.19+ — check with `node --version`):');
      console.log('    cd storybook && npm install   # installs Storybook in your workspace — we never ship it');
      console.log(`    cd .. && specs run            # builds everything and serves it — http://localhost:${result.port}`);
      console.log('');
      console.log('  `specs run` publishes the content pages, emits each platform, and starts');
      console.log('  Storybook, then watches for changes. Start it that way rather than with');
      console.log('  `npm run storybook`: the raw binary prompts for telemetry consent and for a');
      console.log('  fallback port, and backgrounded those prompts exit without starting anything.');
      // The alternative used to be offered here, which contradicted the setup flow
      // that bans it by name — two instructions in one terminal scroll, which teaches
      // distrust of both. `specs storybook dev` still exists and is documented; it is
      // just not what this output recommends.
      process.exit(ERROR_CODES.SUCCESS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(ERROR_CODES.GENERAL_ERROR);
    }
  });

const DevCommand = new Command('dev')
  .description('Run Storybook with the whole workspace watching — transforms re-emit on spec changes, pages republish on config and asset changes. Fetch, generate, and render stay yours')
  .option('--config <path>', 'Path to a config/ directory or legacy specs.config.yaml')
  .action(async (options: SharedOptions) => {
    try {
      const ws = resolveWorkspace(options.config);
      await dev(ws);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(ERROR_CODES.GENERAL_ERROR);
    }
  });

const PublishCommand = new Command('publish')
  .description(`Rewrite generated Storybook content. Concerns: ${concernNames().join(', ')} — omit to publish all`)
  .argument('[concern]', 'One concern to rebuild (default: all)')
  .option('--config <path>', 'Path to a config/ directory or legacy specs.config.yaml')
  .action(async (concern: string | undefined, options: SharedOptions) => {
    await runPublish(concern, options);
  });

export const Storybook = new Command('storybook')
  .description('Scaffold and publish the workspace Storybook — init writes the host, publish writes what it shows')
  .option('--config <path>', 'Path to a config/ directory or legacy specs.config.yaml')
  .addCommand(InitCommand)
  .addCommand(DevCommand)
  .addCommand(PublishCommand)
  .action(async (options: SharedOptions) => {
    // Bare `specs storybook` = publish all concerns (specs#642).
    await runPublish(undefined, options);
  });
