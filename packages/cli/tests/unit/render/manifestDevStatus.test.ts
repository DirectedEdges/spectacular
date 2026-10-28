import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { loadDevStatusByNodeId, devStatusForSpec, type WritableDevStatus } from '../../../src/render/manifestDevStatus.js';
import type { CLIConfig } from '../../../src/config/types.js';

const MANIFEST = `# Component Manifest

**Scan format version:** 2
**File:** data/library.file.json

---

## Components

| ✓ | Name | ID | Type | Dev Status |
|------|------|------|------|------------|
| [x] | Button | 1:23 | COMPONENT_SET | READY_FOR_DEV |
| [x] | Card | 1:45 | COMPONENT | COMPLETED |
| [x] | Chip | 1:67 | COMPONENT | NONE |
| [ ] | Banner | 1:89 | COMPONENT | WORKSHOPPING |
`;

let dataDir: string;

// A config is only ever read for its data directory and its sources, so the fixture
// states those and nothing else — a fuller one would imply the lookup depends on it.
const configFor = (directory: string): CLIConfig =>
  ({ settings: { data: { directory, sources: { library: { fetch: ['file'] } } } } } as unknown as CLIConfig);

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devstatus-'));
  fs.writeFileSync(path.join(dataDir, 'library.manifest.md'), MANIFEST, 'utf-8');
});

afterAll(() => {
  fs.removeSync(dataDir);
});

describe('loadDevStatusByNodeId', () => {
  it('indexes only the statuses Figma can be asked to write', () => {
    const index = loadDevStatusByNodeId(configFor(dataDir));
    expect(index.get('1:23')).toBe('READY_FOR_DEV');
    expect(index.get('1:45')).toBe('COMPLETED');
    // NONE is the absence of a status, and an unrecognized one says nothing render can act on.
    expect(index.has('1:67')).toBe(false);
    expect(index.has('1:89')).toBe(false);
  });

  it('is empty when the workspace has no manifest', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devstatus-empty-'));
    try {
      expect(loadDevStatusByNodeId(configFor(emptyDir)).size).toBe(0);
    } finally {
      fs.removeSync(emptyDir);
    }
  });

  it('is empty when no configured source carries the component file', () => {
    const config = { settings: { data: { directory: dataDir, sources: {} } } } as unknown as CLIConfig;
    expect(loadDevStatusByNodeId(config).size).toBe(0);
  });
});

describe('devStatusForSpec', () => {
  const index = new Map<string, WritableDevStatus>([['1:23', 'READY_FOR_DEV']]);

  it('matches a bare spec on the Figma node it was generated from', () => {
    expect(devStatusForSpec({ metadata: { source: { nodeId: '1:23' } } }, index)).toBe('READY_FOR_DEV');
  });

  it('matches a spec in the wrapped components form', () => {
    const spec = { components: { button: { metadata: { source: { nodeId: '1:23' } } } } };
    expect(devStatusForSpec(spec, index)).toBe('READY_FOR_DEV');
  });

  it('returns nothing for a spec the manifest has no row for', () => {
    expect(devStatusForSpec({ metadata: { source: { nodeId: '9:99' } } }, index)).toBeUndefined();
  });

  it('returns nothing for a spec carrying no source node id', () => {
    expect(devStatusForSpec({ title: 'Hand authored' }, index)).toBeUndefined();
  });
});
