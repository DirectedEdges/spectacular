/**
 * MigrateCommand unit tests
 *
 * Covers `specs migrate config` (v1 → v2, ADR-071) and the underlying
 * `migrateConfigV1` mapping: every member of the pre-split
 * `specs.config.yaml` shape lands in the right split file — conventions,
 * or settings. These mappings used to be exercised through the
 * loader's in-memory migration; the loader now refuses legacy files
 * (ConfigLoader.test.ts) and the mapping lives here.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import { Migrate } from '../../../src/commands/migrate.js';
import { migrateConfigV1 } from '../../../src/config/migrations/configV1.js';
import { ConfigLoader } from '../../../src/config/ConfigLoader.js';

/**
 * v1 defaulted the three layout flags to false and v2 defaults them to true, so
 * every migration writes them out explicitly to preserve what the workspace
 * currently emits. They appear in every settings result, whatever else the
 * source configured.
 */
const PRESERVED_LAYOUT = { splitComponents: false, splitConcerns: false, useSubfolders: false };

describe('migrateConfigV1 (config v1 → v2 mapping)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns nothing for an empty source (no section configured, no file written)', () => {
    const result = migrateConfigV1({});
    expect(result.conventions).toBeUndefined();
    // Not "nothing": the layout flags must be preserved even from an empty source.
    expect(result.settings).toEqual({ spec: { ...PRESERVED_LAYOUT } });
  });

  it('maps dataDirectory to settings.data.directory', () => {
    const result = migrateConfigV1({ dataDirectory: './data-in' });
    expect(result.settings).toEqual({ data: { directory: './data-in' }, spec: { ...PRESERVED_LAYOUT } });
  });

  it('maps outputDirectory to settings.spec.directory', () => {
    const result = migrateConfigV1({ outputDirectory: './specs-out' });
    expect(result.settings).toEqual({ spec: { directory: './specs-out', ...PRESERVED_LAYOUT } });
  });

  it('maps author to settings.author', () => {
    const result = migrateConfigV1({ author: 'Test Author' });
    expect(result.settings).toEqual({ author: 'Test Author', spec: { ...PRESERVED_LAYOUT } });
  });

  it('supports deprecated sourceDirectory as dataDirectory (with warning)', () => {
    const warn = vi.mocked(console.warn);
    const result = migrateConfigV1({ sourceDirectory: './old-data' });
    expect(result.settings).toEqual({ data: { directory: './old-data' }, spec: { ...PRESERVED_LAYOUT } });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("'sourceDirectory' is deprecated"));
  });

  it('prefers dataDirectory over sourceDirectory when both are present', () => {
    const warn = vi.mocked(console.warn);
    const result = migrateConfigV1({ dataDirectory: './new', sourceDirectory: './old' });
    expect(result.settings).toEqual({ data: { directory: './new' }, spec: { ...PRESERVED_LAYOUT } });
    expect(warn).not.toHaveBeenCalled();
  });

  it("maps sources, renaming each source's data array to fetch", () => {
    const result = migrateConfigV1({
      sources: {
        library: { key: 'ABC123', data: ['file', 'variables', 'styles'] },
        icons: { key: 'DEF456' },
      },
    });
    expect(result.settings).toEqual({
      data: {
        sources: {
          library: { key: 'ABC123', fetch: ['file', 'variables', 'styles'] },
          icons: { key: 'DEF456' },
        },
      },
      spec: { ...PRESERVED_LAYOUT },
    });
  });

  it('maps output split flags into settings.spec', () => {
    const result = migrateConfigV1({
      output: { splitComponents: true, splitConcerns: true, useSubfolders: true },
    });
    expect(result.settings).toEqual({
      spec: { splitComponents: true, splitConcerns: true, useSubfolders: true },
    });
  });

  it('maps config.format.output to settings.spec.format and passes keys/layout/tokens/color through', () => {
    const result = migrateConfigV1({
      config: {
        format: { output: 'YAML', keys: 'SNAKE', layout: 'BOTH', tokens: 'TOKEN_NAME', color: 'HEXA' },
      },
    });
    expect(result.settings).toEqual({
      spec: { format: 'YAML', keys: 'SNAKE', layout: 'BOTH', tokens: 'TOKEN_NAME', color: 'HEXA', ...PRESERVED_LAYOUT },
    });
  });

  it('maps config.format.figmaKeys to conventions.figma.naming', () => {
    const result = migrateConfigV1({ config: { format: { figmaKeys: 'SENTENCE' } } });
    expect(result.conventions).toEqual({ naming: 'SENTENCE' });
  });

  it('maps processing.glyphNamePattern to conventions.figma.glyphs.match', () => {
    const result = migrateConfigV1({ config: { processing: { glyphNamePattern: 'DS Icon Glyph /' } } });
    expect(result.conventions).toEqual({ glyphs: { match: 'DS Icon Glyph /' } });
  });

  it('maps processing.codeOnlyPropsPattern to conventions.figma.codeOnlyProps.match', () => {
    const result = migrateConfigV1({ config: { processing: { codeOnlyPropsPattern: '^_' } } });
    expect(result.conventions).toEqual({ codeOnlyProps: { match: '^_' } });
  });

  it('maps processing.images.imageComponent to conventions.figma.images.match', () => {
    const result = migrateConfigV1({
      config: {
        processing: {
          images: { imageComponent: 'DS Image', backgroundImage: true, sourceProps: ['imageSource'] },
        },
      },
    });
    expect(result.conventions).toEqual({
      images: { match: 'DS Image', backgroundImage: true, sourceProps: ['imageSource'] },
    });
  });

  it('maps processing subcomponents/instanceExamples/slotConstraints/inferNumberProps to conventions.figma', () => {
    const subcomponents = { match: ['{C} / {S}'] };
    const instanceExamples = { scope: 'FILE', match: ['{C} / Examples / {S}'] };
    const result = migrateConfigV1({
      config: {
        processing: {
          subcomponents,
          instanceExamples,
          slotConstraints: true,
          inferNumberProps: true,
        },
      },
    });
    expect(result.conventions).toEqual({
      subcomponents, instanceExamples, slotConstraints: true, inferNumberProps: true,
    });
  });

  it('maps processing.states to the specs conventions file, not the figma entry (ADR-073 Decision 4)', () => {
    const states = { hover: { prop: 'state', value: 'hover' } };
    const result = migrateConfigV1({ config: { processing: { states } } });
    expect(result.specsConventions).toEqual({ states });
    expect(result.conventions).toBeUndefined();
  });

  it('maps processing variantDepth/details/collapsePrimitiveWrapper to settings.spec', () => {
    const result = migrateConfigV1({
      config: { processing: { variantDepth: 2, details: 'FULL', collapsePrimitiveWrapper: true } },
    });
    expect(result.settings).toEqual({
      spec: { variantDepth: 2, details: 'FULL', collapsePrimitiveWrapper: true, ...PRESERVED_LAYOUT },
    });
  });

  it('maps the config.include allowlist to settings.spec', () => {
    const result = migrateConfigV1({
      config: {
        include: {
          invalidVariants: false,
          invalidCombinations: true,
          emptyVariants: false,
          defaultSlotContent: true,
        },
      },
    });
    expect(result.settings).toEqual({
      spec: {
        invalidVariants: false,
        invalidCombinations: true,
        emptyVariants: false,
        defaultSlotContent: true,
        ...PRESERVED_LAYOUT,
      },
    });
  });

  it('strips unknown include keys (EOLed allowlist: imageData, instanceExamples)', () => {
    const result = migrateConfigV1({
      config: { include: { defaultSlotContent: true, imageData: true, instanceExamples: true } },
    });
    expect(result.settings).toEqual({ spec: { defaultSlotContent: true, ...PRESERVED_LAYOUT } });
    expect(result.conventions).toBeUndefined();
  });

  it('drops config.transformers rather than carrying it forward', () => {
    // A transformer pipeline stopped being a thing to configure once each target
    // emitted everything it needs. `specs react` and `specs webcomponents` replace it.
    const result = migrateConfigV1({
      config: { transformers: [{ name: 'contract' }, { name: 'css', rules: ['layout'] }] },
    });
    expect(result).not.toHaveProperty('pipeline');
    expect(JSON.stringify(result)).not.toContain('transformers');
  });
});

describe('MigrateCommand (specs migrate)', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(process.cwd(), 'tests', 'tmp', `test-migrate-${Date.now()}`);
    fs.ensureDirSync(testDir);

    vi.spyOn(process, 'cwd').mockReturnValue(testDir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
      throw new Error(`process.exit:${code}`);
    });

    // Commander accumulates option state across parses; reset between tests.
    Migrate.setOptionValue('from', undefined);
    Migrate.setOptionValue('dryRun', undefined);
    Migrate.setOptionValue('list', undefined);
    Migrate.setOptionValue('source', undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(testDir)) {
      fs.removeSync(testDir);
    }
  });

  /** Run `specs migrate <args>` against the mocked cwd. */
  async function runMigrate(...args: string[]) {
    await Migrate.parseAsync(['node', 'specs', ...args]);
  }

  /** All console.log output, joined. */
  function logged(): string {
    return vi.mocked(console.log).mock.calls.map(args => args.join(' ')).join('\n');
  }

  const LEGACY_FULL = `
dataDirectory: ./data-in
outputDirectory: ./specs-out
author: Test Author
config:
  format:
    figmaKeys: SENTENCE
  processing:
    variantDepth: 2
  transformers:
    - name: contract
`;

  it('writes the three files and renames the source to specs.config.yaml.migrated', async () => {
    fs.writeFileSync(path.join(testDir, 'specs.config.yaml'), LEGACY_FULL);

    await runMigrate('config');

    const conventions = yaml.parse(fs.readFileSync(path.join(testDir, 'config', 'conventions', 'figma.yaml'), 'utf-8'));
    const settings = yaml.parse(fs.readFileSync(path.join(testDir, 'config', 'settings.yaml'), 'utf-8'));

    // The file IS the platform, so its body sits at the root (ADR-078).
    expect(conventions).toEqual({ naming: 'SENTENCE' });
    expect(settings).toEqual({
      author: 'Test Author',
      data: { directory: './data-in' },
      spec: { directory: './specs-out', variantDepth: 2, ...PRESERVED_LAYOUT },
    });
    expect(fs.existsSync(path.join(testDir, 'config', 'pipeline.yaml'))).toBe(false);

    // Discovery must stop finding the source: renamed, not left in place.
    expect(fs.existsSync(path.join(testDir, 'specs.config.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(testDir, 'specs.config.yaml.migrated'))).toBe(true);
    expect(fs.readFileSync(path.join(testDir, 'specs.config.yaml.migrated'), 'utf-8')).toBe(LEGACY_FULL);
  });

  it('renames a JSON source to specs.config.json.migrated', async () => {
    fs.writeFileSync(
      path.join(testDir, 'specs.config.json'),
      JSON.stringify({ author: 'Test Author' })
    );

    await runMigrate('config');

    expect(fs.existsSync(path.join(testDir, 'specs.config.json'))).toBe(false);
    expect(fs.existsSync(path.join(testDir, 'specs.config.json.migrated'))).toBe(true);
    const settings = yaml.parse(fs.readFileSync(path.join(testDir, 'config', 'settings.yaml'), 'utf-8'));
    expect(settings).toEqual({ author: 'Test Author', spec: { ...PRESERVED_LAYOUT } });
  });

  it('--dry-run writes nothing and renames nothing', async () => {
    fs.writeFileSync(path.join(testDir, 'specs.config.yaml'), LEGACY_FULL);

    await runMigrate('config', '--dry-run');

    expect(fs.existsSync(path.join(testDir, 'config'))).toBe(false);
    expect(fs.existsSync(path.join(testDir, 'specs.config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'specs.config.yaml.migrated'))).toBe(false);
    expect(logged()).toContain('Would write: config/conventions/figma.yaml');
    expect(logged()).toContain('Would write: config/settings.yaml');
    expect(logged()).toContain('Would rename: specs.config.yaml → specs.config.yaml.migrated');
  });

  it.each(['conventions.yaml', 'settings.yaml'])(
    'refuses (and writes nothing) when config/%s already exists',
    async existing => {
      fs.writeFileSync(path.join(testDir, 'specs.config.yaml'), LEGACY_FULL);
      fs.ensureDirSync(path.join(testDir, 'config'));
      fs.writeFileSync(path.join(testDir, 'config', existing), '# authored\n');

      await expect(runMigrate('config')).rejects.toThrow('process.exit:2');

      // Nothing written, nothing renamed
      expect(fs.readdirSync(path.join(testDir, 'config'))).toEqual([existing]);
      expect(fs.readFileSync(path.join(testDir, 'config', existing), 'utf-8')).toBe('# authored\n');
      expect(fs.existsSync(path.join(testDir, 'specs.config.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'specs.config.yaml.migrated'))).toBe(false);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('already contains'));
    }
  );

  it('writes no file for a section absent from the source', async () => {
    fs.writeFileSync(path.join(testDir, 'specs.config.yaml'), 'author: Test Author\n');

    await runMigrate('config');

    expect(fs.existsSync(path.join(testDir, 'config', 'settings.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'config', 'conventions', 'figma.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(testDir, 'config', 'pipeline.yaml'))).toBe(false);
  });

  it('reports nothing to migrate when no legacy file exists', async () => {
    await runMigrate('config');
    expect(logged()).toContain('Nothing to migrate');
    expect(fs.existsSync(path.join(testDir, 'config'))).toBe(false);
  });

  it('exits for an unknown subject', async () => {
    await expect(runMigrate('nonsense')).rejects.toThrow('process.exit:2');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("no migrations registered for 'nonsense'")
    );
  });

  it('exits for an unregistered source version', async () => {
    fs.writeFileSync(path.join(testDir, 'specs.config.yaml'), LEGACY_FULL);
    await expect(runMigrate('config', '--from', 'v9')).rejects.toThrow('process.exit:2');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("no 'config' migration from 'v9'")
    );
  });

  it('round-trip: migrated output loads to the same resolved config the legacy file meant', async () => {
    fs.writeFileSync(path.join(testDir, 'specs.config.yaml'), `
dataDirectory: ./data-in
outputDirectory: ./specs-out
author: Test Author
sources:
  library:
    key: ABC123
    data: [file, variables, styles]
output:
  splitComponents: true
  useSubfolders: true
config:
  format:
    output: YAML
    keys: SNAKE
    figmaKeys: SENTENCE
  processing:
    variantDepth: 2
    details: FULL
    glyphNamePattern: 'DS Icon Glyph /'
    codeOnlyPropsPattern: '^_'
    slotConstraints: true
    subcomponents:
      match:
        - "{C} / {S}"
    instanceExamples:
      scope: FILE
      match:
        - "{C} / Examples / {S}"
    images:
      imageComponent: DS Image
      backgroundImage: true
      sourceProps: [imageSource]
  include:
    invalidVariants: false
    defaultSlotContent: true
  transformers:
    - name: contract
`);

    await runMigrate('config');

    const config = new ConfigLoader().load();

    // settings — directories resolve against the workspace root, exactly as
    // they did when the legacy file sat there
    expect(config.settings.author).toBe('Test Author');
    expect(config.settings.data?.directory).toBe(path.resolve(testDir, 'data-in'));
    expect(config.settings.spec.directory).toBe(path.resolve(testDir, 'specs-out'));
    expect(config.settings.data?.sources).toEqual({
      library: { key: 'ABC123', fetch: ['file', 'variables', 'styles'] },
    });
    expect(config.settings.spec.splitComponents).toBe(true);
    expect(config.settings.spec.useSubfolders).toBe(true);
    expect(config.settings.spec.format).toBe('YAML');
    expect(config.settings.spec.keys).toBe('SNAKE');
    expect(config.settings.spec.variantDepth).toBe(2);
    expect(config.settings.spec.details).toBe('FULL');
    expect(config.settings.spec.invalidVariants).toBe(false);
    expect(config.settings.spec.defaultSlotContent).toBe(true);
    expect(config.configDir).toBe(testDir);

    // conventions
    expect(config.conventions.platforms!.figma.naming).toBe('SENTENCE');
    expect(config.conventions.platforms!.figma.glyphs).toEqual({ match: 'DS Icon Glyph /' });
    expect(config.conventions.platforms!.figma.codeOnlyProps).toEqual({ match: '^_' });
    expect(config.conventions.platforms!.figma.slotConstraints).toBe(true);
    expect(config.conventions.platforms!.figma.subcomponents).toEqual({ scope: 'NESTED', match: ['{C} / {S}'] });
    expect(config.conventions.platforms!.figma.instanceExamples).toEqual({
      scope: 'FILE',
      match: ['{C} / Examples / {S}'],
    });
    expect(config.conventions.platforms!.figma.images).toEqual({
      backgroundImage: true,
      match: 'DS Image',
      sourceProps: ['imageSource'],
    });

    // pipeline
  });

  describe('config pipeline → retired (ADR-071 amendment)', () => {
    it('renames a leftover config/pipeline.yaml out of discovery', async () => {
      const pipelineFile = path.join(testDir, 'config', 'pipeline.yaml');
      fs.ensureDirSync(path.dirname(pipelineFile));
      fs.writeFileSync(pipelineFile, 'transformers:\n  - name: react\n');

      await runMigrate('config');

      expect(fs.existsSync(pipelineFile)).toBe(false);
      expect(fs.existsSync(`${pipelineFile}.migrated`)).toBe(true);
      expect(logged()).toContain('pipeline.yaml');
    });

    it('--dry-run leaves the file in place and reports the rename', async () => {
      const pipelineFile = path.join(testDir, 'config', 'pipeline.yaml');
      fs.ensureDirSync(path.dirname(pipelineFile));
      fs.writeFileSync(pipelineFile, 'transformers: []\n');

      await runMigrate('config', '--dry-run');

      expect(fs.existsSync(pipelineFile)).toBe(true);
      expect(logged()).toContain('Would rename');
    });
  });
});

describe('MigrateCommand — --source (a file discovery would not find)', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(process.cwd(), 'tests', 'tmp', `test-migrate-source-${Date.now()}`);
    fs.ensureDirSync(testDir);
    vi.spyOn(process, 'cwd').mockReturnValue(testDir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
      throw new Error(`process.exit:${code}`);
    });
    Migrate.setOptionValue('from', undefined);
    Migrate.setOptionValue('dryRun', undefined);
    Migrate.setOptionValue('list', undefined);
    Migrate.setOptionValue('source', undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(testDir)) fs.removeSync(testDir);
  });

  it('converts a custom-named file and renames it', async () => {
    fs.writeFileSync(
      path.join(testDir, 'custom-config.yaml'),
      'dataDirectory: ./data\nconfig:\n  format:\n    keys: CAMEL\n'
    );

    await Migrate.parseAsync(['node', 'specs', 'config', '--source', 'custom-config.yaml']);

    expect(fs.existsSync(path.join(testDir, 'config', 'settings.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'custom-config.yaml.migrated'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'custom-config.yaml'))).toBe(false);
  });

  it('reports nothing to migrate when the named file does not exist', async () => {
    await Migrate.parseAsync(['node', 'specs', 'config', '--source', 'absent.yaml']);

    expect(fs.existsSync(path.join(testDir, 'config'))).toBe(false);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('absent.yaml does not exist'));
  });
});

