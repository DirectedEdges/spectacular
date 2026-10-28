import { describe, it, expect } from 'vitest';
import { deriveDefaultInclusion, mergeRows } from '../../../src/commands/scan.js';
import type { ComponentInfo } from '../../../src/scan/discovery.js';
import type { ManifestRowV2 } from '../../../src/utilities/manifestParserV2.js';

function ci(id: string, name: string, type: 'COMPONENT' | 'COMPONENT_SET', devStatus: 'READY_FOR_DEV' | 'NONE'): ComponentInfo {
  return { id, name, type, devStatus };
}

function row(id: string, name: string, included: boolean, devStatus: 'READY_FOR_DEV' | 'NONE', type: 'COMPONENT' | 'COMPONENT_SET' = 'COMPONENT_SET'): ManifestRowV2 {
  return { id, name, type, included, devStatus };
}

describe('deriveDefaultInclusion', () => {
  it('READY_FOR_DEV checks only the components marked ready', () => {
    const components = [
      ci('1:1', 'A', 'COMPONENT_SET', 'READY_FOR_DEV'),
      ci('1:2', 'B', 'COMPONENT_SET', 'NONE'),
      ci('1:3', 'C', 'COMPONENT', 'NONE')
    ];
    const result = deriveDefaultInclusion(components, 'READY_FOR_DEV');
    expect(result.get('1:1')).toBe(true);
    expect(result.get('1:2')).toBe(false);
    expect(result.get('1:3')).toBe(false);
  });

  it('READY_FOR_DEV checks everything when the library marks nothing', () => {
    const components = [
      ci('1:1', 'A', 'COMPONENT_SET', 'NONE'),
      ci('1:2', 'B', 'COMPONENT', 'NONE')
    ];
    const result = deriveDefaultInclusion(components, 'READY_FOR_DEV');
    expect(result.get('1:1')).toBe(true);
    expect(result.get('1:2')).toBe(true);
  });

  it('ALL checks every row regardless of devStatus', () => {
    const components = [
      ci('1:1', 'A', 'COMPONENT_SET', 'READY_FOR_DEV'),
      ci('1:2', 'B', 'COMPONENT_SET', 'NONE')
    ];
    const result = deriveDefaultInclusion(components, 'ALL');
    expect(result.get('1:1')).toBe(true);
    expect(result.get('1:2')).toBe(true);
  });
});

describe('mergeRows', () => {
  it('preserves prior checkbox when devStatus unchanged', () => {
    const current = [ci('1:1', 'A', 'COMPONENT_SET', 'NONE')];
    const prior = [row('1:1', 'A', true, 'NONE')];
    const defaults = new Map([['1:1', false]]);
    const { rows, stats } = mergeRows(current, prior, defaults, false);
    expect(rows[0].included).toBe(true);
    expect(stats.preserved).toBe(1);
    expect(stats.flippedByFigma).toBe(0);
  });

  it('flips checkbox to match Figma when devStatus changes (NONE → READY_FOR_DEV)', () => {
    const current = [ci('1:1', 'A', 'COMPONENT_SET', 'READY_FOR_DEV')];
    const prior = [row('1:1', 'A', false, 'NONE')];
    const defaults = new Map([['1:1', true]]);
    const { rows, stats } = mergeRows(current, prior, defaults, false);
    expect(rows[0].included).toBe(true);
    expect(rows[0].devStatus).toBe('READY_FOR_DEV');
    expect(stats.flippedByFigma).toBe(1);
  });

  it('flips checkbox off when devStatus regresses (READY_FOR_DEV → NONE)', () => {
    const current = [ci('1:1', 'A', 'COMPONENT_SET', 'NONE')];
    const prior = [row('1:1', 'A', true, 'READY_FOR_DEV')];
    const defaults = new Map([['1:1', false]]);
    const { rows, stats } = mergeRows(current, prior, defaults, false);
    expect(rows[0].included).toBe(false);
    expect(stats.flippedByFigma).toBe(1);
  });

  it('--keep-checks preserves prior checkbox even when devStatus changes', () => {
    const current = [ci('1:1', 'A', 'COMPONENT_SET', 'READY_FOR_DEV')];
    const prior = [row('1:1', 'A', false, 'NONE')];
    const defaults = new Map([['1:1', true]]);
    const { rows, stats } = mergeRows(current, prior, defaults, true);
    expect(rows[0].included).toBe(false);
    expect(rows[0].devStatus).toBe('READY_FOR_DEV');
    expect(stats.preserved).toBe(1);
    expect(stats.flippedByFigma).toBe(0);
  });

  it('uses defaults map for newly-added components', () => {
    const current = [
      ci('1:1', 'A', 'COMPONENT_SET', 'NONE'),
      ci('1:2', 'B', 'COMPONENT_SET', 'READY_FOR_DEV')
    ];
    const prior = [row('1:1', 'A', true, 'NONE')];
    const defaults = new Map([['1:1', false], ['1:2', true]]);
    const { rows, stats } = mergeRows(current, prior, defaults, false);
    const newRow = rows.find(r => r.id === '1:2')!;
    expect(newRow.included).toBe(true);
    expect(stats.added).toBe(1);
  });

  it('counts removed components from prior', () => {
    const current = [ci('1:1', 'A', 'COMPONENT_SET', 'NONE')];
    const prior = [
      row('1:1', 'A', true, 'NONE'),
      row('9:9', 'Gone', true, 'NONE')
    ];
    const defaults = new Map([['1:1', false]]);
    const { rows, stats } = mergeRows(current, prior, defaults, false);
    expect(rows).toHaveLength(1);
    expect(stats.removed).toBe(1);
  });
});
