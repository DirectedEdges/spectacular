/**
 * Specs CLI - Command registry and entry helpers
 */

import './figma-shim.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env from cwd if present (no external dependency needed)
try {
  const envContent = readFileSync(resolve(process.cwd(), '.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
} catch { /* no .env file, that's fine */ }

import { Command } from 'commander';
import { Generate } from './commands/generate.js';
import { Scan } from './commands/scan.js';
import { Fetch } from './commands/fetch.js';
import { Cache } from './commands/cache.js';
import { Init } from './commands/init.js';
import { Migrate } from './commands/migrate.js';
import { Analyze } from './commands/analyze.js';
import { ApplyCustomTokens } from './commands/applyCustomTokens.js';
import { React } from './commands/react.js';
import { WebComponents } from './commands/webcomponents.js';
import { Render } from './commands/render.js';
import { Bridge } from './commands/bridge.js';
import { Version } from './commands/version.js';
import { Skills } from './commands/skills.js';
import { Storybook } from './commands/storybook.js';
import { Testing } from './commands/testing.js';
import { Build } from './commands/build.js';
import { Run } from './commands/run.js';

declare const __SPECS_CLI_VERSION__: string;

// Backward compatibility: export Scan also as Audit
export const Audit = Scan;

export { Generate, Scan, Fetch, Init, Migrate, ApplyCustomTokens, React, WebComponents, Analyze, Render, Bridge, Version, Skills, Storybook, Build, Run };

export const commands = {
  Init,
  Migrate,
  Build,
  Run,
  Generate,
  Scan,
  Fetch,
  ApplyCustomTokens,
  React,
  WebComponents,
  Analyze,
  Render,
  Bridge,
  Version,
  Skills,
  Storybook,
};

export function createProgram(): Command {
  const program = new Command();

  program
    .name('specs')
    .description('Generate component specifications from Figma REST API data')
    .version(__SPECS_CLI_VERSION__);

  program.addCommand(Init);
  program.addCommand(Migrate);
  // The whole-workspace commands come before the individual steps they run:
  // `specs --help` should lead with the one command most people want.
  program.addCommand(Build);
  program.addCommand(Run);
  program.addCommand(Generate);
  program.addCommand(Scan);
  program.addCommand(Fetch);
  program.addCommand(Cache);
  program.addCommand(ApplyCustomTokens);
  program.addCommand(React);
  program.addCommand(WebComponents);
  program.addCommand(Analyze);
  program.addCommand(Render);
  program.addCommand(Bridge);
  program.addCommand(Version);
  program.addCommand(Skills);
  program.addCommand(Storybook);
  program.addCommand(Testing);

  // Deprecated alias: 'audit' → 'scan'
  const auditAlias = new Command('audit')
    .description('(deprecated: use "scan") Scan Figma file and generate component manifest')
    .argument('<file>', 'Path to Figma JSON file')
    .allowUnknownOption(true)
    .action((_file: string, _options: unknown, cmd: Command) => {
      console.error('Warning: "specs audit" is deprecated, use "specs scan" instead');
      // Re-parse with scan command
      const args = process.argv.slice(2);
      args[args.indexOf('audit')] = 'scan';
      const prog = createProgram();
      prog.parse(['node', 'specs', ...args]);
    });
  auditAlias.helpOption(false);
  program.addCommand(auditAlias);

  return program;
}

export function runCli(argv: string[] = process.argv): void {
  const program = createProgram();
  program.parse(argv);
}
