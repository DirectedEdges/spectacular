import { describe, it, expect } from 'vitest';
import yaml from 'yaml';
import fs from 'fs';
import path from 'path';
import { DEFAULT_SETTINGS } from '@directededges/specs-schema';
import { CONFIG_DEFAULTS } from '../../../src/config/ConfigDefaults.js';
import {
  generateFigmaConventionsTemplate,
  generateSpecsConventionsTemplate,
  generateSettingsTemplate,
  generateConfigTemplates,
} from '../../../src/config/ConfigTemplates.js';

describe('ConfigTemplates', () => {
  describe('generateConfigTemplates', () => {
    /**
     * The one failure the move to `templates/*.yaml` introduced.
     *
     * A template used to be a function, so adding one meant writing it and wiring it
     * in the same edit. A file can now be dropped into `templates/` and referenced by
     * nothing: unused files do not fail a build, so it would simply never scaffold.
     * The inverse is already caught — a map entry naming a missing file fails the
     * import.
     */
    it('wires every file in templates/ into the scaffold', () => {
      const dir = path.resolve(__dirname, '../../../src/config/templates');
      const onDisk = fs.readdirSync(dir).filter(f => f.endsWith('.yaml'));
      const scaffolded = Object.keys(generateConfigTemplates()).map(p => path.basename(p));
      const orphaned = onDisk.filter(f => !scaffolded.includes(f));
      expect(orphaned, `present in templates/ but scaffolded by nothing: ${orphaned.join(', ')}`).toEqual([]);
    });

    it('scaffolds one conventions file per platform, the specs file, plus settings', () => {
      const templates = generateConfigTemplates();
      expect(Object.keys(templates).sort()).toEqual([
        'config/conventions/figma.yaml',
        'config/conventions/react.yaml',
        'config/conventions/specs.yaml',
        'config/conventions/web-components.yaml',
        'config/settings.yaml',
      ]);
    });

    it('every template parses as valid YAML — commented example blocks included', () => {
      for (const template of Object.values(generateConfigTemplates())) {
        expect(template).toBeTruthy();
        expect(typeof template).toBe('string');
        expect(() => yaml.parse(template)).not.toThrow();
      }
    });

    it('templates have consistent line endings', () => {
      for (const template of Object.values(generateConfigTemplates())) {
        expect(template.includes('\r\n')).toBe(false);
      }
    });
  });

  describe('generateFigmaConventionsTemplate', () => {
    it('documents every feature-toggle block (commented) with a doc link', () => {
      const template = generateFigmaConventionsTemplate();
      for (const block of ['instanceExamples:', 'images:', 'sourceProps:']) {
        expect(template).toContain(block);
      }
      expect(template).toContain('spectacular.systems/guides/images/');
      expect(template).toContain('spectacular.systems/guides/instance-examples/');
      // states describes the spec's own props, so it lives in specs.yaml (ADR-073 Decision 4)
      expect(template).not.toContain('states:');
    });

    it('should include commented glyphs block for icon glyph naming', () => {
      const template = generateFigmaConventionsTemplate();
      expect(template).toContain('glyphs:');
      expect(template).toContain('glyph');
    });

    it('should include figma conventions structure', () => {
      const template = generateFigmaConventionsTemplate();
      // The filename is the platform id, so the body has no wrapping key (ADR-078).
      expect(template).not.toContain('\nfigma:');
      // A commented line is the opposite of the default, so uncommenting it
      // always changes behaviour — NONE, the default, would be inert.
      expect(template).toContain('# naming: SENTENCE');
      expect(template).not.toContain('# naming: NONE');
      expect(template).toContain('subcomponents:');
      expect(template).toContain('match:');
      expect(template).toContain('slotConstraints:');
      expect(template).toContain('codeOnlyProps:');
    });

    it('the body sits at the root — the filename is the platform id', () => {
      const parsed = yaml.parse(generateFigmaConventionsTemplate());
      // No wrapping key: conventions/figma.yaml IS the figma entry (ADR-078).
      expect(Object.keys(parsed)).not.toContain('figma');
      expect(Object.keys(parsed)).toContain('subcomponents');
    });

    it('a code platform stub is inert until uncommented', () => {
      const templates = generateConfigTemplates();
      for (const key of ['config/conventions/react.yaml', 'config/conventions/web-components.yaml']) {
        const stub = templates[key];
        expect(stub).toContain('# primitives:');
        // Pure comments parse to nothing, which is the same as declaring nothing.
        expect(yaml.parse(stub)).toBeNull();
      }
    });
  });

  describe('generateSpecsConventionsTemplate', () => {
    it('documents every member (commented) with a doc link', () => {
      const template = generateSpecsConventionsTemplate();
      for (const block of ['# states:', '# accessibility:', '# value:', 'indeterminate:']) {
        expect(template).toContain(block);
      }
      expect(template).toContain('spectacular.systems/settings/states/');
    });

    it('is inert until uncommented', () => {
      // Pure comments parse to nothing, which is the same as declaring nothing.
      expect(yaml.parse(generateSpecsConventionsTemplate())).toBeNull();
    });
  });

  describe('generateSettingsTemplate', () => {
    it('should include data.directory with default value', () => {
      const template = generateSettingsTemplate();
      expect(template).toContain('directory: ./data');
      expect(template).toContain('spectacular.systems/settings/data-sources/');
    });

    it('should include spec.directory with default value', () => {
      const template = generateSettingsTemplate();
      expect(template).toContain('directory: ./specs');
      expect(template).toContain('spectacular.systems/settings/folders/');
    });

    it('should include inline documentation comments', () => {
      const template = generateSettingsTemplate();
      expect(template).toContain('#');
      expect(template).toContain('spectacular.systems/settings/');
    });

    it('should include Figma sources section', () => {
      const template = generateSettingsTemplate();
      expect(template).toContain('sources:');
      expect(template).toContain('What to fetch');
      expect(template).toContain('FIGMA_FILE_KEY');
    });

    it('should include spec serialization settings', () => {
      const template = generateSettingsTemplate();
      expect(template).toContain('spec:');
      expect(template).toContain('keys:');
      expect(template).toContain('format:');
      expect(template).toContain('tokens:');
      expect(template).toContain('layout:');
      expect(template).toContain('color:');
      expect(template).toContain('variantDepth');
      expect(template).toContain('details');
      expect(template).toContain('collapsePrimitiveWrapper');
      expect(template).toContain('defaultSlotContent');
    });

    it('declares the scaffolded serialization settings', () => {
      const parsed = yaml.parse(generateSettingsTemplate());
      expect(parsed.spec.format).toBe('YAML');
      expect(parsed.spec.keys).toBe('CAMEL');
      expect(parsed.spec.color).toBe('HEXA');
    });

    it('should have valid structure with top-level keys', () => {
      const parsed = yaml.parse(generateSettingsTemplate());
      expect(Object.keys(parsed)).toContain('author');
      expect(Object.keys(parsed)).toContain('data');
      expect(Object.keys(parsed)).toContain('spec');
      expect(Object.keys(parsed)).toContain('assets');
      expect(parsed.data.sources).toEqual({
        library: { key: 'YOUR_FIGMA_FILE_KEY', fetch: ['file', 'variables', 'styles'] },
      });
      expect(parsed.assets.directory).toBe('./assets');
      // curation is a mapping of commented members, so it parses to null rather
      // than being absent — the key itself must still be there to be found.
      expect(Object.keys(parsed)).toContain('curation');
    });

    it('states the writing contract rather than annotating each setting', () => {
      const template = generateSettingsTemplate();
      expect(template).toContain('Every setting is written out at the value this workspace');
      expect(template).toContain("All but three are the schema's own default; those three are marked.");
    });

    /**
     * The scaffold and `DEFAULT_SETTINGS` are two statements of what a fresh workspace
     * produces, and for five members they disagreed for several releases because
     * nothing compared them (ADR-112). A scaffolded value that silently departs from
     * the schema means the published docs and a reader's own file give different
     * answers, so every departure has to be deliberate and listed here.
     *
     * The three listed are on while the schema defaults them off. Each reads a
     * convention a fresh workspace has not declared, so each finds nothing — on is
     * free, and it makes declaring the convention the only later step.
     */
    const DECLARED_DEPARTURES = ['roles', 'promotePrimitives', 'defaultSlotContent'];

    it('scaffolds the schema default for every setting but the declared departures', () => {
      const parsed = yaml.parse(generateSettingsTemplate());
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS.spec)) {
        if (typeof value === 'object' || DECLARED_DEPARTURES.includes(key)) continue;
        expect(parsed.spec[key], `spec.${key} departs from the schema default`).toEqual(value);
      }
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS.curation)) {
        expect(parsed.curation[key], `curation.${key} departs from the schema default`).toEqual(value);
      }
    });

    it('scaffolds each declared departure on, and says why in the file', () => {
      const parsed = yaml.parse(generateSettingsTemplate());
      const template = generateSettingsTemplate();
      for (const key of DECLARED_DEPARTURES) {
        expect(parsed.spec[key]).toBe(true);
        expect(DEFAULT_SETTINGS.spec[key as 'roles']).toBe(false);
      }
      expect(template).toContain('on while the schema defaults them off');
    });

    /**
     * A commented member whose value equals its default is inert: uncommenting it
     * changes nothing, which makes the template read as a list of switches that do
     * not work. Every default lives in DEFAULT_SETTINGS, so this is checkable.
     */
    it('never shows a commented spec setting at its default value', () => {
      const template = generateSettingsTemplate();
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS.spec)) {
        if (typeof value === 'object') continue;
        expect(template).not.toContain(`# ${key}: ${String(value)}`);
      }
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS.curation)) {
        expect(template).not.toContain(`# ${key}: ${String(value)}`);
      }
    });

    /** Every setting the schema defines is offered, so none is discoverable only in docs. */
    it('offers every spec and curation setting the schema defines', () => {
      const template = generateSettingsTemplate();
      for (const key of Object.keys(DEFAULT_SETTINGS.spec)) {
        expect(template).toContain(`${key}:`);
      }
      for (const key of Object.keys(DEFAULT_SETTINGS.curation)) {
        expect(template).toContain(`${key}:`);
      }
    });

    /**
     * The template is authored as YAML, so the directories are literals rather than
     * interpolated from `CONFIG_DEFAULTS`. That is the trade for a readable scaffold,
     * and this is what pays for it: changing a default without changing the template
     * fails here instead of scaffolding the old path into every new workspace.
     */
    it('scaffolds the same directories the CLI defaults to', () => {
      const template = generateSettingsTemplate();
      expect(template).toContain(`directory: ${CONFIG_DEFAULTS.dataDirectory}`);
      expect(template).toContain(`directory: ${CONFIG_DEFAULTS.outputDirectory}`);
    });
  });

});
