import { defineConfig } from 'vitest/config';
import path from 'path';
import fs from 'fs';

/**
 * Two kinds of source are authored in their own format and imported as strings:
 * skills as markdown, and the `specs init` scaffold as YAML. The CLI build does this
 * with esbuild's `--loader:.md=text --loader:.yaml=text`; vite has no equivalent
 * default, so a test importing either index fails parsing the file as JS. This
 * mirrors the build's loaders so the two agree — a skill and a scaffold are text in
 * both.
 */
const textFormats = {
  name: 'text-formats',
  transform(_code: string, id: string) {
    if (!id.endsWith('.md') && !id.endsWith('.yaml')) return null;
    return { code: `export default ${JSON.stringify(fs.readFileSync(id, 'utf8'))};`, map: null };
  },
};

export default defineConfig({
  plugins: [textFormats],
  define: {
    __SPECS_CLI_VERSION__: JSON.stringify('test'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['packages/*/tests/**/*.test.ts'],
    typecheck: {
      include: ['packages/*/tests/**/*.test-d.ts'],
    },
    exclude: ['node_modules'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/types.ts'],
    },
  },
});
