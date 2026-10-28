/**
 * SingleFileWriter - Writes all components to one file
 *
 * Default behavior: Creates a single library file with all component data
 */

import fs from 'fs-extra';
import path from 'path';
import { FileWriter, type WriteResult } from './FileWriter.js';
import type { FileManifest } from './FileManifest.js';

export class SingleFileWriter extends FileWriter {
  /**
   * Write all components to a single file
   * @param manifest File manifest containing entries to write
   * @returns Result containing written files, warnings, and errors
   */
  async write(manifest: FileManifest): Promise<WriteResult> {
    const result: WriteResult = {
      filesWritten: [],
      warnings: [],
      errors: []
    };

    try {
      if (manifest.entries.length === 0) {
        result.warnings.push('No entries to write');
        return result;
      }

      // Single-file mode: combine all entries into one file
      // Assume first entry contains the aggregated data
      const entry = manifest.entries[0];
      const outputPath = path.join(manifest.baseDir, entry.path);

      // Check if file exists and warn before overwriting
      if (await fs.pathExists(outputPath)) {
        result.warnings.push(`Overwriting existing file: ${entry.path}`);
      }

      // Ensure directory exists
      await fs.ensureDir(path.dirname(outputPath));

      // Serialize in the configured format
      const content = FileWriter.serialize(entry.content, manifest.format);

      // Write file
      await fs.writeFile(outputPath, content, 'utf-8');
      result.filesWritten.push(entry.path);

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to write file: ${message}`);
    }

    return result;
  }
}
