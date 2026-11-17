import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import yaml from 'yaml';
import { checkPromotionMap } from '../../../src/validate/promotionMap.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'promotion-'));
  await fs.ensureDir(path.join(root, 'config', 'conventions'));
  await fs.ensureDir(path.join(root, 'specs', 'analysis', 'foundations'));
});
afterEach(async () => {
  await fs.remove(root);
});

async function table(doc: unknown): Promise<void> {
  await fs.writeFile(path.join(root, 'config', 'conventions', 'figma.primitives.yaml'), yaml.stringify(doc));
}

async function target(key: string, props: Record<string, unknown>): Promise<void> {
  const dir = path.join(root, 'specs', 'components', key);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, 'api.yaml'), yaml.stringify({ title: key, anatomy: { root: { type: 'container' } }, props }));
}

async function tokens(type: string, paths: string[]): Promise<void> {
  await fs.writeFile(
    path.join(root, 'specs', 'analysis', 'foundations', `${type}.yaml`),
    yaml.stringify({ $type: type, tokens: paths.map(p => ({ $token: p, $type: type })) }),
  );
}

function check(known: string[]): ReturnType<typeof checkPromotionMap> {
  return checkPromotionMap({
    configDir: path.join(root, 'config'),
    specsPath: path.join(root, 'specs'),
    known: new Set(known),
  });
}

describe('checkPromotionMap', () => {
  it('reports a values key that is not a token the library holds', async () => {
    await tokens('dimension', ['Spacing/S']);
    await target('dsBox', { gap: { type: 'string' } });
    await table({ dsBox: { elementType: 'container', map: [{ source: 'itemSpacing', values: { 'Spacing/S': { gap: 'S' }, 'Spacing/Nope': { gap: 'L' } } }] } });
    const out = check(['dsBox']);
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('"Spacing/Nope" is not a token this library holds');
  });

  it('reports a written prop the target does not declare', async () => {
    await tokens('dimension', ['Spacing/S']);
    await target('dsBox', { gap: { type: 'string' } });
    await table({ dsBox: { elementType: 'container', map: [{ source: 'itemSpacing', values: { 'Spacing/S': { spacing: 'S' } } }] } });
    const out = check(['dsBox']);
    expect(out.map(w => w.message)).toEqual(['writes "spacing", which "dsBox" does not declare']);
  });

  it('reports a prop written by the as-is form too', async () => {
    await target('dsText', { text: { type: 'string' } });
    await table({ dsText: { elementType: 'text', map: [{ source: 'content', prop: 'label' }] } });
    expect(check(['dsText'])[0].message).toContain('writes "label"');
  });

  it('collapses every unknown target into one warning', async () => {
    await table({
      dsBox: { elementType: 'container', map: [] },
      dsCard: { elementType: 'container', map: [] },
      dsText: { elementType: 'text', map: [{ source: 'content', prop: 'text' }] },
    });
    const out = check(['dsText']);
    expect(out).toHaveLength(1);
    expect(out[0].message).toBe('2 promotion targets have no spec folder, so they promote nothing: dsBox, dsCard');
  });

  it('reports a value outside the target prop\'s declared enum', async () => {
    await target('dsBox', { layoutMode: { type: 'string', enum: ['Vertical', 'Horizontal'] } });
    await table({ dsBox: { elementType: 'container', map: [{ source: 'layoutMode', values: { VERTICAL: { layoutMode: 'Column' } } }] } });
    expect(check(['dsBox'])[0].message)
      .toBe('writes "layoutMode: Column", which is not one of "dsBox"\'s declared values (Vertical, Horizontal)');
  });

  it('leaves a value alone where the prop declares no enum', async () => {
    await target('dsText', { text: { type: 'string' } });
    await table({ dsText: { elementType: 'text', map: [{ source: 'content', prop: 'text' }] } });
    expect(check(['dsText'])).toEqual([]);
  });

  it('reports a source the element kind does not carry', async () => {
    await target('dsBox', { gap: { type: 'string' } });
    await table({ dsBox: { elementType: 'container', map: [{ source: 'children', prop: 'gap' }] } });
    expect(check(['dsBox'])[0].message).toContain('"children" is not read from a container');
  });

  it('accepts a dotted source whose head is honoured', async () => {
    await target('dsText', { weight: { type: 'string' } });
    await table({ dsText: { elementType: 'text', map: [{ source: 'typography.fontStyle', prop: 'weight' }] } });
    expect(check(['dsText'])).toEqual([]);
  });

  it('leaves a raw scalar key alone', async () => {
    await tokens('dimension', ['Spacing/S']);
    await target('dsBox', { layoutMode: { type: 'string' } });
    await table({ dsBox: { elementType: 'container', map: [{ source: 'layoutMode', values: { VERTICAL: { layoutMode: 'Vertical' }, NONE: { layoutMode: 'None' } } }] } });
    expect(check(['dsBox'])).toEqual([]);
  });

  it('checks no token key when the foundations analysis has not been run', async () => {
    await target('dsBox', { gap: { type: 'string' } });
    await table({ dsBox: { elementType: 'container', map: [{ source: 'itemSpacing', values: { 'Spacing/Whatever': { gap: 'S' } } }] } });
    expect(check(['dsBox'])).toEqual([]);
  });

  it('says nothing when the workspace has no promotion table', async () => {
    expect(check([])).toEqual([]);
  });

  it('says nothing for a table that is entirely sound', async () => {
    await tokens('dimension', ['Spacing/S', 'Spacing/L']);
    await target('dsBox', { gap: { type: 'string' }, layoutMode: { type: 'string' } });
    await table({
      dsBox: {
        elementType: 'container',
        map: [
          { source: 'layoutMode', values: { VERTICAL: { layoutMode: 'Vertical' } } },
          { source: 'itemSpacing', values: { 'Spacing/S': { gap: 'S' }, 'Spacing/L': { gap: 'L' } } },
        ],
      },
    });
    expect(check(['dsBox'])).toEqual([]);
  });
});
