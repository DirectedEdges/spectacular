import { describe, it, expect, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { createProgram } from '../../src/index.js';

type RunResult = {
  exitCode?: number;
  stdout: string[];
  stderr: string[];
};

async function runCli(args: string[], env?: Record<string, string | undefined>): Promise<RunResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const originalEnv = { ...process.env };
  if (env) {
    process.env = { ...process.env, ...env };
  }

  let exitCode: number | undefined;

  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
    const resolvedCode = typeof code === 'number' ? code : typeof code === 'string' ? Number(code) : 0;
    if (exitCode === undefined) {
      exitCode = Number.isFinite(resolvedCode) ? resolvedCode : 0;
    }
    throw new Error(`process.exit:${exitCode}`);
  });
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(' '));
  });
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderr.push(args.map(String).join(' '));
  });

  try {
    const program = createProgram();
    await program.parseAsync(args, { from: 'user' });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('process.exit:')) {
      throw error;
    }
  } finally {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.env = originalEnv;
  }

  return { exitCode, stdout, stderr };
}

describe('CLI integration', () => {
  it('runs scan and writes a manifest', async () => {
    const testDir = path.join(process.cwd(), 'tests', 'tmp', `cli-scan-${Date.now()}`);
    await fs.ensureDir(testDir);

    const filePath = path.join(testDir, 'library.json');
    const outputPath = path.join(testDir, 'components.md');

    const data = {
      name: 'Test Library',
      document: {
        id: '0:0',
        name: 'Document',
        type: 'DOCUMENT',
        children: [
          {
            id: '1:1',
            name: 'Page',
            type: 'CANVAS',
            children: [
              { id: '2:1', name: 'Alert', type: 'COMPONENT', children: [] },
              {
                id: '3:1',
                name: 'Button Set',
                type: 'COMPONENT_SET',
                children: [
                  { id: '3:2', name: 'Button/Primary', type: 'COMPONENT', children: [] }
                ]
              }
            ]
          }
        ]
      }
    };

    await fs.writeJSON(filePath, data);

    const result = await runCli(['scan', filePath, '--output', outputPath]);

    expect(result.exitCode).toBe(0);
    expect(await fs.pathExists(outputPath)).toBe(true);

    await fs.remove(testDir);
  });

  it('exits with FILE_ERROR for missing generate input', async () => {
    const result = await runCli(['generate', 'missing.json', '--component', 'Button']);
    expect(result.exitCode).toBe(3);
  });

  it('exits with FILE_ERROR for missing generate manifest', async () => {
    const result = await runCli(['generate', 'missing.md']);
    expect(result.exitCode).toBe(3);
  });

  it('exits with INVALID_ARGS when FIGMA_TOKEN is missing', async () => {
    const result = await runCli(['fetch'], { FIGMA_TOKEN: undefined });
    expect(result.exitCode).toBe(2);
  });

  it('init creates a config file at the requested path', async () => {
    const testDir = path.join(process.cwd(), 'tests', 'tmp', `cli-init-${Date.now()}`);
    await fs.ensureDir(testDir);

    const configPath = path.join(testDir, 'specs.config.yaml');
    const result = await runCli(['init', '--config', configPath]);

    expect(result.exitCode).toBeUndefined();
    expect(await fs.pathExists(configPath)).toBe(true);

    await fs.remove(testDir);
  });

  it('author start writes the three concern files and prints the digest', async () => {
    const testDir = path.join(process.cwd(), 'tests', 'tmp', `cli-author-${Date.now()}`);
    const configDir = path.join(testDir, 'config');
    const specsDir = path.join(testDir, 'specs');
    await fs.ensureDir(configDir);
    await fs.writeFile(path.join(configDir, 'settings.yaml'), 'spec:\n  format: YAML\n');

    const result = await runCli(['author', 'start', 'badge', '--config', configDir, '-o', specsDir]);

    expect(result.exitCode).toBe(0);
    for (const file of ['api.yaml', 'variants.yaml', 'examples.yaml']) {
      expect(await fs.pathExists(path.join(specsDir, 'components', 'badge', file))).toBe(true);
    }
    const printed = result.stdout.join('\n');
    expect(printed).toContain('badge');
    expect(printed).toContain('catalogue');
    expect(printed).toContain('posture');

    const again = await runCli(['author', 'start', 'badge', '--config', configDir, '-o', specsDir]);
    expect(again.exitCode).toBe(3); // FILE_ERROR — start never overwrites

    await fs.remove(testDir);
  });
});
