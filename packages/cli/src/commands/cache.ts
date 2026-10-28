/**
 * Cache Command
 *
 * Builds the render lookup caches under `{data.directory}/cache/` from the fetched
 * Figma payloads. `fetch` and `apply-custom-tokens` run this themselves, so it is
 * needed by hand only when the caches are missing or something outside those
 * commands changed the data. See src/cache/cache.ts for what the files contain.
 */

import { Command } from 'commander';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { refreshCache } from '../cache/cache.js';
import { reportCache } from '../cache/report.js';
import { figmaOf } from '../config/PlatformConventions.js';
import { ERROR_CODES } from '../utilities/errorCodes.js';

export const Cache = new Command('cache')
  .description('Build the render lookup caches from fetched Figma data')
  .option('--config <path>', 'Path to a config/ directory or legacy specs.config.yaml')
  .option('--force', 'Rebuild every source, even those whose cached data still matches')
  .action((options: { config?: string; force?: boolean }) => {
    try {
      const config = new ConfigLoader().load(options.config);

      const dataDirectory = config.settings.data?.directory;
      if (!dataDirectory) {
        console.error('Error: data.directory is not set in the workspace settings.');
        process.exit(ERROR_CODES.INVALID_ARGS);
      }

      const aliases = Object.keys(config.settings.data?.sources ?? {});
      if (aliases.length === 0) {
        console.error('Error: no sources are configured in the workspace settings.');
        console.error('Tip: the cache is built per source — add one under `data.sources`, then run `specs fetch`.');
        process.exit(ERROR_CODES.INVALID_ARGS);
      }

      const report = refreshCache({
        dataDir: dataDirectory,
        aliases,
        glyphs: figmaOf(config.conventions).glyphs,
        force: options.force,
      });

      const ok = reportCache(report);
      if (!ok) {
        console.error('✗ Cache incomplete — one or more payloads could not be read.');
        process.exit(ERROR_CODES.GENERAL_ERROR);
      }
      console.log('✓ Cache written.');
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(ERROR_CODES.GENERAL_ERROR);
    }
  });
