import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConcernFileWriter } from '../../../src/writers/ConcernFileWriter.js';
import { FileManifest } from '../../../src/writers/FileManifest.js';
import type { OutputConfig } from '../../../src/writers/outputConfig.js';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';

const testDir = path.join(__dirname, '../../tmp/test-concern-writer-' + Date.now());

describe('ConcernFileWriter', () => {
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
        props: [{ id: 'variant', type: 'variant' }],
        default: { name: 'default', layout: [], elements: {} },
        variants: [{ name: 'secondary', elements: {} }],
        metadata: { plugin: { version: 6 } }
      }
    },
    {
      name: 'Alert',
      spec: {
        title: 'Alert',
        anatomy: { root: { type: 'container' } },
        props: [{ id: 'type', type: 'variant' }],
        default: { name: 'default', layout: [], elements: {} },
        variants: [{ name: 'warning', elements: {} }],
        metadata: { plugin: { version: 6 } }
      }
    }
  ];

  it('should create api.yaml and variants.yaml files', async () => {
    const config: OutputConfig = {
      splitComponents: false,
      splitConcerns: true,
      useSubfolders: false,
      defaultFormat: 'yaml'
    };

    const manifest = new FileManifest(mockComponents, config, testDir);
    const writer = new ConcernFileWriter();

    const result = await writer.write(manifest);

    expect(result.errors).toHaveLength(0);
    expect(result.filesWritten).toHaveLength(2);

    const apiPath = path.join(testDir, 'api.yaml');
    const variantsPath = path.join(testDir, 'variants.yaml');

    expect(await fs.pathExists(apiPath)).toBe(true);
    expect(await fs.pathExists(variantsPath)).toBe(true);
  });

  it('should separate API and Variants concerns correctly', async () => {
    const config: OutputConfig = {
      splitComponents: false,
      splitConcerns: true,
      useSubfolders: false,
      defaultFormat: 'yaml'
    };

    const manifest = new FileManifest(mockComponents, config, testDir);
    const writer = new ConcernFileWriter();

    await writer.write(manifest);

    const apiContent = yaml.parse(await fs.readFile(path.join(testDir, 'api.yaml'), 'utf-8'));
    const variantsContent = yaml.parse(await fs.readFile(path.join(testDir, 'variants.yaml'), 'utf-8'));

    // API file should have anatomy and props
    expect(apiContent.components.button).toHaveProperty('title');
    expect(apiContent.components.button).toHaveProperty('anatomy');
    expect(apiContent.components.button).toHaveProperty('props');
    expect(apiContent.components.button).not.toHaveProperty('default');
    expect(apiContent.components.button).not.toHaveProperty('variants');

    // Variants file should have default and variants
    expect(variantsContent.components.button).toHaveProperty('default');
    expect(variantsContent.components.button).toHaveProperty('variants');
    expect(variantsContent.components.button).not.toHaveProperty('anatomy');
    expect(variantsContent.components.button).not.toHaveProperty('props');
  });

  it('should include generation metadata in both files', async () => {
    const config: OutputConfig = {
      splitComponents: false,
      splitConcerns: true,
      useSubfolders: false,
      defaultFormat: 'yaml'
    };

    const manifest = new FileManifest(mockComponents, config, testDir);
    const writer = new ConcernFileWriter();

    await writer.write(manifest);

    const apiContent = yaml.parse(await fs.readFile(path.join(testDir, 'api.yaml'), 'utf-8'));
    const variantsContent = yaml.parse(await fs.readFile(path.join(testDir, 'variants.yaml'), 'utf-8'));

    expect(apiContent.metadata).toHaveProperty('lastUpdated');
    expect(apiContent.metadata).toHaveProperty('componentCount', 2);
    expect(apiContent.metadata).toHaveProperty('concern', 'api');

    expect(variantsContent.metadata).toHaveProperty('lastUpdated');
    expect(variantsContent.metadata).toHaveProperty('componentCount', 2);
    expect(variantsContent.metadata).toHaveProperty('concern', 'variants');
  });

  it('should include metadata in both concerns for each component', async () => {
    const config: OutputConfig = {
      splitComponents: false,
      splitConcerns: true,
      useSubfolders: false,
      defaultFormat: 'yaml'
    };

    const manifest = new FileManifest(mockComponents, config, testDir);
    const writer = new ConcernFileWriter();

    await writer.write(manifest);

    const apiContent = yaml.parse(await fs.readFile(path.join(testDir, 'api.yaml'), 'utf-8'));
    const variantsContent = yaml.parse(await fs.readFile(path.join(testDir, 'variants.yaml'), 'utf-8'));

    // Component metadata should be in both files
    expect(apiContent.components.button.metadata).toHaveProperty('plugin');
    expect(variantsContent.components.button.metadata).toHaveProperty('plugin');
  });
});
