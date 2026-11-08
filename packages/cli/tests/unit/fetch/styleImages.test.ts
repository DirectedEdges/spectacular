import { describe, it, expect } from 'vitest';
import {
  fillStyleRefs, imageHashOfNode, collectStyleImages, NODES_CHUNK,
} from '../../../src/fetch/styleImages.js';

/** A `GET /v1/files/:key/styles` response, trimmed to the fields that are read. */
function stylesPayload(): unknown {
  return {
    meta: {
      styles: [
        { key: 'imgkey1', file_key: 'f', node_id: '1568:2977', style_type: 'FILL', name: 'Images / Wanaka' },
        { key: 'colorkey', file_key: 'f', node_id: '1568:2947', style_type: 'FILL', name: 'Color/Primary' },
        { key: 'textkey', file_key: 'f', node_id: '1:5', style_type: 'TEXT', name: 'Body/Medium' },
        { key: 'gridkey', file_key: 'f', node_id: '1:6', style_type: 'GRID', name: 'Grid/Base' },
        { key: 'imgkey2', file_key: 'f', node_id: '4612:52562', style_type: 'FILL', name: 'Images / Wheatfield' },
      ],
    },
  };
}

/** Stands in for Get File Nodes, answering from a fixed id → fills map. */
function nodesFrom(fills: Record<string, unknown[]>) {
  const seen: string[][] = [];
  const getNodes = async (ids: string[]) => {
    seen.push(ids);
    return {
      nodes: Object.fromEntries(ids.map(id => [id, { document: { id, fills: fills[id] ?? [] } }])),
    };
  };
  return { getNodes, seen };
}

const IMAGE_PAINT = { blendMode: 'NORMAL', type: 'IMAGE', scaleMode: 'FILL', imageRef: 'b60ac7bc' };
const SOLID_PAINT = { blendMode: 'NORMAL', type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } };

describe('fillStyleRefs', () => {
  it('keeps only FILL styles, which are the only ones that can paint an image', () => {
    expect(fillStyleRefs(stylesPayload()).map(r => r.name)).toEqual([
      'Images / Wanaka', 'Color/Primary', 'Images / Wheatfield',
    ]);
  });

  it('carries the published key, which is the join to styles.yaml', () => {
    expect(fillStyleRefs(stylesPayload())[0]).toEqual({
      name: 'Images / Wanaka', key: 'imgkey1', node_id: '1568:2977',
    });
  });

  it('reads an unpublished file\'s empty styles list as no styles, not a failure', () => {
    expect(fillStyleRefs({ meta: { styles: [] } })).toEqual([]);
  });

  it('survives a payload with no styles list at all', () => {
    expect(fillStyleRefs({})).toEqual([]);
    expect(fillStyleRefs(null)).toEqual([]);
  });
});

describe('imageHashOfNode', () => {
  it('reads the REST API\'s imageRef', () => {
    expect(imageHashOfNode({ fills: [IMAGE_PAINT] })).toBe('b60ac7bc');
  });

  it('reads the Plugin API\'s imageHash, the same identity under another name', () => {
    expect(imageHashOfNode({ fills: [{ type: 'IMAGE', imageHash: 'plugin-side' }] })).toBe('plugin-side');
  });

  it('ignores a hidden image paint', () => {
    expect(imageHashOfNode({ fills: [{ ...IMAGE_PAINT, visible: false }] })).toBeUndefined();
  });

  it('returns nothing for a colour style', () => {
    expect(imageHashOfNode({ fills: [SOLID_PAINT] })).toBeUndefined();
  });

  it('takes the first visible image paint when a style stacks several', () => {
    expect(imageHashOfNode({ fills: [SOLID_PAINT, IMAGE_PAINT, { type: 'IMAGE', imageRef: 'second' }] }))
      .toBe('b60ac7bc');
  });

  it('survives a node with no fills, or fills Figma reported as mixed', () => {
    expect(imageHashOfNode({})).toBeUndefined();
    expect(imageHashOfNode({ fills: 'mixed' })).toBeUndefined();
    expect(imageHashOfNode(null)).toBeUndefined();
  });
});

describe('collectStyleImages', () => {
  it('returns only the fill styles whose paint is an image', async () => {
    const { getNodes } = nodesFrom({
      '1568:2977': [IMAGE_PAINT],
      '1568:2947': [SOLID_PAINT],
      '4612:52562': [{ type: 'IMAGE', imageRef: '14dacdfc' }],
    });
    const found = await collectStyleImages(fillStyleRefs(stylesPayload()), getNodes);
    expect(found).toEqual([
      { name: 'Images / Wanaka', key: 'imgkey1', node_id: '1568:2977', imageHash: 'b60ac7bc' },
      { name: 'Images / Wheatfield', key: 'imgkey2', node_id: '4612:52562', imageHash: '14dacdfc' },
    ]);
  });

  it('sorts by style name, so an unchanged library writes a byte-identical payload', async () => {
    const refs = [
      { name: 'Images / Zebra', key: 'z', node_id: 'z' },
      { name: 'Images / Apple', key: 'a', node_id: 'a' },
    ];
    const { getNodes } = nodesFrom({ z: [IMAGE_PAINT], a: [IMAGE_PAINT] });
    expect((await collectStyleImages(refs, getNodes)).map(s => s.name))
      .toEqual(['Images / Apple', 'Images / Zebra']);
  });

  it('batches node requests rather than asking for one id at a time', async () => {
    const refs = Array.from({ length: NODES_CHUNK + 3 }, (_, i) => ({
      name: `Images / ${String(i).padStart(3, '0')}`, key: `k${i}`, node_id: `n${i}`,
    }));
    const { getNodes, seen } = nodesFrom(
      Object.fromEntries(refs.map(r => [r.node_id, [IMAGE_PAINT]])),
    );
    const found = await collectStyleImages(refs, getNodes);
    expect(found).toHaveLength(NODES_CHUNK + 3);
    expect(seen.map(ids => ids.length)).toEqual([NODES_CHUNK, 3]);
  });

  it('makes no request when the library publishes no fill styles', async () => {
    const { getNodes, seen } = nodesFrom({});
    expect(await collectStyleImages([], getNodes)).toEqual([]);
    expect(seen).toEqual([]);
  });

  it('throws on an API-level error rather than reporting zero images', async () => {
    const getNodes = async () => ({ err: 'Not found' });
    await expect(collectStyleImages(fillStyleRefs(stylesPayload()), getNodes))
      .rejects.toThrow('Not found');
  });

  it('treats a node the API omitted as a style with no image', async () => {
    const getNodes = async () => ({ nodes: { '1568:2977': null } });
    expect(await collectStyleImages([{ name: 'Gone', key: 'k', node_id: '1568:2977' }], getNodes))
      .toEqual([]);
  });
});
