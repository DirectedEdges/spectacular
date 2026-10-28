import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFileWriter } from '../../../src/writers/ComponentFileWriter.js';
import { FileManifest } from '../../../src/writers/FileManifest.js';
import type { OutputConfig } from '../../../src/writers/outputConfig.js';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';

const testDir = path.join(__dirname, '../../tmp/test-component-writer-' + Date.now());

describe('ComponentFileWriter', () => {
  beforeEach(async () => {
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  const mockComponents = [
    {
      name: 'Button',
      spec: {
        title: 'Button',
        anatomy: { root: { type: 'container' } },
        props: [],
        default: { name: 'default', layout: [], elements: {} },
        variants: [],
        metadata: { plugin: { version: 6 } }
      }
    },
    {
      name: 'Alert',
      spec: {
        title: 'Alert',
        anatomy: { root: { type: 'container' } },
        props: [],
        default: { name: 'default', layout: [], elements: {} },
        variants: [],
        metadata: { plugin: { version: 6 } }
      }
    }
  ];

  describe('flat mode', () => {
    it('should write separate files for each component', async () => {
      const config: OutputConfig = {
        splitComponents: true,
        splitConcerns: false,
        useSubfolders: false,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(mockComponents, config, testDir);
      const writer = new ComponentFileWriter(false);

      const result = await writer.write(manifest);

      expect(result.errors).toHaveLength(0);
      expect(result.filesWritten).toHaveLength(2);

      const buttonPath = path.join(testDir, 'button.yaml');
      const alertPath = path.join(testDir, 'alert.yaml');

      expect(await fs.pathExists(buttonPath)).toBe(true);
      expect(await fs.pathExists(alertPath)).toBe(true);

      const buttonContent = yaml.parse(await fs.readFile(buttonPath, 'utf-8'));
      expect(buttonContent.title).toBe('Button');

      const alertContent = yaml.parse(await fs.readFile(alertPath, 'utf-8'));
      expect(alertContent.title).toBe('Alert');
    });
  });

  describe('subfolder mode', () => {
    it('should create component directories', async () => {
      const config: OutputConfig = {
        splitComponents: true,
        splitConcerns: false,
        useSubfolders: true,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(mockComponents, config, testDir);
      const writer = new ComponentFileWriter(true);

      const result = await writer.write(manifest);

      expect(result.errors).toHaveLength(0);
      expect(result.filesWritten).toHaveLength(2);

      const buttonPath = path.join(testDir, 'button', 'button.yaml');
      const alertPath = path.join(testDir, 'alert', 'alert.yaml');

      expect(await fs.pathExists(buttonPath)).toBe(true);
      expect(await fs.pathExists(alertPath)).toBe(true);
    });
  });

  it('should batch directory creation', async () => {
    const config: OutputConfig = {
      splitComponents: true,
      splitConcerns: false,
      useSubfolders: true,
      defaultFormat: 'yaml'
    };

    const manifest = new FileManifest(mockComponents, config, testDir);
    const writer = new ComponentFileWriter(true);

    await writer.write(manifest);

    // Verify both directories exist
    expect(await fs.pathExists(path.join(testDir, 'button'))).toBe(true);
    expect(await fs.pathExists(path.join(testDir, 'alert'))).toBe(true);
  });

  it('should warn for each overwritten file', async () => {
    const config: OutputConfig = {
      splitComponents: true,
      splitConcerns: false,
      useSubfolders: false,
      defaultFormat: 'yaml'
    };

    // Create existing files
    await fs.writeFile(path.join(testDir, 'button.yaml'), 'old', 'utf-8');
    await fs.writeFile(path.join(testDir, 'alert.yaml'), 'old', 'utf-8');

    const manifest = new FileManifest(mockComponents, config, testDir);
    const writer = new ComponentFileWriter(false);

    const result = await writer.write(manifest);

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('alert.yaml');
    expect(result.warnings[1]).toContain('button.yaml');
  });
});
