/**
 * Author Command
 *
 * The authoring namespace: `status` prints the startup digest (read-only),
 * `start <key>` prints the same digest after writing a collision-checked
 * component folder with all three concern templates. The digest work lives in
 * src/author/; this file is registration and argument parsing.
 */

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { buildStatus } from '../author/status.js';
import { startComponent, StartKeyError, StartCollisionError } from '../author/start.js';
import { ERROR_CODES } from '../utilities/errorCodes.js';

interface AuthorOptions {
  config?: string;
  output?: string;
}

interface Resolved {
  specsRoot: string;
  configDir?: string;
  dataDir?: string;
  workspaceRoot: string;
  format: 'YAML' | 'JSON';
}

function resolve(options: AuthorOptions): Resolved {
  const config = new ConfigLoader().load(options.config);
  const specsRoot = options.output
    ? path.resolve(options.output)
    : config.settings.spec.directory
      ? path.resolve(config.settings.spec.directory)
      : path.resolve(process.cwd());
  const configDir = options.config ? path.resolve(options.config) : path.resolve('config');
  return {
    specsRoot,
    configDir: fs.existsSync(configDir) ? configDir : undefined,
    dataDir: config.settings.data?.directory ? path.resolve(config.settings.data.directory) : undefined,
    workspaceRoot: process.cwd(),
    format: config.settings.spec.format === 'JSON' ? 'JSON' : 'YAML',
  };
}

function print(document: unknown, format: 'YAML' | 'JSON'): void {
  console.log(format === 'JSON'
    ? JSON.stringify(document, null, 2)
    : yaml.stringify(document, { lineWidth: 120 }).trimEnd());
}

export const Author = new Command('author')
  .description('Authoring workflow: startup status and the opening write of a component');

Author.command('status')
  .description('Print the authoring startup digest — catalogue, analysis freshness, conventions, posture. Read-only')
  .option('--config <path>', 'Path to a config/ directory')
  .option('-o, --output <dir>', 'Specs directory (default: spec.directory from settings)')
  .action(async (options: AuthorOptions) => {
    try {
      const resolved = resolve(options);
      const status = await buildStatus(resolved);
      print(status, resolved.format);
      process.exit(ERROR_CODES.SUCCESS);
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(ERROR_CODES.GENERAL_ERROR);
    }
  });

Author.command('start')
  .description('Create specs/components/<key>/ with all three concern templates, then print the status digest')
  .argument('<key>', 'camelCase spec folder key for the new component')
  .option('--title <title>', 'Display title (default: derived from the key)')
  .option('--config <path>', 'Path to a config/ directory')
  .option('-o, --output <dir>', 'Specs directory (default: spec.directory from settings)')
  .action(async (key: string, options: AuthorOptions & { title?: string }) => {
    try {
      const resolved = resolve(options);
      const start = startComponent({
        specsRoot: resolved.specsRoot,
        key,
        title: options.title,
        format: resolved.format,
        workspaceRoot: resolved.workspaceRoot,
      });
      const status = await buildStatus(resolved);
      print({ start, ...status }, resolved.format);
      process.exit(ERROR_CODES.SUCCESS);
    } catch (e) {
      if (e instanceof StartKeyError) {
        console.error(`Error: ${e.message}`);
        process.exit(ERROR_CODES.INVALID_ARGS);
      }
      if (e instanceof StartCollisionError) {
        console.error(`Error: ${e.message}`);
        process.exit(ERROR_CODES.FILE_ERROR);
      }
      console.error(`Error: ${(e as Error).message}`);
      process.exit(ERROR_CODES.GENERAL_ERROR);
    }
  });
