// Removing emitted output that no longer has a spec behind it.
//
// Separate from the emit run because it is the one thing here that deletes. The
// platform trees are derived and may be pruned; nothing else in the workspace is.

import fs from 'fs-extra';
import path from 'path';
import { toPascalCase } from '../transforms/naming.js';
import type { Transformer } from '../transforms/transformer.js';
import { dirNameFor, SPEC_KINDS, type SpecKind } from '../utilities/specsLayout.js';

/**
 * Delete emitted component directories that no spec in this run accounts for.
 *
 * The expected set is derived the same way `outputDir` is, so the two cannot
 * disagree about where a component's output lives. Only whole component
 * directories are pruned — a stale file *inside* a directory whose component
 * still exists is not visible from here, because what a transformer writes
 * inside its `outputDir` is the transformer's own business.
 */
export async function pruneOrphans(
  transformers: Transformer[],
  specs: Array<{ kind: SpecKind; key: string }>,
  workspaceDir: string,
  /** Kinds this run did not emit, and is therefore not authoritative over. */
  skippedKinds: ReadonlySet<SpecKind> = new Set(),
): Promise<void> {
  const trees = new Set(
    transformers.map(t => t.outputTree).filter((t): t is string => Boolean(t)),
  );

  // Each kind's emitted directory is judged only against that kind's specs
  // (ADR-096). Judging one against the other would report every composition as an
  // orphaned component and delete it on the spot.
  for (const tree of trees) {
    for (const kind of SPEC_KINDS) {
      if (skippedKinds.has(kind)) continue;
      const expected = new Set(
        specs.filter(s => s.kind === kind).map(s => toPascalCase(s.key)),
      );
      const kindRoot = path.join(workspaceDir, tree, 'src', dirNameFor(kind));
      if (!(await fs.pathExists(kindRoot))) continue;

      const entries = await fs.readdir(kindRoot, { withFileTypes: true });
      const orphans = entries
        .filter(e => e.isDirectory() && !expected.has(e.name))
        .map(e => e.name);

      if (orphans.length === 0) continue;

      // One line, not one per directory: the list is the finding, and a rename
      // that changes a convention can orphan the whole tree at once.
      console.warn(
        `⚠ removed ${orphans.length} emitted ${orphans.length === 1 ? 'directory' : 'directories'} ` +
          `under ${tree}/src/${dirNameFor(kind)} with no matching spec: ${orphans.join(', ')}`,
      );
      for (const orphan of orphans) await fs.remove(path.join(kindRoot, orphan));
    }
  }
}
