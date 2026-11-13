/**
 * The authoring-startup digest behind `specs author status` — what exists, how
 * fresh the analysis is, where the conventions live, and whether the live
 * posture answers. Every field is deterministic from data on disk: keys,
 * paths, dates, booleans — never content a session must study (that stays in
 * the files the authoring skills read), and never a sentence composed per
 * component. Nothing here starts or repairs anything.
 */

import fs from 'fs-extra';
import path from 'path';
import { resolveSpecsLayout } from '../utilities/specsLayout.js';

export interface AnalysisFact {
  /** Workspace-relative path the report lives at (or would). */
  path: string;
  /** ISO date (day precision) of the report's last write; null when absent. */
  updated: string | null;
}

export interface AuthorStatus {
  catalogue: {
    components: string[];
    compositions: string[];
  };
  analysis: {
    props: AnalysisFact;
    dependencies: AnalysisFact;
    foundations: AnalysisFact;
    /** True when any report above is absent or predates the newest fetched payload. */
    stale: boolean;
  };
  conventions: {
    files: string[];
  };
  posture: {
    /** The pinned Storybook port read from storybook/package.json; null when unreadable. */
    storybookPort: number | null;
    up: boolean;
  };
}

/** The reports an authoring round correlates against — fixed set, not a directory walk. */
const AUTHORING_REPORTS = ['props', 'dependencies.byComponent', 'foundations'] as const;

export interface StatusInputs {
  /** The specs root (`spec.directory`). */
  specsRoot: string;
  /** The `config/` directory, when one exists. */
  configDir?: string;
  /** The fetched-data directory (`data.directory`), when configured. */
  dataDir?: string;
  /** The workspace root holding `storybook/` — the parent of `config/`. */
  workspaceRoot: string;
  /** Probe for the Storybook port; injectable for tests. */
  probe?: (port: number) => Promise<boolean>;
}

export async function buildStatus(inputs: StatusInputs): Promise<AuthorStatus> {
  const layout = resolveSpecsLayout(inputs.specsRoot);
  const analysisDir = layout.analysisDir();

  const facts = Object.fromEntries(
    AUTHORING_REPORTS.map(base => {
      const found = ['yaml', 'yml', 'json']
        .map(ext => path.join(analysisDir, `${base}.${ext}`))
        .find(p => fs.existsSync(p));
      const rel = path.join(path.basename(analysisDir), `${base}.${found ? path.extname(found).slice(1) : 'yaml'}`);
      return [base, {
        path: rel,
        updated: found ? fs.statSync(found).mtime.toISOString().slice(0, 10) : null,
      }];
    }),
  ) as Record<(typeof AUTHORING_REPORTS)[number], AnalysisFact>;

  const port = readPinnedStorybookPort(inputs.workspaceRoot);
  const probe = inputs.probe ?? probePort;

  return {
    catalogue: {
      components: layout.folderNames('component'),
      compositions: layout.folderNames('composition'),
    },
    analysis: {
      props: facts['props'],
      dependencies: facts['dependencies.byComponent'],
      foundations: facts['foundations'],
      stale: isStale(Object.values(facts), inputs.dataDir),
    },
    conventions: {
      files: conventionsFiles(inputs.configDir, inputs.workspaceRoot),
    },
    posture: {
      storybookPort: port,
      up: port !== null && (await probe(port)),
    },
  };
}

/** Workspace-relative conventions file paths, sorted. */
function conventionsFiles(configDir: string | undefined, workspaceRoot: string): string[] {
  if (!configDir) return [];
  const dir = path.join(configDir, 'conventions');
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json'))
    .map(f => path.relative(workspaceRoot, path.join(dir, f)))
    .sort();
}

/** A report set is stale when any report is absent or older than the newest fetched payload. */
function isStale(facts: AnalysisFact[], dataDir: string | undefined): boolean {
  if (facts.some(f => f.updated === null)) return true;
  if (!dataDir || !fs.existsSync(dataDir)) return false;
  const newestPayload = newestMtime(dataDir);
  if (newestPayload === 0) return false;
  const oldestReport = Math.min(...facts.map(f => new Date(`${f.updated}T23:59:59Z`).getTime()));
  return oldestReport < newestPayload;
}

/** Newest file mtime directly under `dir` and one level into its directories. */
function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const child of fs.readdirSync(full)) {
        newest = Math.max(newest, fs.statSync(path.join(full, child)).mtimeMs);
      }
    } else {
      newest = Math.max(newest, fs.statSync(full).mtimeMs);
    }
  }
  return newest;
}

/**
 * The pinned port from storybook/package.json's `storybook` script (`-p <port>`).
 * Read, never guessed — probing a default port and declaring the posture down is
 * the recorded failure this ordering exists to prevent.
 */
export function readPinnedStorybookPort(workspaceRoot: string): number | null {
  const pkgPath = path.join(workspaceRoot, 'storybook', 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { scripts?: Record<string, string> };
    const script = pkg.scripts?.storybook ?? '';
    const match = script.match(/-p\s+(\d+)/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/** One local HTTP request with a short deadline; refusal or timeout reads as down. */
async function probePort(port: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`http://localhost:${port}/`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
