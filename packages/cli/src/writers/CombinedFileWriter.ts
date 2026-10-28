import fs from 'fs-extra';
import type { FileManifest } from './FileManifest.js';
import { FileWriter, WriteResult } from './FileWriter.js';
import { reconcileStaleConcerns, staleWarnings } from './StaleConcerns.js';

/**
 * Writer for combined mode: creates component/api and component/variants files
 * Each component gets its own directory with separate concern files
 */
export class CombinedFileWriter extends FileWriter {
  async write(manifest: FileManifest): Promise<WriteResult> {
    const result: WriteResult = {
      filesWritten: [],
      warnings: [],
      errors: []
    };

    try {
      // Get unique directories that need to be created
      const directories = new Set(
        manifest.entries.map((entry: { path: string }) => {
          const lastSlash = entry.path.lastIndexOf('/');
          return lastSlash > 0 ? entry.path.substring(0, lastSlash) : '';
        }).filter((dir: string) => dir.length > 0)
      );

      // Create all directories in batch
      await Promise.all(
        Array.from(directories).map(dir => fs.ensureDir(dir))
      );

      // Process each file in the manifest
      for (const entry of manifest.entries) {
        const filePath = entry.path;

        // Check if file exists and warn
        const exists = await fs.pathExists(filePath);
        if (exists) {
          result.warnings.push(`Warning: Overwriting existing file: ${filePath}`);
        }

        // Serialize in the configured format
        const content = FileWriter.serialize(entry.content, manifest.format);

        // Write file
        await fs.writeFile(filePath, content, 'utf-8');
        result.filesWritten.push(filePath);
      }

      // A concern this run stopped emitting leaves its previous file behind, in a folder
      // the run did write — so the orphaned-folder note never covers it. Renamed rather
      // than left, and cleared again if the concern returns.
      result.warnings.push(...staleWarnings(await reconcileStaleConcerns(result.filesWritten)));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to write combined files: ${errorMessage}`);
    }

    return result;
  }
}
