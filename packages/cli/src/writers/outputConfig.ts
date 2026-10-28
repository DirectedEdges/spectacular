/**
 * Output configuration for CLI writers
 */

export type OutputFormat = 'yaml' | 'json';

export interface OutputConfig {
  splitComponents: boolean;
  splitConcerns: boolean;
  useSubfolders: boolean;
  defaultFormat: OutputFormat;
}

export const DEFAULT_OUTPUT_CONFIG: OutputConfig = {
  splitComponents: true,
  splitConcerns: true,
  useSubfolders: true,
  defaultFormat: 'json'
};
