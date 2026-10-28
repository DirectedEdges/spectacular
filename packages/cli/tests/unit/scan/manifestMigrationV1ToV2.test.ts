import { describe, it, expect } from 'vitest';
import { isV1Manifest, migrateV1ToV2 } from '../../../src/scan/manifestMigrationV1ToV2.js';

const V1 = `# Component Manifest

**Generated:** 2026-04-01T00:00:00Z
**File:** data/library.file.json

## Components

- [x] Button (1:23, COMPONENT_SET)
- [ ] Card (1:45, COMPONENT)
- [x] Icon (2:1, COMPONENT)
`;

describe('ManifestMigrationV1ToV2', () => {
  describe('isV1Manifest', () => {
    it('returns true for legacy checkbox-list format', () => {
      expect(isV1Manifest(V1)).toBe(true);
    });

    it('returns false when scan format version header is present', () => {
      const v2 = '**Scan format version:** 2\n\n- [x] Old (1:1, COMPONENT)\n';
      expect(isV1Manifest(v2)).toBe(false);
    });

    it('returns false for content with no checkbox rows', () => {
      expect(isV1Manifest('# Some doc\n\nJust prose.')).toBe(false);
    });
  });

  describe('migrateV1ToV2', () => {
    it('lifts v1 rows into v2 row shape with devStatus=NONE', () => {
      const rows = migrateV1ToV2(V1);
      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual({
        id: '1:23',
        name: 'Button',
        type: 'COMPONENT_SET',
        included: true,
        devStatus: 'NONE'
      });
      expect(rows[1]).toMatchObject({ id: '1:45', included: false, devStatus: 'NONE' });
      expect(rows[2]).toMatchObject({ id: '2:1', name: 'Icon', included: true });
    });

    it('preserves checkbox state across migration', () => {
      const rows = migrateV1ToV2(V1);
      expect(rows.filter(r => r.included).map(r => r.id)).toEqual(['1:23', '2:1']);
    });
  });
});
