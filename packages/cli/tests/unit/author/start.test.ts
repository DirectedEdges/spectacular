import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'yaml';
import { startComponent, titleFromKey, StartKeyError, StartCollisionError } from '../../../src/author/start.js';
import { runValidate } from '../../../src/validate/run.js';

let dir: string;

function start(key: string, overrides: Partial<Parameters<typeof startComponent>[0]> = {}) {
  return startComponent({
    specsRoot: path.join(dir, 'specs'),
    key,
    format: 'YAML',
    workspaceRoot: dir,
    ...overrides,
  });
}

describe('author start', () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-author-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('writes all three concern templates with the title filled', () => {
    const result = start('iconButton');
    expect(result).toEqual({
      key: 'iconButton',
      folder: path.join('specs', 'components', 'iconButton'),
      wrote: ['api.yaml', 'variants.yaml', 'examples.yaml'],
    });
    const api = yaml.parse(fs.readFileSync(path.join(dir, 'specs', 'components', 'iconButton', 'api.yaml'), 'utf-8'));
    expect(api.title).toBe('Icon Button');
    expect(api.metadata.concern).toBe('api');
    expect(api.metadata.source).toBeUndefined();
  });

  it('a freshly started folder validates clean as authored', () => {
    start('iconButton');
    const result = runValidate({
      specsPath: path.join(dir, 'specs'),
      components: ['iconButton'],
      authored: true,
    });
    expect(result.findings.filter(f => f.level === 'error')).toEqual([]);
  });

  it('refuses a key that is not a folder key, naming the derived spelling', () => {
    expect(() => start('Icon Button')).toThrow(StartKeyError);
    expect(() => start('Icon Button')).toThrow(/derives to "iconButton"/);
  });

  it('refuses a collision without touching the folder', () => {
    fs.mkdirSync(path.join(dir, 'specs', 'components', 'badge'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'specs', 'components', 'badge', 'api.yaml'), 'existing');
    expect(() => start('badge')).toThrow(StartCollisionError);
    expect(fs.readFileSync(path.join(dir, 'specs', 'components', 'badge', 'api.yaml'), 'utf-8')).toBe('existing');
  });

  it('writes JSON when the workspace format is JSON', () => {
    const result = start('badge', { format: 'JSON' });
    expect(result.wrote).toEqual(['api.json', 'variants.json', 'examples.json']);
    const api = JSON.parse(fs.readFileSync(path.join(dir, 'specs', 'components', 'badge', 'api.json'), 'utf-8'));
    expect(api.title).toBe('Badge');
  });

  it('derives titles from keys', () => {
    expect(titleFromKey('badge')).toBe('Badge');
    expect(titleFromKey('iconButton')).toBe('Icon Button');
    expect(titleFromKey('pageHeader2')).toBe('Page Header2');
  });
});
