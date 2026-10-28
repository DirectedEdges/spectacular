import { describe, it, expect } from 'vitest';
import { ManifestParserV2 } from '../../../src/utilities/manifestParserV2.js';

const V2_FIXTURE = `# Component Manifest

**Scan format version:** 2
**Generated:** 2026-05-08T18:02:11Z
**File:** data/specs-testing.file.json
**Variables:** data/specs-testing.variables.json
**File last modified:** 2026-05-08T17:48:26Z

---

## Components

| ✓ | Name | ID | Type | Dev Status |
|------|------|------|------|------------|
| [x] | TEST PropBinding 1 | 397:37 | COMPONENT_SET | READY_FOR_DEV |
| [ ] | Button | 1:23 | COMPONENT_SET | NONE |
| [x] | Card | 1:45 | COMPONENT | NONE |
`;

describe('ManifestParserV2', () => {
  it('detects v2 from header', () => {
    expect(ManifestParserV2.isV2(V2_FIXTURE)).toBe(true);
  });

  it('does not detect v1 (checkbox-list) as v2', () => {
    const v1 = '# Component Manifest\n\n**File:** x.json\n\n- [x] Button (1:23, COMPONENT_SET)\n';
    expect(ManifestParserV2.isV2(v1)).toBe(false);
  });

  it('parses metadata fields', () => {
    const { metadata } = ManifestParserV2.parse(V2_FIXTURE);
    expect(metadata.scanFormatVersion).toBe(2);
    expect(metadata.file).toBe('data/specs-testing.file.json');
    expect(metadata.variables).toBe('data/specs-testing.variables.json');
    expect(metadata.fileLastModified).toBe('2026-05-08T17:48:26Z');
  });

  it('parses rows with checkbox, type and devStatus', () => {
    const { components } = ManifestParserV2.parse(V2_FIXTURE);
    expect(components).toHaveLength(3);
    expect(components[0]).toEqual({
      id: '397:37',
      name: 'TEST PropBinding 1',
      type: 'COMPONENT_SET',
      included: true,
      devStatus: 'READY_FOR_DEV'
    });
    expect(components[1].included).toBe(false);
    expect(components[1].devStatus).toBe('NONE');
    expect(components[2]).toMatchObject({ id: '1:45', type: 'COMPONENT', included: true, devStatus: 'NONE' });
  });

  it('ignores non-row lines (header separator, prose)', () => {
    const { components } = ManifestParserV2.parse(V2_FIXTURE);
    expect(components.every(c => /^\d+:\d+$/.test(c.id))).toBe(true);
  });

  it('returns empty components when no table rows present', () => {
    const empty = '**Scan format version:** 2\n\n## Components\n\n| ✓ | Name | ID | Type | Dev Status |\n|---|---|---|---|---|\n';
    const { components } = ManifestParserV2.parse(empty);
    expect(components).toEqual([]);
  });

  it('unescapes escaped pipes in names (round-trips scan escapeCell)', () => {
    const fixture = [
      '**Scan format version:** 2',
      '',
      '## Components',
      '',
      '| ✓ | Name | ID | Type | Dev Status |',
      '|------|------|------|------|------------|',
      '| [x] | Toggle \\| On/Off | 1:23 | COMPONENT_SET | NONE |',
      ''
    ].join('\n');

    const { components } = ManifestParserV2.parse(fixture);
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe('Toggle | On/Off');
    expect(components[0].id).toBe('1:23');
  });
  it('parses COMPLETED rows without warning and preserves the checkbox', () => {
    const fixture = [
      '**Scan format version:** 2',
      '',
      '## Components',
      '',
      '| ✓ | Name | ID | Type | Dev Status |',
      '|------|------|------|------|------------|',
      '| [x] | Text Field | 9313:18494 | COMPONENT_SET | COMPLETED |',
      ''
    ].join('\n');

    const { components, warnings } = ManifestParserV2.parse(fixture);
    expect(components).toEqual([
      {
        id: '9313:18494',
        name: 'Text Field',
        type: 'COMPONENT_SET',
        included: true,
        devStatus: 'COMPLETED'
      }
    ]);
    expect(warnings).toEqual([]);
  });

  it('keeps a row with an unrecognized status, unselected, and warns', () => {
    const fixture = [
      '**Scan format version:** 2',
      '',
      '## Components',
      '',
      '| ✓ | Name | ID | Type | Dev Status |',
      '|------|------|------|------|------------|',
      '| [x] | Text Field | 9313:18494 | COMPONENT_SET | IN_REVIEW |',
      ''
    ].join('\n');

    const { components, warnings } = ManifestParserV2.parse(fixture);
    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({ id: '9313:18494', devStatus: 'IN_REVIEW', included: false });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('IN_REVIEW');
  });

  it('warns instead of silently dropping a malformed checkbox row', () => {
    const fixture = [
      '**Scan format version:** 2',
      '',
      '## Components',
      '',
      '| ✓ | Name | ID | Type | Dev Status |',
      '|------|------|------|------|------------|',
      '| [x] | Broken | not-an-id | COMPONENT_SET | NONE |',
      ''
    ].join('\n');

    const { components, warnings } = ManifestParserV2.parse(fixture);
    expect(components).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Broken');
  });

  it('reports no warnings for a clean manifest', () => {
    expect(ManifestParserV2.parse(V2_FIXTURE).warnings).toEqual([]);
  });
});
