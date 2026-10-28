/**
 * CLI configuration structure
 *
 * The two artifacts a workspace authors (ADR-071), fully resolved:
 * `config/conventions/` and `config/settings.yaml`.
 *
 * A pre-split `specs.config.yaml` does not load: `ConfigLoader` refuses it
 * and directs the user to `specs migrate config`.
 */

import type {
  ResolvedConventions,
  ResolvedSettings,
} from '@directededges/specs-schema';

export type CliSourceDataKind = 'file' | 'variables' | 'styles';

export interface CLIConfig {
  /** Facts about the Figma library — every consumer of that library declares the same values. */
  conventions: ResolvedConventions;
  /** Choices about this run — sources, spec output, assets. */
  settings: ResolvedSettings;
  /** Absolute path of the directory the configuration was loaded from, for resolving relative paths. */
  configDir?: string;
}
