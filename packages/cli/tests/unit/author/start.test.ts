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

  // The templates carry no live data by design: placeholder props and elements used to
  // reach the analysis reports as a real prop surface, and the reports are what the next
  // author correlates against. So a fresh folder reports exactly the required nodes that
  // are still unwritten — never an error about content nobody authored.
  it('a freshly started folder reports only its unwritten required nodes', () => {
    start('iconButton');
    const result = runValidate({
      specsPath: path.join(dir, 'specs'),
      components: ['iconButton'],
      authored: true,
    });
    const errors = result.findings.filter(f => f.level === 'error');
    expect(errors.map(f => `${f.file}${f.path}`).sort()).toEqual([
      'api.yaml/anatomy',
      'api.yaml/props',
      'variants.yaml/default',
      'variants.yaml/variants',
    ]);
    for (const e of errors) expect(e.message).toBe('required property is missing');
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
