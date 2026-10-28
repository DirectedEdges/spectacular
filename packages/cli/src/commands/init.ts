/**
 * Init Command
 *
 * Scaffolds the config/ directory — conventions/<platform>.yaml, settings.yaml, and
 * with production-ready defaults and inline documentation
 * for getting started with Specs CLI.
 */

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import readline from 'readline';
import { generateConfigTemplates } from '../config/ConfigTemplates.js';
import { DOCS_BASE_URL } from '../constants/docs.js';

export const Init = new Command('init')
  .description('Initialize config/conventions/<platform>.yaml and config/settings.yaml with production defaults')
  .option('--force', 'Overwrite existing config without prompting')
  .option('-c, --config <path>', 'Custom directory to write the config files into (default: current directory)')
  .action(async (options) => {
    await initCommand(options as { force?: boolean; config?: string });
  });

/**
 * Initialize config files
 */
async function initCommand(options: { force?: boolean; config?: string }): Promise<void> {
  const baseDir = options.config || '.';

  // A pre-split workspace must not be scaffolded over. `init` writes defaults,
  // so it would quietly replace whatever the workspace actually declared — and
  // `specs migrate config` would then refuse, because config/ exists.
  const legacy = ['specs.config.yaml', 'specs.config.json']
    .find(name => fs.existsSync(path.join(baseDir, name)));
  if (legacy) {
    console.error(`Error: found ${legacy} — a pre-split configuration (ADR-071).`);
    console.error('  Run `specs migrate config` to convert it, keeping what this workspace declares.');
    console.error(`  To scaffold fresh defaults instead, remove ${legacy} first.`);
    process.exitCode = 2;
    return;
  }

  const templates = generateConfigTemplates();
  const existing = Object.keys(templates).filter(rel => fs.existsSync(path.join(baseDir, rel)));

  if (existing.length > 0 && !options.force) {
    // Prompt before overwriting
    const shouldOverwrite = await promptBeforeOverwrite(existing.join(', '));
    if (!shouldOverwrite) {
      console.log('Config initialization cancelled.');
      return;
    }
  }

  try {
    for (const [rel, template] of Object.entries(templates)) {
      const filePath = path.join(baseDir, rel);
      fs.ensureDirSync(path.dirname(filePath));
      fs.writeFileSync(filePath, template, 'utf-8');
      console.log(`✓ Created ${filePath}`);
    }
    // The chain, not the commands it replaced. This used to end at `specs generate`
    // and never mention `specs run` or Storybook, so someone working from the terminal
    // was taught a different workflow from the one the docs and the setup skill teach —
    // and stopped three steps short of anything they could look at.
    console.log('📚 Next steps:');
    console.log('   1. Edit config/settings.yaml to add your Figma file key');
    console.log('   2. Run: specs fetch');
    console.log('   3. Run: specs scan — then tick the components you want in the manifest');
    console.log('   4. Run: specs run — generates specs, emits every platform, and serves Storybook');
    console.log('');
    console.log('   `specs run` watches and redoes only what a change affects, so leave it running.');
    console.log('   For a single pass that exits instead, use: specs build');
    console.log('');
    console.log(`📖 Documentation: ${DOCS_BASE_URL}/settings/`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error creating config file: ${error.message}`);
    } else {
      console.error('Error creating config file');
    }
    process.exit(1);
  }
}

/**
 * Prompt user before overwriting existing config
 */
async function promptBeforeOverwrite(configPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(
      `Config file(s) exist: ${configPath}. Overwrite? (y/N) `,
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y');
      }
    );
  });
}
