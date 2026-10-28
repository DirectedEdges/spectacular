/**
 * Figma file key parsing — a pasted Figma URL or a bare file key resolve to the
 * same thing, since a branch key works anywhere a main file key does at
 * `GET /v1/files/:key`.
 *
 * Accepted URL shapes are the ones Figma serves today:
 *   https://www.figma.com/design/<KEY>/<slug>?...
 *   https://www.figma.com/file/<KEY>/<slug>?...
 *   https://www.figma.com/design/<MAIN_KEY>/branch/<BRANCH_KEY>/<slug>?...
 *
 * The third is what the URL bar shows while a branch is open, and it names both
 * files. The branch key is the one that means "this file" — reading the leading
 * key instead would resolve a branch link to main, fetch the wrong document, and
 * look entirely successful doing it.
 */

/** Figma file keys are URL-safe alphanumeric strings; 20+ chars in practice. */
const FILE_KEY = /^[A-Za-z0-9]{10,128}$/;
const FIGMA_URL = /^https?:\/\/(?:[\w-]+\.)*figma\.com\/(?:design|file)\/([A-Za-z0-9]{10,128})(?:\/branch\/([A-Za-z0-9]{10,128}))?(?:[/?#]|$)/;

export class FigmaKeyError extends Error {}

/**
 * Resolve a bare file key or a Figma file/design URL to a file key.
 * Throws `FigmaKeyError` with the input echoed back — the caller is always a
 * command that should report this as a usage error, not a crash.
 */
export function resolveFigmaFileKey(input: string): string {
  const value = input.trim();

  if (FILE_KEY.test(value)) return value;

  const match = FIGMA_URL.exec(value);
  if (match) return match[2] ?? match[1];

  if (/figma\.com/.test(value)) {
    throw new FigmaKeyError(
      `Not a Figma file URL: ${value}\n  Expected figma.com/design/<KEY>/... or figma.com/file/<KEY>/...`
    );
  }

  throw new FigmaKeyError(
    `Not a Figma file key or URL: ${value}\n  Pass a file key, or the URL of the file or branch as it appears in Figma`
  );
}

/**
 * Slugify a Figma branch name for use as a source alias: the alias becomes a
 * filename stem (`<alias>.file.json`) and a manifest name, so it has to be
 * filesystem- and CLI-safe.
 */
export function slugifyBranchName(name: string): string {
  const slug = name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'branch';
}
