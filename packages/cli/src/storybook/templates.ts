// Template access. Templates are inert text files the CLI never imports —
// init and publish read them from disk and write parameterized copies into
// the customer's workspace (ADR A).
import crypto from 'node:crypto';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * The Storybook release these templates were built and tested against (ADR A
 * decision 3). Substituted into the scaffolded package.json and into the
 * host's own outside-tested-range report in main.ts.
 */
export const STORYBOOK_VERSION = '10.6.1';
export const STORYBOOK_MAJOR = STORYBOOK_VERSION.split('.')[0];

/**
 * Where the template files live. The published package carries them at
 * dist/storybook-templates/ (the build copies them beside the bundle);
 * running from a repo checkout finds them in src/.
 *
 * The source directory is tried FIRST, because its existence is what
 * distinguishes a checkout from an install — a published package has no src/.
 * In a checkout both directories exist, and only src/ is current: `npm run
 * build` copies the templates into dist/, but the watcher that development
 * actually runs only re-bundles the program. Preferring dist/ there served a
 * new template from a directory that had never heard of it, so adding a page
 * failed with ENOENT on a file plainly present in the tree.
 */
export function templatesDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, '..', 'src', 'storybook', 'templates'),
    path.join(here, 'storybook-templates'),
    path.join(here, '..', 'storybook-templates'),
    path.join(here, 'templates'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error(`storybook templates not found — looked in:\n  ${candidates.join('\n  ')}`);
}

export function readTemplate(relPath: string): string {
  return fs.readFileSync(path.join(templatesDir(), relPath), 'utf-8');
}

/** Replace every `{{KEY}}` with its value. Unknown placeholders are an error. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  const rendered = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key: string) => {
    if (!(key in vars)) throw new Error(`template placeholder {{${key}}} has no value`);
    return vars[key];
  });
  return rendered;
}


/**
 * One hash over every template this CLI ships. Stamped into the scaffold at
 * init and compared at publish, so a host left behind by a CLI upgrade is
 * *announced* rather than silently stale — publish still never touches it
 * (ADR A); upgrading stays the customer's explicit `init --force`.
 */
export function templatesHash(): string {
  const dir = templatesDir();
  const hash = crypto.createHash('sha256');
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d).sort()) {
      const full = path.join(d, entry);
      if (fs.statSync(full).isDirectory()) walk(full);
      else {
        hash.update(path.relative(dir, full));
        hash.update(fs.readFileSync(full));
      }
    }
  };
  walk(dir);
  return hash.digest('hex').slice(0, 16);
}
