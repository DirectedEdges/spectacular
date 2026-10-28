/**
 * ConfigLoader unit tests
 *
 * Covers the split `config/` directory (ADR-071): conventions.yaml,
 * and settings.yaml, each optional and independently
 * defaulted. A pre-split `specs.config.yaml`/`.json` is refused with a
 * pointer to `specs migrate config` — the legacy mapping itself is
 * exercised in tests/unit/commands/MigrateCommand.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { ConfigLoader } from '../../../src/config/ConfigLoader.js';
import { DEFAULT_SETTINGS } from '@directededges/specs-schema';

describe('ConfigLoader', () => {
  let configLoader: ConfigLoader;
  let testDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    configLoader = new ConfigLoader();
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'tests', 'tmp', `test-${Date.now()}`);
    fs.ensureDirSync(testDir);

    // Store original values
    originalHome = process.env.HOME;

    // Mock process.cwd() to return test directory
    vi.spyOn(process, 'cwd').mockReturnValue(testDir);
    // Silence validation warnings by default; individual tests spy on
    // console.warn where the warning itself is under test.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original values
    vi.restoreAllMocks();
    process.env.HOME = originalHome;

    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.removeSync(testDir);
    }
  });

  /** Write one file of a split `config/` directory in the test workspace. */
  function writeSplitFile(name: string, content: string) {
    const target = path.join(testDir, 'config', name);
    fs.ensureDirSync(path.dirname(target));
    fs.writeFileSync(target, content);
  }

  /** Write a pre-split (v1) config file in the test workspace root. */
  function writeLegacyFile(content: string, name = 'specs.config.yaml') {
    fs.writeFileSync(path.join(testDir, name), content);
  }

  describe('split config/ directory (ADR-071)', () => {
    it('loads conventions and settings from config/', () => {
      writeSplitFile('conventions/figma.yaml', `
naming: SENTENCE
glyphs:
  match: 'DS Icon Glyph / {i}'
slotConstraints: true
`);
      writeSplitFile('settings.yaml', `
author: Test Author
spec:
  format: YAML
  variantDepth: 2
`);

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.naming).toBe('SENTENCE');
      expect(config.conventions.platforms!.figma.glyphs).toEqual({ match: 'DS Icon Glyph / {i}' });
      expect(config.conventions.platforms!.figma.slotConstraints).toBe(true);
      expect(config.settings.author).toBe('Test Author');
      expect(config.settings.spec.format).toBe('YAML');
      expect(config.settings.spec.variantDepth).toBe(2);
    });

    it('defaults each missing split file independently', () => {
      writeSplitFile('settings.yaml', 'spec:\n  variantDepth: 3');

      const config = configLoader.load();
      // No conventions declared at all — DEFAULT_CONVENTIONS carries no members,
      // because a platform-keyed map has no fixed key to populate (ADR-073). The
      // three defaultable values are applied by whoever resolves a platform.
      expect(config.conventions).toEqual({});
      // settings.yaml present — merged over DEFAULT_SETTINGS
      expect(config.settings.spec.variantDepth).toBe(3);
      expect(config.settings.spec.format).toBe(DEFAULT_SETTINGS.spec.format);
    });

    it('accepts .json split files', () => {
      writeSplitFile('conventions/figma.json', JSON.stringify({ naming: 'TITLE' }));

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.naming).toBe('TITLE');
    });

    it('loads normally (no throw) when config/ is present alongside a legacy specs.config.yaml', () => {
      writeSplitFile('settings.yaml', 'spec:\n  variantDepth: 2');
      writeLegacyFile('config:\n  processing:\n    variantDepth: 1');

      let config;
      expect(() => {
        config = configLoader.load();
      }).not.toThrow();
      expect(config!.settings.spec.variantDepth).toBe(2); // config/ wins
    });

    it('loads an explicit directory path', () => {
      const dir = path.join(testDir, 'elsewhere', 'config');
      fs.ensureDirSync(dir);
      fs.writeFileSync(path.join(dir, 'settings.yaml'), 'spec:\n  format: YAML');

      const config = configLoader.load(dir);
      expect(config.settings.spec.format).toBe('YAML');
    });

    it('resolves relative directories against the workspace root (parent of config/)', () => {
      writeSplitFile('settings.yaml', 'data:\n  directory: ./my-data\nspec:\n  directory: ./my-specs');

      const config = configLoader.load();
      expect(config.settings.data?.directory).toBe(path.resolve(testDir, 'my-data'));
      expect(config.settings.spec.directory).toBe(path.resolve(testDir, 'my-specs'));
      expect(config.configDir).toBe(testDir);
    });
  });

  describe('legacy file refusal (ADR-071)', () => {
    it('refuses a discovered specs.config.yaml with a pointer to specs migrate config', () => {
      writeLegacyFile('config:\n  processing:\n    variantDepth: 2');

      expect(() => configLoader.load()).toThrow(/specs\.config\.yaml is no longer read \(ADR-071\)/);
      expect(() => configLoader.load()).toThrow(/specs migrate config/);
      expect(() => configLoader.load()).toThrow(/config\/conventions\/ and config\/settings\.yaml/);
      expect(() => configLoader.load()).toThrow(/https:\/\/spectacular\.systems\/settings\//);
    });

    it('refuses a discovered specs.config.json', () => {
      writeLegacyFile(
        JSON.stringify({ config: { processing: { variantDepth: 3 } } }),
        'specs.config.json'
      );

      expect(() => configLoader.load()).toThrow(/specs\.config\.json is no longer read \(ADR-071\)/);
    });

    it('refuses a discovered ~/.specs/config.yaml', () => {
      const home = path.join(testDir, 'home');
      fs.ensureDirSync(path.join(home, '.specs'));
      fs.writeFileSync(path.join(home, '.specs', 'config.yaml'), 'author: Home Author');
      process.env.HOME = home;

      expect(() => configLoader.load()).toThrow(/config\.yaml is no longer read \(ADR-071\)/);
    });

    it('names a working remedy for a file discovery would not find', () => {
      const customPath = path.join(testDir, 'custom-config.yaml');
      fs.writeFileSync(customPath, 'config:\n  processing:\n    variantDepth: 2');

      // `specs migrate config` alone would report "nothing to migrate" here, so
      // the refusal has to name the source explicitly.
      expect(() => configLoader.load(customPath)).toThrow(
        /specs migrate config --source custom-config\.yaml/
      );
    });

    it('refuses an explicit --config path pointing at a legacy file', () => {
      const customPath = path.join(testDir, 'custom-config.yaml');
      fs.writeFileSync(customPath, 'config:\n  processing:\n    variantDepth: 2');

      expect(() => configLoader.load(customPath)).toThrow(/custom-config\.yaml is no longer read \(ADR-071\)/);
    });

    it('is a hard stop — never falls back to defaults', () => {
      const error = vi.mocked(console.error);
      writeLegacyFile('config:\n  processing:\n    variantDepth: 2');

      expect(() => configLoader.load()).toThrow();
      // The refusal throws before the try/catch that degrades load failures
      // into defaults, so the fallback path must never run.
      expect(error).not.toHaveBeenCalledWith('Falling back to default configuration');
    });
  });

  describe('retired layout files mark the config directory (ADR-071 retirement)', () => {
    it('refuses a conventions.yaml-only workspace instead of silently defaulting', () => {
      writeSplitFile('conventions.yaml', 'figma:\n  naming: SENTENCE\n');
      expect(() => configLoader.load()).toThrow(/no longer read \(ADR-078\)/);
    });

    it('warns on a leftover pipeline.yaml and still loads', () => {
      writeSplitFile('pipeline.yaml', 'transformers:\n  - name: react\n');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = configLoader.load();
      expect(config.settings).toBeDefined();
      expect(warn.mock.calls.flat().join('\n')).toMatch(/pipeline\.yaml is no longer read/);
    });

    it('warns on a leftover pipeline.yaml beside a split settings file', () => {
      writeSplitFile('settings.yaml', 'spec:\n  format: YAML\n');
      writeSplitFile('pipeline.yaml', 'transformers: []\n');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = configLoader.load();
      expect(config.settings.spec.format).toBe('YAML');
      expect(warn.mock.calls.flat().join('\n')).toMatch(/specs migrate config/);
    });
  });

  describe('defaults (no configuration found)', () => {
    it('returns defaults when no config exists', () => {
      const config = configLoader.load();
      const { directory, ...spec } = config.settings.spec;
      expect(spec).toEqual(DEFAULT_SETTINGS.spec);
      expect(directory).toBeTruthy();
      // DEFAULT_CONVENTIONS carries no members (ADR-073) — see the note above.
      expect(config.conventions).toEqual({});
    });

    it('returns defaults when an explicit path does not exist', () => {
      const nonExistentPath = path.join(testDir, 'does-not-exist.yaml');
      const config = configLoader.load(nonExistentPath);
      const { directory, ...spec } = config.settings.spec;
      expect(spec).toEqual(DEFAULT_SETTINGS.spec);
    });
  });

  describe('settings validation (config/settings.yaml)', () => {
    it('should validate variantDepth and use default for invalid values', () => {
      writeSplitFile('settings.yaml', 'spec:\n  variantDepth: 999'); // Invalid

      const config = configLoader.load();
      expect(config.settings.spec.variantDepth).toBe(9999); // Default
    });

    it('should validate details and use default for invalid values', () => {
      writeSplitFile('settings.yaml', 'spec:\n  details: INVALID');

      const config = configLoader.load();
      expect(config.settings.spec.details).toBe('LAYERED'); // Default
    });

    it('should validate spec.keys and use default for invalid values', () => {
      writeSplitFile('settings.yaml', 'spec:\n  keys: INVALID');

      const config = configLoader.load();
      expect(config.settings.spec.keys).toBe(DEFAULT_SETTINGS.spec.keys);
    });

    it('should validate spec.format and use default for invalid values', () => {
      writeSplitFile('settings.yaml', 'spec:\n  format: XML');

      const config = configLoader.load();
      expect(config.settings.spec.format).toBe(DEFAULT_SETTINGS.spec.format);
    });

    it('should validate spec.layout and use default for invalid values', () => {
      writeSplitFile('settings.yaml', 'spec:\n  layout: INVALID');

      const config = configLoader.load();
      expect(config.settings.spec.layout).toBe(DEFAULT_SETTINGS.spec.layout);
    });

    it('should validate spec.tokens and use default for invalid values', () => {
      writeSplitFile('settings.yaml', 'spec:\n  tokens: INVALID');

      const config = configLoader.load();
      expect(config.settings.spec.tokens).toBe(DEFAULT_SETTINGS.spec.tokens);
    });

    it('should accept all valid spec.tokens values', () => {
      const validValues = ['TOKEN', 'TOKEN_NAME', 'TOKEN_FIGMA_EXTENSIONS', 'FIGMA_NAME', 'CUSTOM', 'FIGMA_SYNTAX_WEB', 'FIGMA_SYNTAX_IOS', 'FIGMA_SYNTAX_ANDROID'];

      validValues.forEach(value => {
        writeSplitFile('settings.yaml', `spec:\n  tokens: ${value}`);

        const config = configLoader.load();
        expect(config.settings.spec.tokens).toBe(value);
      });
    });

    it('warns on a case-variant spec.tokens and uses the default — no silent folding', () => {
      writeSplitFile('settings.yaml', 'spec:\n  tokens: figma_syntax_ios');

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = configLoader.load();
      // Governed surface: the value is not transformed behind the author's
      // back. It warns, names the valid values, and falls back.
      expect(config.settings.spec.tokens).toBe(DEFAULT_SETTINGS.spec.tokens);
      expect(warn.mock.calls.some(c => String(c[0]).includes('figma_syntax_ios'))).toBe(true);
      warn.mockRestore();
    });

    it('should validate spec.color and use default for invalid values', () => {
      writeSplitFile('settings.yaml', 'spec:\n  color: INVALID');

      const config = configLoader.load();
      expect(config.settings.spec.color).toBe(DEFAULT_SETTINGS.spec.color);
    });

    it('should accept all valid spec.color values', () => {
      const validValues = ['HEX', 'HEXA', 'RGB', 'RGBA', 'HSLA', 'HSB', 'OKLCH', 'OKLAB', 'OBJECT'];

      validValues.forEach(value => {
        writeSplitFile('settings.yaml', `spec:\n  color: ${value}`);

        const config = configLoader.load();
        expect(config.settings.spec.color).toBe(value);
      });
    });

    it('warns on a case-variant spec.color and uses the default — no silent folding', () => {
      writeSplitFile('settings.yaml', 'spec:\n  color: oklch');

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = configLoader.load();
      expect(config.settings.spec.color).toBe(DEFAULT_SETTINGS.spec.color);
      expect(warn.mock.calls.some(c => String(c[0]).includes('oklch'))).toBe(true);
      warn.mockRestore();
    });

    it('loads conventions/storybook.yaml as a reserved basename, not a platform (ADR-098)', () => {
      writeSplitFile('conventions/storybook.yaml', 'color:\n  rowGroup: [Palette]\n  groupLeaves: true');

      const config = configLoader.load();
      expect(config.conventions.storybook).toEqual({ color: { rowGroup: ['Palette'], groupLeaves: true } });
      expect(config.conventions.platforms?.storybook).toBeUndefined();
    });

    it('drops a non-mapping storybook concern with a warning naming it', () => {
      writeSplitFile('conventions/storybook.yaml', 'color: just-a-string\ntypography:\n  sample: ok');

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = configLoader.load();
      expect(config.conventions.storybook).toEqual({ typography: { sample: 'ok' } });
      expect(warn.mock.calls.some(c => String(c[0]).includes('"color"'))).toBe(true);
      warn.mockRestore();
    });

    it('warns on an unknown top-level settings key and ignores it', () => {
      writeSplitFile('settings.yaml', 'storybook:\n  color: {}\nspec:\n  keys: CAMEL');

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = configLoader.load();
      expect((config.settings as Record<string, unknown>).storybook).toBeUndefined();
      expect(warn.mock.calls.some(c => String(c[0]).includes('"storybook"'))).toBe(true);
      warn.mockRestore();
    });

    it('should accept all valid variantDepth values', () => {
      const validValues = [1, 2, 3, 9999];

      validValues.forEach(value => {
        writeSplitFile('settings.yaml', `spec:\n  variantDepth: ${value}`);

        const config = configLoader.load();
        expect(config.settings.spec.variantDepth).toBe(value);
      });
    });

    it('should accept all valid spec.keys values', () => {
      const validValues = ['SAFE', 'CAMEL', 'SNAKE', 'KEBAB', 'PASCAL', 'TRAIN'];

      validValues.forEach(value => {
        writeSplitFile('settings.yaml', `spec:\n  keys: ${value}`);

        const config = configLoader.load();
        expect(config.settings.spec.keys).toBe(value);
      });
    });

    it('should default the split layout on when settings.yaml omits the flags', () => {
      writeSplitFile('settings.yaml', 'spec:\n  format: YAML');

      const config = configLoader.load();
      expect(config.settings.spec.splitComponents).toBe(true);
      expect(config.settings.spec.splitConcerns).toBe(true);
      expect(config.settings.spec.useSubfolders).toBe(true);
    });

    it('should let settings.yaml turn the split layout off', () => {
      writeSplitFile(
        'settings.yaml',
        'spec:\n  splitComponents: false\n  splitConcerns: false\n  useSubfolders: false'
      );

      const config = configLoader.load();
      expect(config.settings.spec.splitComponents).toBe(false);
      expect(config.settings.spec.splitConcerns).toBe(false);
      expect(config.settings.spec.useSubfolders).toBe(false);
    });

    it('should validate split flags: a non-boolean warns and falls back to the default', () => {
      const warn = vi.mocked(console.warn);
      writeSplitFile('settings.yaml', 'spec:\n  splitComponents: "yes"');

      const config = configLoader.load();
      expect(config.settings.spec.splitComponents).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid settings.spec.splitComponents')
      );
    });
  });

  describe('spec.roleValidation validation (ADR-067)', () => {
    it('preserves a valid value', () => {
      writeSplitFile('settings.yaml', 'spec:\n  roleValidation: error\n');
      const config = configLoader.load();
      expect(config.settings.spec.roleValidation).toBe('error');
    });

    it('replaces an invalid value with the default and warns', () => {
      const warn = vi.mocked(console.warn);
      writeSplitFile('settings.yaml', 'spec:\n  roleValidation: strict\n');
      const config = configLoader.load();
      expect(config.settings.spec.roleValidation).toBe(DEFAULT_SETTINGS.spec.roleValidation);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid settings.spec.roleValidation')
      );
    });

    it('defaults to warn when absent, without warning', () => {
      const warn = vi.mocked(console.warn);
      writeSplitFile('settings.yaml', 'spec:\n  format: YAML\n');
      const config = configLoader.load();
      expect(config.settings.spec.roleValidation).toBe('warn');
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('roleValidation')
      );
    });
  });

  describe('spec.defaultSlotContent validation', () => {
    it('preserves a valid boolean (true)', () => {
      writeSplitFile('settings.yaml', 'spec:\n  defaultSlotContent: true');

      const config = configLoader.load();
      expect(config.settings.spec.defaultSlotContent).toBe(true);
    });

    it('preserves a valid boolean (false)', () => {
      writeSplitFile('settings.yaml', 'spec:\n  defaultSlotContent: false');

      const config = configLoader.load();
      expect(config.settings.spec.defaultSlotContent).toBe(false);
    });

    // defaultSlotContent activates only on a literal boolean `true`; any other
    // value is coerced to false (ConfigLoader.ts resolveSettings).
    it('coerces a non-boolean defaultSlotContent value to false', () => {
      writeSplitFile('settings.json', JSON.stringify({ spec: { defaultSlotContent: 'yes' } }));

      const config = configLoader.load();
      expect(config.settings.spec.defaultSlotContent).toBe(false);
    });

    it('coerces a truthy-but-not-true value (e.g. 1) to false', () => {
      writeSplitFile('settings.json', JSON.stringify({ spec: { defaultSlotContent: 1 } }));

      const config = configLoader.load();
      expect(config.settings.spec.defaultSlotContent).toBe(false);
    });
  });

  describe('conventions validation (config/conventions/<platform>.yaml)', () => {
    it('should preserve a valid glyphs.match', () => {
      writeSplitFile('conventions/figma.yaml', 'glyphs:\n  match: "DS Icon Glyph /"');

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.glyphs).toEqual({ match: 'DS Icon Glyph /' });
    });

    it('should strip an invalid glyphs.match (non-string)', () => {
      writeSplitFile('conventions/figma.yaml', 'glyphs:\n  match: 123');

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.glyphs).toBeUndefined();
    });

    it('should strip an empty glyphs.match', () => {
      writeSplitFile('conventions/figma.yaml', "glyphs:\n  match: '  '");

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.glyphs).toBeUndefined();
    });

    it('should default subcomponents.scope to NESTED when a valid match is given', () => {
      writeSplitFile('conventions/figma.yaml', `
subcomponents:
  match:
    - "{C} / {S}"
`);

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.subcomponents).toEqual({ scope: 'NESTED', match: ['{C} / {S}'] });
    });

    it('resolves an empty objectProps block to the default separator (ADR-111)', () => {
      writeSplitFile('conventions/figma.yaml', 'objectProps: {}');

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.objectProps).toEqual({ separator: '.' });
    });

    it('keeps an explicit objectProps.separator', () => {
      writeSplitFile('conventions/figma.yaml', 'objectProps:\n  separator: "_"');

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.objectProps).toEqual({ separator: '_' });
    });

    it('warns and defaults an invalid objectProps.separator', () => {
      const warn = vi.mocked(console.warn);
      writeSplitFile('conventions/figma.yaml', 'objectProps:\n  separator: ""');

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.objectProps).toEqual({ separator: '.' });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid conventions/figma.yaml objectProps.separator')
      );
    });

    it('warns and defaults a non-object objectProps value', () => {
      const warn = vi.mocked(console.warn);
      writeSplitFile('conventions/figma.yaml', 'objectProps: true');

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.objectProps).toEqual({ separator: '.' });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid conventions/figma.yaml objectProps')
      );
    });

    it('leaves objectProps undefined when the block is absent', () => {
      writeSplitFile('conventions/figma.yaml', 'naming: SENTENCE');

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.objectProps).toBeUndefined();
    });

    it('should remove subcomponents (and warn) when match is empty', () => {
      const warn = vi.mocked(console.warn);
      writeSplitFile('conventions/figma.json', JSON.stringify({ subcomponents: { match: [] } }));

      const config = configLoader.load();
      // Nothing declared this platform at all, so there is no entry to read — which
      // is a stronger statement than an entry with no subcomponents block.
      expect(config.conventions.platforms?.figma?.subcomponents).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid conventions/figma.yaml subcomponents.match')
      );
    });
  });

  describe('conventions/specs.yaml (ADR-073 Decision 4)', () => {
    it('resolves states, accessibility.label and value into conventions.specs', () => {
      writeSplitFile('conventions/specs.yaml', `
states:
  disabled:
    prop: isDisabled
accessibility:
  label:
    prop: a11yLabel
value:
  prop: progress
  indeterminate: isLoading
`);

      const config = configLoader.load();
      expect(config.conventions.specs).toEqual({
        states: { disabled: { prop: 'isDisabled' } },
        accessibility: { label: { prop: 'a11yLabel' } },
        value: { prop: 'progress', indeterminate: 'isLoading' },
      });
    });

    it('drops an accessibility block without label.prop (and warns), keeping the rest', () => {
      const warn = vi.mocked(console.warn);
      writeSplitFile('conventions/specs.yaml', 'accessibility: yes\nstates:\n  disabled:\n    prop: isDisabled\n');

      const config = configLoader.load();
      expect(config.conventions.specs).toEqual({ states: { disabled: { prop: 'isDisabled' } } });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid conventions/specs.yaml accessibility')
      );
    });

    it('drops a value block without prop (and warns) — prop is required', () => {
      const warn = vi.mocked(console.warn);
      writeSplitFile('conventions/specs.yaml', 'value:\n  indeterminate: isLoading\n');

      const config = configLoader.load();
      expect(config.conventions.specs).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid conventions/specs.yaml value')
      );
    });

    it('never reads specs.yaml as a platform', () => {
      writeSplitFile('conventions/specs.yaml', 'states:\n  disabled:\n    prop: isDisabled\n');

      const config = configLoader.load();
      expect(config.conventions.platforms?.specs).toBeUndefined();
    });

    it('warns when a relocated key still sits in a platform file, naming the new home', () => {
      const warn = vi.mocked(console.warn);
      writeSplitFile('conventions/figma.yaml', `
states:
  disabled:
    prop: isDisabled
propRoles:
  accessibleName: a11yLabel
roleValidation: error
`);

      const config = configLoader.load();
      const figma = config.conventions.platforms!.figma;
      expect(figma).not.toHaveProperty('states');
      expect(figma).not.toHaveProperty('propRoles');
      expect(figma).not.toHaveProperty('roleValidation');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('conventions/figma.yaml states: moved to conventions/specs.yaml')
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('conventions/figma.yaml propRoles: replaced by accessibility.label and value')
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('conventions/figma.yaml roleValidation: moved to settings.yaml spec.roleValidation')
      );
    });
  });

  describe('conventions/figma.primitives.yaml (ADR-073 Decision 5)', () => {
    it('reads the promotion table from its Figma-qualified basename', () => {
      writeSplitFile('conventions/figma.primitives.yaml', `
dsIcon:
  elementType: glyph
  map:
    - source: fillColor
      prop: color
`);

      const config = configLoader.load();
      expect(config.conventions.primitives).toEqual({
        dsIcon: { elementType: 'glyph', map: [{ source: 'fillColor', prop: 'color' }] },
      });
      expect(config.conventions.platforms).toBeUndefined();
    });

    it('refuses the retired primitives.yaml basename rather than reading it as a platform', () => {
      writeSplitFile('conventions/primitives.yaml', 'dsIcon:\n  elementType: glyph\n  map: []\n');

      // The refusal stops the run — a defaults fallback here would generate
      // successfully and silently wrong.
      expect(() => configLoader.load()).toThrow(/ADR-073 Decision 5/);
    });

    it('passes match through to the resolved entry (ADR-100)', () => {
      writeSplitFile('conventions/figma.primitives.yaml', `
dsSection:
  elementType: container
  match:
    - DS Section
    - Section
  map: []
`);

      expect(configLoader.load().conventions.primitives).toEqual({
        dsSection: { elementType: 'container', match: ['DS Section', 'Section'], map: [] },
      });
    });

    it('omits match entirely when the entry declares none', () => {
      writeSplitFile('conventions/figma.primitives.yaml', 'dsIcon:\n  elementType: glyph\n  map: []\n');

      const entry = configLoader.load().conventions.primitives!.dsIcon;
      expect('match' in entry).toBe(false);
    });

    it.each([
      ['an empty array', 'match: []'],
      ['a bare string', 'match: Section'],
    ])('drops match declared as %s, naming the entry', (_label, declaration) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      writeSplitFile('conventions/figma.primitives.yaml', `
dsSection:
  elementType: container
  ${declaration}
  map: []
`);

      const entry = configLoader.load().conventions.primitives!.dsSection;
      expect('match' in entry).toBe(false);
      expect(warn.mock.calls.some(call => String(call[0]).includes('dsSection'))).toBe(true);
    });

    it('keeps the usable prefixes when only some entries are strings', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      writeSplitFile('conventions/figma.primitives.yaml', `
dsSection:
  elementType: container
  match:
    - Section
    - 7
    - ""
  map: []
`);

      expect(configLoader.load().conventions.primitives!.dsSection.match).toEqual(['Section']);
      expect(warn.mock.calls.some(call => String(call[0]).includes('2 dropped'))).toBe(true);
    });
  });

  describe('conventions/figma.yaml instanceExamples validation (ADR-050)', () => {
    it('defaults an invalid scope to PAGE while keeping a valid match', () => {
      writeSplitFile('conventions/figma.yaml', `
instanceExamples:
  scope: SIDEWAYS
  match:
    - "{C} / Examples / {S}"
`);

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.instanceExamples).toEqual({
        scope: 'PAGE',
        match: ['{C} / Examples / {S}'],
      });
    });

    it('preserves a valid scope (FILE)', () => {
      writeSplitFile('conventions/figma.yaml', `
instanceExamples:
  scope: FILE
  match:
    - "{C} / Examples / {S}"
`);

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.instanceExamples?.scope).toBe('FILE');
    });

    it('keeps the block when match is omitted (match is optional — ADR-050)', () => {
      const warn = vi.mocked(console.warn);
      writeSplitFile('conventions/figma.yaml', `
instanceExamples:
  scope: PAGE
  parentNames:
    - Ready-made examples
`);

      const config = configLoader.load();
      // Presence of the block is the on-switch; no match means every in-scope
      // instance qualifies, narrowed here by parentNames.
      expect(config.conventions.platforms!.figma.instanceExamples).toEqual({
        scope: 'PAGE',
        parentNames: ['Ready-made examples'],
      });
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Invalid'));
    });

    it('keeps the block but ignores match (and warns) when match is an empty array', () => {
      const warn = vi.mocked(console.warn);
      writeSplitFile('conventions/figma.json', JSON.stringify({ instanceExamples: { scope: 'PAGE', match: [] } }));

      const config = configLoader.load();
      const ie = config.conventions.platforms!.figma.instanceExamples as Record<string, unknown>;
      expect(ie).toEqual({ scope: 'PAGE' });
      expect(ie).not.toHaveProperty('match');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid conventions/figma.yaml instanceExamples.match')
      );
    });

    it('strips a non-array exclude while keeping the rest of the block', () => {
      writeSplitFile('conventions/figma.json', JSON.stringify({
          instanceExamples: { match: ['{C} / Examples / {S}'], exclude: 'nope' },
        }));

      const config = configLoader.load();
      const ie = config.conventions.platforms!.figma.instanceExamples as Record<string, unknown>;
      expect(ie.match).toEqual(['{C} / Examples / {S}']);
      expect(ie.exclude).toBeUndefined();
    });

    it('strips a non-array parentNames while keeping the rest of the block', () => {
      writeSplitFile('conventions/figma.json', JSON.stringify({
          instanceExamples: { match: ['{C} / Examples / {S}'], parentNames: 123 },
        }));

      const config = configLoader.load();
      const ie = config.conventions.platforms!.figma.instanceExamples as Record<string, unknown>;
      expect(ie.match).toEqual(['{C} / Examples / {S}']);
      expect(ie.parentNames).toBeUndefined();
    });

    it('passes a fully valid block through unchanged', () => {
      const block = {
        scope: 'PAGE',
        match: ['{C} / Examples / {S}'],
        exclude: ['{C} / Examples / Internal / {S}'],
        parentNames: ['Examples'],
      };
      writeSplitFile('conventions/figma.json', JSON.stringify({ instanceExamples: block }));

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.instanceExamples).toEqual(block);
    });
  });

  describe('conventions.figma.images validation (ADR-063)', () => {
    it('resolves a full block: backgroundImage, trimmed match, trimmed sourceProps', () => {
      writeSplitFile('conventions/figma.json', JSON.stringify({ images: { backgroundImage: true, match: ' DS Image ', sourceProps: [' imageSource ', 'src'] } }));

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.images).toEqual({
        backgroundImage: true,
        match: 'DS Image',
        sourceProps: ['imageSource', 'src'],
      });
    });

    it('fills-only: backgroundImage alone resolves with defaults', () => {
      writeSplitFile('conventions/figma.yaml', 'images:\n  backgroundImage: true');

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.images).toEqual({ backgroundImage: true, sourceProps: [] });
    });

    it('sourceProps-only: re-typing without fills or component', () => {
      writeSplitFile('conventions/figma.json', JSON.stringify({ images: { sourceProps: ['Image'] } }));

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.images).toEqual({ backgroundImage: false, sourceProps: ['Image'] });
    });

    it('match without sourceProps is dropped (needs a forwarding target)', () => {
      writeSplitFile('conventions/figma.json', JSON.stringify({ images: { backgroundImage: true, match: 'DS Image' } }));

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.images).toEqual({ backgroundImage: true, sourceProps: [] });
      expect(config.conventions.platforms!.figma.images).not.toHaveProperty('match');
    });

    it('coerces a non-boolean backgroundImage to false', () => {
      writeSplitFile('conventions/figma.json', JSON.stringify({ images: { backgroundImage: 'yes' } }));

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.images?.backgroundImage).toBe(false);
    });

    it('is absent by default (presence is the on-switch)', () => {
      writeSplitFile('conventions/figma.yaml', 'naming: NONE');

      const config = configLoader.load();
      expect(config.conventions.platforms!.figma.images).toBeUndefined();
    });
  });

  describe('conventions.specs.slots.default validation (ADR-099)', () => {
    it('reads the default-slot patterns, trimmed', () => {
      writeSplitFile('conventions/specs.yaml', `
slots:
  default:
    match:
      - ' children '
      - items
`);

      const config = configLoader.load();
      expect(config.conventions.specs!.slots).toEqual({ default: { match: ['children', 'items'] } });
    });

    it('is absent by default (presence is the on-switch)', () => {
      writeSplitFile('conventions/specs.yaml', 'value:\n  prop: progress');

      const config = configLoader.load();
      expect(config.conventions.specs!.slots).toBeUndefined();
    });

    it('drops an empty match — a convention that names nothing flattens nothing', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      writeSplitFile('conventions/specs.json', JSON.stringify({ slots: { default: { match: [] } } }));

      const config = configLoader.load();
      expect(config.conventions.specs?.slots).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('slots.default.match'));
    });

    it('drops a match that is not an array of strings', () => {
      writeSplitFile('conventions/specs.json', JSON.stringify({ slots: { default: { match: 'children' } } }));

      const config = configLoader.load();
      expect(config.conventions.specs?.slots).toBeUndefined();
    });

    it('drops a non-object slots block', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      writeSplitFile('conventions/specs.json', JSON.stringify({ slots: 'children' }));

      const config = configLoader.load();
      expect(config.conventions.specs?.slots).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('slots'));
    });

    // The platform file built from an allowlist would otherwise drop the key in
    // silence, and the workspace would lose its default-slot convention without a word.
    it('names the new home when slots is still declared on a platform', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      writeSplitFile('conventions/figma.json', JSON.stringify({ slots: { default: { match: ['children'] } } }));

      const config = configLoader.load();
      expect(config.conventions.specs?.slots).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('conventions/specs.yaml'));
    });
  });

  describe('Merging with defaults', () => {
    it('should merge partial settings with defaults', () => {
      writeSplitFile('settings.yaml', 'spec:\n  variantDepth: 2');

      const config = configLoader.load();

      // Overridden value
      expect(config.settings.spec.variantDepth).toBe(2);

      // Default values preserved
      expect(config.settings.spec.details).toBe(DEFAULT_SETTINGS.spec.details);
      expect(config.settings.spec.keys).toBe(DEFAULT_SETTINGS.spec.keys);
      // No subcomponents convention declared — no default can supply one
      expect(config.conventions.platforms?.figma?.subcomponents).toBeUndefined();
    });
  });
});
