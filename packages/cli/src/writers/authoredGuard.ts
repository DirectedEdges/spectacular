import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import type { FileManifest } from './FileManifest.js';

/**
 * The components a generate run would overwrite whose existing specs are
 * authored, not captured.
 *
 * The tell is the contract's own: a captured spec always records where it came
 * from (`metadata.source`, the page and node ids), and an authored spec has no
 * source to record. Generate is only authoritative over what capture produced —
 * overwriting an authored spec round-trips hand work out of existence, which is
 * data loss in any workspace, not a clean-room rule.
 *
 * Only per-component files are checked: a concern file inside a component's
 * folder, or a file-per-component document. The collapsed layouts (one library
 * file, one document per concern) are not authoring surfaces. An existing file
 * that cannot be read or parsed counts as authored — ambiguity resolves toward
 * not destroying it.
 */
const COLLAPSED_BASENAMES = new Set(['api', 'variants', 'examples', 'library']);

export async function authoredOverwrites(manifest: FileManifest): Promise<string[]> {
  const authored = new Set<string>();
  for (const entry of manifest.entries) {
    const abs = path.isAbsolute(entry.path) ? entry.path : path.join(manifest.baseDir, entry.path);
    const segments = path.relative(manifest.baseDir, abs).split(path.sep);
    const base = segments[segments.length - 1];
    const stem = base.replace(/\.(yaml|yml|json)$/i, '');
    const perComponent =
      segments.length === 2 || (segments.length === 1 && !COLLAPSED_BASENAMES.has(stem));
    if (!perComponent) continue;
    if (!(await fs.pathExists(abs))) continue;
    const component = segments.length === 2 ? segments[0] : stem;
    try {
      const text = await fs.readFile(abs, 'utf-8');
      const doc = abs.endsWith('.json') ? JSON.parse(text) : yaml.parse(text);
      const metadata = (doc as Record<string, unknown> | null)?.metadata as
        | Record<string, unknown>
        | undefined;
      if (metadata && 'source' in metadata) continue;
      authored.add(component);
    } catch {
      authored.add(component);
    }
  }
  return [...authored].sort();
}
