import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CombinedFileWriter } from '../../../src/writers/CombinedFileWriter.js';
import { FileManifest } from '../../../src/writers/FileManifest.js';
import type { OutputConfig } from '../../../src/writers/outputConfig.js';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';

const testDir = path.join(__dirname, '../../tmp/test-combined-writer-' + Date.now());

describe('CombinedFileWriter', () => {
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

  it('should create component directories with concern files', async () => {
    const config: OutputConfig = {
      splitComponents: true,
      splitConcerns: true,
      useSubfolders: false,
      defaultFormat: 'yaml'
    };

    const manifest = new FileManifest(mockComponents, config, testDir);
    const writer = new CombinedFileWriter();

    const result = await writer.write(manifest);

    expect(result.errors).toHaveLength(0);
    expect(result.filesWritten).toHaveLength(4); // 2 components x 2 concerns

    const buttonApiPath = path.join(testDir, 'button', 'api.yaml');
    const buttonVariantsPath = path.join(testDir, 'button', 'variants.yaml');
    const alertApiPath = path.join(testDir, 'alert', 'api.yaml');
    const alertVariantsPath = path.join(testDir, 'alert', 'variants.yaml');

    expect(await fs.pathExists(buttonApiPath)).toBe(true);
    expect(await fs.pathExists(buttonVariantsPath)).toBe(true);
    expect(await fs.pathExists(alertApiPath)).toBe(true);
    expect(await fs.pathExists(alertVariantsPath)).toBe(true);
  });

  it('should separate concerns within each component directory', async () => {
    const config: OutputConfig = {
      splitComponents: true,
      splitConcerns: true,
      useSubfolders: false,
      defaultFormat: 'yaml'
    };

    const manifest = new FileManifest(mockComponents, config, testDir);
    const writer = new CombinedFileWriter();

    await writer.write(manifest);

    const buttonApiContent = yaml.parse(
      await fs.readFile(path.join(testDir, 'button', 'api.yaml'), 'utf-8')
    );
    const buttonVariantsContent = yaml.parse(
      await fs.readFile(path.join(testDir, 'button', 'variants.yaml'), 'utf-8')
    );

    // API file should have title, anatomy, props (no components wrapper)
    expect(buttonApiContent).toHaveProperty('title', 'Button');
    expect(buttonApiContent).toHaveProperty('anatomy');
    expect(buttonApiContent).toHaveProperty('props');
    expect(buttonApiContent).not.toHaveProperty('default');
    expect(buttonApiContent).not.toHaveProperty('variants');
    expect(buttonApiContent).not.toHaveProperty('components');

    // Variants file should have default, variants
    expect(buttonVariantsContent).toHaveProperty('default');
    expect(buttonVariantsContent).toHaveProperty('variants');
    expect(buttonVariantsContent).not.toHaveProperty('anatomy');
    expect(buttonVariantsContent).not.toHaveProperty('props');
    expect(buttonVariantsContent).not.toHaveProperty('components');
  });

  it('should batch create all component directories', async () => {
    const config: OutputConfig = {
      splitComponents: true,
      splitConcerns: true,
      useSubfolders: false,
      defaultFormat: 'yaml'
    };

    const manifest = new FileManifest(mockComponents, config, testDir);
    const writer = new CombinedFileWriter();

    await writer.write(manifest);

    expect(await fs.pathExists(path.join(testDir, 'button'))).toBe(true);
    expect(await fs.pathExists(path.join(testDir, 'alert'))).toBe(true);
  });

  it('should include concern metadata in each file', async () => {
    const config: OutputConfig = {
      splitComponents: true,
      splitConcerns: true,
      useSubfolders: false,
      defaultFormat: 'yaml'
    };

    const manifest = new FileManifest(mockComponents, config, testDir);
    const writer = new CombinedFileWriter();

    await writer.write(manifest);

    const buttonApiContent = yaml.parse(
      await fs.readFile(path.join(testDir, 'button', 'api.yaml'), 'utf-8')
    );
    const buttonVariantsContent = yaml.parse(
      await fs.readFile(path.join(testDir, 'button', 'variants.yaml'), 'utf-8')
    );

    expect(buttonApiContent.metadata).toHaveProperty('lastUpdated');
    expect(buttonApiContent.metadata).toHaveProperty('concern', 'api');

    expect(buttonVariantsContent.metadata).toHaveProperty('lastUpdated');
    expect(buttonVariantsContent.metadata).toHaveProperty('concern', 'variants');
  });
});
