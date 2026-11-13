import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildStatus, readPinnedStorybookPort } from '../../../src/author/status.js';

let dir: string;

function write(rel: string, content = 'a: 1', mtime?: Date): void {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  if (mtime) fs.utimesSync(full, mtime, mtime);
}

const OLD = new Date('2026-01-01T12:00:00Z');
const NEW = new Date('2026-06-01T12:00:00Z');

function status(overrides: Partial<Parameters<typeof buildStatus>[0]> = {}) {
  return buildStatus({
    specsRoot: path.join(dir, 'specs'),
    configDir: path.join(dir, 'config'),
    dataDir: path.join(dir, 'data'),
    workspaceRoot: dir,
    probe: async () => true,
    ...overrides,
  });
}

describe('author status', () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-author-status-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reports catalogue, analysis facts, conventions, and posture', async () => {
    write('specs/components/badge/api.yaml');
    write('specs/components/button/api.yaml');
    write('specs/analysis/props.yaml', 'a: 1', NEW);
    write('specs/analysis/dependencies.byComponent.yaml', 'a: 1', NEW);
    write('specs/analysis/foundations.yaml', 'a: 1', NEW);
    write('config/conventions/figma.yaml');
    write('config/conventions/react.yaml');
    write('data/cache/icons.yaml', 'a: 1', OLD);
    write('storybook/package.json', JSON.stringify({ scripts: { storybook: 'storybook dev -p 6106 --ci' } }));

    const result = await status();
    expect(result.catalogue).toEqual({ components: ['badge', 'button'], compositions: [] });
    expect(result.analysis.props).toEqual({ path: path.join('analysis', 'props.yaml'), updated: '2026-06-01' });
    expect(result.analysis.stale).toBe(false);
    expect(result.conventions.files).toEqual([
      path.join('config', 'conventions', 'figma.yaml'),
      path.join('config', 'conventions', 'react.yaml'),
    ]);
    expect(result.posture).toEqual({ storybookPort: 6106, up: true });
  });

  it('marks analysis stale when a report is missing or older than the newest payload', async () => {
    write('specs/analysis/props.yaml', 'a: 1', NEW);
    write('specs/analysis/dependencies.byComponent.yaml', 'a: 1', NEW);
    const missing = await status();
    expect(missing.analysis.foundations.updated).toBeNull();
    expect(missing.analysis.stale).toBe(true);

    write('specs/analysis/foundations.yaml', 'a: 1', OLD);
    write('data/newer.variables.json', '{}', NEW);
    const outdated = await status();
    expect(outdated.analysis.stale).toBe(true);
  });

  it('reports the posture down without a readable port, and never probes', async () => {
    let probed = false;
    const result = await status({ probe: async () => { probed = true; return true; } });
    expect(result.posture).toEqual({ storybookPort: null, up: false });
    expect(probed).toBe(false);
  });

  it('reads the pinned port only from the storybook script', () => {
    write('storybook/package.json', JSON.stringify({ scripts: { storybook: 'storybook dev --ci' } }));
    expect(readPinnedStorybookPort(dir)).toBeNull();
  });
});
