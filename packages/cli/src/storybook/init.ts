// `specs storybook init` — scaffold the host, once. Writes package.json,
// tsconfig.json and .storybook/*, creates content-overrides/, and seeds
// content/components/tabs.json so the manager's build-time import resolves
// before the first publish. Prints the install step; the customer installs
// Storybook — we never ship or vendor it (ADR A decision 1).
import fs from 'fs-extra';
import path from 'path';
import type { Workspace } from './workspace.js';
import { readTemplate, renderTemplate, templatesHash, STORYBOOK_VERSION, STORYBOOK_MAJOR } from './templates.js';
import { deriveTabs, deriveModes } from './concerns/components/index.js';
import { resolveStorybookPort, type PortSource } from './port.js';

declare const __SPECS_CLI_VERSION__: string;

export interface InitOptions {
  force: boolean;
  /** `--port`, when given. Absent means resolve from the workspace (port.ts). */
  port?: string;
}

export interface InitResult {
  written: string[];
  port: string;
  /** Where the port came from, so the caller can say whether a flag was needed. */
  portSource: PortSource;
  /**
   * Declared deps the existing storybook/node_modules does not satisfy —
   * missing packages or a different major. Non-empty only when an install
   * already exists (the --force upgrade path): a rewritten package.json
   * changes nothing on disk until the customer reinstalls, and the new
   * main.ts imports packages the old install never held.
   */
  staleInstall: string[];
}

/** Files init owns. `--force` rewrites exactly these — never content/ or content-overrides/. */
const HOST_FILES: Array<{ out: string; template: string }> = [
  { out: 'package.json', template: 'package.json.tpl' },
  { out: 'tsconfig.json', template: 'tsconfig.json.tpl' },
  { out: '.storybook/main.ts', template: 'main.ts.tpl' },
  { out: '.storybook/preview.tsx', template: 'preview.tsx.tpl' },
  { out: '.storybook/manager.tsx', template: 'manager.tsx.tpl' },
  { out: '.storybook/manager-head.html', template: 'manager-head.html.tpl' },
  { out: '.storybook/ComponentDocs.tsx', template: 'ComponentDocs.tsx.tpl' },
];

export function init(ws: Workspace, options: InitOptions): InitResult {
  const dotStorybook = path.join(ws.storybookDir, '.storybook');
  if (fs.existsSync(dotStorybook) && !options.force) {
    throw new Error(
      `storybook/.storybook/ already exists — the host is scaffolded.\n` +
      `  To refresh what the host shows, run: specs storybook\n` +
      `  To rewrite the host config itself (your edits to it are lost), run: specs storybook init --force`,
    );
  }

  const workspaceName = path.basename(ws.root);
  const cssvarsPath = path.join(ws.assetsDir, 'cssvars', 'cssvars.css');
  // The port is resolved, not defaulted: a `--force` that defaulted the flag
  // to 6006 rewrote the npm script and moved an already-running workspace off
  // its own address — including for the screenshot runner, which reads the
  // same script. A declared port now survives a rewrite, and so does an
  // existing scaffold's port when nothing declares one.
  const resolvedPort = resolveStorybookPort(ws, options.port);
  const vars: Record<string, string> = {
    WORKSPACE_NAME: workspaceName,
    PORT: String(resolvedPort.port),
    STORYBOOK_VERSION,
    STORYBOOK_MAJOR,
    // Only asset kinds present produce config entries (specs#610): a workspace
    // that never emitted a platform gets the import commented, not broken.
    CSSVARS_IMPORT: fs.existsSync(cssvarsPath)
      ? "import '../../assets/cssvars/cssvars.css';"
      : "// No generated stylesheet yet — after `specs react` or `specs webcomponents`, uncomment:\n// import '../../assets/cssvars/cssvars.css';",
  };

  const written: string[] = [];
  let packageJson = '';
  for (const file of HOST_FILES) {
    const out = path.join(ws.storybookDir, file.out);
    const content = renderTemplate(readTemplate(file.template), vars);
    if (file.out === 'package.json') packageJson = content;
    fs.ensureDirSync(path.dirname(out));
    fs.writeFileSync(out, content);
    written.push(path.join('storybook', file.out));
  }

  // The scaffold stamp: which CLI templates built this host. Publish compares
  // it so a host left behind by an upgrade is announced, never silently stale.
  fs.writeFileSync(
    path.join(dotStorybook, 'scaffold.json'),
    JSON.stringify({
      templates: templatesHash(),
      cli: typeof __SPECS_CLI_VERSION__ !== 'undefined' ? __SPECS_CLI_VERSION__ : 'dev',
      // The Storybook release the templates were tested against (ADR A):
      // the declaration half of the range report; main.ts carries the
      // runtime half.
      storybook: STORYBOOK_VERSION,
    }, null, 2) + '\n',
  );
  written.push(path.join('storybook', '.storybook', 'scaffold.json'));

  // The override tree: the customer's, from the start. No command writes into it.
  fs.ensureDirSync(path.join(ws.storybookDir, 'content-overrides'));

  // Seed tabs.json: the manager imports it at build time, so it must exist
  // before the first publish. Publish rewrites it from the same derivation.
  const tabsFile = path.join(ws.storybookDir, 'content', 'components', 'tabs.json');
  if (!fs.existsSync(tabsFile)) {
    fs.ensureDirSync(path.dirname(tabsFile));
    fs.writeFileSync(tabsFile, JSON.stringify(deriveTabs(ws), null, 2) + '\n');
    written.push(path.join('storybook', 'content', 'components', 'tabs.json'));
  }

  // Seed modes.json for the same reason: the scaffolded preview imports it.
  const modesFile = path.join(ws.storybookDir, 'content', 'components', 'modes.json');
  if (!fs.existsSync(modesFile)) {
    fs.writeFileSync(modesFile, JSON.stringify(deriveModes(ws, ws.config.conventions.storybook?.modes), null, 2) + '\n');
    written.push(path.join('storybook', 'content', 'components', 'modes.json'));
  }

  return {
    written,
    port: String(resolvedPort.port),
    portSource: resolvedPort.source,
    staleInstall: staleInstall(ws, packageJson),
  };
}

/**
 * Declared deps the existing install does not satisfy. Writing package.json
 * changes nothing in node_modules/ — a --force from an older scaffold leaves
 * an install the new host files cannot run on, and Storybook fails (or
 * worse, degrades) only at startup. Majors are compared because every range
 * the template declares is a caret range.
 */
function staleInstall(ws: Workspace, packageJson: string): string[] {
  const nodeModules = path.join(ws.storybookDir, 'node_modules');
  if (!packageJson || !fs.existsSync(nodeModules)) return [];
  const declared = JSON.parse(packageJson) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const stale: string[] = [];
  for (const [name, range] of Object.entries({ ...declared.dependencies, ...declared.devDependencies })) {
    const installedManifest = path.join(nodeModules, name, 'package.json');
    if (!fs.existsSync(installedManifest)) {
      stale.push(`${name} (${range}) is not installed`);
      continue;
    }
    let installed = '';
    try {
      installed = (JSON.parse(fs.readFileSync(installedManifest, 'utf-8')) as { version?: string }).version ?? '';
    } catch {
      continue;
    }
    const declaredMajor = /\d+/.exec(range)?.[0];
    const installedMajor = /\d+/.exec(installed)?.[0];
    if (declaredMajor && installedMajor && declaredMajor !== installedMajor) {
      stale.push(`${name}: declares ${range}, installed ${installed}`);
    }
  }
  return stale;
}
