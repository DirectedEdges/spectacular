/**
 * The dev-status vocabulary, as carried from Figma.
 *
 * Shared, not scan's own: `scan` reads a status off a node, the manifest parser
 * validates one written into a manifest row, and `specs render` stamps one back
 * onto the node it writes. It lived in the component discovery module, which made
 * the manifest parser import from a command's feature folder to validate a string.
 */

/** Dev statuses Figma itself sets, plus 'NONE' for a node with no status. */
export type KnownDevStatus = 'READY_FOR_DEV' | 'COMPLETED' | 'NONE';

export const KNOWN_DEV_STATUSES: readonly KnownDevStatus[] = ['READY_FOR_DEV', 'COMPLETED', 'NONE'];

/**
 * A dev status as carried from Figma. Values outside `KnownDevStatus` are passed
 * through verbatim rather than collapsed, so a status this CLI predates stays visible.
 */
export type DevStatus = KnownDevStatus | (string & {});

export function isKnownDevStatus(value: string): value is KnownDevStatus {
  return (KNOWN_DEV_STATUSES as readonly string[]).includes(value);
}
