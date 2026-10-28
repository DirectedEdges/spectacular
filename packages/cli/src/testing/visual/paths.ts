// Where visual-testing state lives, and the small file helpers every stage
// shares. State is the workspace's own `testing/visual/` directory — NOT under
// storybook/, which `specs storybook` generates wholesale and `init --force`
// rewrites; a hand-tuned ignore file kept there is a file waiting to be
// overwritten.
//
// The layout:
//
//   figma/<kind>/<key>/<nodeId>.png              one baseline, every platform
//   render/<target>/<kind>/<key>/<nodeId>.png    what that platform emitted
//   diff/<target>/<kind>/<key>/<nodeId>.png      and its triptych
//   accepted/<target>/<kind>/<key>/<nodeId>.png  the regression baseline
//   report/<fidelity|regression>.<target>.{json,md}
//
// Kind comes before key everywhere because a component and a composition may
// legally share a name. Target comes before kind because everything under it
// is one platform's output, and the trees are deleted and rebuilt per platform.
import fs from 'fs-extra';
import path from 'path';
import { resolveWorkspace, type Workspace } from '../../storybook/workspace.js';
import { kindDir, type SpecKind, type Target } from './types.js';

export interface VisualWorkspace {
  ws: Workspace;
  /** <workspace>/testing/visual */
  root: string;
  manifestPath: string;
  ignorePath: string;
  reportDir: string;
  /**
   * The Figma baseline tree, keyed kind-first. One export is the truth for
   * every platform, so it carries no target.
   */
  dirFor(tree: 'figma', kind: SpecKind, key: string): string;
  /**
   * The per-platform trees, keyed target-first then kind. Without the target
   * segment a Web Components shoot overwrote the React screenshots in place,
   * and the diff — which reads whichever files are present — scored one
   * platform's renders against the other's report.
   */
  dirFor(tree: 'render' | 'diff' | 'accepted', kind: SpecKind, key: string, target: Target): string;
}

export function resolveVisual(configPath?: string): VisualWorkspace {
  const ws = resolveWorkspace(configPath);
  const root = path.join(ws.root, 'testing', 'visual');
  return {
    ws,
    root,
    manifestPath: path.join(root, 'manifest.json'),
    ignorePath: path.join(root, 'visual-ignore.yaml'),
    reportDir: path.join(root, 'report'),
    dirFor(tree: string, kind: SpecKind, key: string, target?: Target): string {
      return tree === 'figma'
        ? path.join(root, tree, kindDir(kind), key)
        : path.join(root, tree, target as Target, kindDir(kind), key);
    },
  };
}

/** Node ids contain ':'; keep files portable. */
export function sanitizeNodeId(nodeId: string): string {
  return nodeId.replace(/:/g, '-');
}

export function readJson<T = unknown>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

// The Storybook port lives in ../../storybook/port.ts, resolved once for every
// command that needs it. This file used to carry a second copy of the regex
// that reads it out of the scaffolded npm script.
