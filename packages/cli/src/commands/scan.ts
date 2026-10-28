/**
 * Scan Command - Discover and list all components in a Figma file
 *
 * Purpose: Scan Figma file and generate manifest of components for curation
 */

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { ComponentDiscovery, SectionedComponentDiscovery, type DiscoverySource, type ComponentInfo } from '../scan/discovery.js';
import type { DevStatus } from '../utilities/devStatus.js';
import { SectionedFile, shadowIngestEnabled, shadowCompare } from '../utilities/sectionedFile.js';
import { ManifestParserV2, type ManifestRowV2 } from '../utilities/manifestParserV2.js';
import { isV1Manifest, migrateV1ToV2 } from '../scan/manifestMigrationV1ToV2.js';
import { specFolderKey } from '../utilities/specFolderKey.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { StepError } from '../pipeline/StepError.js';
import { figmaOf } from '../config/PlatformConventions.js';
import { ERROR_CODES } from '../utilities/errorCodes.js';

const SCAN_FORMAT_VERSION = 2;

interface ScanOptions {
  output?: string;
  dataDir?: string;
  config?: string;
  source?: string;
  includeAll: boolean;
  keepChecks: boolean;
  resetChecks: boolean;
  variables?: string;
  verbose: boolean;
}

export interface ScanResult {
  /** Where the manifest was written. */
  manifestPath: string;
  components: number;
  compositions: number;
  selected: number;
}

/**
 * Default inclusion when no prior manifest exists (or --reset-checks), from
 * `settings.curation.defaultSelection` (ADR-093).
 *
 * - `READY_FOR_DEV` checks the components the library marks ready. A library
 *   that marks none is not curated down to nothing: every component is checked
 *   instead, since a library not using the signal has said nothing by omitting it.
 * - `ALL` checks every component regardless of marking.
 */
export function deriveDefaultInclusion(
  components: ComponentInfo[],
  defaultSelection: 'READY_FOR_DEV' | 'ALL'
): Map<string, boolean> {
  const result = new Map<string, boolean>();
  const anyReady = components.some(c => c.devStatus === 'READY_FOR_DEV');

  for (const c of components) {
    if (defaultSelection === 'ALL' || !anyReady) {
      result.set(c.id, true);
      continue;
    }
    result.set(c.id, c.devStatus === 'READY_FOR_DEV');
  }
  return result;
}

/**
 * A subcomponent is generated as part of its parent's spec, so it needs no
 * row of its own checked. `{C} / {S}` binds {C} to a real listed component
 * rather than to any text, so "List / Item" is recognised as belonging
 * to "List" and only to it.
 */
export function subcomponentParentOf(
  name: string,
  listedNames: string[],
  conventions: { match?: string[]; exclude?: string[] } = {}
): string | null {
  const patterns = conventions.match ?? [];
  if (patterns.length === 0) return null;

  const matchesAnyWith = (list: string[], parent: string) =>
    list.some(pattern => bindPattern(pattern, parent).test(name));

  for (const parent of listedNames) {
    if (parent.toLowerCase() === name.toLowerCase()) continue;
    if (!matchesAnyWith(patterns, parent)) continue;
    if (matchesAnyWith(conventions.exclude ?? [], parent)) continue;
    return parent;
  }
  return null;
}

/**
 * `{C}` bound to a known parent is that parent's name exactly, slashes included
 * (ADR-094 rule 3), `{S}` spans separators (rule 1), and every other character is
 * literal (rule 4).
 */
function bindPattern(pattern: string, parentName: string): RegExp {
  const source = pattern
    .split(/(\{C\}|\{S\})/)
    .map(part => {
      if (part === '{C}') return escapeRegExp(parentName);
      if (part === '{S}') return '.+';
      return escapeRegExp(part);
    })
    .join('');
  return new RegExp(`^${source}$`, 'i');
}

/**
 * Dev status is a property of a component, and the pieces a component composes
 * carry none of their own — a subcomponent has no status to read, and a
 * sibling it instances was curated on its own merits. So devStatus-derived
 * curation deselects the dependencies of its own selection, and generating
 * from it produces scaffolds importing output that was never generated.
 *
 * Every listed component a checked component composes, transitively, is
 * retained — except one the caller protects, which is how a manifest that
 * outranks the library keeps a deselection this pass would otherwise reverse.
 */
export function retainComposedDependencies(
  rows: Array<{ id: string; name: string; included: boolean }>,
  composedOf: (checkedIds: string[]) => Set<string>,
  conventions: { match?: string[]; exclude?: string[] } = {},
  protectedIds: ReadonlySet<string> = new Set()
): number {
  const checkedRows = rows.filter(r => r.included);
  if (checkedRows.length === 0) return 0;
  const needed = composedOf(checkedRows.map(r => r.id));
  const checkedNames = checkedRows.map(r => r.name);
  let retained = 0;
  for (const row of rows) {
    if (row.included || !needed.has(row.id)) continue;
    if (protectedIds.has(row.id)) continue;
    if (subcomponentParentOf(row.name, checkedNames, conventions)) continue;
    row.included = true;
    retained += 1;
  }
  return retained;
}

/**
 * Authoring aids that live in the library as components but are not components
 * of it: the Examples sets a designer keeps beside a component, and the sets
 * that carry the code-only-props surface. Generating them writes spec folders
 * for things nothing consumes.
 *
 * Patterns match per ADR-094: `{S}` spans separators, `{C}` fills one segment when no
 * parent is known, and every other character — spaces and slashes included — matches
 * exactly. A library using two spellings of a separator declares a pattern for each.
 */
export function isAuthoringAid(
  name: string,
  conventions: { exclude?: string[]; codeOnlyProps?: string } = {}
): boolean {
  const firstSegment = name.split('/')[0].trim();
  if (conventions.codeOnlyProps && firstSegment) {
    if (firstSegment.toLowerCase() === conventions.codeOnlyProps.trim().toLowerCase()) return true;
  }

  return (conventions.exclude ?? []).some(pattern =>
    patternToRegExp(pattern).test(name)
  );
}

/**
 * A `{C}`/`{S}` pattern as a regular expression, for the case where no parent is known
 * (ADR-094). `{C}` fills one segment, `{S}` spans them, and every other character is
 * literal. Case is the one thing not significant.
 */
function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .split(/(\{C\}|\{S\})/)
    .map(part => {
      if (part === '{C}') return '[^/]+';
      if (part === '{S}') return '.+';
      return escapeRegExp(part);
    })
    .join('');
  return new RegExp(`^${source}$`, 'i');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface MergeStats {
  added: number;
  removed: number;
  flippedByFigma: number;
  preserved: number;
}

/**
 * Merge prior rows with current scan, per `settings.curation.preserveManualSelections`
 * (ADR-093).
 *
 * Rules:
 * - New rows: use deriveDefaultInclusion.
 * - Existing rows where devStatus changed: the library wins by default — use the
 *   new devStatus's implied check state (READY_FOR_DEV → checked, NONE →
 *   unchecked). With `preserveManualSelections`, the recorded checkbox wins and
 *   only the devStatus column updates.
 * - Existing rows where devStatus unchanged: preserve prior checkbox either way.
 * - Removed rows: dropped.
 */
export function mergeRows(
  current: ComponentInfo[],
  prior: ManifestRowV2[],
  defaults: Map<string, boolean>,
  preserveManualSelections: boolean
): { rows: ManifestRowV2[]; stats: MergeStats } {
  const priorById = new Map(prior.map(r => [r.id, r]));
  const stats: MergeStats = { added: 0, removed: 0, flippedByFigma: 0, preserved: 0 };

  const rows: ManifestRowV2[] = current.map(c => {
    const prev = priorById.get(c.id);
    if (!prev) {
      stats.added++;
      return {
        id: c.id,
        name: c.name,
        type: c.type as 'COMPONENT' | 'COMPONENT_SET',
        included: defaults.get(c.id) ?? false,
        devStatus: c.devStatus
      };
    }

    let included: boolean;
    if (preserveManualSelections) {
      included = prev.included;
      stats.preserved++;
    } else if (prev.devStatus !== c.devStatus) {
      included = c.devStatus === 'READY_FOR_DEV';
      stats.flippedByFigma++;
    } else {
      included = prev.included;
      stats.preserved++;
    }

    return {
      id: c.id,
      name: c.name,
      type: c.type as 'COMPONENT' | 'COMPONENT_SET',
      included,
      devStatus: c.devStatus
    };
  });

  const currentIds = new Set(current.map(c => c.id));
  for (const prev of prior) {
    if (!currentIds.has(prev.id)) stats.removed++;
  }

  return { rows, stats };
}

interface PriorManifest {
  components: ManifestRowV2[];
  compositions: ManifestRowV2[];
}

function readPriorManifest(outputPath: string): PriorManifest | null {
  if (!fs.existsSync(outputPath)) return null;
  const content = fs.readFileSync(outputPath, 'utf-8');

  // ⬇️ ManifestMigrationV1ToV2 — DELETE WITH ManifestParser.ts when v1 is retired.
  if (isV1Manifest(content)) {
    return { components: migrateV1ToV2(content), compositions: [] };
  }

  if (ManifestParserV2.isV2(content)) {
    const { components, compositions, warnings } = ManifestParserV2.parse(content);
    for (const warning of warnings) console.warn(`⚠ ${warning}`);
    return { components, compositions };
  }
  return null;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

/**
 * Partition components by the glyphs convention (ADR-103) — membership computed by the
 * discovery source over both forms (name pattern and/or structure). With no convention
 * declared, all components stay in the components list and glyphs is empty.
 */
export function partitionByGlyphConvention(
  components: ComponentInfo[],
  glyphIds: Set<string>
): { components: ComponentInfo[]; glyphs: ComponentInfo[] } {
  if (glyphIds.size === 0) return { components, glyphs: [] };
  const comps: ComponentInfo[] = [];
  const glyphs: ComponentInfo[] = [];
  for (const c of components) {
    if (glyphIds.has(c.id)) {
      glyphs.push(c);
    } else {
      comps.push(c);
    }
  }
  return { components: comps, glyphs };
}

/**
 * The compositions a manifest may list, from the frames discovery qualified by the
 * marker (ADR-095). Two further exclusions:
 *
 * - a frame carrying the code-only-props surface is not a composition, for the same
 *   reason it is not a component. `subcomponents.exclude` does NOT apply here: those
 *   patterns describe how this library names a component's parts, and a composition
 *   is a frame, not a component. A frame named `Compositions / Examples / Lockup`
 *   is a composition whose author happened to use the word, and dropping it would
 *   leave a marked frame missing with no row to recover it from
 * - a frame whose name yields no spec key cannot own a spec folder. A frame named with
 *   whitespace alone is real, not hypothetical, and the writer would fall back to
 *   naming its folder `component` — which the next such frame would then collide with
 *
 * Returns the listable rows and, separately, what was dropped and why, so the caller
 * can say so rather than leaving a marked frame silently missing.
 */
export function listableCompositions(
  frames: ComponentInfo[],
  aidConventions: { exclude?: string[]; codeOnlyProps?: string } = {}
): { compositions: ComponentInfo[]; authoringAids: number; unnameable: ComponentInfo[] } {
  const compositions: ComponentInfo[] = [];
  const unnameable: ComponentInfo[] = [];
  let authoringAids = 0;

  for (const frame of frames) {
    if (isAuthoringAid(frame.name, { codeOnlyProps: aidConventions.codeOnlyProps })) {
      authoringAids += 1;
      continue;
    }
    if (specFolderKey(frame.name) === null) {
      unnameable.push(frame);
      continue;
    }
    compositions.push(frame);
  }

  compositions.sort((a, b) => a.name.localeCompare(b.name));
  return { compositions, authoringAids, unnameable };
}

/**
 * The one-line merge summary under a section's count. Empty when a merge produced
 * nothing worth saying, so a first scan prints no line at all.
 */
function mergeSummary(stats: MergeStats | null): string | null {
  if (!stats) return null;
  const parts: string[] = [];
  if (stats.added) parts.push(`${stats.added} added`);
  if (stats.removed) parts.push(`${stats.removed} removed`);
  if (stats.flippedByFigma) parts.push(`${stats.flippedByFigma} updated by devStatus`);
  if (stats.preserved) parts.push(`${stats.preserved} preserved`);
  return parts.length ? `  Merge: ${parts.join(', ')}` : null;
}

function generateManifestV2(
  rows: ManifestRowV2[],
  compositions: ManifestRowV2[],
  glyphs: ComponentInfo[],
  sourceFile: string,
  fileLastModified: string | undefined,
  variablesFile?: string
): string {
  const lines: string[] = [];
  lines.push('# Component Manifest');
  lines.push('');
  lines.push(`**Scan format version:** ${SCAN_FORMAT_VERSION}  `);
  lines.push(`**Generated:** ${new Date().toISOString()}  `);
  lines.push(`**File:** ${sourceFile}`);
  if (variablesFile) lines.push(`**Variables:** ${variablesFile}`);
  if (fileLastModified) lines.push(`**File last modified:** ${fileLastModified}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Components');
  lines.push('');
  lines.push('| ✓ | Name | ID | Type | Dev Status |');
  lines.push('|------|------|------|------|------------|');
  for (const row of rows) {
    const checkbox = row.included ? '[x]' : '[ ]';
    lines.push(
      `| ${checkbox} | ${escapeCell(row.name)} | ${row.id} | ${row.type} | ${row.devStatus} |`
    );
  }

  // Compositions (ADR-095) are curated exactly as components are — same columns,
  // same checkbox, same merge rules. What differs is only which nodes are eligible
  // for a row: every component set and standalone component, versus only the frames
  // the library marks ready for dev. The note says so, because a reader will
  // otherwise wonder where the rest of the library's frames went.
  if (compositions.length > 0) {
    lines.push('');
    lines.push('## Compositions');
    lines.push('');
    lines.push('_Frames marked `READY_FOR_DEV` in Figma — a frame with no marking gets no row. Check and uncheck to curate, exactly as above._');
    lines.push('');
    lines.push('| ✓ | Name | ID | Type | Dev Status |');
    lines.push('|------|------|------|------|------------|');
    for (const row of compositions) {
      const checkbox = row.included ? '[x]' : '[ ]';
      lines.push(
        `| ${checkbox} | ${escapeCell(row.name)} | ${row.id} | ${row.type} | ${row.devStatus} |`
      );
    }
  }

  if (glyphs.length > 0) {
    lines.push('');
    lines.push('## Glyphs');
    lines.push('');
    lines.push('_Detected via the `glyphs` convention in `config/conventions/figma.yaml`. Excluded from `specs generate`._');
    lines.push('');
    lines.push('| Name | ID | Type |');
    lines.push('|------|------|------|');
    for (const g of glyphs) {
      lines.push(`| ${escapeCell(g.name)} | ${g.id} | ${g.type} |`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Scan one Figma payload and write its curation manifest.
 *
 * Returns rather than exiting, so `specs build` and `specs run` can call it as
 * one step of a chain (ADR-101). A condition that stops the scan throws
 * `StepError` carrying the exit code the command would have used; the command
 * body below turns that back into an exit.
 */
export async function runScan(
  fileArg: string | undefined,
  options: ScanOptions,
): Promise<ScanResult> {
      if (options.keepChecks && options.resetChecks) {
        throw new StepError('--keep-checks and --reset-checks are mutually exclusive', ERROR_CODES.INVALID_ARGS);
      }

      const config = new ConfigLoader().load(options.config);
      const configDir = config.configDir ?? process.cwd();
      const dataDir = options.dataDir || config.settings.data?.directory;
      const resolvedDir = path.resolve(configDir, dataDir || '.');

      let file: string;
      let scanAlias: string | null = null;
      if (fileArg) {
        if (options.source) {
          throw new StepError('Pass either a <file> argument or --source, not both', ERROR_CODES.INVALID_ARGS);
        }
        file = fileArg;
      } else {
        const fileSources = Object.entries(config.settings.data?.sources ?? {}).filter(
          ([, entry]) => Array.isArray(entry.fetch) && entry.fetch.includes('file')
        );

        // An alias fetched with `specs fetch --source` is never in config, so an alias
        // with a payload on disk is as real a source as a configured one.
        const fetchedOnDisk = (alias: string) => fs.existsSync(path.join(resolvedDir, `${alias}.file.json`));

        if (fileSources.length === 0 && !(options.source && fetchedOnDisk(options.source))) {
          throw new StepError(
            'No <file> argument provided and no sources configured in the workspace settings',
            ERROR_CODES.INVALID_ARGS,
            'Tip: run `specs fetch` first, or pass a file path explicitly (e.g., `specs scan data/library.file.json`)',
          );
        }

        let alias: string;
        if (options.source) {
          const match = fileSources.find(([name]) => name === options.source);
          if (!match && !fetchedOnDisk(options.source)) {
            const available = fileSources.map(([name]) => name).join(', ');
            throw new StepError(
              `--source "${options.source}" did not match a configured source with file data\nAvailable: ${available || '(none)'}`,
              ERROR_CODES.INVALID_ARGS,
              `Tip: an unconfigured source needs its payload fetched first — \`specs fetch --source ${options.source}=<url>\``,
            );
          }
          alias = match ? match[0] : options.source;
        } else if (fileSources.length === 1) {
          alias = fileSources[0][0];
        } else {
          const available = fileSources.map(([name]) => name).join(', ');
          throw new StepError(
            `Multiple sources configured. Specify one with --source <alias>.\nAvailable: ${available}`,
            ERROR_CODES.INVALID_ARGS,
          );
        }

        file = path.join(resolvedDir, `${alias}.file.json`);
        scanAlias = alias;

        if (options.verbose) {
          console.error(`[CLI] Using source "${alias}": ${path.relative(process.cwd(), file)}`);
        }
      }

      if (!options.output) {
        const baseName = path.basename(file, '.file.json').replace(/\.file$/, '');
        options.output = path.join(resolvedDir, `${baseName}.manifest.md`);
      }

      if (options.verbose) {
        console.error(`[CLI] Scanning file: ${file}`);
      }

      // Sectioned path (specs#561): a page-split artifact reads page by page —
      // no single-string limit, no whole-document graph. Reads of pre-existing
      // monolithic payloads keep working.
      let sectioned: SectionedFile | null = null;
      if (scanAlias) {
        sectioned = SectionedFile.open(resolvedDir, scanAlias); // throws loudly on an unknown format version
        // The manifest's **File:** header must name the artifact actually
        // scanned — generate resolves its payload from it.
        if (sectioned && !fs.existsSync(file)) file = sectioned.dir;
      } else if (fileArg && fs.existsSync(file) && fs.statSync(file).isDirectory()) {
        sectioned = SectionedFile.openDir(file);
        if (!sectioned) {
          throw new StepError(
            `${file} is a directory but not a split payload (no manifest.json)`,
            ERROR_CODES.INVALID_ARGS,
          );
        }
      }

      if (!sectioned && !fs.existsSync(file)) {
        throw new StepError(
          `File not found: ${file}`,
          ERROR_CODES.FILE_ERROR,
          fileArg ? undefined : 'Tip: run `specs fetch` to download source data',
        );
      }

      const glyphsConvention = figmaOf(config.conventions).glyphs;
      const discovery: DiscoverySource = sectioned
        ? new SectionedComponentDiscovery(sectioned, glyphsConvention)
        : await ComponentDiscovery.fromFile(file);

      if (sectioned && shadowIngestEnabled() && fs.existsSync(file)) {
        const mono = await ComponentDiscovery.fromFile(file);
        shadowCompare(`scan:${scanAlias}:components`, mono.findAllComponents(), discovery.findAllComponents());
      }

      if (options.verbose) {
        console.error(`[CLI] File loaded: ${discovery.getFileName()}`);
      }

      const componentInfoList = discovery.findAllComponents();

      if (componentInfoList.length === 0) {
        console.error('Warning: No components found in file');
      }

      if (options.verbose) {
        const readyCount = componentInfoList.filter(c => c.devStatus === 'READY_FOR_DEV').length;
        console.error(`[CLI] Found ${componentInfoList.length} top-level components (${readyCount} READY_FOR_DEV)`);
      }

      // Sort by name for stable diffs
      componentInfoList.sort((a, b) => a.name.localeCompare(b.name));

      const figmaConventions = figmaOf(config.conventions);
      const aidConventions = {
        exclude: figmaConventions.subcomponents?.exclude,
        codeOnlyProps: figmaConventions.codeOnlyProps?.match,
      };
      const listable = componentInfoList.filter(c => !isAuthoringAid(c.name, aidConventions));
      if (options.verbose && listable.length < componentInfoList.length) {
        console.error(`[CLI] Excluded ${componentInfoList.length - listable.length} authoring-aid component(s)`);
      }

      const { components: componentList, glyphs: glyphList } = partitionByGlyphConvention(
        listable,
        discovery.glyphComponentIds(glyphsConvention)
      );

      if (options.verbose && glyphsConvention) {
        console.error(`[CLI] Glyphs convention matched ${glyphList.length} components`);
      }

      // Curation settings (ADR-093), each overridable for one run by its flag.
      const curation = config.settings.curation;
      const defaultSelection = options.includeAll ? 'ALL' : curation.defaultSelection;
      const preserveManualSelections = options.keepChecks || curation.preserveManualSelections;
      const includeDependencies = curation.includeDependencies;

      if (options.verbose) {
        console.error(
          `[CLI] Curation: defaultSelection=${defaultSelection}, ` +
          `preserveManualSelections=${preserveManualSelections}, ` +
          `includeDependencies=${includeDependencies}`
        );
      }

      const outputPath = path.resolve(options.output!);
      const prior = options.resetChecks ? null : readPriorManifest(outputPath);
      const priorComponents = prior?.components ?? null;
      const defaults = deriveDefaultInclusion(componentList, defaultSelection);

      let rows: ManifestRowV2[];
      let stats: MergeStats | null = null;
      if (priorComponents && defaultSelection !== 'ALL') {
        const merged = mergeRows(componentList, priorComponents, defaults, preserveManualSelections);
        rows = merged.rows;
        stats = merged.stats;
      } else {
        rows = componentList.map(c => ({
          id: c.id,
          name: c.name,
          type: c.type as 'COMPONENT' | 'COMPONENT_SET',
          included: defaults.get(c.id) ?? false,
          devStatus: c.devStatus as DevStatus
        }));
      }

      // Retention must not undo a deselection the manifest is the authority for:
      // it runs after the merge, so without this it re-checks exactly what a human
      // unchecked. Rows the prior manifest recorded as unchecked are protected.
      const protectedIds = preserveManualSelections && priorComponents
        ? new Set(priorComponents.filter(r => !r.included).map(r => r.id))
        : new Set<string>();

      if (includeDependencies && defaultSelection !== 'ALL') {
        const retained = retainComposedDependencies(
          rows,
          ids => discovery.composedComponentIds(ids),
          {
            match: figmaConventions.subcomponents?.match,
            exclude: figmaConventions.subcomponents?.exclude,
          },
          protectedIds
        );
        if (retained > 0) {
          console.error(`Retained ${retained} component(s) composed by checked components`);
        }
      }

      // Compositions (ADR-095) are curated exactly as components are. Only the
      // eligible set differs: a frame earns a row by being marked ready for dev in
      // Figma, and an unmarked frame gets no row at all — the library holds tens of
      // thousands of frames a designer merely works inside.
      const { compositions: compositionList, authoringAids: compositionAids, unnameable } = listableCompositions(
        discovery.findCompositions(),
        aidConventions
      );
      for (const frame of unnameable) {
        console.warn(
          `⚠ Composition skipped: frame ${frame.id} has no name that yields a spec key — ` +
          `give it a name in Figma, or remove its ready-for-dev marking`
        );
      }
      if (options.verbose) {
        if (compositionAids > 0) {
          console.error(`[CLI] Excluded ${compositionAids} authoring-aid frame(s) from compositions`);
        }
        console.error(`[CLI] Found ${compositionList.length} composition(s) marked READY_FOR_DEV`);
      }

      // Every eligible composition is marked ready for dev by definition, so
      // `deriveDefaultInclusion` checks them all on a first scan, and `mergeRows`
      // never sees a devStatus change — which is precisely "a check already recorded
      // survives the rescan". A frame that loses its marking leaves the eligible set
      // and its row is dropped, the same as a deleted component's.
      const compositionDefaults = deriveDefaultInclusion(compositionList, defaultSelection);
      let compositions: ManifestRowV2[];
      let compositionStats: MergeStats | null = null;
      if (prior?.compositions.length && defaultSelection !== 'ALL') {
        const merged = mergeRows(
          compositionList, prior.compositions, compositionDefaults, preserveManualSelections
        );
        compositions = merged.rows;
        compositionStats = merged.stats;
      } else {
        compositions = compositionList.map(c => ({
          id: c.id,
          name: c.name,
          type: 'FRAME' as const,
          included: compositionDefaults.get(c.id) ?? false,
          devStatus: c.devStatus
        }));
      }

      const manifest = generateManifestV2(
        rows,
        compositions,
        glyphList,
        path.resolve(file),
        discovery.getFileLastModified(),
        options.variables ? path.resolve(options.variables) : undefined
      );

      await fs.ensureDir(path.dirname(outputPath));
      await fs.writeFile(outputPath, manifest, 'utf-8');

      const includedCount = rows.filter(r => r.included).length;
      const excludedCount = rows.length - includedCount;

      console.log(`✓ Scanned ${path.basename(file)}`);

      // Each section's merge line sits directly under its own count. They used to be
      // written at opposite ends of the summary, which read as though the components'
      // merge described the glyphs.
      console.log(`✓ Found ${rows.length} components (${includedCount} selected, ${excludedCount} excluded)`);
      const componentMerge = mergeSummary(stats);
      if (componentMerge) console.log(componentMerge);

      if (compositions.length > 0) {
        const selected = compositions.filter(c => c.included).length;
        console.log(
          `✓ Found ${compositions.length} compositions (${selected} selected, ` +
          `${compositions.length - selected} excluded)`
        );
        const compositionMerge = mergeSummary(compositionStats);
        if (compositionMerge) console.log(compositionMerge);
      }

      if (glyphList.length > 0) {
        console.log(`✓ Detected ${glyphList.length} glyphs (excluded from generate)`);
      }
      console.log(`✓ Saved to ${outputPath}`);
      console.log('');
      console.log(`Next: Edit ${path.basename(outputPath)} to adjust selections, then run:`);
      console.log(`  specs generate`);

      return {
        manifestPath: outputPath,
        components: rows.length,
        compositions: compositions.length,
        selected: includedCount,
      };
}

export const Scan = new Command('scan')
  .description('Scan Figma file and generate component manifest for curation')
  .argument('[file]', 'Path to Figma JSON file (default: resolved from a configured source in the workspace settings)')
  .option('--source <alias>', 'Configured source alias to scan (required when multiple sources exist)')
  .option('-o, --output <path>', 'Output manifest file path (default: {data.directory}/{alias}.manifest.md)')
  .option('--data-dir <dir>', 'Override data directory for default manifest output path')
  .option('--config <path>', 'Path to a config/ directory or legacy specs.config.yaml')
  .option('--include-all', 'Select every component for this run — overrides settings.curation.defaultSelection', false)
  .option('--keep-checks', 'Prior checkbox state wins over a changed devStatus for this run — overrides settings.curation.preserveManualSelections', false)
  .option('--reset-checks', 'Ignore the prior manifest and re-derive every checkbox from settings.curation', false)
  .option('-v, --variables <path>', 'Variables file path (for reference in manifest)')
  .option('--verbose', 'Enable detailed logging', false)
  .action(async (fileArg: string | undefined, options: ScanOptions) => {
    try {
      await runScan(fileArg, options);
      process.exit(ERROR_CODES.SUCCESS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      if (error instanceof StepError && error.tip) console.error(error.tip);
      if (options.verbose && error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      process.exit(error instanceof StepError ? error.code : ERROR_CODES.GENERAL_ERROR);
    }
  });
