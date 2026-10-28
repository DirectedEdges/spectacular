/**
 * ApplyCustomTokens Command - Inject $custom objects from a mapping file into fetched data
 *
 * Purpose:
 * - Read a mapping JSON file containing { figmaId: { $custom: {...}, ...otherProps } }
 * - Inject the $custom objects into variables and styles JSON files
 * - Config-aware: auto-discovers data files from the workspace settings
 * - Supports -v/-s flags to override file paths
 */

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { refreshCache } from '../cache/cache.js';
import { reportCache } from '../cache/report.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
import type { CLIConfig } from '../config/types.js';
import { figmaOf } from '../config/PlatformConventions.js';
import { ERROR_CODES } from '../utilities/errorCodes.js';

type MappingEntry = Record<string, unknown>;
type MappingFile = Record<string, MappingEntry>;

function loadAndValidateMapping(mappingPath: string): MappingFile {
  if (!fs.existsSync(mappingPath)) {
    throw new Error(`Mapping file not found: ${mappingPath}`);
  }

  let parsed: unknown;
  try {
    parsed = fs.readJSONSync(mappingPath);
  } catch {
    throw new Error(`Malformed JSON in mapping file: ${mappingPath}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Mapping file must be a JSON object: ${mappingPath}`);
  }

  const mapping = parsed as MappingFile;

  for (const [id, entry] of Object.entries(mapping)) {
    if (entry.$custom === undefined) continue;
    if (typeof entry.$custom !== 'object' || entry.$custom === null || Array.isArray(entry.$custom)) {
      throw new Error(`Invalid $custom value for "${id}": must be a non-null object`);
    }
  }

  return mapping;
}

function discoverDataFiles(
  configDir: string,
  config: CLIConfig,
  variablesFlag?: string,
  stylesFlag?: string,
): { variablesPaths: string[]; stylesPaths: string[] } {
  if (variablesFlag || stylesFlag) {
    return {
      variablesPaths: variablesFlag ? [path.resolve(variablesFlag)] : [],
      stylesPaths: stylesFlag ? [path.resolve(stylesFlag)] : [],
    };
  }

  const sourceDir = path.resolve(configDir, config.settings.data?.directory || 'data');
  const variablesPaths: string[] = [];
  const stylesPaths: string[] = [];

  const sources = config.settings.data?.sources;
  if (sources) {
    for (const [alias, source] of Object.entries(sources)) {
      if ((source.fetch ?? []).includes('variables')) {
        const vp = path.join(sourceDir, `${alias}.variables.json`);
        if (fs.existsSync(vp)) variablesPaths.push(vp);
      }
      if ((source.fetch ?? []).includes('styles')) {
        const sp = path.join(sourceDir, `${alias}.styles.json`);
        if (fs.existsSync(sp)) stylesPaths.push(sp);
      }
    }
  }

  return { variablesPaths, stylesPaths };
}

function augmentVariablesFile(filePath: string, mapping: MappingFile): { matched: number; total: number } {
  const json = fs.readJSONSync(filePath);
  let matched = 0;

  if (json.meta?.variables) {
    for (const [id, varDef] of Object.entries<Record<string, unknown>>(json.meta.variables)) {
      const entry = mapping[id];
      if (entry?.$custom) {
        varDef.$custom = entry.$custom;
        matched++;
      }
    }
  }

  fs.writeJSONSync(filePath, json, { spaces: 2 });
  const total = json.meta?.variables ? Object.keys(json.meta.variables).length : 0;
  return { matched, total };
}

function augmentStylesFile(filePath: string, mapping: MappingFile): { matched: number; total: number } {
  const json = fs.readJSONSync(filePath);
  let matched = 0;
  let total = 0;

  // Shape 1: { all_styles: [...] }
  if (json.all_styles && Array.isArray(json.all_styles)) {
    total += json.all_styles.length;
    for (const style of json.all_styles) {
      const entry = mapping[style.id];
      if (entry?.$custom) {
        style.$custom = entry.$custom;
        matched++;
      }
    }
  }

  // Shape 2: { meta: { styles: [...] } }
  if (json.meta?.styles && Array.isArray(json.meta.styles)) {
    total += json.meta.styles.length;
    for (const s of json.meta.styles) {
      const primaryId = s.node_id || s.key;
      const entry = mapping[primaryId];
      if (entry?.$custom) {
        s.$custom = entry.$custom;
        matched++;
      }
    }
  }

  // Shape 3: { styles: { [styleId]: {...} } }
  if (json.styles && typeof json.styles === 'object' && !Array.isArray(json.styles)) {
    for (const [styleId, s] of Object.entries<Record<string, unknown>>(json.styles)) {
      total++;
      const entry = mapping[styleId];
      if (entry?.$custom) {
        s.$custom = entry.$custom;
        matched++;
      }
    }
  }

  fs.writeJSONSync(filePath, json, { spaces: 2 });
  return { matched, total };
}

export interface ApplyCustomTokensOptions {
  config?: string;
  variables?: string;
  styles?: string;
}

export const ApplyCustomTokens = new Command('applyCustomTokens')
  .description('Inject $custom token objects from a mapping file into fetched variables/styles JSON')
  .argument('<mapping>', 'Path to the JSON mapping file')
  .option('--config <path>', 'Path to a config/ directory or legacy specs.config.yaml')
  .option('-v, --variables <path>', 'Path to variables JSON file (overrides config discovery)')
  .option('-s, --styles <path>', 'Path to styles JSON file (overrides config discovery)')
  .action(async (mappingArg: string, options: ApplyCustomTokensOptions) => {
    try {
      const mappingPath = path.resolve(mappingArg);

      // Load and validate mapping
      const mapping = loadAndValidateMapping(mappingPath);

      // Check for entries with $custom
      const entriesWithCustom = Object.entries(mapping).filter(([, entry]) => entry.$custom !== undefined);

      if (entriesWithCustom.length === 0) {
        console.log('No custom tokens found in mapping file. No files were modified.');
        process.exit(ERROR_CODES.SUCCESS);
      }

      // Load config and discover files
      const config = new ConfigLoader().load(options.config);
      const configDir = config.configDir ?? process.cwd();
      const { variablesPaths, stylesPaths } = discoverDataFiles(configDir, config, options.variables, options.styles);

      if (variablesPaths.length === 0 && stylesPaths.length === 0) {
        console.error('Error: No variables or styles files found. Use -v/-s flags or configure sources in the workspace settings');
        process.exit(ERROR_CODES.INVALID_ARGS);
      }

      let totalVariablesMatched = 0;
      let totalStylesMatched = 0;
      const unmatchedIds = new Set(entriesWithCustom.map(([id]) => id));

      // Augment variables files
      for (const vp of variablesPaths) {
        if (!fs.existsSync(vp)) {
          console.error(`Warning: Variables file not found: ${vp}`);
          continue;
        }
        const { matched } = augmentVariablesFile(vp, mapping);
        totalVariablesMatched += matched;

        // Remove matched IDs from unmatched set
        const json = fs.readJSONSync(vp);
        if (json.meta?.variables) {
          for (const id of Object.keys(json.meta.variables)) {
            if (mapping[id]?.$custom) unmatchedIds.delete(id);
          }
        }
      }

      // Augment styles files
      for (const sp of stylesPaths) {
        if (!fs.existsSync(sp)) {
          console.error(`Warning: Styles file not found: ${sp}`);
          continue;
        }
        const { matched } = augmentStylesFile(sp, mapping);
        totalStylesMatched += matched;

        // Remove matched IDs from unmatched set
        const json = fs.readJSONSync(sp);
        if (json.meta?.styles && Array.isArray(json.meta.styles)) {
          for (const s of json.meta.styles) {
            const primaryId = s.node_id || s.key;
            if (mapping[primaryId]?.$custom) unmatchedIds.delete(primaryId);
          }
        }
        if (json.all_styles && Array.isArray(json.all_styles)) {
          for (const s of json.all_styles) {
            if (mapping[s.id]?.$custom) unmatchedIds.delete(s.id);
          }
        }
        if (json.styles && typeof json.styles === 'object') {
          for (const styleId of Object.keys(json.styles)) {
            if (mapping[styleId]?.$custom) unmatchedIds.delete(styleId);
          }
        }
      }

      // Report results
      const totalMatched = totalVariablesMatched + totalStylesMatched;
      console.log(`✓ Applied ${totalMatched} custom token(s): ${totalVariablesMatched} variable(s), ${totalStylesMatched} style(s)`);

      if (unmatchedIds.size > 0) {
        console.log(`  ${unmatchedIds.size} mapping entry ID(s) did not match any variable or style`);
      }

      // The variables payload was just rewritten in place, so the render cache built from
      // it now describes pre-custom-token data. Rebuild before anyone renders against it.
      const dataDirectory = config.settings.data?.directory;
      if (dataDirectory) {
        const report = refreshCache({
          dataDir: path.resolve(configDir, dataDirectory),
          aliases: Object.keys(config.settings.data?.sources ?? {}),
          glyphs: figmaOf(config.conventions).glyphs,
        });
        reportCache(report);
      }

      process.exit(ERROR_CODES.SUCCESS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(ERROR_CODES.GENERAL_ERROR);
    }
  });
