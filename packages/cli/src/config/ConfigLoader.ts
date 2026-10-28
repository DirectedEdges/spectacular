/**
 * Configuration File Loader
 *
 * Loads and validates the workspace's split configuration (ADR-071):
 * a `config/` directory holding `conventions.yaml`, `settings.yaml`, and
 * (each optional, `.json` also accepted).
 *
 * A pre-split `specs.config.yaml` is refused, not read: `specs migrate config`
 * converts it. Loading runs inside read-only commands and in CI, so it never
 * writes to a workspace, and it never falls back to defaults when it finds a
 * configuration it cannot use.
 *
 * Priority order: CLI flags > file > defaults.
 */

import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import {
  DEFAULT_CONVENTIONS,
  DEFAULT_SETTINGS,
  type ResolvedConventions,
  type ResolvedPlatformConventions,
  type PrimitiveEntry,
  type SpecsConventions,
  type ResolvedSettings,
  type Settings,
  type StorybookConventions,
  type SourceEntry,
} from '@directededges/specs-schema';
import { DOCS_BASE_URL } from '../constants/docs.js';
import { CONFIG_DEFAULTS } from './ConfigDefaults.js';
import type { CLIConfig } from '../config/types.js';

/**
 * Base names of the split-configuration files inside `config/`.
 *
 * Conventions is deliberately absent: it is a *directory* of per-platform files
 * (ADR-078), not one file, and is read by {@link ConfigLoader.readConventionsDir}.
 */
const CONFIG_DIR_FILES = ['settings'] as const;

/**
 * Basenames retired layouts wrote into `config/`. Neither is read, but their
 * presence marks the directory as this workspace's config so the load path can
 * refuse (`conventions`) or warn (`pipeline`) loudly instead of the run falling
 * through to defaults.
 */
const RETIRED_CONFIG_DIR_FILES = ['conventions', 'pipeline'] as const;

/** Directory inside `config/` holding one conventions file per platform (ADR-078). */
const CONVENTIONS_DIR = 'conventions';

/**
 * Reserved basename in `config/conventions/` for the promotion table (ADR-075).
 * A component's props are the same whichever platform renders it, so the table is
 * stated once rather than per platform — but its `source` keys name Figma style
 * properties and its `values` keys name Figma tokens, so the file carries the
 * `figma.` qualifier (ADR-073 Decision 5). Not a platform; no platform may take
 * this id.
 */
const PRIMITIVES_FILE = 'figma.primitives';

/** The promotion table's pre-Decision-5 basename, refused with a rename remedy. */
const PRIMITIVES_FILE_RETIRED = 'primitives';

/**
 * Reserved basename in `config/conventions/` for conventions about the spec itself
 * (ADR-073 Decision 4): the states classification, the prop conventions role emission
 * consumes, and the default-slot naming convention (ADR-099). Shares the directory
 * because these are conventions a library
 * states once, but the spec is the hub every platform converts to or from, so it
 * is a sibling of the platform files and no platform may take this id.
 */
const SPECS_FILE = 'specs';
const STORYBOOK_FILE = 'storybook';

/** Extensions accepted for each split-configuration file, in priority order. */
const CONFIG_FILE_EXTENSIONS = ['yaml', 'json'] as const;

type ConfigSource =
  | { kind: 'directory'; dir: string }
  | { kind: 'legacy'; file: string };

/** Pre-split workspace files that `specs migrate config` can convert. */
const CONFIG_V1_BASENAMES = ['specs.config.yaml', 'specs.config.json'];

/**
 * A deliberate refusal to load a retired configuration shape. Distinct from a
 * load *failure* so the loader's defaults fallback can tell them apart: a
 * refusal must stop the run — falling back to defaults would generate
 * successfully and silently wrong, which is the outcome the refusal exists to
 * prevent.
 */
export class ConfigRefusal extends Error {}

export class ConfigLoader {
  constructor() {
    // Config loader with runtime type checking instead of schema validation
  }

  /**
   * Load configuration from the split `config/` directory, a legacy file,
   * or defaults.
   *
   * @param configPath - Optional explicit path: either a `config/` directory
   *   holding split files or a legacy `specs.config.yaml`/`.json` file
   * @returns Complete CLI configuration
   */
  public load(configPath?: string): CLIConfig {
    const source = configPath
      ? this.classifyExplicitPath(configPath)
      : this.findConfigSource();

    if (!source) {
      return this.getDefaultConfig();
    }

    // A pre-split file is a hard stop, not a load failure: falling back to
    // defaults would generate successfully and silently wrong, missing
    // everything the workspace's conventions declare.
    if (source.kind === 'legacy') {
      this.refuseLegacyFile(source.file);
    }

    try {
      return this.loadFromDirectory(source.dir);
    } catch (error) {
      if (error instanceof ConfigRefusal) throw error;
      console.error(`Error loading config from ${source.dir}:`, error);
      console.error('Falling back to default configuration');
      return this.getDefaultConfig();
    }
  }

  /**
   * The `config/` directory a `load()` with the same argument would read from,
   * or null when the run falls back to defaults or to a legacy file.
   *
   * Exposed for the watch paths: config is re-read on every pass, so a
   * convention edit already takes effect — it just needs something to watch
   * for it. A legacy file returns null rather than a path, because `load()`
   * refuses it and there is nothing to re-run.
   */
  public resolveDirectory(configPath?: string): string | null {
    const source = configPath
      ? this.classifyExplicitPath(configPath)
      : this.findConfigSource();
    return source?.kind === 'directory' ? source.dir : null;
  }

  /**
   * Classify an explicit `configPath` argument as either a split-config
   * directory or a legacy file.
   */
  private classifyExplicitPath(configPath: string): ConfigSource | null {
    if (!fs.existsSync(configPath)) {
      return null;
    }
    if (fs.statSync(configPath).isDirectory()) {
      return { kind: 'directory', dir: path.resolve(configPath) };
    }
    return { kind: 'legacy', file: path.resolve(configPath) };
  }

  /**
   * Find configuration in standard locations.
   *
   * Checks in order:
   * 1. ./config/ containing any of conventions|settings .yaml/.json
   * 2. ./specs.config.yaml
   * 3. ./specs.config.json
   * 4. ~/.specs/config.yaml
   */
  private findConfigSource(): ConfigSource | null {
    const configDir = path.join(process.cwd(), 'config');
    if (fs.existsSync(configDir) && fs.statSync(configDir).isDirectory()) {
      const hasSplitFile = CONFIG_DIR_FILES.some(base =>
        CONFIG_FILE_EXTENSIONS.some(ext => fs.existsSync(path.join(configDir, `${base}.${ext}`)))
      );
      // `config/conventions/` is a directory of per-platform files (ADR-078), and on
      // its own it marks a split workspace just as `settings.yaml` does.
      const conventionsDir = path.join(configDir, CONVENTIONS_DIR);
      const hasConventionsDir = fs.existsSync(conventionsDir) && fs.statSync(conventionsDir).isDirectory();
      // Retired-layout files also mark the directory as this workspace's config.
      // Without this, a workspace holding only `config/conventions.yaml` (or a
      // leftover `config/pipeline.yaml`) is not recognized at all and the run
      // generates with defaults, silently missing everything the file declares —
      // recognizing it routes the load through the loud refusal instead.
      const hasRetiredFile = RETIRED_CONFIG_DIR_FILES.some(base =>
        CONFIG_FILE_EXTENSIONS.some(ext => fs.existsSync(path.join(configDir, `${base}.${ext}`)))
      );
      if (hasSplitFile || hasConventionsDir || hasRetiredFile) {
        return { kind: 'directory', dir: configDir };
      }
    }

    const legacyLocations = [
      path.join(process.cwd(), 'specs.config.yaml'),
      path.join(process.cwd(), 'specs.config.json'),
      path.join(process.env.HOME || '~', '.specs', 'config.yaml'),
    ];
    for (const location of legacyLocations) {
      if (fs.existsSync(location)) {
        return { kind: 'legacy', file: location };
      }
    }

    return null;
  }

  /**
   * Load the split configuration from a `config/` directory. Missing files
   * are fine — each half defaults independently.
   *
   * Relative directories resolve against the directory that *contains*
   * `config/` (the workspace root), matching where a legacy root-level
   * `specs.config.yaml` resolved them.
   */
  private loadFromDirectory(dir: string): CLIConfig {
    // A leftover pipeline file is inert, not wrong — every workspace created
    // before the retirement has one — so it warns rather than refuses, and the
    // warning says what replaced it and what to do.
    for (const ext of CONFIG_FILE_EXTENSIONS) {
      const pipelineFile = path.join(dir, `pipeline.${ext}`);
      if (fs.existsSync(pipelineFile)) {
        console.warn(
          `Warning: ${pipelineFile} is no longer read (ADR-071 amendment).\n` +
          `  Transformers became commands — run \`specs react\` or \`specs webcomponents\` —\n` +
          `  and \`specs analyze\` has always taken its analyzers as arguments.\n` +
          `  Delete the file, or run \`specs migrate config\` to remove it.`
        );
        break;
      }
    }

    const conventions = this.resolveConventions(this.readConventionsDir(dir));
    const settings = this.resolveSettings(this.readPart(dir, 'settings'));

    const configDir = path.dirname(dir);
    this.resolveSettingsDirectories(settings, configDir);

    return { conventions, settings, configDir };
  }

  /**
   * Refuse a pre-split configuration file.
   *
   * ADR-071 made this a breaking change deliberately. Reading the old shape
   * would mean supporting two layouts indefinitely; ignoring it would be worse
   * — the run would fall through to defaults and generate specs missing
   * everything the conventions declare, without ever failing.
   */
  private refuseLegacyFile(file: string): never {
    // Name the full path: a workspace file and a home-directory one are refused
    // for the same reason but have different remedies, and `config.yaml` alone
    // does not tell the reader which file is being rejected.
    const home = process.env.HOME || '~';
    const isUserLevel = file.startsWith(path.join(home, '.specs'));
    const isDiscovered = CONFIG_V1_BASENAMES.includes(path.basename(file));

    const remedy = isUserLevel
      ? "  A user-level configuration has no equivalent in the split layout. Move what it declares into this workspace's config/ directory, then delete it."
      : isDiscovered
        ? '  Run `specs migrate config` to write config/conventions/ and config/settings.yaml from it.'
        : `  Run \`specs migrate config --source ${path.basename(file)}\` to write config/conventions/ and config/settings.yaml from it.`;

    throw new Error(
      `${file} is no longer read (ADR-071).\n` +
      `${remedy}\n` +
      `  Docs: ${DOCS_BASE_URL}/settings/`
    );
  }

  /**
   * Read one split-configuration file (`<base>.yaml` or `<base>.json`) from
   * the config directory. Returns undefined when the file is absent.
   */
  private readPart(dir: string, base: string): unknown {
    for (const ext of CONFIG_FILE_EXTENSIONS) {
      const file = path.join(dir, `${base}.${ext}`);
      if (fs.existsSync(file)) {
        return this.parseFile(file);
      }
    }
    return undefined;
  }

  private parseFile(file: string): unknown {
    const raw = fs.readFileSync(file, 'utf-8');
    return file.endsWith('.json') ? JSON.parse(raw) : yaml.parse(raw);
  }

  /**
   * Read `config/conventions/` — one file per platform, the basename being the
   * platform id (ADR-078). Returns an id-keyed map of raw entry bodies.
   *
   * A stray `config/conventions.yaml` is refused rather than read: supporting both
   * layouts would mean two discovery paths forever, and silently ignoring the file
   * would generate specs missing everything it declares.
   */
  private readConventionsDir(dir: string): { byPlatform: Record<string, unknown>; primitives?: unknown; specs?: unknown; storybook?: unknown } {
    for (const ext of CONFIG_FILE_EXTENSIONS) {
      const stray = path.join(dir, `${CONVENTIONS_DIR}.${ext}`);
      if (fs.existsSync(stray)) {
        throw new ConfigRefusal(
          `${stray} is no longer read (ADR-078).\n` +
          `  Conventions are one file per platform in config/${CONVENTIONS_DIR}/ — move each\n` +
          `  platform's block into config/${CONVENTIONS_DIR}/<platform>.yaml, with the platform\n` +
          `  key becoming the filename and its body de-indented to the root.\n` +
          `  Docs: ${DOCS_BASE_URL}/schema/conventions/`
        );
      }
    }

    const conventionsDir = path.join(dir, CONVENTIONS_DIR);
    if (!fs.existsSync(conventionsDir) || !fs.statSync(conventionsDir).isDirectory()) {
      return { byPlatform: {} };
    }

    const byPlatform: Record<string, unknown> = {};
    let primitives: unknown;
    let specs: unknown;
    let storybook: unknown;
    for (const entry of fs.readdirSync(conventionsDir).sort()) {
      const ext = path.extname(entry).slice(1);
      if (!(CONFIG_FILE_EXTENSIONS as readonly string[]).includes(ext)) continue;
      const file = path.join(conventionsDir, entry);
      if (!fs.statSync(file).isFile()) continue;
      const id = path.basename(entry, path.extname(entry));
      if (id === PRIMITIVES_FILE) {
        primitives = this.parseFile(file);
        continue;
      }
      // Refused rather than read as a platform named 'primitives', which is what
      // falling through would silently do.
      if (id === PRIMITIVES_FILE_RETIRED) {
        throw new ConfigRefusal(
          `${file} is no longer read (ADR-073 Decision 5).\n` +
          `  The promotion table is Figma-scoped — its sources and token names describe the\n` +
          `  design tool — so rename the file to config/${CONVENTIONS_DIR}/${PRIMITIVES_FILE}.${ext}.\n` +
          `  Docs: ${DOCS_BASE_URL}/schema/conventions/`
        );
      }
      if (id === SPECS_FILE) {
        specs = this.parseFile(file);
        continue;
      }
      // Third reserved basename (ADR-098): workspace Storybook presentation.
      // Read here rather than falling through as a platform named 'storybook'.
      if (id === STORYBOOK_FILE) {
        storybook = this.parseFile(file);
        continue;
      }
      // The filename is the platform id, so a platform is declared in exactly one
      // file and there is no merge rule to define.
      byPlatform[id] = this.parseFile(file);
    }
    return { byPlatform, primitives, specs, storybook };
  }

  /**
   * Resolve conventions: one {@link ResolvedPlatformConventions} per declared
   * platform, with defaults applied inside each declared block.
   *
   * Absence of a block means that platform declares no such convention — no default
   * can supply it.
   */
  private resolveConventions(read: { byPlatform: Record<string, unknown>; primitives?: unknown; specs?: unknown; storybook?: unknown }): ResolvedConventions {
    const platforms: Record<string, ResolvedPlatformConventions> = {};
    for (const [id, parsed] of Object.entries(read.byPlatform)) {
      platforms[id] = this.resolvePlatform(id, parsed);
    }
    const primitives = this.resolvePrimitives(read.primitives);
    const specs = this.resolveSpecs(read.specs);
    const storybook = this.resolveStorybook(read.storybook);
    if (!Object.keys(platforms).length && !primitives && !specs && !storybook) return { ...DEFAULT_CONVENTIONS };
    return {
      ...(Object.keys(platforms).length ? { platforms } : {}),
      ...(primitives ? { primitives } : {}),
      ...(specs ? { specs } : {}),
      ...(storybook ? { storybook } : {}),
    };
  }

  /**
   * Resolve `config/conventions/primitives.yaml` — the promotion table, keyed by the
   * design system's own component names (ADR-075).
   *
   * An entry needs an `elementType` and a `map`; one missing either is dropped with a
   * warning rather than failing the run, so a half-written table promotes what it
   * describes and leaves the rest as it is.
   *
   * `match` is optional and carries the layer-name prefixes selecting the entry
   * (ADR-100). A malformed one is dropped and named rather than passed on: a name match
   * short-circuits scoring, so a value the engine cannot read turns into a selection
   * made by styling alone, which looks like the table being wrong rather than the file.
   */
  private resolvePrimitives(parsed: unknown): Record<string, PrimitiveEntry> | undefined {
    if (!parsed || typeof parsed !== 'object') return undefined;
    const where = `conventions/${PRIMITIVES_FILE}.yaml`;
    const entries: Record<string, PrimitiveEntry> = {};
    for (const [name, body] of Object.entries(parsed as Record<string, unknown>)) {
      const entry = body as Partial<PrimitiveEntry> | null;
      if (!entry || typeof entry !== 'object' || !entry.elementType || !Array.isArray(entry.map)) {
        console.warn(`${where}: '${name}' needs an elementType and a map — entry ignored.`);
        continue;
      }
      entries[name] = {
        elementType: entry.elementType,
        ...(this.resolvePrimitiveMatch(entry.match, name, where) ?? {}),
        map: entry.map,
      };
    }
    return Object.keys(entries).length ? entries : undefined;
  }

  /**
   * The `match` member of one promotion entry, or nothing when it is absent or unusable.
   *
   * Absence is a statement — the entry is selected by score — so it warns about nothing.
   * A declared value that is not a non-empty array of non-empty strings is named,
   * because the author meant to select by name and would otherwise see scoring's answer
   * with no indication why.
   */
  private resolvePrimitiveMatch(
    match: unknown,
    name: string,
    where: string
  ): { match: string[] } | undefined {
    if (match === undefined || match === null) return undefined;
    if (!Array.isArray(match) || !match.length) {
      console.warn(`${where}: '${name}' match must be a non-empty array of layer-name prefixes — ignored, so '${name}' is selected by score.`);
      return undefined;
    }
    const prefixes = match.filter((prefix): prefix is string => typeof prefix === 'string' && prefix.length > 0);
    if (prefixes.length !== match.length) {
      console.warn(`${where}: '${name}' match must hold only non-empty strings — ${match.length - prefixes.length} dropped.`);
    }
    return prefixes.length ? { match: prefixes } : undefined;
  }

  /**
   * Resolve `config/conventions/storybook.yaml` — Storybook presentation
   * conventions (ADR-098), concern-keyed with open feature values.
   *
   * The contract fixes the file and the concern keying; per-feature values are
   * validated by each concern's implementation. What this resolver enforces is
   * the shape it can see — a concern whose body is not a mapping is dropped
   * WITH a warning naming it, never silently (ADR-098).
   */
  private resolveStorybook(parsed: unknown): StorybookConventions | undefined {
    if (parsed === undefined || parsed === null) return undefined;
    const where = `conventions/${STORYBOOK_FILE}.yaml`;
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn(`⚠ ${where}: expected concern-keyed mappings at the top level. Ignoring the file.`);
      return undefined;
    }
    const storybook: StorybookConventions = {};
    for (const [concern, body] of Object.entries(parsed as Record<string, unknown>)) {
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        console.warn(`⚠ ${where}: concern "${concern}" is not a mapping of feature settings — ignored.`);
        continue;
      }
      storybook[concern] = body as Record<string, unknown>;
    }
    return Object.keys(storybook).length ? storybook : undefined;
  }

  /**
   * Resolve `config/conventions/specs.yaml` — conventions about the spec itself
   * (ADR-073 Decision 4): the default-slot naming convention, the states
   * classification, the accessible-name prop convention, and the value prop
   * convention. A malformed member is dropped with a warning rather than failing the
   * run, so the rest of the file still applies.
   */
  private resolveSpecs(parsed: unknown): SpecsConventions | undefined {
    if (!parsed || typeof parsed !== 'object') return undefined;
    const where = `conventions/${SPECS_FILE}.yaml`;
    const raw = parsed as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const specs: SpecsConventions = {};

    // slots.default (ADR-099) — the naming patterns identifying a component's one
    // designated default slot. A non-empty array of non-empty strings, else the block
    // is dropped: a convention that names nothing would flatten nothing, and a reader
    // would have no way to tell that from "not configured".
    if (raw.slots !== undefined && raw.slots !== null) {
      if (typeof raw.slots !== 'object') {
        console.warn(`Invalid ${where} slots: expected an object. Removing slots convention.`);
      } else {
        const def = (raw.slots as Record<string, unknown>).default;
        if (def !== undefined) {
          const match = def !== null && typeof def === 'object'
            ? (def as Record<string, unknown>).match
            : undefined;
          const patterns = Array.isArray(match)
            ? (match as unknown[]).filter((v): v is string => typeof v === 'string' && v.trim() !== '').map(v => v.trim())
            : [];
          if (patterns.length === 0) {
            console.warn(`Invalid ${where} slots.default.match: expected a non-empty array of strings. Removing slots convention.`);
          } else {
            specs.slots = { default: { match: patterns } };
          }
        }
      }
    }

    // states — concept-keyed map, passed through when it is an object
    if (raw.states !== undefined && raw.states !== null) {
      if (typeof raw.states === 'object' && !Array.isArray(raw.states)) {
        specs.states = raw.states;
      } else {
        console.warn(`Invalid ${where} states: expected a concept-keyed map. Ignoring.`);
      }
    }

    // accessibility — today only `label`, a prop reference
    if (raw.accessibility !== undefined && raw.accessibility !== null) {
      const label = typeof raw.accessibility === 'object' ? raw.accessibility.label : undefined;
      const prop = label && typeof label === 'object' ? label.prop : undefined;
      if (typeof prop === 'string' && prop.trim() !== '') {
        specs.accessibility = { label: { prop: prop.trim() } };
      } else {
        console.warn(`Invalid ${where} accessibility: expected label.prop to name a prop. Ignoring.`);
      }
    }

    // value — { prop, indeterminate? }, prop required
    if (raw.value !== undefined && raw.value !== null) {
      const v = (typeof raw.value === 'object' ? raw.value : {}) as Record<string, unknown>;
      const prop = typeof v.prop === 'string' && v.prop.trim() !== '' ? v.prop.trim() : undefined;
      const indeterminate = typeof v.indeterminate === 'string' && v.indeterminate.trim() !== ''
        ? v.indeterminate.trim()
        : undefined;
      if (prop) {
        specs.value = { prop, ...(indeterminate && { indeterminate }) };
      } else {
        console.warn(`Invalid ${where} value: prop must name the prop carrying the value. Ignoring.`);
      }
    }

    return Object.keys(specs).length ? specs : undefined;
  }

  /**
   * Resolve one platform's conventions. `where` names the file in any warning, so a
   * reader knows which of several conventions files to fix.
   */
  private resolvePlatform(id: string, parsed: unknown): ResolvedPlatformConventions {
    const where = `conventions/${id}.yaml`;
    const raw = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

    const platform: ResolvedPlatformConventions = {
      naming: 'NONE',
      slotConstraints: raw.slotConstraints === true,
      inferNumberProps: raw.inferNumberProps === true,
      inferComposableSlots: raw.inferComposableSlots === true,
    };

    // naming
    const validNaming = ['NONE', 'SENTENCE', 'TITLE'];
    const naming = typeof raw.naming === 'string' ? raw.naming.toUpperCase() : undefined;
    if (naming && validNaming.includes(naming)) {
      platform.naming = naming as ResolvedPlatformConventions['naming'];
    }

    // glyphs — at least one declared form survives (ADR-103): a non-empty match
    // string, and/or a structure whose children is a non-empty array. A block
    // carrying neither is dropped.
    if (raw.glyphs !== undefined && raw.glyphs !== null && typeof raw.glyphs === 'object') {
      const match = raw.glyphs.match;
      const structure = raw.glyphs.structure as { children?: unknown[] } | undefined;
      const glyphs: NonNullable<ResolvedPlatformConventions['glyphs']> = {};
      if (typeof match === 'string' && match.trim() !== '') {
        glyphs.match = match;
      }
      if (structure && typeof structure === 'object' && Array.isArray(structure.children) && structure.children.length > 0) {
        glyphs.structure = structure as NonNullable<ResolvedPlatformConventions['glyphs']>['structure'];
      }
      if (glyphs.match || glyphs.structure) {
        platform.glyphs = glyphs;
      }
    }

    // codeOnlyProps — a non-empty match string, else the block is dropped
    if (raw.codeOnlyProps !== undefined && raw.codeOnlyProps !== null) {
      const match = typeof raw.codeOnlyProps === 'object' ? raw.codeOnlyProps.match : undefined;
      if (typeof match === 'string' && match.trim() !== '') {
        platform.codeOnlyProps = { match };
      }
    }

    // objectProps (ADR-111). Presence of the block is the on-switch; separator
    // defaults to "." inside a declared block. Absence means no folding.
    if (raw.objectProps !== undefined) {
      if (raw.objectProps === null || typeof raw.objectProps !== 'object') {
        console.warn(`Invalid ${where} objectProps: expected an object. Using default: { separator: "." }`);
        platform.objectProps = { separator: '.' };
      } else {
        const sep = (raw.objectProps as Record<string, unknown>).separator;
        let separator = '.';
        if (sep !== undefined) {
          if (typeof sep === 'string' && sep !== '') {
            separator = sep;
          } else {
            console.warn(`Invalid ${where} objectProps.separator: expected a non-empty string. Using default: "."`);
          }
        }
        platform.objectProps = { separator };
      }
    }

    // subcomponents
    if (raw.subcomponents !== undefined && raw.subcomponents !== null && typeof raw.subcomponents === 'object') {
      const subs = raw.subcomponents;
      const validScopes = ['NESTED', 'PAGE'];
      if (!Array.isArray(subs.match) || subs.match.length === 0) {
        console.warn(`Invalid ${where} subcomponents.match: must be a non-empty array of strings. Removing subcomponents convention.`);
      } else {
        platform.subcomponents = {
          scope: validScopes.includes(subs.scope) ? subs.scope : 'NESTED',
          match: subs.match,
          ...(Array.isArray(subs.exclude) && { exclude: subs.exclude }),
        };
      }
    }

    // instanceExamples (ADR-050). The on-switch is the presence of the block;
    // match is an OPTIONAL name filter — when invalid, drop just the filter.
    if (raw.instanceExamples !== undefined && raw.instanceExamples !== null && typeof raw.instanceExamples === 'object') {
      const ie = raw.instanceExamples;
      const validIeScopes = ['PAGE', 'FILE'];
      let match = ie.match;
      if (match !== undefined && (!Array.isArray(match) || match.length === 0)) {
        console.warn(`Invalid ${where} instanceExamples.match: when provided, must be a non-empty array of strings. Ignoring match filter.`);
        match = undefined;
      }
      platform.instanceExamples = {
        scope: validIeScopes.includes(ie.scope) ? ie.scope : 'PAGE',
        ...(match !== undefined && { match }),
        ...(Array.isArray(ie.exclude) && { exclude: ie.exclude }),
        ...(Array.isArray(ie.parentNames) && { parentNames: ie.parentNames }),
      };
    }

    // images (ADR-063, ADR-077). Presence of the block is the on-switch; each member
    // is an independent trigger. `component` is this platform's name for the same
    // component `match` names in Figma.
    if (raw.images !== undefined) {
      const img = raw.images as Record<string, unknown>;
      if (img === null || typeof img !== 'object') {
        console.warn(`Invalid ${where} images: expected an object. Removing images convention.`);
      } else {
        if (img.backgroundImage !== undefined && typeof img.backgroundImage !== 'boolean') {
          console.warn(`Invalid ${where} images.backgroundImage: expected boolean, got ${typeof img.backgroundImage}. Using default: false`);
        }
        const sourceProps = Array.isArray(img.sourceProps)
          ? (img.sourceProps as unknown[]).filter((v): v is string => typeof v === 'string' && v.trim() !== '').map(v => v.trim())
          : [];
        if (img.sourceProps !== undefined && (!Array.isArray(img.sourceProps) || sourceProps.length === 0)) {
          console.warn(`Invalid ${where} images.sourceProps: expected a non-empty array of strings. Ignoring sourceProps.`);
        }
        let match = typeof img.match === 'string' && (img.match as string).trim() !== ''
          ? (img.match as string).trim()
          : undefined;
        if (img.match !== undefined && !match) {
          console.warn(`Invalid ${where} images.match: expected a non-empty string. Ignoring match.`);
        }
        // The designated component needs a forwarding target: sourceProps[0].
        if (match && sourceProps.length === 0) {
          console.warn(`${where} images.match requires a non-empty sourceProps (sourceProps[0] is its source prop). Ignoring match.`);
          match = undefined;
        }
        const component = typeof img.component === 'string' && (img.component as string).trim() !== ''
          ? (img.component as string).trim()
          : undefined;
        platform.images = {
          backgroundImage: img.backgroundImage === true,
          ...(match && { match }),
          ...(component && { component }),
          sourceProps,
        };
      }
    }

    // Relocated keys (ADR-073 Decision 4, ADR-067). This method builds from an
    // allowlist, so an unrecognized key is otherwise dropped in silence — a
    // workspace would lose its state classification and still transform. Name the
    // new home instead.
    if (raw.states !== undefined) {
      console.warn(`${where} states: moved to conventions/${SPECS_FILE}.yaml (ADR-073 Decision 4). Ignoring it here.`);
    }
    if (raw.propRoles !== undefined) {
      console.warn(`${where} propRoles: replaced by accessibility.label and value in conventions/${SPECS_FILE}.yaml (ADR-073 Decision 4). Ignoring it here.`);
    }
    if (raw.roleValidation !== undefined) {
      console.warn(`${where} roleValidation: moved to settings.yaml spec.roleValidation (ADR-067). Ignoring it here.`);
    }
    if (raw.slots !== undefined) {
      console.warn(`${where} slots: moved to conventions/${SPECS_FILE}.yaml (ADR-099) — the default slot names a prop the spec declares, not a platform fact. Ignoring it here.`);
    }

    // defaultFillWidth (ADR-081) — a positive number, else ignored
    if (raw.defaultFillWidth !== undefined) {
      if (typeof raw.defaultFillWidth === 'number' && Number.isFinite(raw.defaultFillWidth) && raw.defaultFillWidth > 0) {
        platform.defaultFillWidth = raw.defaultFillWidth;
      } else {
        console.warn(`Invalid ${where} defaultFillWidth: expected a positive number. Ignoring.`);
      }
    }

    // stylesProp — the prop receiving styling no promotion mapped, one per platform
    // (ADR-076). Promotion targets are named by the spec, so there is no per-primitive
    // block to fold it into.
    if (typeof raw.stylesProp === 'string' && raw.stylesProp.trim() !== '') {
      platform.stylesProp = raw.stylesProp.trim();
    }

    return platform;
  }

  /**
   * Resolve settings: deep-merge over DEFAULT_SETTINGS, then validate and
   * correct, replacing invalid enum values with defaults.
   */
  private resolveSettings(parsed: unknown): ResolvedSettings {
    // settings.yaml is a governed surface (schema Settings). A key the schema
    // does not declare is ignored WITH a warning naming it — never silently:
    // a silent pass-through is indistinguishable from a typo doing nothing,
    // and is how an undeclared surface once grew without an ADR.
    if (parsed && typeof parsed === 'object') {
      const KNOWN_SETTINGS_KEYS = ['author', 'curation', 'data', 'spec', 'assets'];
      for (const key of Object.keys(parsed as Record<string, unknown>)) {
        if (!KNOWN_SETTINGS_KEYS.includes(key)) {
          console.warn(`⚠ settings.yaml: unknown setting "${key}" ignored (known: ${KNOWN_SETTINGS_KEYS.join(', ')})`);
          delete (parsed as Record<string, unknown>)[key];
        }
      }
    }
    const merged = parsed
      ? this.deepMerge(DEFAULT_SETTINGS, parsed as Partial<Settings>)
      : DEFAULT_SETTINGS;
    const corrected = JSON.parse(JSON.stringify(merged)) as ResolvedSettings;

    // Guard against null/undefined nested objects from YAML parsing
    // (YAML parsing of keys with only comments produces null instead of empty object)
    if (!corrected.spec || typeof corrected.spec !== 'object') {
      if ((merged as Record<string, unknown>).spec !== undefined) {
        console.warn('⚠ settings.yaml: `spec` is not a mapping (a section holding only comments parses as null). Using defaults for the whole section.');
      }
      corrected.spec = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.spec));
    }
    if (!corrected.curation || typeof corrected.curation !== 'object') {
      if ((merged as Record<string, unknown>).curation !== undefined) {
        console.warn('⚠ settings.yaml: `curation` is not a mapping. Using defaults for the whole section.');
      }
      corrected.curation = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.curation));
    }
    if (corrected.data !== undefined && (corrected.data === null || typeof corrected.data !== 'object')) {
      delete corrected.data;
    }
    if (corrected.assets !== undefined && (corrected.assets === null || typeof corrected.assets !== 'object')) {
      delete corrected.assets;
    }

    const spec = corrected.spec;

    // Valid enum options (authoritative lists in schema Settings.ts)
    const validKeys = ['SAFE', 'CAMEL', 'SNAKE', 'KEBAB', 'PASCAL', 'TRAIN'];
    const validFormats = ['JSON', 'YAML'];
    const validLayouts = ['LAYOUT', 'PARENT_CHILDREN', 'BOTH'];
    const validTokens = ['TOKEN', 'TOKEN_NAME', 'TOKEN_FIGMA_EXTENSIONS', 'FIGMA_NAME', 'CUSTOM', 'FIGMA_SYNTAX_WEB', 'FIGMA_SYNTAX_IOS', 'FIGMA_SYNTAX_ANDROID'];
    const validColors = ['HEX', 'HEXA', 'RGB', 'RGBA', 'HSLA', 'HSB', 'OKLCH', 'OKLAB', 'OBJECT'];
    const validVariantDepths = [1, 2, 3, 9999];
    const validDetails = ['FULL', 'LAYERED'];

    // No silent transformation and no silent substitution on a governed
    // surface: a value the schema does not declare — including a case variant
    // like `camel` — warns, names the valid values, and falls back to the
    // default. The author said something specific; discarding it without a
    // signal is worse than rejecting it.
    const enumCheck = <K extends string | number>(
      field: string, value: unknown, valid: readonly K[], fallback: K, optional = false,
    ): K => {
      if (optional && (value === undefined || value === null)) return value as K;
      if (valid.includes(value as K)) return value as K;
      if (value !== undefined && value !== null && value !== '') {
        console.warn(`⚠ settings.spec.${field}: "${String(value)}" is not a valid value (valid: ${valid.join(', ')}). Using default: ${fallback}`);
      }
      return fallback;
    };
    spec.keys = enumCheck('keys', spec.keys, validKeys as readonly typeof spec.keys[], DEFAULT_SETTINGS.spec.keys);
    spec.format = enumCheck('format', spec.format, validFormats as readonly typeof spec.format[], DEFAULT_SETTINGS.spec.format);
    spec.layout = enumCheck('layout', spec.layout, validLayouts as readonly typeof spec.layout[], DEFAULT_SETTINGS.spec.layout);
    spec.tokens = enumCheck('tokens', spec.tokens, validTokens as readonly NonNullable<typeof spec.tokens>[], DEFAULT_SETTINGS.spec.tokens, true);
    spec.color = enumCheck('color', spec.color, validColors as readonly typeof spec.color[], DEFAULT_SETTINGS.spec.color);
    spec.variantDepth = enumCheck('variantDepth', spec.variantDepth, validVariantDepths as readonly typeof spec.variantDepth[], DEFAULT_SETTINGS.spec.variantDepth);
    spec.details = enumCheck('details', spec.details, validDetails as readonly typeof spec.details[], DEFAULT_SETTINGS.spec.details);
    // An invalid value falls back to the schema default, like every other field
    // here. Naming a value of its own would make this a second place a default is
    // stated, which is how the schema and the scaffold drifted (ADR-112).
    if (typeof spec.collapsePrimitiveWrapper !== 'boolean') {
      if (spec.collapsePrimitiveWrapper !== undefined) {
        console.warn(
          `Invalid settings.spec.collapsePrimitiveWrapper: expected boolean, got ${typeof spec.collapsePrimitiveWrapper}. Using default: ${DEFAULT_SETTINGS.spec.collapsePrimitiveWrapper}`
        );
      }
      spec.collapsePrimitiveWrapper = DEFAULT_SETTINGS.spec.collapsePrimitiveWrapper;
    }

    // roleValidation (ADR-067) — severity for unmet required role obligations
    if (!['warn', 'error'].includes(spec.roleValidation)) {
      if ((spec as Record<string, unknown>).roleValidation !== undefined) {
        console.warn(`Invalid settings.spec.roleValidation: expected 'warn' or 'error'. Using default: ${DEFAULT_SETTINGS.spec.roleValidation}`);
      }
      spec.roleValidation = DEFAULT_SETTINGS.spec.roleValidation;
    }

    // defaultSlotContent activates only on a literal boolean `true`. Any other
    // value (e.g. the string "yes", a number, or undefined) is treated as off.
    const dsc = (spec as Record<string, unknown>).defaultSlotContent;
    if (dsc !== undefined && typeof dsc !== 'boolean') {
      console.warn(`Invalid settings.spec.defaultSlotContent: expected boolean, got ${typeof dsc}. Using default: false`);
    }
    if (dsc !== true) {
      spec.defaultSlotContent = false;
    }

    // Split flags: booleans only. These are required on ResolvedSettings, so an
    // invalid value is replaced with the schema default rather than removed.
    for (const flag of ['splitComponents', 'splitConcerns', 'useSubfolders'] as const) {
      const value = (spec as Record<string, unknown>)[flag];
      if (typeof value !== 'boolean') {
        if (value !== undefined) {
          console.warn(
            `Invalid settings.spec.${flag}: expected boolean, got ${typeof value}. Using default: ${DEFAULT_SETTINGS.spec[flag]}`
          );
        }
        spec[flag] = DEFAULT_SETTINGS.spec[flag];
      }
    }

    // curation (ADR-093) — which components of a library a run specs.
    const curation = corrected.curation;
    const validSelections = ['READY_FOR_DEV', 'ALL'];
    curation.defaultSelection = (
      typeof curation.defaultSelection === 'string' ? curation.defaultSelection.toUpperCase() : ''
    ) as typeof curation.defaultSelection;
    if (!validSelections.includes(curation.defaultSelection)) {
      if ((curation as Record<string, unknown>).defaultSelection) {
        console.warn(
          `Invalid settings.curation.defaultSelection: expected 'READY_FOR_DEV' or 'ALL'. Using default: ${DEFAULT_SETTINGS.curation.defaultSelection}`
        );
      }
      curation.defaultSelection = DEFAULT_SETTINGS.curation.defaultSelection;
    }
    for (const flag of ['preserveManualSelections', 'includeDependencies'] as const) {
      const value = (curation as Record<string, unknown>)[flag];
      if (typeof value !== 'boolean') {
        if (value !== undefined) {
          console.warn(
            `Invalid settings.curation.${flag}: expected boolean, got ${typeof value}. Using default: ${DEFAULT_SETTINGS.curation[flag]}`
          );
        }
        curation[flag] = DEFAULT_SETTINGS.curation[flag];
      }
    }

    return corrected;
  }

  /**
   * Resolve relative data/spec directories against the directory the
   * configuration was loaded from.
   */
  private resolveSettingsDirectories(settings: ResolvedSettings, configDir: string): void {
    if (settings.data?.directory && !path.isAbsolute(settings.data.directory)) {
      settings.data.directory = path.resolve(configDir, settings.data.directory);
    }
    if (settings.spec.directory && !path.isAbsolute(settings.spec.directory)) {
      settings.spec.directory = path.resolve(configDir, settings.spec.directory);
    }
  }

  /**
   * Deep merge two objects, with source overriding target
   * Null values from source are ignored to prevent YAML parsing issues
   * (empty sections with only comments parse as null, not empty objects)
   */
  private deepMerge<T>(target: T, source: Partial<T>): T {
    if (!source || typeof source !== 'object') {
      return target;
    }

    const result = { ...target } as Record<string, unknown>;

    for (const key in source) {
      if (source[key] !== undefined && source[key] !== null) {
        const sourceValue = source[key];
        if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
          result[key] = this.deepMerge((result[key] as T) || ({} as T), sourceValue);
        } else {
          result[key] = sourceValue;
        }
      }
    }

    return result as T;
  }

  /**
   * Get default configuration with convention-based defaults
   */
  private getDefaultConfig(): CLIConfig {
    const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as ResolvedSettings;
    settings.data = { directory: path.resolve(CONFIG_DEFAULTS.dataDirectory) };
    settings.spec.directory = path.resolve(CONFIG_DEFAULTS.outputDirectory);

    return {
      // A workspace that declares nothing. Copied rather than shared, so a consumer
      // mutating its config cannot reach the exported constant.
      conventions: { ...DEFAULT_CONVENTIONS },
      settings,
    };
  }
}
