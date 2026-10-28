/**
 * Display license status extracted from component output metadata.
 */

import type { ComponentsData } from '@directededges/specs-from-figma';

const STATUS_DESCRIPTIONS: Record<string, string> = {
  'invalid': 'key not recognized',
  'expired': 'key expired',
  'activation-limit-reached': 'all seats consumed for this key',
  'network-error': 'could not reach license server',
  'wrong-runtime': 'key is for a different product',
};

export class LicenseStatus {
  /**
   * Extract the resolved license { level, status } stamped into the first
   * successful component's metadata. Returns null when nothing succeeded or no
   * license was stamped. Single source of the metadata path for both the
   * status line and the gating check below.
   */
  static resolve(results: ComponentsData[]): { level?: string; status?: string } | null {
    const firstSuccess = results.find(
      (r): r is { name: string; component: Record<string, any> } => 'component' in r,
    );
    const generator = firstSuccess?.component?.metadata?.generator;
    if (!generator?.license) return null;
    return generator.license as { level?: string; status?: string };
  }

  /**
   * Print a license status line based on the first successful result.
   * Silent when no license key was provided or no results succeeded.
   */
  static display(results: ComponentsData[], licenseKeyProvided: boolean): void {
    if (!licenseKeyProvided) return;

    const license = LicenseStatus.resolve(results);
    if (!license) return;

    const { level, status } = license;

    if (status === 'active') {
      console.log(`License: ${level} (active)`);
    } else if (status) {
      const desc = STATUS_DESCRIPTIONS[status] || status;
      console.log(`License: ${level || 'FREE'} (${status} — ${desc})`);
    }
  }
}
