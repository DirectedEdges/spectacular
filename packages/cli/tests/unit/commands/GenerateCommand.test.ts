import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { Command } from 'commander';
import { Generate } from '../../../src/commands/generate.js';
import { ManifestParser } from '../../../src/generate/manifestParser.js';
import { ManifestParserV2 } from '../../../src/utilities/manifestParserV2.js';
import { LicenseStatus } from '../../../src/generate/licenseStatus.js';
import type { ComponentsData } from '@directededges/specs-from-figma';

// ============================================================================
// COMMAND REGISTRATION
// ============================================================================

describe('GenerateCommand', () => {
  describe('registration', () => {
    it('registers name and description', () => {
      expect(Generate.name()).toBe('generate');
      expect(Generate.description()).toContain('Generate');
    });

    it('has source as an optional argument (defaults to manifest from config)', () => {
      const args = Generate.registeredArguments;
      expect(args).toHaveLength(1);
      expect(args[0].name()).toBe('source');
      expect(args[0].required).toBe(false);
    });

    it('component option is not mandatory (optional for manifest mode)', () => {
      const componentOption = Generate.options.find(o => o.long === '--component');
      expect(componentOption).toBeDefined();
      // mandatory means the option itself must be provided; required means its value needs an argument
      // component is optional (.option not .requiredOption) but takes a required value <name|id>
      expect(componentOption!.mandatory).toBeFalsy();
    });

    it('registers all expected options', () => {
      const options = Generate.options.map(option => option.long).filter(Boolean);

      expect(options).toContain('--component');
      expect(options).toContain('--license');
      expect(options).toContain('--format');
      expect(options).toContain('--output');
      expect(options).toContain('--variables');
      expect(options).toContain('--styles');
      expect(options).toContain('--data-dir');
      expect(options).toContain('--config');
      expect(options).toContain('--combine-as-library');
      expect(options).toContain('--combine-concerns');
      expect(options).toContain('--no-subfolders');
      expect(options).toContain('--from-bridge');
      expect(options).toContain('--file');
      expect(options).toContain('--verbose');
    });

    it('--from-bridge and --file are not mandatory (opt-in source mode)', () => {
      const fromBridge = Generate.options.find(o => o.long === '--from-bridge');
      const file = Generate.options.find(o => o.long === '--file');
      expect(fromBridge).toBeDefined();
      expect(fromBridge!.mandatory).toBeFalsy();
      expect(file).toBeDefined();
      expect(file!.mandatory).toBeFalsy();
    });

    it('has short aliases for key options', () => {
      const shorts = Generate.options.map(o => o.short).filter(Boolean);

      expect(shorts).toContain('-c');
      expect(shorts).toContain('-l');
      expect(shorts).toContain('-f');
      expect(shorts).toContain('-o');
      expect(shorts).toContain('-v');
      expect(shorts).toContain('-s');
    });

    // The split layout is the default, so each flag turns a split OFF. Absent
    // means "defer to config", which is why neither combine flag carries a
    // Commander default that would mask a configured value.
    it('combine-as-library has no Commander default (defers to config)', () => {
      const opt = Generate.options.find(o => o.long === '--combine-as-library');
      expect(opt!.defaultValue).toBeUndefined();
    });

    it('combine-concerns has no Commander default (defers to config)', () => {
      const opt = Generate.options.find(o => o.long === '--combine-concerns');
      expect(opt!.defaultValue).toBeUndefined();
    });

    // Commander resolves a negatable flag at parse time rather than through
    // Option.defaultValue: absent yields true, passed yields false. Generate's
    // resolution keys off that explicit `false`, so absence still defers to
    // the configured value.
    it('no-subfolders parses to true when absent and false when passed', () => {
      const parse = (argv: string[]) => {
        const probe = new Command('probe')
          .option('--combine-as-library', 'x')
          .option('--combine-concerns', 'x')
          .option('--no-subfolders', 'x');
        probe.parse(argv, { from: 'user' });
        return probe.opts();
      };

      expect(parse([]).subfolders).toBe(true);
      expect(parse(['--no-subfolders']).subfolders).toBe(false);
      expect(parse([]).combineAsLibrary).toBeUndefined();
      expect(parse(['--combine-as-library']).combineAsLibrary).toBe(true);
    });

    it('verbose defaults to false', () => {
      const opt = Generate.options.find(o => o.long === '--verbose');
      expect(opt!.defaultValue).toBe(false);
    });
  });
});

// ============================================================================
// MANIFEST PARSING (T01 + T03)
// ============================================================================

describe('parseManifest', () => {
  describe('component parsing', () => {
    it('parses checked components as included', () => {
      const manifest = `# Components\n- [x] DS Button (123:456, COMPONENT_SET)\n- [x] DS Alert (789:012, COMPONENT)`;
      const { components } = ManifestParser.parse(manifest);

      expect(components).toHaveLength(2);
      expect(components[0]).toEqual({
        id: '123:456',
        name: 'DS Button',
        type: 'COMPONENT_SET',
        included: true
      });
      expect(components[1]).toEqual({
        id: '789:012',
        name: 'DS Alert',
        type: 'COMPONENT',
        included: true
      });
    });

    it('parses unchecked components as excluded', () => {
      const manifest = `- [ ] DS Button (123:456, COMPONENT_SET)`;
      const { components } = ManifestParser.parse(manifest);

      expect(components).toHaveLength(1);
      expect(components[0].included).toBe(false);
    });

    it('handles mixed checked and unchecked', () => {
      const manifest = [
        '- [x] Button (1:1, COMPONENT_SET)',
        '- [ ] Alert (2:2, COMPONENT)',
        '- [x] Modal (3:3, COMPONENT_SET)',
        '- [ ] Tooltip (4:4, COMPONENT)'
      ].join('\n');

      const { components } = ManifestParser.parse(manifest);

      expect(components).toHaveLength(4);
      expect(components.filter(c => c.included)).toHaveLength(2);
      expect(components.filter(c => !c.included)).toHaveLength(2);
    });

    it('returns empty array for content with no checkbox lines', () => {
      const manifest = `# Just a heading\nSome text without checkboxes`;
      const { components } = ManifestParser.parse(manifest);
      expect(components).toHaveLength(0);
    });

    it('ignores lines that do not match component format', () => {
      const manifest = [
        '# Components',
        '- [x] DS Button (123:456, COMPONENT_SET)',
        '- Some regular bullet',
        '- [x] Has no parens',
        '  - [x] Indented checkbox (nested, COMPONENT)',
        '- [x] DS Alert (789:012, COMPONENT)'
      ].join('\n');

      const { components } = ManifestParser.parse(manifest);
      // Only lines matching full format are parsed
      expect(components).toHaveLength(2);
      expect(components[0].name).toBe('DS Button');
      expect(components[1].name).toBe('DS Alert');
    });

    it('handles COMPONENT_SET type case-insensitively', () => {
      const manifest = `- [x] Button (1:1, component_set)`;
      const { components } = ManifestParser.parse(manifest);

      expect(components[0].type).toBe('COMPONENT_SET');
    });

    it('handles COMPONENT type case-insensitively', () => {
      const manifest = `- [x] Icon (1:1, component)`;
      const { components } = ManifestParser.parse(manifest);

      expect(components[0].type).toBe('COMPONENT');
    });

    it('extracts component names with special characters', () => {
      const manifest = `- [x] DS Button/Primary (123:456, COMPONENT_SET)`;
      const { components } = ManifestParser.parse(manifest);

      expect(components[0].name).toBe('DS Button/Primary');
    });
  });

  describe('metadata extraction', () => {
    it('extracts File metadata from header', () => {
      const manifest = [
        '# Component Manifest',
        '**File:** data/library.file.json',
        '',
        '- [x] Button (1:1, COMPONENT_SET)'
      ].join('\n');

      const { metadata } = ManifestParser.parse(manifest);
      expect(metadata.file).toBe('data/library.file.json');
    });

    it('trims whitespace from File metadata', () => {
      const manifest = `**File:**   data/library.file.json   \n- [x] Button (1:1, COMPONENT_SET)`;
      const { metadata } = ManifestParser.parse(manifest);
      expect(metadata.file).toBe('data/library.file.json');
    });

    it('returns undefined file when no File header present', () => {
      const manifest = `- [x] Button (1:1, COMPONENT_SET)`;
      const { metadata } = ManifestParser.parse(manifest);
      expect(metadata.file).toBeUndefined();
    });
  });

  describe('realistic manifest', () => {
    it('parses a full audit-generated manifest', () => {
      const manifest = [
        '# Component Audit',
        '',
        '**File:** data/library.file.json',
        '**Generated:** 2026-03-21',
        '',
        '## Components (5 total)',
        '',
        '- [x] DS Accordion (5507:100, COMPONENT_SET)',
        '- [x] DS Alert (5507:200, COMPONENT_SET)',
        '- [ ] DS Avatar (5507:300, COMPONENT_SET)',
        '- [x] DS Button (5507:400, COMPONENT_SET)',
        '- [ ] DS Card (5507:500, COMPONENT_SET)',
      ].join('\n');

      const { components, metadata } = ManifestParser.parse(manifest);

      expect(components).toHaveLength(5);
      expect(components.filter(c => c.included)).toHaveLength(3);
      expect(metadata.file).toBe('data/library.file.json');

      const selected = components.filter(c => c.included);
      expect(selected.map(c => c.name)).toEqual(['DS Accordion', 'DS Alert', 'DS Button']);
      expect(selected.map(c => c.id)).toEqual(['5507:100', '5507:200', '5507:400']);
    });
  });
});

// ============================================================================
// SOURCE AUTO-DETECTION (T01)
// ============================================================================

describe('source auto-detection', () => {
  // These test the detection logic as documented:
  // - JSON content (starts with `{`) → file mode
  // - Markdown with `- [` → manifest mode
  // The actual detection happens in the action handler, but we can verify
  // the detection criteria by testing the same logic.

  it('JSON content is detected by leading brace', () => {
    const jsonContent = '{ "name": "test" }';
    const trimmed = jsonContent.trimStart();
    expect(trimmed.startsWith('{')).toBe(true);
    expect(trimmed.includes('- [')).toBe(false);
  });

  it('manifest content is detected by checkbox pattern', () => {
    const manifestContent = '# Manifest\n- [x] Button (1:1, COMPONENT_SET)';
    const trimmed = manifestContent.trimStart();
    expect(trimmed.includes('- [')).toBe(true);
    expect(trimmed.startsWith('{')).toBe(false);
  });

  it('JSON with leading whitespace is still detected', () => {
    const jsonContent = '  \n  { "name": "test" }';
    const trimmed = jsonContent.trimStart();
    expect(trimmed.startsWith('{')).toBe(true);
  });

  it('plain text is neither JSON nor manifest', () => {
    const plainText = 'Hello world, this is plain text.';
    const trimmed = plainText.trimStart();
    expect(trimmed.startsWith('{')).toBe(false);
    expect(trimmed.includes('- [')).toBe(false);
  });

  it('YAML is neither JSON nor manifest', () => {
    const yamlContent = 'components:\n  button:\n    title: Button';
    const trimmed = yamlContent.trimStart();
    expect(trimmed.startsWith('{')).toBe(false);
    expect(trimmed.includes('- [')).toBe(false);
  });
});

// ============================================================================
// V1 + V2 MANIFEST DETECTION & DISPATCH (issue #101)
// ============================================================================

describe('manifest format detection (v1 + v2)', () => {
  // Mirrors the detection logic in GenerateCommand.action:
  //   const isV2Manifest = ManifestParserV2.isV2(sourceContent);
  //   const isV1Manifest = trimmed.includes('- [');
  //   const isManifest = isV2Manifest || isV1Manifest;
  //   const isJson = trimmed.startsWith('{');
  function detect(content: string) {
    const trimmed = content.trimStart();
    const isV2Manifest = ManifestParserV2.isV2(content);
    const isV1Manifest = trimmed.includes('- [');
    return {
      isV2Manifest,
      isV1Manifest,
      isManifest: isV2Manifest || isV1Manifest,
      isJson: trimmed.startsWith('{'),
    };
  }

  const V2_TABLE = [
    '# Component Manifest',
    '',
    '**Scan format version:** 2  ',
    '**File:** data/specs-testing.file.json',
    '',
    '## Components',
    '',
    '| ✓ | Name | ID | Type | Dev Status |',
    '|------|------|------|------|------------|',
    '| [x] | DS Button | 639:11013 | COMPONENT_SET | NONE |',
  ].join('\n');

  const V1_LIST = [
    '# Component Manifest',
    '',
    '**File:** data/specs-testing.file.json',
    '',
    '- [x] DS Button (639:11013, COMPONENT_SET)',
  ].join('\n');

  it('detects a v2 table manifest as a manifest (was the #101 regression)', () => {
    const d = detect(V2_TABLE);
    expect(d.isV2Manifest).toBe(true);
    expect(d.isManifest).toBe(true);
    expect(d.isJson).toBe(false);
  });

  it('still detects a v1 checkbox-list manifest as a manifest', () => {
    const d = detect(V1_LIST);
    expect(d.isV1Manifest).toBe(true);
    expect(d.isManifest).toBe(true);
    expect(d.isJson).toBe(false);
  });

  it('detects raw JSON as file mode, not manifest', () => {
    const d = detect('{ "name": "library", "components": {} }');
    expect(d.isManifest).toBe(false);
    expect(d.isJson).toBe(true);
  });

  it('rejects unrecognized content (neither manifest nor JSON)', () => {
    const d = detect('just some prose without checkboxes or a version header');
    expect(d.isManifest).toBe(false);
    expect(d.isJson).toBe(false);
  });

  it('dispatches v2 content to ManifestParserV2', () => {
    const { components, metadata } = ManifestParserV2.parse(V2_TABLE);
    expect(metadata.scanFormatVersion).toBe(2);
    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({ id: '639:11013', name: 'DS Button', included: true });
  });

  it('dispatches v1 content to the legacy ManifestParser', () => {
    const { components, metadata } = ManifestParser.parse(V1_LIST);
    expect(metadata.file).toBe('data/specs-testing.file.json');
    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({ id: '639:11013', name: 'DS Button', included: true });
  });
});

// ============================================================================
// LICENSE KEY RESOLUTION (T04)
// ============================================================================

describe('license key resolution', () => {
  // The resolution logic in GenerateCommand:
  //   const licenseKey = options.license || process.env.ANOVA_LICENSE_KEY;
  //   const licenseInput = licenseKey ? { key: licenseKey } : undefined;

  it('--license flag produces license input', () => {
    const optionsLicense = 'lic_abc';
    const envKey = undefined;
    const licenseKey = optionsLicense || envKey;
    expect(licenseKey).toBe('lic_abc');
    expect(licenseKey ? { key: licenseKey } : undefined).toEqual({ key: 'lic_abc' });
  });

  it('env var produces license input when no flag', () => {
    const optionsLicense = undefined;
    const envKey = 'lic_env';
    const licenseKey = optionsLicense || envKey;
    expect(licenseKey).toBe('lic_env');
    expect(licenseKey ? { key: licenseKey } : undefined).toEqual({ key: 'lic_env' });
  });

  it('--license flag wins over env var', () => {
    const optionsLicense = 'lic_flag';
    const envKey = 'lic_env';
    const licenseKey = optionsLicense || envKey;
    expect(licenseKey).toBe('lic_flag');
  });

  it('neither flag nor env var produces undefined', () => {
    const optionsLicense = undefined;
    const envKey = undefined;
    const licenseKey = optionsLicense || envKey;
    expect(licenseKey).toBeUndefined();
    expect(licenseKey ? { key: licenseKey } : undefined).toBeUndefined();
  });
});

// ============================================================================
// LICENSE STATUS DISPLAY (T05)
// ============================================================================

describe('displayLicenseStatus', () => {
  let logSpy: MockInstance;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function makeResult(licenseLevel: string, licenseStatus: string): ComponentsData[] {
    return [{
      name: 'Button',
      component: {
        title: 'Button',
        metadata: {
          generator: {
            license: { level: licenseLevel, status: licenseStatus }
          }
        }
      }
    }] as any;
  }

  it('displays PRO (active) for active PRO license', () => {
    LicenseStatus.display(makeResult('PRO', 'active'), true);

    expect(logSpy).toHaveBeenCalledWith('License: PRO (active)');
  });

  it('displays FREE (invalid) for invalid key', () => {
    LicenseStatus.display(makeResult('FREE', 'invalid'), true);

    expect(logSpy).toHaveBeenCalledWith('License: FREE (invalid — key not recognized)');
  });

  it('displays FREE (expired) for expired key', () => {
    LicenseStatus.display(makeResult('FREE', 'expired'), true);

    expect(logSpy).toHaveBeenCalledWith('License: FREE (expired — key expired)');
  });

  it('displays FREE (activation-limit-reached) for exhausted seats', () => {
    LicenseStatus.display(makeResult('FREE', 'activation-limit-reached'), true);

    expect(logSpy).toHaveBeenCalledWith(
      'License: FREE (activation-limit-reached — all seats consumed for this key)'
    );
  });

  it('displays FREE (network-error) for license server failure', () => {
    LicenseStatus.display(makeResult('FREE', 'network-error'), true);

    expect(logSpy).toHaveBeenCalledWith(
      'License: FREE (network-error — could not reach license server)'
    );
  });

  it('displays nothing when no license key was provided', () => {
    LicenseStatus.display(makeResult('FREE', 'active'), false);

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('displays nothing when results have no successful components', () => {
    const errorResults: ComponentsData[] = [
      { name: 'Button', error: 'Component not found' } as any
    ];

    LicenseStatus.display(errorResults, true);

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('displays nothing when component has no generator metadata', () => {
    const results: ComponentsData[] = [{
      name: 'Button',
      component: { title: 'Button', metadata: {} }
    }] as any;

    LicenseStatus.display(results, true);

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('displays nothing when component has no license in generator', () => {
    const results: ComponentsData[] = [{
      name: 'Button',
      component: { title: 'Button', metadata: { generator: {} } }
    }] as any;

    LicenseStatus.display(results, true);

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('uses first successful result for license info (multiple results)', () => {
    const results: ComponentsData[] = [
      { name: 'Button', error: 'failed' } as any,
      {
        name: 'Alert',
        component: {
          title: 'Alert',
          metadata: { generator: { license: { level: 'PRO', status: 'active' } } }
        }
      } as any,
      {
        name: 'Modal',
        component: {
          title: 'Modal',
          metadata: { generator: { license: { level: 'PRO', status: 'active' } } }
        }
      } as any
    ];

    LicenseStatus.display(results, true);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('License: PRO (active)');
  });

  it('handles unknown status gracefully', () => {
    LicenseStatus.display(makeResult('FREE', 'some-future-status'), true);

    // Falls through to default: uses status as its own description
    expect(logSpy).toHaveBeenCalledWith('License: FREE (some-future-status — some-future-status)');
  });
});

// ============================================================================
// OUTPUT PATH RESOLUTION (#34)
// ============================================================================

describe('output path resolution', () => {
  // Tests the logic that prevents EISDIR when outputDirectory is an existing
  // directory in single-file mode. The fix appends `library.{format}` when
  // outputPath is an existing directory and no split mode is active.

  it('appends default filename when outputPath is a directory in single-file mode', () => {
    // Simulates the fix logic from GenerateCommand
    const isSingleFileMode = true;
    const isDirectory = true;
    const outputPath = '/project/specs';
    const resolvedFormat = 'yaml';

    const result = (isSingleFileMode && isDirectory)
      ? `${outputPath}/library.${resolvedFormat}`
      : outputPath;

    expect(result).toBe('/project/specs/library.yaml');
  });

  it('appends library.json when format is json', () => {
    const isSingleFileMode = true;
    const isDirectory = true;
    const outputPath = '/project/specs';
    const resolvedFormat = 'json';

    const result = (isSingleFileMode && isDirectory)
      ? `${outputPath}/library.${resolvedFormat}`
      : outputPath;

    expect(result).toBe('/project/specs/library.json');
  });

  it('does not modify outputPath in split-components mode even if path is a directory', () => {
    const isSingleFileMode = false; // splitComponents is true
    const isDirectory = true;
    const outputPath = '/project/specs';
    const resolvedFormat = 'yaml';

    const result = (isSingleFileMode && isDirectory)
      ? `${outputPath}/library.${resolvedFormat}`
      : outputPath;

    expect(result).toBe('/project/specs');
  });

  it('does not modify outputPath when path is a file (not a directory)', () => {
    const isSingleFileMode = true;
    const isDirectory = false;
    const outputPath = '/project/specs.yaml';
    const resolvedFormat = 'yaml';

    const result = (isSingleFileMode && isDirectory)
      ? `${outputPath}/library.${resolvedFormat}`
      : outputPath;

    expect(result).toBe('/project/specs.yaml');
  });
});

// ============================================================================
// RESULT DISCRIMINATION
// ============================================================================

describe('result discrimination', () => {
  // Tests the pattern used in GenerateCommand to separate successes from errors:
  //   for (const result of results) {
  //     if ('component' in result) { ... success ... }
  //     else { ... error ... }
  //   }

  it('success results have component property', () => {
    const success: ComponentsData = {
      name: 'Button',
      component: { title: 'Button' }
    } as any;

    expect('component' in success).toBe(true);
    expect('error' in success).toBe(false);
  });

  it('error results have error property', () => {
    const error: ComponentsData = {
      name: 'Button',
      error: 'Component not found'
    } as any;

    expect('error' in error).toBe(true);
    expect('component' in error).toBe(false);
  });

  it('mixed results are separated correctly', () => {
    const results: ComponentsData[] = [
      { name: 'Button', component: { title: 'Button' } } as any,
      { name: 'Alert', error: 'Component not found' } as any,
      { name: 'Modal', component: { title: 'Modal' } } as any,
    ];

    const successes = results.filter(r => 'component' in r);
    const errors = results.filter(r => 'error' in r);

    expect(successes).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toHaveProperty('name', 'Alert');
  });
});
