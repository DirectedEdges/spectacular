// `specs storybook publish` — rewrite the generated content tree, one concern
// folder at a time, wholesale (ADR A decision 2). Never writes host config,
// never writes content-overrides/.
import fs from 'fs-extra';
import path from 'path';
import type { Workspace } from './workspace.js';
import { registry, concernNames } from './concerns/registry.js';
import { templatesHash } from './templates.js';

export interface PublishResult {
  /** Concern → { written, changed, removed } file counts. */
  concerns: Record<string, { written: number; changed: number; removed: number }>;
  /** Override files currently shadowing generated pages, workspace-relative. */
  overrides: string[];
  /** Overrides whose concern's data files changed in this run — divergence to tell the customer about. */
  divergedOverrides: string[];
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function pruneEmptyDirs(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(path.join(dir, entry.name));
  }
  if (fs.readdirSync(dir).length === 0) fs.removeSync(dir);
}

export async function publish(ws: Workspace, concernName?: string): Promise<PublishResult> {
  // ADR-098: conventions/storybook.yaml is concern-keyed. A key naming no
  // publish concern is ignored WITH a warning — a silently ignored block is
  // indistinguishable from a working one. (Concern pages may consume blocks
  // named after foundations pages too, so those keys are also legitimate.)
  //
  // `host` is legitimate and deliberately not a publish concern: it says where
  // the Storybook is served, which publish has no part in writing.
  const conventionKeys = Object.keys(ws.config.conventions.storybook ?? {});
  const legitimate = new Set([...concernNames(), 'host', 'color', 'typography', 'icons', 'modes']);
  for (const key of conventionKeys) {
    if (!legitimate.has(key)) {
      console.warn(`⚠ conventions/storybook.yaml: unknown concern "${key}" ignored (known: ${[...legitimate].join(', ')})`);
    }
  }

  // Announce a host left behind by a CLI upgrade — publish never rewrites host
  // files (ADR A), so staleness must at least be said out loud. `init --force`
  // is the upgrade, and it never touches content-overrides/.
  const stampPath = path.join(ws.storybookDir, '.storybook', 'scaffold.json');
  if (fs.existsSync(stampPath)) {
    try {
      const stamp = JSON.parse(fs.readFileSync(stampPath, 'utf-8')) as { templates?: string };
      if (stamp.templates && stamp.templates !== templatesHash()) {
        console.warn('⚠ The Storybook host was scaffolded by an older CLI — run `specs storybook init --force` (host files only; content-overrides/ is never touched), then restart the server.');
      }
    } catch {
      // An unreadable stamp is not worth failing a publish over.
    }
  }

  const selected = concernName ? registry.filter((c) => c.name === concernName) : registry;
  if (concernName && selected.length === 0) {
    throw new Error(`unknown concern "${concernName}" — concerns: ${concernNames().join(', ')}`);
  }

  const contentDir = path.join(ws.storybookDir, 'content');
  const overridesDir = path.join(ws.storybookDir, 'content-overrides');
  const result: PublishResult = { concerns: {}, overrides: [], divergedOverrides: [] };
  const changedDataByConcern = new Map<string, boolean>();

  for (const concern of selected) {
    if (!concern.detect(ws)) {
      // Nothing to build: the folder is removed so the section never appears
      // stale — and the removal is SAID, so a run that deletes a directory
      // never reports "nothing changed".
      const dir = path.join(contentDir, concern.name);
      if (fs.existsSync(dir)) {
        const removedCount = [...walkFiles(dir)].length;
        fs.removeSync(dir);
        result.concerns[concern.name] = { written: 0, changed: 0, removed: removedCount };
      }
      continue;
    }
    const files = await concern.build(ws);
    const dir = path.join(contentDir, concern.name);
    const wanted = new Map(files.map((f) => [path.join(dir, f.path), f.content]));

    // Override resolution lives here, not in the host's globs: a generated page
    // whose path is overridden is withheld, so the prune below removes any
    // existing twin and the statically-globbed override is the only match.
    // Both trees stay in the index the moment an override appears or vanishes —
    // Storybook's own watcher does the rest, no restart.
    for (const file of [...wanted.keys()]) {
      if (!/\.stories\.[jt]sx?$/.test(file)) continue;
      const override = path.join(overridesDir, path.relative(contentDir, file));
      if (fs.existsSync(override)) wanted.delete(file);
    }

    let changed = 0;
    let dataChanged = false;
    for (const [file, content] of wanted) {
      const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
      if (existing !== content) {
        fs.ensureDirSync(path.dirname(file));
        // Atomic: temp + rename, like every emitted file. Storybook indexes
        // these pages the moment its watcher fires, and a torn read poisons
        // its per-file index cache — a 500 that survives the file being fine
        // again. Never give a watcher a half-written file.
        const tmp = `${file}.tmp-${process.pid}`;
        fs.writeFileSync(tmp, content);
        fs.renameSync(tmp, file);
        changed++;
        if (file.includes(`${path.sep}data${path.sep}`)) dataChanged = true;
      }
    }

    let removed = 0;
    for (const existing of walkFiles(dir)) {
      if (!wanted.has(existing)) {
        fs.removeSync(existing);
        removed++;
      }
    }
    pruneEmptyDirs(dir);

    changedDataByConcern.set(concern.name, dataChanged);
    result.concerns[concern.name] = { written: wanted.size, changed, removed };
  }

  // Overrides: always rewritten generated pages mean an override is pinned to
  // the data contract it forked from — say which exist, and which sit over a
  // concern whose data moved this run (ADR A).
  for (const file of walkFiles(overridesDir)) {
    const rel = path.relative(overridesDir, file);
    result.overrides.push(path.join('storybook', 'content-overrides', rel));
    const concern = rel.split(path.sep)[0];
    if (changedDataByConcern.get(concern)) {
      result.divergedOverrides.push(path.join('storybook', 'content-overrides', rel));
    }
  }

  return result;
}
