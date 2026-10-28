// Where a render reads its workspace from, and what that workspace declares.
//
// Extracted from server.ts for the same reason the manifest builders were: that module
// opens a WebSocket on import, so none of this could be reached by a test. Nothing here
// touches a socket — it resolves directories and reads config files.
//
// `resolveDirs` takes its overrides as an argument rather than reading `process` directly.
// Those come from the command line and the environment, which is a property of how the
// server was started, not of how a path resolves — and passing them in is what makes the
// precedence rules testable.

import { readFileSync } from 'fs';
import { resolve as pathResolve } from 'path';
import { parse } from 'yaml';
import { resolveWorkspaceDir } from './config.js';
import type { GlyphsConvention } from '../utilities/glyphConvention.js';

/**
 * The startup-time answers that outrank per-request derivation.
 *
 * `startupWorkspaceDir` pins one workspace for the whole session (`--workspace`, or
 * `WORKSPACE_DIR`). `envSpecsDir` / `envDataDir` override the derived directories
 * outright, for a layout that does not put `specs/` and `data/` side by side.
 */
export interface WorkspaceOverrides {
  startupWorkspaceDir: string | null;
  envSpecsDir: string | null;
  envDataDir: string | null;
}

export interface ResolvedWorkspace {
  specsDir: string;
  dataDir: string;
  aliases: string[];
  glyphs?: GlyphsConvention;
}

/**
 * Resolve the specs and data directories for a given spec or manifest path.
 * Precedence: explicit env overrides → startup workspace → per-request derivation.
 */
export function resolveDirs(fromPath: string, overrides: WorkspaceOverrides): ResolvedWorkspace {
  const { startupWorkspaceDir, envSpecsDir, envDataDir } = overrides;
  const workspaceDir = startupWorkspaceDir ?? resolveWorkspaceDir(fromPath);
  if (!workspaceDir && (!envSpecsDir || !envDataDir)) {
    throw new Error(
      `Cannot determine workspace for "${fromPath}". ` +
      `Pass --workspace <dir>, set WORKSPACE_DIR, or ensure the path is inside a directory containing specs/ and data/.`
    );
  }
  const specsDir = envSpecsDir ?? pathResolve(workspaceDir as string, 'specs');
  const dataDir = envDataDir ?? pathResolve(workspaceDir as string, 'data');
  // Data files are named {sourceAlias}.manifest.md, {sourceAlias}.file.json, etc.
  // The source alias comes from the first key under `data.sources` in the workspace settings.
  const { aliases, glyphs } = resolveSources(workspaceDir);
  return { specsDir, dataDir, aliases, glyphs };
}

/**
 * Every source alias declared in the workspace config, in declaration order, plus the
 * glyph naming pattern. Render resolves against all of them: a component can instance a
 * component, bind a token, or place a glyph from any library the workspace declares.
 *
 * The workspace authors config/settings.yaml and config/conventions.yaml (ADR-071);
 * a pre-split workspace still carries a single specs.config.yaml, so that shape is
 * read as a fallback to keep older workspaces rendering.
 */
/**
 * The glyph name pattern this workspace declares, from whichever conventions layout it uses.
 *
 * `config/conventions/figma.yaml` is the only layout ADR-078 leaves standing, and its
 * contents are that platform's conventions directly — the filename is the platform id, so
 * there is no `figma:` wrapper inside. The single-file `config/conventions.yaml` is read
 * second, for a workspace that has not been migrated.
 *
 * This value is part of the icons cache signature, and `specs cache` derives it from the
 * loaded config. Reading it from a different place than the cache writer does not fail
 * loudly: the pattern comes back undefined, the two signatures disagree forever, and every
 * render refuses on a permanently "stale" icons.yaml.
 */
export function readGlyphsConvention(workspaceDir: string): GlyphsConvention | undefined {
  try {
    const figma = parse(readFileSync(pathResolve(workspaceDir, 'config', 'conventions', 'figma.yaml'), 'utf8')) as {
      glyphs?: GlyphsConvention;
    };
    if (figma?.glyphs) return figma.glyphs;
  } catch {
    // No per-platform conventions file — try the single-file layout below.
  }
  try {
    const conventions = parse(readFileSync(pathResolve(workspaceDir, 'config', 'conventions.yaml'), 'utf8')) as {
      figma?: { glyphs?: GlyphsConvention };
    };
    return conventions?.figma?.glyphs;
  } catch {
    return undefined; // No conventions file — no glyphs convention.
  }
}

/**
 * `workspaceDir` is nullable because `resolveDirs` permits exactly one case without one:
 * SPECS_DIR and DATA_DIR both set, pointing at a layout that is not a workspace. There is
 * no config to read then, so there are no aliases — the same answer this gives for a
 * workspace whose config is missing, and render reports it as an unusable cache.
 *
 * It used to be typed `string` and called through an `as string` cast, which asserted
 * something false: the null reached `pathResolve` here and threw a TypeError from inside a
 * function the caller was not looking at.
 */
export function resolveSources(workspaceDir: string | null): { aliases: string[]; glyphs?: GlyphsConvention } {
  if (!workspaceDir) return { aliases: [] };
  try {
    const settings = parse(readFileSync(pathResolve(workspaceDir, 'config', 'settings.yaml'), 'utf8')) as {
      data?: { sources?: Record<string, unknown> };
    };
    const sources = settings?.data?.sources;
    const aliases = sources && typeof sources === 'object' ? Object.keys(sources) : [];
    return { aliases, glyphs: readGlyphsConvention(workspaceDir) };
  } catch {
    // No split config — fall through to the legacy single-file shape.
  }
  const configPath = pathResolve(workspaceDir, 'specs.config.yaml');
  try {
    const config = parse(readFileSync(configPath, 'utf8')) as {
      sources?: Record<string, unknown>;
      config?: { processing?: { glyphNamePattern?: string } };
    };
    const sources = config?.sources;
    const aliases = sources && typeof sources === 'object' ? Object.keys(sources) : [];
    const legacyPattern = config?.config?.processing?.glyphNamePattern;
    return { aliases, glyphs: legacyPattern ? { match: legacyPattern } : undefined };
  } catch {
    // No config or unreadable — no aliases, which render reports as an unusable cache
    return { aliases: [] };
  }
}

