/**
 * Size-aware reads for fetched Figma payloads.
 *
 * Node cannot materialize a string longer than ~512MB (V8's limit,
 * `0x1fffffe8` characters), and every fetched payload is read as one UTF-8
 * string before parsing. A real-world community library file can exceed that,
 * and the raw failure — "Cannot create a string longer than 0x1fffffe8
 * characters" — names neither the file nor a way forward. Every command that
 * reads a payload goes through here so the failure names both.
 */

import { readFileSync, statSync } from 'fs';
import { basename } from 'path';

/** V8's maximum string length in characters; a payload at or above this byte
 *  count cannot be read as a single string (UTF-8 bytes ≥ characters). */
export const MAX_JSON_STRING_BYTES = 0x1fffffe8;

const MB = 1048576;

/** A payload too large for a single-string read. `remedies` is display-ready. */
export class PayloadTooLargeError extends Error {
  readonly file: string;
  readonly bytes: number;
  readonly remedies: string[];

  constructor(file: string, bytes: number) {
    const remedies = [
      `Re-fetch without geometry data: specs fetch --no-geometry (around a third smaller)`,
      `Remove or split pages in Figma that this workspace does not need`,
    ];
    super(
      `${basename(file)} is ${Math.round(bytes / MB)}MB — over the ~${Math.round(MAX_JSON_STRING_BYTES / MB)}MB ` +
      `limit Node can read as a single JSON string.\n` +
      remedies.map(r => `  Remedy: ${r}`).join('\n')
    );
    this.name = 'PayloadTooLargeError';
    this.file = file;
    this.bytes = bytes;
    this.remedies = remedies;
  }
}

/** True when this error is the size cap — either detected up front or V8's own throw. */
export function isPayloadSizeError(error: unknown): boolean {
  return error instanceof PayloadTooLargeError
    || (error instanceof Error && error.message.includes('Cannot create a string longer'));
}

/** Throw a named, remedied error when the payload cannot be read as one string.
 *  `bytes` is injectable for tests; defaults to the file's on-disk size. */
export function assertPayloadReadable(filePath: string, bytes?: number): void {
  const size = bytes ?? statSync(filePath).size;
  if (size >= MAX_JSON_STRING_BYTES) throw new PayloadTooLargeError(filePath, size);
}

/**
 * Read and parse one fetched payload. Throws `PayloadTooLargeError` before
 * attempting an impossible read, and wraps parse failures with the file name —
 * a payload error must never surface as a bare V8 or JSON message.
 */
export function readJsonPayload(filePath: string): Record<string, unknown> {
  assertPayloadReadable(filePath);
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch (error) {
    if (isPayloadSizeError(error)) {
      // Belt and braces: multi-byte content can pass the byte check yet still
      // exceed the character cap on concatenation.
      throw new PayloadTooLargeError(filePath, statSync(filePath).size);
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${basename(filePath)}: ${reason}`);
  }
}
