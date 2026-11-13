import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { CssvarsTransformer } from '../../../src/transforms/Cssvars.js';

// ---------------------------------------------------------------------------
// Fixtures — a minimal workspace data directory
// ---------------------------------------------------------------------------

const variablesJson = {
  meta: {
    variableCollections: {
      'c:local': {
        name: 'Theme',
        modes: [
          { modeId: 'm:light', name: 'Light' },
          { modeId: 'm:dark', name: 'Dark' },
        ],
        defaultModeId: 'm:light',
        variableIds: ['v:surface', 'v:radius'],
        remote: false,
      },
      'c:remote': {
        name: 'DS Color',
        modes: [{ modeId: 'm:one', name: 'Mode1' }],
        defaultModeId: 'm:one',
        variableIds: ['v:remote-shadow-x'],
        remote: true,
      },
    },
    variables: {
      'v:surface': {
        name: 'Surface/Primary',
        variableCollectionId: 'c:local',
        resolvedType: 'COLOR',
        valuesByMode: {
          'm:light': { r: 1, g: 1, b: 1, a: 1 },
          'm:dark': { r: 0, g: 0, b: 0, a: 1 },
        },
        remote: false,
      },
      'v:radius': {
        name: 'Radius/Medium',
        variableCollectionId: 'c:local',
        resolvedType: 'FLOAT',
        valuesByMode: { 'm:light': 8, 'm:dark': 8 },
        remote: false,
      },
      'v:remote-shadow-x': {
        name: 'Shadow/Elevated/x',
        variableCollectionId: 'c:remote',
        resolvedType: 'FLOAT',
        valuesByMode: { 'm:one': 2 },
        remote: true,
      },
      'v:alias': {
        name: 'Surface/Alias',
        variableCollectionId: 'c:local',
        resolvedType: 'COLOR',
        valuesByMode: { 'm:light': { type: 'VARIABLE_ALIAS', id: 'v:surface' } },
        remote: false,
      },
    },
  },
};

const fileJson = {
  styles: {
    's:effect': { name: 'Elevation/Raised', styleType: 'EFFECT' },
    's:fill': { name: 'Brand/Gradient', styleType: 'FILL' },
    's:text': { name: 'Body/Small', styleType: 'TEXT' },
    's:unused': { name: 'Elevation/Unused', styleType: 'EFFECT' },
  },
  document: {
    children: [
      {
        styles: { effect: 's:effect' },
        effects: [
          { type: 'DROP_SHADOW', visible: true, color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 4, spread: 0 },
          {
            type: 'DROP_SHADOW', visible: true, color: { r: 0, g: 0, b: 0, a: 0.1 }, offset: { x: 2, y: 3 }, radius: 4, spread: 0,
            boundVariables: { offsetX: { type: 'VARIABLE_ALIAS', id: 'v:remote-shadow-x' } },
          },
          { type: 'BACKGROUND_BLUR', visible: true, radius: 6 },
        ],
        children: [
          {
            styles: { fill: 's:fill' },
            fills: [
              { type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } },
              {
                type: 'GRADIENT_LINEAR',
                visible: true,
                gradientHandlePositions: [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }, { x: 0, y: 0 }],
                gradientStops: [
                  { position: 0, color: { r: 1, g: 1, b: 1, a: 1 } },
                  { position: 1, color: { r: 0, g: 0, b: 0, a: 1 } },
                ],
              },
            ],
            children: [
              {
                styles: { text: 's:text' },
                style: { fontFamily: 'Inter', fontWeight: 500, fontSize: 12, lineHeightPx: 16 },
              },
            ],
          },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------------------

describe('CssvarsTransformer', () => {
  let tmpDir: string;
  let dataDir: string;
  let outDir: string;
  const transformer = () => new CssvarsTransformer();

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cssvars-test-'));
    dataDir = path.join(tmpDir, 'data');
    outDir = path.join(tmpDir, 'specs');
    await fs.ensureDir(dataDir);
    await fs.ensureDir(outDir);
    await fs.writeJSON(path.join(dataDir, 'lib.variables.json'), variablesJson);
    await fs.writeJSON(path.join(dataDir, 'lib.file.json'), fileJson);
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  async function runFinalize(t = transformer()) {
    await t.run({}, { specDir: path.join(outDir, 'comp'), outputDir: path.join(outDir, 'comp'), workspaceDir: outDir, specsRoot: outDir, kind: 'component' as const, componentKey: 'comp', tokensFormat: 'TOKEN', outputFormat: 'JSON' as const, dataDirectory: dataDir });
    await t.finalize!(outDir);
    return fs.readFile(path.join(outDir, '..', 'assets', 'cssvars', 'cssvars.css'), 'utf-8');
  }

  it('has name "cssvars"', () => {
    expect(transformer().name).toBe('cssvars');
  });

  it('emits variable definitions with collection-prefixed kebab names', async () => {
    const out = await runFinalize();
    expect(out).toContain('--theme-surface-primary: #ffffff;');
    expect(out).toContain('--theme-radius-medium: 8px;');
  });

  it('includes subscribed (remote) collection variables', async () => {
    const out = await runFinalize();
    expect(out).toContain('--ds-color-shadow-elevated-x: 2px;');
  });

  it('resolves variable aliases to var() references', async () => {
    const out = await runFinalize();
    expect(out).toContain('--theme-surface-alias: var(--theme-surface-primary);');
  });

  it('emits mode override blocks and a modes manifest for local multi-mode collections', async () => {
    const out = await runFinalize();
    expect(out).toContain('[data-theme="dark"] {');
    // Not anchored to `:root`. An element selects a theme for its own subtree
    // (ADR-123), and a `:root`-anchored block can only ever match the document —
    // so a card selecting a dark theme would carry the attribute and render
    // unchanged, with every test still passing.
    expect(out).not.toContain(':root[data-theme=');
    expect(out).toContain('--theme-surface-primary: #000000;');
    const manifest = await fs.readJSON(path.join(outDir, '..', 'assets', 'cssvars', 'modes.json'));
    expect(manifest['Theme']).toMatchObject({ attr: 'data-theme', modes: ['Light', 'Dark'], default: 'Light' });
  });

  it('emits effect styles as role vars, resolving bound variables to var()', async () => {
    const out = await runFinalize();
    expect(out).toContain(
      '--elevation-raised-shadows: 0 4px 4px 0 rgba(0, 0, 0, 0.25), var(--ds-color-shadow-elevated-x) 3px 4px 0 rgba(0, 0, 0, 0.1);'
    );
    expect(out).toContain('--elevation-raised-background-blur: blur(6px);');
    expect(out).not.toContain('--elevation-raised:');
  });

  it('emits fill styles from the topmost visible paint as gradient functions', async () => {
    const out = await runFinalize();
    expect(out).toContain('--brand-gradient: linear-gradient(180deg, #ffffff 0%, #000000 100%);');
  });

  it('emits text styles as font shorthands', async () => {
    const out = await runFinalize();
    expect(out).toContain('--body-small: 500 12px/16px "Inter", sans-serif;');
  });

  it('skips styles with no recoverable definition and reports the count', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = await runFinalize();
    expect(out).not.toContain('--elevation-unused');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('1 styles without usage');
    logSpy.mockRestore();
  });

  it('warns and skips when no data directory exists', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = transformer();
    await t.run({}, { specDir: path.join(outDir, 'comp'), outputDir: path.join(outDir, 'comp'), workspaceDir: outDir, specsRoot: outDir, kind: 'component' as const, componentKey: 'comp', tokensFormat: 'TOKEN', outputFormat: 'JSON' as const, dataDirectory: path.join(tmpDir, 'missing') });
    await t.finalize!(outDir);
    expect(fs.existsSync(path.join(outDir, 'cssvars'))).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no data directory'));
    warnSpy.mockRestore();
  });

  it('degrades gracefully with file data but no variables data', async () => {
    await fs.remove(path.join(dataDir, 'lib.variables.json'));
    const out = await runFinalize();
    expect(out).toContain('--brand-gradient:');
    expect(out).toContain('--body-small:');
    // Bound variable can't resolve without variables data — raw value wins.
    expect(out).toContain('--elevation-raised-shadows: 0 4px 4px 0 rgba(0, 0, 0, 0.25), 2px 3px 4px 0 rgba(0, 0, 0, 0.1);');
  });
});
