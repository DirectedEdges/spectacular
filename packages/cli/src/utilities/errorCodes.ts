/**
 * The CLI's process exit codes — the whole contract, in one place.
 *
 * Every command used to declare its own `ERROR_CODES` object holding whichever
 * subset it happened to use, each one annotated "from contracts/error-codes.md",
 * a file that does not exist. Fourteen copies agreed on the numbers by luck, and
 * a fifteenth command adding a code had nowhere to look for the next free value.
 * This module is that contract: a command imports it and reaches for the code it
 * needs, and a new code is added here once.
 *
 * The values are a public interface — scripts and CI branch on them — so an
 * existing code's number never changes. A new one takes the next free integer.
 */

export const ERROR_CODES = {
  /** The command did what it was asked. */
  SUCCESS: 0,
  /** Anything that failed for a reason the other codes do not name. */
  GENERAL_ERROR: 1,
  /** The invocation itself is wrong — a missing argument, two exclusive flags. */
  INVALID_ARGS: 2,
  /** A path does not exist, cannot be read, or cannot be written. */
  FILE_ERROR: 3,
  /** A request to Figma or the license service did not complete. */
  NETWORK_ERROR: 4,
  /** Credentials are missing, rejected, or not valid for this runtime. */
  AUTH_ERROR: 5,
  /** An upstream service asked us to slow down. */
  RATE_LIMIT: 6,
  /** A named component is not in the source the command was pointed at. */
  COMPONENT_NOT_FOUND: 7,
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
