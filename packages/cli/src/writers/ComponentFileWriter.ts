/**
 * ComponentFileWriter - Writes one file per component
 *
 * Supports both flat and subfolder modes:
 * - Flat: Button.yaml, Alert.yaml
 * - Subfolders: Button/Button.yaml, Alert/Alert.yaml
 */

import fs from 'fs-extra';
import path from 'path';
import { FileWriter, type WriteResult } from './FileWriter.js';
import type { FileManifest } from './FileManifest.js';

export class ComponentFileWriter extends FileWriter {
  /**
   * @param _useSubfolders Whether to organize files in component subdirectories (handled by manifest)
   */
  constructor(_useSubfolders = false) {
    super();
  }

  /**
   * Write one file per component
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
      // Create all directories first (batch operation)
      const directories = new Set<string>();
      for (const entry of manifest.entries) {
        const dir = path.dirname(path.join(manifest.baseDir, entry.path));
        directories.add(dir);
      }

      for (const dir of directories) {
        await fs.ensureDir(dir);
      }

      // Write all files
      for (const entry of manifest.entries) {
        const outputPath = path.join(manifest.baseDir, entry.path);

        // Check if file exists and warn before overwriting
        if (await fs.pathExists(outputPath)) {
          result.warnings.push(`Overwriting existing file: ${entry.path}`);
        }

        // Serialize in the configured format
        const content = FileWriter.serialize(entry.content, manifest.format);

        // Write file
        await fs.writeFile(outputPath, content, 'utf-8');
        result.filesWritten.push(entry.path);
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to write files: ${message}`);
    }

    return result;
  }
}
