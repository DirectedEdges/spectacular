/**
 * Configuration Defaults
 * 
 * Default values for optional CLI configuration fields.
 * These apply when config file is not present or fields are omitted.
 */

import { DEFAULT_OUTPUT_CONFIG } from '../writers/outputConfig.js';

export const CONFIG_DEFAULTS = {
  /** Default location where fetch writes payloads and where generate/scan read from */
  dataDirectory: './data',

  /** Default location for generated spec files */
  outputDirectory: './specs',

  /** Default output file organization settings */
  output: DEFAULT_OUTPUT_CONFIG,
} as const;

export type ConfigDefaults = typeof CONFIG_DEFAULTS;
