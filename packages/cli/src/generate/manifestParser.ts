/**
 * Parses checkbox markdown manifests produced by `specs audit`.
 *
 * Format:
 *   **File:** path/to/file.json
 *   - [x] ComponentName (id, COMPONENT_SET)
 *   - [ ] OtherComponent (id, COMPONENT)
 */

export interface ManifestComponent {
  id: string;
  name: string;
  type: 'COMPONENT' | 'COMPONENT_SET';
  included: boolean;
}

export interface ManifestMetadata {
  file?: string;
  variables?: string;
}

export interface ManifestResult {
  components: ManifestComponent[];
  metadata: ManifestMetadata;
}

export class ManifestParser {
  private static readonly COMPONENT_REGEX =
    /^-\s+\[([x ])\]\s+(.+?)\s+\((\d+:\d+),\s+(COMPONENT_SET|COMPONENT)\)/i;

  private static readonly FILE_HEADER_REGEX =
    /\*\*File:\*\*\s+(.+?)$/m;

  private static readonly VARIABLES_HEADER_REGEX =
    /\*\*Variables:\*\*\s+(.+?)$/m;

  /**
   * Parse a checkbox markdown manifest into structured component entries.
   */
  static parse(manifestContent: string): ManifestResult {
    const lines = manifestContent.split('\n');
    const components: ManifestComponent[] = [];
    const metadata: ManifestMetadata = {};

    const fileMatch = manifestContent.match(ManifestParser.FILE_HEADER_REGEX);
    if (fileMatch) {
      metadata.file = fileMatch[1].trim();
    }

    const variablesMatch = manifestContent.match(ManifestParser.VARIABLES_HEADER_REGEX);
    if (variablesMatch) {
      metadata.variables = variablesMatch[1].trim();
    }

    for (const line of lines) {
      const match = line.match(ManifestParser.COMPONENT_REGEX);
      if (match) {
        const [, checkbox, name, id, type] = match;
        components.push({
          id,
          name,
          type: type.toUpperCase() as 'COMPONENT' | 'COMPONENT_SET',
          included: checkbox.toLowerCase() === 'x',
        });
      }
    }

    return { components, metadata };
  }
}
