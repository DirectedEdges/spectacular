/**
 * The `specs/` directory layout (ADR-096) — the one place that knows where each
 * kind of spec lives, how a spec folder is recognised, and how a pre-ADR flat
 * directory is read.
 *
 * Every consumer resolves through here. Before this module the answer was
 * re-derived per reader with its own filter — the emitter walk looked for a child
 * containing `api.yaml`, the version assembler skipped names starting with `_` or
 * `.` — two rules for one question, and nowhere to add a third kind.
 */

import fs from 'fs-extra';
import path from 'path';

/** What a spec describes. A component is reusable; a composition arranges components. */
export type SpecKind = 'component' | 'composition';

export const COMPONENTS_DIR = 'components';
export const COMPOSITIONS_DIR = 'compositions';
export const ANALYSIS_DIR = 'analysis';
/**
 * Where a library's foundation material sits: the fetched `variables.json` and
 * `styles.json`, and one directory per foundation concern holding the authored
 * documents for it (ADR-118).
 *
 * Named here because three callers reached for the literal independently — the
 * authored-document validator and both authored-input analyzers — and a fourth
 * would have made the drift permanent. It is not a `SpecKind`: nothing under it
 * describes a component or a composition.
 */
export const FOUNDATIONS_DIR = 'foundations';

export const SPEC_KINDS: readonly SpecKind[] = ['component', 'composition'];

/** The directory name a kind's specs live under, relative to the specs root. */
export function dirNameFor(kind: SpecKind): string {
  return kind === 'composition' ? COMPOSITIONS_DIR : COMPONENTS_DIR;
}

export interface SpecsLayout {
  /** Absolute path to the specs root — the directory `spec.directory` names. */
  root: string;
  /**
   * True when this directory predates ADR-096: spec folders sit at the root and
   * there is no `components/`. Compositions cannot exist in a legacy directory.
   */
  legacy: boolean;
  /** Absolute directory holding this kind's spec folders. */
  dirFor(kind: SpecKind): string;
  /** Absolute analysis directory — always `analysis/` (ADR-096). */
  analysisDir(): string;
  /**
   * Spec folder names for a kind, each a directory containing an api document.
   * Empty for `composition` in a legacy directory, and for a kind whose
   * directory does not exist.
   */
  folderNames(kind: SpecKind, format?: string): string[];
  /** Absolute path to one spec folder. */
  folderFor(kind: SpecKind, key: string): string;
}

function makeLayout(root: string, legacy: boolean): SpecsLayout {
  return {
    root,
    legacy,
    dirFor(kind) {
      return legacy ? root : path.join(root, dirNameFor(kind));
    },
    analysisDir() {
      return path.join(root, ANALYSIS_DIR);
    },
    folderNames(kind, format) {
      if (legacy && kind === 'composition') return [];
      return specFolderNames(this.dirFor(kind), format);
    },
    folderFor(kind, key) {
      return path.join(this.dirFor(kind), key);
    },
  };
}

/**
 * Read the layout of an existing specs directory.
 *
 * A directory with a `components/` child is current, and spec folders at its root
 * are **ignored** rather than merged: a workspace mid-migration would otherwise
 * emit one component from two sources with no way to say which won, and a stale
 * root folder would resurrect a component a rename had retired.
 */
export function resolveSpecsLayout(root: string): SpecsLayout {
  const resolved = path.resolve(root);
  const hasKindDirs =
    fs.existsSync(path.join(resolved, COMPONENTS_DIR)) ||
    fs.existsSync(path.join(resolved, COMPOSITIONS_DIR));
  return makeLayout(resolved, !hasKindDirs && hasRootSpecFolders(resolved));
}

/** The layout a run writes. Always current — nothing writes the legacy shape. */
export function writeLayout(root: string): SpecsLayout {
  return makeLayout(path.resolve(root), false);
}

/**
 * The deprecation line a legacy directory earns, or null. One line per run, and it
 * names the remedy rather than only the problem.
 */
export function legacyLayoutNotice(layout: SpecsLayout): string | null {
  if (!layout.legacy) return null;
  return (
    `Note: ${path.basename(layout.root)}/ uses the pre-${COMPONENTS_DIR}/ layout — ` +
    `spec folders at its root are read as components. Re-run \`specs generate\` to write ` +
    `${COMPONENTS_DIR}/ and ${COMPOSITIONS_DIR}/, then delete the leftovers it reports.`
  );
}

/**
 * Spec folder names directly inside `dir` — a directory holding an api document.
 *
 * The api document is what makes a folder a spec rather than something the customer
 * keeps here, which is why the test is its presence and not the folder's name. With
 * no `format`, either extension counts, so a reader that does not know the run's
 * format still finds the folders.
 */
export function specFolderNames(dir: string, format?: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const extensions = format ? [format] : ['yaml', 'yml', 'json'];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => extensions.some(ext => fs.existsSync(path.join(dir, name, `api.${ext}`))))
    .sort();
}

/** True when `dir` holds at least one spec folder at its own level. */
function hasRootSpecFolders(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === COMPONENTS_DIR || entry.name === COMPOSITIONS_DIR) continue;
    for (const ext of ['yaml', 'yml', 'json']) {
      if (fs.existsSync(path.join(dir, entry.name, `api.${ext}`))) return true;
    }
  }
  return false;
}
