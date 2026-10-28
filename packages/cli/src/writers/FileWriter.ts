import yaml from 'yaml';
import type { OutputFormat } from '../writers/outputConfig.js';

/**
 * Result of a file writing operation
 */
export interface WriteResult {
  /** Paths of successfully written files (relative to output directory) */
  filesWritten: string[];

  /** Non-fatal issues encountered during write (e.g., "Overwriting existing file") */
  warnings: string[];

  /** Fatal errors that prevented writing */
  errors: string[];
}

/** Shared YAML stringify options for deterministic output */
const YAML_OPTIONS: yaml.DocumentOptions & yaml.SchemaOptions & yaml.ParseOptions & yaml.CreateNodeOptions & yaml.ToStringOptions = {
  indent: 2,
  lineWidth: 0,
  defaultStringType: 'PLAIN',
  defaultKeyType: 'PLAIN',
  aliasDuplicateObjects: false
};

/**
 * A string a YAML 1.1 parser reads as a base-60 integer.
 *
 * Figma node ids are `page:node` — `42:2`, `25:23` — and YAML 1.1 treats a
 * colon-separated digit run as sexagesimal, so `25:23` becomes 25 × 60 + 23 =
 * 1523 and `42:2` becomes 2522. Emitting them plain is therefore lossy for any
 * consumer on a 1.1 parser: PyYAML, Ruby's YAML, older Java bindings. They
 * receive a plausible integer rather than an error, which is the worst shape a
 * data bug can take.
 *
 * The `yaml` package we read with is 1.2, where sexagesimal was removed, so
 * nothing in this toolchain ever noticed. This is about what we publish.
 *
 * Only the ambiguous scalars are quoted. Quoting every string would churn every
 * spec in every workspace and bury real changes in diff noise.
 */
const SEXAGESIMAL = /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/;

/**
 * Quote the scalars a 1.1 parser would misread, leaving every other string plain.
 *
 * Done by visiting the document rather than at each id's source, because node ids
 * reach the spec from several places — `metadata.source`, instance references,
 * `$extensions` — and a per-site fix would be one `grep` away from being wrong
 * again the next time one is added.
 */
function quoteAmbiguousScalars(doc: yaml.Document): void {
  yaml.visit(doc, {
    Scalar(_key, node) {
      if (typeof node.value === 'string' && SEXAGESIMAL.test(node.value)) {
        node.type = 'QUOTE_SINGLE';
      }
    },
  });
}

/**
 * Strategy interface for writing file manifests to the filesystem
 *
 * Implementations:
 * - SingleFileWriter: Writes all components to one file
 * - ComponentFileWriter: Writes one file per component
 * - ConcernFileWriter: Writes separate api/variants files
 * - CombinedFileWriter: Writes component/api and component/variants files
 */
export abstract class FileWriter {
  /**
   * Serialize content to the specified format
   */
  static serialize(content: Record<string, unknown>, format: OutputFormat): string {
    if (format === 'json') return JSON.stringify(content, null, 2);
    const doc = new yaml.Document(content, YAML_OPTIONS);
    quoteAmbiguousScalars(doc);
    return doc.toString(YAML_OPTIONS);
  }

  /**
   * Write files according to the manifest
   * @param manifest File manifest containing entries to write
   * @returns Result containing written files, warnings, and errors
   */
  abstract write(manifest: any): Promise<WriteResult>;
}
