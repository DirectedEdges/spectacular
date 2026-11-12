import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { changedComponentFolders } from '../../../src/commands/render.js';

let root: string;

function specFolder(...segments: string[]): string {
  const dir = path.join(root, ...segments);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'api.yaml'), 'title: X\n');
  fs.writeFileSync(path.join(dir, 'variants.yaml'), 'default: {}\n');
  return dir;
}

describe('changedComponentFolders', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-watch-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('maps changed files to their spec folders, deduplicated', () => {
    const icon = specFolder('components', 'icon');
    specFolder('components', 'iconButton');
    const folders = changedComponentFolders(
      ['components/icon/variants.yaml', 'components/icon/api.yaml'],
      root,
    );
    expect(folders).toEqual([icon]);
  });

  it('keeps two changed specs separate and ignores unmapped paths', () => {
    const icon = specFolder('components', 'icon');
    const button = specFolder('components', 'iconButton');
    const folders = changedComponentFolders(
      ['components/icon/variants.yaml', 'components/iconButton/api.yaml', 'analysis/foundations.yaml', 'README.md'],
      root,
    );
    expect(folders).toEqual([button, icon].sort());
  });

  it('maps nothing for the start-up run', () => {
    specFolder('components', 'icon');
    expect(changedComponentFolders([], root)).toEqual([]);
  });
});
