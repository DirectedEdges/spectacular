// The one place the workspace's Storybook port is decided.
//
// A workspace's Storybook address is a fact about that workspace, and a person
// maintaining several of them wants each to answer at the same localhost every
// day. It is declared in `config/conventions/storybook.yaml`, under the `host`
// concern:
//
//   host:
//     port: 6101
//
// No schema change carries that: `StorybookConventions` is open at both levels,
// in the type and in the JSON schema, precisely so a concern can be added as
// its vocabulary settles (ADR-098). `host` is the first concern about serving
// the Storybook rather than about what a page shows.
//
// Before this, the port existed only inside the generated `storybook/package.json`
// npm script — a file `init --force` rewrites — and was read back out of it by
// two separate regexes that disagreed on return type. A declared port removes
// the regex from the decision: it stays only as the fallback that keeps an
// already-scaffolded workspace working.
import fs from 'fs-extra';
import path from 'path';
import type { Workspace } from './workspace.js';

/** The port a scaffold falls back to when nothing declares one. */
export const DEFAULT_STORYBOOK_PORT = 6006;

/** Where a resolved port came from, so a command can say so. */
export type PortSource = 'flag' | 'declared' | 'scaffold' | 'default';

export interface ResolvedPort {
  port: number;
  source: PortSource;
}

function isValidPort(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= 65535;
}

/**
 * The declared port, or null. A present-but-unusable value warns and returns
 * null rather than failing the run: the rest of the file still applies, and a
 * silent fall back to 6006 is how a declared port appears not to work at all.
 */
function declaredPort(ws: Workspace): number | null {
  const host = ws.config.conventions?.storybook?.host as Record<string, unknown> | undefined;
  if (!host || !('port' in host)) return null;
  const raw = host.port;
  // A YAML port is a number; a quoted one is a numeric string. Accept both,
  // since the difference is invisible in the file.
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (!isValidPort(value)) {
    console.warn(
      `⚠ conventions/storybook.yaml: host.port "${String(raw)}" is not a port number (1–65535) — ignored.`,
    );
    return null;
  }
  return value;
}

/**
 * The port baked into the generated npm script — what an existing workspace is
 * already serving. Exported because it is the port Storybook will actually
 * listen on, which a caller may need to compare against the declared one.
 */
export function scaffoldedPort(ws: Workspace): number | null {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ws.storybookDir, 'package.json'), 'utf-8'),
    ) as { scripts?: { storybook?: string } };
    const match = pkg.scripts?.storybook?.match(/-p\s+(\d+)/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the workspace's Storybook port, most explicit first:
 *
 *   1. `override` — a `--port` flag, which answers for this one run
 *   2. `host.port` in `conventions/storybook.yaml` — the workspace's own answer
 *   3. the scaffolded npm script — what an existing workspace is already serving
 *   4. 6006
 *
 * The declaration outranks the scaffold so that `storybook init --force`, which
 * rewrites the npm script, cannot quietly move a workspace off its own address.
 */
export function resolveStorybookPort(ws: Workspace, override?: number | string): ResolvedPort {
  if (override !== undefined && override !== null && String(override).trim() !== '') {
    const value = Number(override);
    if (isValidPort(value)) return { port: value, source: 'flag' };
    console.warn(`⚠ --port "${String(override)}" is not a port number (1–65535) — ignored.`);
  }
  const declared = declaredPort(ws);
  if (declared !== null) return { port: declared, source: 'declared' };
  const scaffolded = scaffoldedPort(ws);
  if (scaffolded !== null) return { port: scaffolded, source: 'scaffold' };
  return { port: DEFAULT_STORYBOOK_PORT, source: 'default' };
}
