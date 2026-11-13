/**
 * `specs author start <key>` — the opening write of an authoring round: the
 * component folder with all three concern templates, collision-checked, with
 * `title` filled. The templates are the bundled skill assets, designed to
 * validate clean as shipped, so a freshly started folder passes
 * `specs validate <key> --authored` at zero edits and every later error is one
 * the author introduced.
 */

import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import TEMPLATE_API from '../skills/templates/api.yaml';
import TEMPLATE_VARIANTS from '../skills/templates/variants.yaml';
import TEMPLATE_EXAMPLES from '../skills/templates/examples.yaml';
import { writeLayout } from '../utilities/specsLayout.js';
import { specFolderKey } from '../utilities/specFolderKey.js';

export interface StartResult {
  key: string;
  /** Workspace-relative folder path. */
  folder: string;
  wrote: string[];
}

export class StartKeyError extends Error {}
export class StartCollisionError extends Error {}

export interface StartInputs {
  specsRoot: string;
  key: string;
  /** Display title; derived from the key when not given. */
  title?: string;
  /** The workspace's spec format. JSON drops the templates' comments by nature. */
  format: 'YAML' | 'JSON';
  /** For the result's relative paths. */
  workspaceRoot: string;
}

export function startComponent(inputs: StartInputs): StartResult {
  // The folder-key shape, not a derivation: specFolderKey() turns raw Figma
  // names into keys and would mangle an already-camelCase key, so it only
  // supplies the suggestion when the given spelling is not a key.
  if (!/^[a-z][a-zA-Z0-9]*$/.test(inputs.key)) {
    const derived = specFolderKey(inputs.key);
    throw new StartKeyError(
      derived && derived !== inputs.key
        ? `key "${inputs.key}" is not a spec folder key — it derives to "${derived}"; use that spelling`
        : `key "${inputs.key}" is not a spec folder key (camelCase, starting lowercase)`,
    );
  }

  const layout = writeLayout(inputs.specsRoot);
  const folder = layout.folderFor('component', inputs.key);
  if (fs.existsSync(folder)) {
    throw new StartCollisionError(`${path.relative(inputs.workspaceRoot, folder)} already exists — start does not overwrite`);
  }

  const title = inputs.title ?? titleFromKey(inputs.key);
  const ext = inputs.format === 'JSON' ? 'json' : 'yaml';
  const files: Array<[string, string]> = [
    // Target the title line, not the first '<Name>' — the template's header
    // comment mentions the placeholder too.
    [`api.${ext}`, render(TEMPLATE_API.replace('title: <Name>', `title: ${yaml.stringify(title).trim()}`), inputs.format)],
    [`variants.${ext}`, render(TEMPLATE_VARIANTS, inputs.format)],
    [`examples.${ext}`, render(TEMPLATE_EXAMPLES, inputs.format)],
  ];

  fs.ensureDirSync(folder);
  for (const [name, content] of files) {
    fs.writeFileSync(path.join(folder, name), content, 'utf-8');
  }

  return {
    key: inputs.key,
    folder: path.relative(inputs.workspaceRoot, folder),
    wrote: files.map(([name]) => name),
  };
}

/** `iconButton` → `Icon Button`. */
export function titleFromKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function render(template: string, format: 'YAML' | 'JSON'): string {
  if (format === 'YAML') return template;
  return JSON.stringify(yaml.parse(template), null, 2) + '\n';
}
