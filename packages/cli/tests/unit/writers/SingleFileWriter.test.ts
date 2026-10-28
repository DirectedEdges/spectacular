import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SingleFileWriter } from '../../../src/writers/SingleFileWriter.js';
import { FileManifest } from '../../../src/writers/FileManifest.js';
import type { OutputConfig } from '../../../src/writers/outputConfig.js';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';

const testDir = path.join(__dirname, '../../tmp/test-single-writer-' + Date.now());

describe('SingleFileWriter', () => {
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

  it('should write single file with all components', async () => {
    const config: OutputConfig = {
      splitComponents: false,
      splitConcerns: false,
      useSubfolders: false,
      defaultFormat: 'yaml'
    };

    const outputPath = path.join(testDir, 'library.yaml');
    const manifest = new FileManifest(mockComponents, config, testDir, 'library.yaml');
    const writer = new SingleFileWriter();

    const result = await writer.write(manifest);

    expect(result.errors).toHaveLength(0);
    expect(result.filesWritten).toHaveLength(1);
    expect(result.filesWritten[0]).toContain('library.yaml');

    const exists = await fs.pathExists(outputPath);
    expect(exists).toBe(true);

    const content = await fs.readFile(outputPath, 'utf-8');
    const parsed = yaml.parse(content);

    expect(parsed).toHaveProperty('components');
    expect(parsed.components).toHaveProperty('button');
    expect(parsed.components).toHaveProperty('alert');
  });

  it('should format YAML with 2-space indentation', async () => {
    const config: OutputConfig = {
      splitComponents: false,
      splitConcerns: false,
      useSubfolders: false,
      defaultFormat: 'yaml'
    };

    const outputPath = path.join(testDir, 'library.yaml');
    const manifest = new FileManifest(mockComponents, config, testDir, 'library.yaml');
    const writer = new SingleFileWriter();

    await writer.write(manifest);

    const content = await fs.readFile(outputPath, 'utf-8');
    const lines = content.split('\n');

    // Check indentation is consistent with 2 spaces
    const indentedLines = lines.filter(line => line.match(/^\s+\w/));
    indentedLines.forEach(line => {
      const spaces = line.match(/^(\s+)/)?.[1].length || 0;
      expect(spaces % 2).toBe(0); // Should be multiple of 2
    });
  });

  it('should warn when overwriting existing file', async () => {
    const config: OutputConfig = {
      splitComponents: false,
      splitConcerns: false,
      useSubfolders: false,
      defaultFormat: 'yaml'
    };

    const outputPath = path.join(testDir, 'library.yaml');

    // Create existing file
    await fs.writeFile(outputPath, 'existing content', 'utf-8');

    const manifest = new FileManifest(mockComponents, config, testDir, 'library.yaml');
    const writer = new SingleFileWriter();

    const result = await writer.write(manifest);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Overwriting existing file');
    expect(result.warnings[0]).toContain('library.yaml');
  });

  it('should handle write errors gracefully', async () => {
    const config: OutputConfig = {
      splitComponents: false,
      splitConcerns: false,
      useSubfolders: false,
      defaultFormat: 'yaml'
    };

    // Use invalid path that will cause write error
    const manifest = new FileManifest(mockComponents, config, '/invalid/path/that/does/not/exist', 'library.yaml');
    const writer = new SingleFileWriter();

    const result = await writer.write(manifest);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Failed to write');
  });
});
