/**
 * Writing a generated page tree without taking the dev server down.
 *
 * The obvious implementation — remove the output directory, write it back from
 * scratch — produces correct output and breaks `astro dev`. The server watches
 * these files, and deleting a whole tree to recreate it left it serving 500s
 * for pages that were present and valid on disk, with the count growing on
 * every run. That was diagnosed and fixed once, in one generator; the other
 * four kept their own emission, two of them still wiping. One of those wipes
 * is why `adr/` could not be watched at all.
 *
 * So there is one contract here and every generator uses it:
 *
 *   - A file is written only when its bytes differ, so an unchanged page keeps
 *     its mtime and a schema edit touching one key triggers one hot reload
 *     rather than ninety-nine.
 *   - Every path written is remembered, so `commit()` can delete a page whose
 *     key was renamed or removed without disturbing its siblings.
 *   - Nothing is deleted until `commit()`, which a generator that failed its
 *     own checks simply does not call.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * An emitter over one output tree.
 *
 * `root` is the directory the sweep is allowed to delete from — never wider
 * than the tree this generator owns, because the sweep's rule is "a markdown
 * file I did not write this run", and that is only true inside it.
 */
export const createEmitter = ({ root, label = root }) => {
  const emitted = new Set();
  let changed = 0;

  /**
   * Write one page. Returns whether the bytes actually changed, which is only
   * of interest to the run summary.
   *
   * Parent directories are created here rather than by the caller: every
   * caller had to do it, two of them did it inside their page loop, and
   * forgetting it is a crash rather than a wrong page.
   */
  const write = (file, contents) => {
    emitted.add(file);
    if (existsSync(file) && readFileSync(file, 'utf8') === contents) return false;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
    changed++;
    return true;
  };

  /**
   * Delete the markdown this run did not write, and the directories that
   * leaves empty.
   *
   * Recursive, because the deepest tree here nests two levels
   * (`mappings/<platform>/rules/<rule>.md`) and a flat sweep would strand
   * retired pages below the first level.
   *
   * Empty directories are pruned too. The sweep used to remove retired pages
   * and leave their folders, so a long-lived checkout accumulated empty
   * directories a clean build never creates — five of them, from a gradient
   * shape retired some releases ago. They render nothing, but they mean the
   * tree never converges on what a fresh build produces, which is what a
   * before/after comparison depends on.
   */
  const commit = () => {
    const removed = [];
    const sweep = (dir) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) sweep(full);
        else if (entry.name.endsWith('.md') && !emitted.has(full)) {
          rmSync(full);
          removed.push(full);
        }
      }
      if (dir !== root && readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
    };
    sweep(root);
    return removed;
  };

  /**
   * One line reporting what the run did. The three generators that counted
   * pages each phrased this differently and the other two did not count at
   * all, so a failed run and a no-op run read the same.
   */
  const summary = (removed) =>
    `${emitted.size} pages under ${label} — ${changed} changed, ${emitted.size - changed} unchanged, ${removed.length} removed`;

  return { root, write, commit, summary, emitted };
};
