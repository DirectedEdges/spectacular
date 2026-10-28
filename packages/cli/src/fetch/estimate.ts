/**
 * How long a fetch will wait before Figma sends anything.
 *
 * A file payload is built on demand: Figma serializes the whole document before
 * the first byte leaves, and only repeats that work when the file changed since
 * the last fetch. For a large file the build dominates — measured at roughly 10
 * to 18 seconds per 100MB, against a transfer that runs at about 75MB/s — so the
 * wait, not the download, is what a caller sits through. Reporting the two as one
 * number is why a 700MB fetch looks like a hang.
 *
 * The size of the last fetch of the same source predicts the wait better than
 * anything else available, and it is already on disk. None of this is precise
 * enough to quote a figure, so callers get a band and never a number.
 *
 * @packageDocumentation
 */

import fs from 'fs-extra';
import path from 'path';
import { splitDirFor } from '../utilities/payloadSplit.js';

/** Seconds of build time per MB of payload, low and high ends of what was measured. */
const SECONDS_PER_MB_LOW = 0.10;
const SECONDS_PER_MB_HIGH = 0.18;

const BYTES_PER_MB = 1048576;

/**
 * Bytes the last fetch of `alias` produced, or null when the source has never
 * been fetched here. The page-split directory records its own source size; a
 * pre-split monolithic payload only has its size on disk.
 */
export function lastFetchedBytes(outDir: string, alias: string): number | null {
  const manifestPath = path.join(splitDirFor(outDir, alias), 'manifest.json');
  try {
    const manifest = fs.readJsonSync(manifestPath) as { sourceBytes?: unknown };
    if (typeof manifest.sourceBytes === 'number' && manifest.sourceBytes > 0) return manifest.sourceBytes;
  } catch { /* no split directory, or it predates sourceBytes */ }

  try {
    const stat = fs.statSync(path.join(outDir, `${alias}.file.json`));
    if (stat.size > 0) return stat.size;
  } catch { /* never fetched */ }

  return null;
}

/** `704MB`, `36MB`, `912KB` — a size a person reads, not a byte count. */
export function formatPayloadSize(bytes: number): string {
  if (bytes >= BYTES_PER_MB) return `${Math.round(bytes / BYTES_PER_MB)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/**
 * A band wide enough to be honest. The upper end of the measured rate decides
 * which band a size falls in, so the estimate errs towards patience.
 */
export function estimateWaitBand(bytes: number): string {
  const high = (bytes / BYTES_PER_MB) * SECONDS_PER_MB_HIGH;
  if (high <= 15) return 'up to 15 seconds';
  if (high <= 30) return 'up to 30 seconds';
  if (high <= 60) return 'between 30 and 60 seconds';
  if (high <= 90) return 'between 60 and 90 seconds';
  return 'more than 90 seconds';
}

/**
 * The line shown while Figma builds the payload. With a previous fetch to go on
 * it names that size and the band; without one it says only that the wait is
 * expected, since a first fetch has nothing to predict from.
 */
export function preparingMessage(alias: string, kind: string, lastBytes: number | null): string {
  const subject = `Figma is preparing ${alias}.${kind} for download`;
  if (lastBytes === null) {
    return `${subject}. For large files this can take 60 to 120 seconds.`;
  }
  return `${subject}. Last fetch was ${formatPayloadSize(lastBytes)}, so this may take ${estimateWaitBand(lastBytes)}.`;
}

/** Seconds-per-MB band, exported for the tests that pin the bucket boundaries. */
export const WAIT_RATE = { low: SECONDS_PER_MB_LOW, high: SECONDS_PER_MB_HIGH };
