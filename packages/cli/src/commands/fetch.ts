/**
 * Fetch Command - Download and store raw Figma REST API payloads
 *
 * Purpose:
 * - Fetch file JSON, variables, and styles for one or more Figma files
 * - Store raw payloads on disk (no transforms)
 * - Enable generate/batch to load and merge in-memory later
 */

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import readline from 'readline';
import { collectGlyphComponents } from '../utilities/glyphComponents.js';
import { hasGlyphConvention } from '../utilities/glyphConvention.js';
import { startSpinner, clearInlineStatus, renderInlineStatus, isInteractive, formatElapsed, erasePrintedLine } from '../utilities/spinner.js';
import { refreshCache } from '../cache/cache.js';
import { reportCache } from '../cache/report.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { ERROR_CODES } from '../utilities/errorCodes.js';

import type { SourceEntry } from '@directededges/specs-schema';
import { figmaOf } from '../config/PlatformConventions.js';
import { MAX_JSON_STRING_BYTES, readJsonPayload } from '../utilities/payloadRead.js';
import { PayloadSplitter, splitDirFor } from '../utilities/payloadSplit.js';
import { lastFetchedBytes, preparingMessage, formatPayloadSize } from '../fetch/estimate.js';
import { SectionedFile } from '../utilities/sectionedFile.js';
import { resolveFigmaFileKey, slugifyBranchName, FigmaKeyError } from '../fetch/fileKey.js';
import { postGetVariables } from '../bridge/client.js';
import { resolveFileKey } from '../bridge/pickConnection.js';

type FetchKind = 'file' | 'variables' | 'styles' | 'icons';

/**
 * A source to fetch. `config` sources come from `data.sources`; `adhoc` sources are
 * named on the command line by `--source`, live only for the run that names them,
 * and exist so a Figma branch can be fetched and diffed without editing config.
 */
interface FetchSource {
  alias: string;
  key: string;
  fetch: FetchKind[];
  origin: 'config' | 'adhoc';
  /** Ad-hoc only: the file this key branches from, per the API's `branch_data`. */
  mainFileKey?: string;
  /** Ad-hoc only: the configured alias whose key equals `mainFileKey`. */
  parentAlias?: string;
  /** Ad-hoc only: the branch's name as Figma reports it on the parent file. */
  branchName?: string;
}

export { collectGlyphComponents };

async function streamToString(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return '';
  const chunks: Buffer[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

const FETCH_KINDS: readonly FetchKind[] = ['file', 'variables', 'styles', 'icons'];

function isFetchKind(value: string): value is FetchKind {
  return (FETCH_KINDS as readonly string[]).includes(value);
}

function splitOnly(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/** One configured source whose `key` cannot address a Figma file. */
export interface SourceKeyProblem {
  alias: string;
  /** What the config holds, rendered for display — `(empty)` when there is nothing. */
  found: string;
  reason: string;
}

/**
 * Configured sources, with every `key` resolved the same way `--source` resolves
 * one: a bare key passes through, a pasted Figma URL becomes its key.
 *
 * An unusable key is collected rather than thrown, so one run names every source
 * that needs fixing instead of failing at the first and hiding the rest. `fetch`
 * is the only consumer of a source's file key — the bridge and Storybook read
 * aliases only — so this is the right place for the check, and it has to happen
 * before any request: an absent key reaches the API as the literal string
 * "undefined" and comes back a 404 that reads as a stale key (specs#706).
 */
export function normalizeSources(
  sources?: Record<string, SourceEntry>
): { entries: FetchSource[]; problems: SourceKeyProblem[] } {
  if (!sources) return { entries: [], problems: [] };

  const entries: FetchSource[] = [];
  const problems: SourceKeyProblem[] = [];

  for (const [alias, entry] of Object.entries(sources)) {
    const raw: unknown = entry?.key;
    const fetch = (entry?.fetch ?? []).filter(isFetchKind);

    // A YAML `key:` with nothing after it parses as null, not as a missing field —
    // which is how an absent key reached the API as the string "undefined".
    const absent = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (absent || typeof raw !== 'string') {
      problems.push({
        alias,
        found: absent ? '(empty)' : String(raw),
        reason: absent ? 'no key is set' : `expected a file key, found ${typeof raw}`
      });
      continue;
    }

    try {
      entries.push({ alias, key: resolveFigmaFileKey(raw), fetch, origin: 'config' });
    } catch (error) {
      problems.push({
        alias,
        found: raw.trim(),
        reason: error instanceof FigmaKeyError ? error.message.split('\n')[0] : String(error)
      });
    }
  }

  return { entries, problems };
}

/** Every unusable key, named with the field to edit and what to put there. */
export function formatSourceKeyProblems(problems: SourceKeyProblem[], configPath: string | null): string {
  const lines = [
    `Error: ${problems.length === 1 ? 'A configured source cannot' : `${problems.length} configured sources cannot`} address a Figma file.`
  ];
  for (const problem of problems) {
    lines.push(`  data.sources.${problem.alias}.key — ${problem.reason} (found: ${problem.found})`);
  }
  lines.push(
    `  Set each to a file key, or paste the file's Figma URL and it will be read from that.`,
    `  Check: ${configReference(configPath)}`
  );
  return lines.join('\n');
}

/** One `--source` value: `<url|key>`, or `<alias>=<url|key>` to name it yourself. */
interface AdHocSpec { alias?: string; key: string; raw: string }

export function parseAdHocSource(value: string): AdHocSpec {
  const raw = value.trim();
  // Split on the first `=` only: a key never contains one, and a URL's query string may.
  const separator = raw.indexOf('=');
  const looksAliased = separator > 0 && !raw.slice(0, separator).includes('/');

  const alias = looksAliased ? raw.slice(0, separator).trim() : undefined;
  const target = looksAliased ? raw.slice(separator + 1).trim() : raw;

  if (alias !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(alias)) {
    throw new FigmaKeyError(`Not a usable source alias: "${alias}"\n  Aliases become filenames — use letters, digits, "-" and "_"`);
  }

  return { alias, key: resolveFigmaFileKey(target), raw };
}

interface BranchProbe {
  name?: string;
  mainFileKey?: string;
}

/**
 * Read a file's identity without downloading it: `depth=1` returns the document node and
 * nothing below it, and `branch_data=true` adds `mainFileKey` when the key is a branch.
 * The payload a diff reads is the full file; this is only about naming the source and
 * knowing which configured source's data kinds to copy — and it means a bad key or token
 * fails before the large request rather than after it.
 */
async function probeFile(key: string, token: string): Promise<{ status: number; headers: Headers; data: BranchProbe }> {
  const url = `https://api.figma.com/v1/files/${key}?depth=1&branch_data=true`;
  const response = await figmaFetch(url, token);
  if (response.status !== 200) {
    return { status: response.status, headers: response.headers, data: {} };
  }
  const body = await streamToString(response.stream);
  return { status: response.status, headers: response.headers, data: JSON.parse(body) as BranchProbe };
}

/**
 * Figma builds a file payload before it sends any of it, so a request can sit
 * silent for minutes with nothing wrong. Only that silence is deadlined: once
 * the first byte arrives the transfer runs unbounded, because a download already
 * in flight is making progress and a partial payload is worth nothing.
 */
const FIRST_BYTE_TIMEOUT_MS = 4 * 60 * 1000;

/** Figma never started sending — distinct from a transfer that began and broke. */
export class FirstByteTimeoutError extends Error {
  constructor(readonly waitedMs: number) {
    super(`Figma did not start sending within ${Math.round(waitedMs / 1000)} seconds`);
    this.name = 'FirstByteTimeoutError';
  }
}

export async function figmaFetch(
  url: string,
  token: string,
  firstByteTimeoutMs: number = FIRST_BYTE_TIMEOUT_MS
): Promise<{ status: number; body: string; headers: Headers; stream: ReadableStream<Uint8Array> | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), firstByteTimeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'X-Figma-Token': token
      },
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) throw new FirstByteTimeoutError(firstByteTimeoutMs);
    throw error;
  } finally {
    // The deadline covers the wait, not the body that follows it.
    clearTimeout(timer);
  }

  if (response.status !== 200) {
    const body = await response.text();
    return { status: response.status, body, headers: response.headers, stream: null };
  }

  return { status: response.status, body: '', headers: response.headers, stream: response.body };
}

const RATE_LIMIT_TYPE_LABELS: Record<string, string> = {
  low: 'Viewer / Collab (low)',
  high: 'Dev / Full (high)'
};

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return `${totalSeconds}s`;

  const units: Array<[string, number]> = [
    ['month', 30 * 24 * 60 * 60],
    ['day', 24 * 60 * 60],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1]
  ];

  for (const [unit, divisor] of units) {
    if (totalSeconds >= divisor) {
      const value = Math.round(totalSeconds / divisor);
      return `${value} ${unit}${value !== 1 ? 's' : ''}`;
    }
  }

  return '0 seconds';
}

export function formatRateLimitError(alias: string, kind: string, headers: Headers): string {
  const lines = [`Error: Rate limited (429) while fetching ${alias}.${kind}`];

  const retryAfter = headers.get('retry-after');
  if (retryAfter) lines.push(`  Retry after: ${formatDuration(Number(retryAfter))}`);

  const limitType = headers.get('x-figma-rate-limit-type');
  if (limitType) {
    const label = RATE_LIMIT_TYPE_LABELS[limitType] ?? limitType;
    lines.push(`  Seat tier: ${label}`);
  }

  const planTier = headers.get('x-figma-plan-tier');
  if (planTier) {
    lines.push(`  Plan: ${planTier.charAt(0).toUpperCase()}${planTier.slice(1)}`);
  }

  lines.push('  See: https://developers.figma.com/docs/rest-api/rate-limits/');

  return lines.join('\n');
}

function classifyHttpStatus(status: number): 'ok' | 'auth' | 'rate' | 'error' {
  if (status === 200) return 'ok';
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate';
  return 'error';
}

function configReference(configPath: string | null): string {
  return configPath || 'the workspace settings (config/settings.yaml)';
}

export function formatNotFoundError(alias: string, kind: string, configPath: string | null, origin: 'config' | 'adhoc' = 'config'): string {
  if (origin === 'adhoc') {
    return [
      `Error: File not found (404) while fetching ${alias}.${kind}`,
      `  Figma returned 404 for the key passed as --source ${alias}.`,
      '    • Check the URL you pasted still opens in Figma (a deleted branch keeps its URL)',
      '    • Your FIGMA_TOKEN account must be able to open it'
    ].join('\n');
  }

  return [
    `Error: File not found (404) while fetching ${alias}.${kind}`,
    `  Figma returned 404 for the file key configured for "${alias}".`,
    '  This usually means the key in your config is stale or out of reach:',
    '    • The file was moved, deleted, or recreated (keys change on duplicate/recreate)',
    '    • Your FIGMA_TOKEN account cannot open this file',
    `  Check: data.sources.${alias}.key in ${configReference(configPath)}`
  ].join('\n');
}

export function formatAuthError(status: number, alias: string, kind: string, configPath: string | null, key?: string, origin: 'config' | 'adhoc' = 'config'): string {
  if (status === 403) {
    const keyHint = key ? `  File key: ${key}` : '';
    if (origin === 'adhoc') {
      return [
        `Error: Access denied (403) while fetching ${alias}.${kind}`,
        '  Your FIGMA_TOKEN is valid but cannot access the file passed as --source.',
        '    • Personal access tokens only reach files your account can view',
        '    • If your org enforces SAML/SSO, personal access tokens are blocked',
        '      Use an OAuth token or ask your admin to allow PATs',
        ...(keyHint ? [keyHint] : [])
      ].join('\n');
    }
    return [
      `Error: Access denied (403) while fetching ${alias}.${kind}`,
      '  Your FIGMA_TOKEN is valid but cannot access this file.',
      `    • Confirm your Figma account can open the file for data.sources.${alias}.key`,
      '    • Personal access tokens only reach files your account can view',
      '    • If your org enforces SAML/SSO, personal access tokens are blocked',
      '      Use an OAuth token or ask your admin to allow PATs',
      '      See: https://www.figma.com/developers/api#oauth2',
      '    • The file may be in personal drafts or a restricted team (403 = exists but no access)',
      ...(keyHint ? [keyHint] : []),
      `  Check: data.sources.${alias}.key in ${configReference(configPath)}`
    ].join('\n');
  }

  return [
    `Error: Authentication failed (${status}) while fetching ${alias}.${kind}`,
    '  Your FIGMA_TOKEN is missing, invalid, or expired.',
    '  Add it to a .env file as FIGMA_TOKEN=your_token_here',
    '  Create a new token: https://www.figma.com/developers/api#access-tokens'
  ].join('\n');
}


export interface FetchOptions {
  config?: string;
  dataDir?: string;
  outDir?: string; // deprecated alias for --data-dir
  only?: string;
  source?: string[];
  fromBridge?: boolean;
  file?: string;
  geometry: boolean;
  verbose: boolean;
}

/**
 * Which configured source a bridge variables payload belongs to. A bridge fetch writes
 * to a configured alias's filenames — that is what lets cache, generate, and render find
 * the payload — so the payload must be attributable to a source the workspace declares.
 * The connected file's key decides when it matches; the plugin cannot always read the
 * real key (it reports an `unsaved-` placeholder without file-key access), so an
 * explicit `--only <alias>` names the destination when key matching cannot.
 */
export function matchBridgeSource(
  sources: Array<{ alias: string; key: string }>,
  fileKey: string | undefined,
  onlyAliases: string[]
): { entry: { alias: string; key: string } } | { error: string } {
  const entry = fileKey ? sources.find(s => s.key === fileKey) : undefined;
  if (entry) {
    if (onlyAliases.length > 0 && !onlyAliases.includes(entry.alias)) {
      return { error: `Error: the connected file is the source "${entry.alias}", but --only named ${onlyAliases.join(', ')}.` };
    }
    return { entry };
  }

  if (onlyAliases.length === 1) {
    const named = sources.find(s => s.alias === onlyAliases[0]);
    if (named) return { entry: named };
  }

  return {
    error: [
      `Error: the connected Figma file (${fileKey ?? 'unknown'}) is not a configured source.`,
      '  A bridge fetch writes to a configured alias\'s filenames so generate and render can find it.',
      '  If this file is one of your sources, name it: --only variables,<alias>',
      `  Sources: ${sources.map(s => `${s.alias} (${s.key})`).join(', ') || '(none)'}`
    ].join('\n')
  };
}

export const Fetch = new Command('fetch')
  .description('Fetch raw REST payloads (file, variables, styles) for configured Figma files')
  .option('--config <path>', 'Path to a config/ directory or legacy specs.config.yaml')
  .option('--data-dir <dir>', 'Override data directory (default: data.directory from the workspace settings, or ./data)')
  .option('--outDir <dir>', 'Deprecated: use --data-dir')
  .option('--only <name[,name...]>', 'Fetch only these — a file alias from sources, a data kind (file, variables, styles, icons), or both')
  .option(
    '--source <[alias=]url|key>',
    'Fetch a file or branch that is not in config — pass its Figma URL or key. Repeatable. Names itself after the branch unless you pass alias=',
    (value: string, previous: string[] = []) => previous.concat(value)
  )
  .option('--no-geometry', 'Omit geometry data (fillGeometry, strokeGeometry, size, relativeTransform) from file payloads')
  .option('--from-bridge', 'Fetch variables from the connected Figma file via the CLI bridge instead of the REST API (no FIGMA_TOKEN or Enterprise plan needed) — combine with --only variables')
  .option('--file <fileKey>', 'Target a specific connected Figma file with --from-bridge (prompts to choose if more than one is connected in an interactive terminal; required otherwise)')
  .option('--verbose', 'Enable detailed logging', false)
  .action(async (options: FetchOptions) => {
    try {
      const configPath = options.config ? path.resolve(options.config) : null;
      const config = new ConfigLoader().load(options.config);
      const configDir = config.configDir ?? process.cwd();

      if (options.outDir && !options.dataDir) {
        console.error('Warning: --outDir is deprecated, use --data-dir instead');
      }
      const outDirValue = options.dataDir || options.outDir || config.settings.data?.directory || 'data';
      const outDir = path.resolve(configDir, outDirValue);

      const normalized = normalizeSources(config.settings.data?.sources);
      const fileEntries = normalized.entries;
      // Before anything else: a key that cannot address a file is a config error,
      // and no amount of network work will turn it into one.
      if (normalized.problems.length > 0) {
        console.error(formatSourceKeyProblems(normalized.problems, configPath));
        process.exit(ERROR_CODES.INVALID_ARGS);
      }
      const adHocValues = options.source ?? [];
      if (fileEntries.length === 0 && adHocValues.length === 0) {
        console.error('Error: No sources configured');
        console.error('Add to config/settings.yaml:');
        console.error('  data:');
        console.error('    directory: data');
        console.error('    sources:');
        console.error('      library:');
        console.error('        key: "<FILE_KEY>"');
        console.error('        fetch: ["file","variables","styles"]');
        process.exit(ERROR_CODES.INVALID_ARGS);
      }

      // `--only` narrows two independent axes: which source files to fetch, and which kinds
      // of data to fetch for them. A value naming a data kind narrows the kind; anything
      // else is read as a file alias. Both can be given together (`--only library,icons`).
      const onlyValues = splitOnly(options.only);
      const onlyKinds = onlyValues.filter(isFetchKind);
      const onlyAliases = onlyValues.filter(v => !isFetchKind(v));

      // An alias sharing a data kind's name would be silently unreachable, so say so
      // rather than guess which the caller meant.
      const shadowed = fileEntries.map(f => f.alias).filter(isFetchKind);
      if (shadowed.length > 0 && onlyKinds.some(k => shadowed.includes(k))) {
        console.error(`Error: --only "${onlyKinds.filter(k => shadowed.includes(k)).join(', ')}" is both a data kind and a source alias.`);
        console.error('Rename the source alias, or drop --only and let config decide.');
        process.exit(ERROR_CODES.INVALID_ARGS);
      }

      // Every name has to mean something. A typo alongside a valid alias would otherwise
      // fetch more than was asked for and say nothing — the opposite of what --only is for.
      const unmatched = onlyAliases.filter(a => !fileEntries.some(f => f.alias === a));
      if (unmatched.length > 0) {
        console.error(`Error: --only ${unmatched.join(', ')} — not a source alias or a data kind.`);
        console.error(`Aliases: ${fileEntries.map(f => f.alias).join(', ') || '(none)'}`);
        console.error(`Kinds:   ${FETCH_KINDS.join(', ')}`);
        process.exit(ERROR_CODES.INVALID_ARGS);
      }

      // -------------------------------------------------------------------
      // Bridge mode (--from-bridge): read variables through the connected plugin
      // instead of the REST API. The plugin shapes the payload like the REST
      // variables/local response, so the written file — and everything that reads
      // it — is identical between the two paths. This is what makes variables
      // reachable without an Enterprise plan (the REST variables endpoints are
      // Enterprise-only; the Plugin API is not).
      // -------------------------------------------------------------------
      if (options.fromBridge) {
        if (adHocValues.length > 0) {
          console.error('Error: --from-bridge reads from the connected Figma file — it cannot be combined with --source.');
          process.exit(ERROR_CODES.INVALID_ARGS);
        }
        if (!(onlyKinds.length === 1 && onlyKinds[0] === 'variables')) {
          console.error('Error: --from-bridge currently fetches variables only.');
          console.error('  Run: specs fetch --only variables --from-bridge');
          process.exit(ERROR_CODES.INVALID_ARGS);
        }

        let result;
        try {
          const fileKey = await resolveFileKey(options.file);
          result = await postGetVariables({ fileKey });
        } catch (e) {
          const err = e as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
          if (err.cause && err.cause.code === 'ECONNREFUSED') {
            console.error('Error: bridge is not running.');
            console.error('  Start it with: specs bridge start');
          } else {
            console.error(`Error: ${err.message}`);
          }
          process.exit(ERROR_CODES.GENERAL_ERROR);
        }

        if (!result.success || !result.meta) {
          const msg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error ?? 'Bridge returned no variables payload.');
          console.error(`Error: ${msg}`);
          process.exit(ERROR_CODES.GENERAL_ERROR);
        }

        const match = matchBridgeSource(fileEntries, result.fileKey, onlyAliases);
        if ('error' in match) {
          console.error(match.error);
          process.exit(ERROR_CODES.INVALID_ARGS);
          return;
        }

        await fs.ensureDir(outDir);
        const outputPath = path.join(outDir, `${match.entry.alias}.variables.json`);
        // The REST response's own envelope, so nothing downstream can tell the two paths apart.
        await fs.writeFile(outputPath, JSON.stringify({ status: 200, error: false, meta: result.meta }), 'utf-8');
        const count = Object.keys(result.meta.variables ?? {}).length;
        console.log(`✓ Downloaded: ${match.entry.alias} variables (${count} variables, via bridge)`);

        const bridgeDataDirectory = config.settings.data?.directory;
        if (bridgeDataDirectory) {
          const dataDir = path.resolve(configDir, bridgeDataDirectory);
          const report = refreshCache({
            dataDir,
            aliases: Object.keys(config.settings.data?.sources ?? {}),
            glyphs: figmaOf(config.conventions).glyphs,
          });
          reportCache(report);
        }

        console.log('✓ Fetch complete');
        process.exit(ERROR_CODES.SUCCESS);
      }

      const token = process.env.FIGMA_TOKEN;
      if (!token) {
        console.error('Error: FIGMA_TOKEN environment variable is required');
        console.error('Tip: create a .env file with FIGMA_TOKEN=your_token_here');
        process.exit(ERROR_CODES.INVALID_ARGS);
        return;
      }

      // -------------------------------------------------------------------
      // Ad-hoc sources (--source): a file or branch fetched without being in config.
      // Resolving one is a small `depth=1` request first — it names the source after the
      // file, matches a branch to the configured source it came from, and fails on a bad
      // key or token before any large download starts.
      // -------------------------------------------------------------------
      const adHoc: FetchSource[] = [];
      for (const value of adHocValues) {
        let spec: AdHocSpec;
        try {
          spec = parseAdHocSource(value);
        } catch (err) {
          console.error(`Error: --source ${value}`);
          console.error(`  ${err instanceof Error ? err.message : String(err)}`);
          process.exit(ERROR_CODES.INVALID_ARGS);
          return;
        }

        const label = spec.alias ?? spec.key;
        const probe = await probeFile(spec.key, token);
        if (probe.status !== 200) {
          const classification = classifyHttpStatus(probe.status);
          if (classification === 'auth') {
            console.error(formatAuthError(probe.status, label, 'file', configPath, options.verbose ? spec.key : undefined, 'adhoc'));
            process.exit(ERROR_CODES.AUTH_ERROR);
          }
          if (classification === 'rate') {
            console.error(formatRateLimitError(label, 'file', probe.headers));
            process.exit(ERROR_CODES.RATE_LIMIT);
          }
          if (probe.status === 404) {
            console.error(formatNotFoundError(label, 'file', configPath, 'adhoc'));
          } else {
            console.error(`Error: HTTP ${probe.status} while resolving --source ${value}`);
          }
          process.exit(ERROR_CODES.NETWORK_ERROR);
        }

        // `mainFileKey` names the file this key branches from. It is used for one thing:
        // matching the branch to a configured source so it fetches the same data kinds,
        // which is what makes the two payloads comparable. A branch of a file that is not
        // configured is a normal thing to fetch, and says nothing.
        const mainFileKey = probe.data.mainFileKey;
        const parent = mainFileKey ? fileEntries.find(f => f.key === mainFileKey) : undefined;
        const branchName = probe.data.name;

        const alias = spec.alias
          ?? (branchName ? `${parent ? `${parent.alias}-` : ''}${slugifyBranchName(branchName)}` : undefined)
          ?? `source-${spec.key.slice(0, 8).toLowerCase()}`;

        // Writing to a configured alias's filenames would overwrite the durable payload
        // this branch is meant to be compared against.
        if (fileEntries.some(f => f.alias === alias)) {
          console.error(`Error: --source ${value} resolves to the alias "${alias}", which is already a configured source.`);
          console.error(`  Name it yourself instead: --source ${alias}-branch=${spec.raw}`);
          process.exit(ERROR_CODES.INVALID_ARGS);
        }
        if (adHoc.some(f => f.alias === alias)) {
          console.error(`Error: two --source values resolve to the same alias "${alias}". Name at least one of them: --source <alias>=<url>`);
          process.exit(ERROR_CODES.INVALID_ARGS);
        }

        // A branch is fetched the way its parent is, so the two payloads are comparable.
        // With no parent to inherit from, `--only` decides, and a bare file payload is
        // the floor — every downstream command needs it.
        const kinds = parent ? parent.fetch : (onlyKinds.length > 0 ? [...onlyKinds] : ['file' as FetchKind]);

        adHoc.push({ alias, key: spec.key, fetch: kinds, origin: 'adhoc', mainFileKey, parentAlias: parent?.alias, branchName });
        console.log(`✓ Resolved: ${alias}${parent ? ` (branch of ${parent.alias})` : ''} → ${kinds.join(', ')}`);
      }

      // Naming ad-hoc sources means fetching those: re-downloading the configured
      // library is a large request the caller did not ask for. `--only <alias>` still
      // adds configured sources back alongside them.
      const configSelected = onlyAliases.length > 0
        ? fileEntries.filter(f => onlyAliases.includes(f.alias))
        : (adHoc.length > 0 ? [] : fileEntries);
      const selected = [...configSelected, ...adHoc];

      // A kind the caller asked for that no selected source is configured to fetch would
      // otherwise do nothing at all and say nothing about why.
      if (onlyKinds.length > 0) {
        const available = new Set(selected.flatMap(f => f.fetch));
        const unavailable = onlyKinds.filter(k => !available.has(k));
        if (unavailable.length === onlyKinds.length) {
          console.error(`Error: --only ${onlyKinds.join(', ')} — no selected source is configured to fetch ${unavailable.length === 1 ? 'it' : 'them'}.`);
          console.error(`Configured data for ${selected.map(f => `${f.alias}: [${f.fetch.join(', ')}]`).join('; ')}`);
          process.exit(ERROR_CODES.INVALID_ARGS);
        }
      }

      const wants = (kind: FetchKind): boolean => onlyKinds.length === 0 || onlyKinds.includes(kind);

      // -------------------------------------------------------------------
      // Validate config for every selected source BEFORE the first byte
      // downloads. A config error surfacing after minutes of downloading
      // wastes the download — and used to abort the remaining sources too.
      // -------------------------------------------------------------------
      for (const entry of selected) {
        if (entry.fetch.includes('icons') && wants('icons')) {
          if (!hasGlyphConvention(figmaOf(config.conventions).glyphs)) {
            console.error(`Error: ${entry.origin === 'adhoc' ? `source "${entry.alias}"` : `data.sources.${entry.alias}.fetch`} includes "icons" but no glyphs convention (match or structure) is declared in config/conventions/figma.yaml`);
            process.exit(ERROR_CODES.INVALID_ARGS);
          }
          if (!config.settings.spec.directory) {
            console.error(`Error: ${entry.origin === 'adhoc' ? `source "${entry.alias}"` : `data.sources.${entry.alias}.fetch`} includes "icons" but spec.directory is not set in the workspace settings`);
            process.exit(ERROR_CODES.INVALID_ARGS);
          }
        }
      }

      // One source's download failure is recorded and reported; the remaining
      // sources still fetch. Auth and rate-limit failures stay fatal — they are
      // token-wide or API-wide, and retrying other sources cannot succeed.
      const sourceFailures: Array<{ alias: string; code: number; outstanding: string[] }> = [];
      class SourceFetchError extends Error {
        constructor(readonly code: number) { super('source fetch failed'); }
      }

      await fs.ensureDir(outDir);

      if (options.verbose) {
        console.log(`[CLI] Config: ${configPath || '(none)'} (${configDir})`);
        console.log(`[CLI] Output directory: ${outDir}`);
        console.log(`[CLI] Files: ${selected.map(s => s.alias).join(', ')}`);
      }

      for (const entry of selected) {
        // Which step was in flight when a transport error threw — transport
        // failures carry no request context of their own (specs#569).
        let activeKind: string = 'file';
        // A whole source dies on the first failing kind, so the kinds after it were
        // never attempted. The retry hint has to name those too, or following it
        // recovers one kind and leaves the rest missing (specs#572).
        const completedKinds = new Set<string>();
        try {
        for (const kind of entry.fetch.filter(k => k !== 'icons' && wants(k))) {
          activeKind = kind;
          // One clock for the kind, read by both stages below. What a caller waited
          // for is "variables", not "the transfer of variables after Figma finished
          // building it" — so the figure that survives on screen spans the whole kind.
          const kindStart = Date.now();
          const url =
            kind === 'file'
              ? `https://api.figma.com/v1/files/${entry.key}${options.geometry ? '?geometry=paths' : ''}`
              : kind === 'variables'
                ? `https://api.figma.com/v1/files/${entry.key}/variables/local`
                : `https://api.figma.com/v1/files/${entry.key}/styles`;

          if (options.verbose) {
            console.log(`[CLI] GET ${kind}: ${url}`);
          }

          // Two stages, reported as two but timed as one, because they have different
          // causes and wildly different durations: Figma builds the payload (silence,
          // minutes for a large file) and only then sends it (seconds). One spinner
          // across both is what made a normal wait read as a hang (specs#707); a clock
          // per stage is what then made a two-minute wait finish as "(0s)", since the
          // only figure left on screen was the transfer's.
          const lastBytes = kind === 'file' ? lastFetchedBytes(outDir, entry.alias) : null;
          const abortHint = isInteractive() ? ' CTRL-C to abort.' : '';
          const preparing = `${preparingMessage(entry.alias, kind, lastBytes)}${abortHint}`;
          console.log(preparing);

          // "Waiting for" named our posture where every other line names the work, and
          // a spaced alias and kind read as "the file called testlibrary". The dotted
          // form is this command's spelling for the artifact everywhere else — its error
          // paths and the name on disk — and `Preparing:` is parallel to `Downloading:`,
          // so the three lines read as one unit of work in three states.
          const stopWaiting = startSpinner(`Preparing: ${entry.alias}.${kind}`, kindStart);
          let result: Awaited<ReturnType<typeof figmaFetch>>;
          try {
            result = await figmaFetch(url, token);
          } catch (error) {
            stopWaiting();
            throw error;
          }
          const waited = stopWaiting();
          const { status, body, headers, stream } = result;

          const classification = classifyHttpStatus(status);

          if (classification === 'auth') {
            console.error(formatAuthError(status, entry.alias, kind, configPath, options.verbose ? entry.key : undefined, entry.origin));
            process.exit(ERROR_CODES.AUTH_ERROR);
          }

          if (classification === 'rate') {
            console.error(formatRateLimitError(entry.alias, kind, headers));
            process.exit(ERROR_CODES.RATE_LIMIT);
          }

          if (classification === 'error') {
            if (status === 404) {
              console.error(formatNotFoundError(entry.alias, kind, configPath, entry.origin));
            } else {
              console.error(`Error: HTTP ${status} while fetching ${entry.alias}.${kind}`);
            }
            throw new SourceFetchError(ERROR_CODES.NETWORK_ERROR);
          }

          // Each stage's line is superseded by the next one's, so only the last
          // survives: the estimate stops being worth screen space once the wait it
          // predicted is over, and the wait stops mattering once the bytes arrived.
          // Failures erase nothing — there, the stage that was in flight is context.
          // `waited` is the cumulative figure read at the end of the first stage, which
          // is the prepare duration — the clock started with the kind, not with a stage.
          const ready = `✓ Ready: ${entry.alias}.${kind} — Figma took ${waited} to prepare it`;
          erasePrintedLine(preparing);
          console.log(ready);
          const stopDownload = startSpinner(`Downloading: ${entry.alias}.${kind}`, kindStart);

          const outputPath = path.join(outDir, `${entry.alias}.${kind}.json`);
          // File payloads dual-write a page-split directory while streaming
          // (specs#559): the sectioned artifact every consumer will migrate to.
          // Additive — a split failure warns and cleans up, never fails the fetch.
          let splitter = kind === 'file' ? new PayloadSplitter(splitDirFor(outDir, entry.alias)) : null;
          const feedSplitter = (bytes: Uint8Array) => {
            if (!splitter) return;
            try { splitter.write(Buffer.from(bytes)); } catch (e) {
              console.warn(`⚠ ${entry.alias}.file/ page split failed (${e instanceof Error ? e.message : e}) — the single-file payload is unaffected.`);
              splitter.abort();
              splitter = null;
            }
          };
          if (stream) {
            const tmpPath = `${outputPath}.tmp`;
            try {
              const writeStream = fs.createWriteStream(tmpPath);
              await new Promise<void>((resolve, reject) => {
                const reader = stream.getReader();
                const pump = () =>
                  reader.read().then(({ done, value }) => {
                    if (done) { writeStream.end(); return; }
                    feedSplitter(value);
                    writeStream.write(value, (err) => { if (err) reject(err); else pump(); });
                  }).catch(reject);
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
                pump();
              });
              await fs.rename(tmpPath, outputPath);
            } catch (err) {
              stopDownload();
              await fs.remove(tmpPath).catch(() => {});
              splitter?.abort();
              splitter = null;
              throw err;
            }
          } else {
            if (body) feedSplitter(Buffer.from(body, 'utf-8'));
            await fs.writeFile(outputPath, body, 'utf-8');
          }
          // Stopped here, but not read here: the spinner has to clear its inline status
          // before the `✓ Split:` line prints, because `erasePrintedLine` only works
          // while the cursor sits directly below the line it erases. The kind's total is
          // read at the end instead, so the split is inside it.
          stopDownload();
          erasePrintedLine(ready);
          // The flip (specs#563): the page-split directory IS the file
          // artifact. The monolithic file exists only transiently during the
          // download, and survives only as a rescue when the split fails.
          let monolithicKept = true;
          if (splitter) {
            try {
              const split = await splitter.finish();
              console.log(`✓ Split: ${entry.alias}.file/ (${split.pages.length} pages, root ${Math.round(fs.statSync(path.join(splitDirFor(outDir, entry.alias), 'root.json')).size / 1048576)}MB)`);
              await fs.remove(outputPath);
              monolithicKept = false;
            } catch (e) {
              console.warn(`⚠ ${entry.alias}.file/ page split failed (${e instanceof Error ? e.message : e}) — keeping the single-file payload instead.`);
              splitter.abort();
            }
          }

          console.log(`✓ Downloaded: ${entry.alias}.${kind} (${formatElapsed(Date.now() - kindStart)})`);
          completedKinds.add(kind);

          // Warn at download time when a kept payload is over the
          // single-string read limit — otherwise the next command's failure is
          // the first sign. (A split payload has no such limit.)
          if (monolithicKept) {
            const written = await fs.stat(outputPath);
            if (written.size >= MAX_JSON_STRING_BYTES) {
              console.warn(`⚠ ${entry.alias}.${kind}.json is ${Math.round(written.size / 1048576)}MB — over the ~${Math.round(MAX_JSON_STRING_BYTES / 1048576)}MB limit Node can read as a single JSON string. Downstream commands (cache, scan, generate) will refuse it.`);
              console.warn(options.geometry
                ? `  Remedy: re-fetch with --no-geometry (around a third smaller).`
                : `  Already fetched without geometry — the file itself is too large; remove or split pages in Figma.`);
            }
          }

          if (options.verbose) {
            const relativeOut = path.relative(process.cwd(), outputPath);
            console.log(`[CLI] Wrote: ${relativeOut}`);
          }
        }

        // Icons run after the other kinds: glyph components are derived from
        // the saved file payload, so `file` must be present (fetched this run
        // or a previous one) before icons can resolve.
        if (entry.fetch.includes('icons') && wants('icons')) {
          activeKind = 'icons';
          const glyphsConvention = figmaOf(config.conventions).glyphs;
          if (!hasGlyphConvention(glyphsConvention)) {
            console.error(`Error: ${entry.origin === 'adhoc' ? `source "${entry.alias}"` : `data.sources.${entry.alias}.fetch`} includes "icons" but no glyphs convention (match or structure) is declared in config/conventions/figma.yaml`);
            process.exit(ERROR_CODES.INVALID_ARGS);
          }
          // Icons are consumed by generated component output, so they live in
          // the durable spec workspace (beside assets/images/), not the data cache.
          const specDirectory = config.settings.spec.directory;
          if (!specDirectory) {
            console.error(`Error: ${entry.origin === 'adhoc' ? `source "${entry.alias}"` : `data.sources.${entry.alias}.fetch`} includes "icons" but spec.directory is not set in the workspace settings`);
            process.exit(ERROR_CODES.INVALID_ARGS);
          }
          const filePath = path.join(outDir, `${entry.alias}.file.json`);
          const iconsSectioned = SectionedFile.open(outDir, entry.alias);
          if (!iconsSectioned && !fs.existsSync(filePath)) {
            console.error(`Error: glyphs require the file payload — fetch "file" for ${entry.alias} first (${filePath} not found)`);
            throw new SourceFetchError(ERROR_CODES.FILE_ERROR);
          }

          const stopSpinner = startSpinner(`Downloading: ${entry.alias}.glyphs`);
          // Page-split payloads collect glyphs from a page-assembled document;
          // slug dedupe must see every page at once, so pages load together here
          // (parsed size is what the old whole-file parse cost anyway).
          const glyphSource = iconsSectioned
            ? { children: iconsSectioned.pageEntries().map(e => iconsSectioned.loadPage(e)) }
            : (readJsonPayload(filePath) as { document?: unknown }).document;
          const glyphs = collectGlyphComponents(glyphSource, glyphsConvention);
          // Assets are a sibling of specs/, not a `_`-prefixed pseudo-component
          // inside it: an SVG is consumed by every target and produced by none
          // (project 024). An ad-hoc source's glyphs are a second version of the
          // same icons under the same slugs — writing them into assets/icons/
          // would overwrite the durable library's assets, so they get their own
          // sibling directory, isolated and deleted with the source's payloads.
          const iconsDir = path.join(
            path.resolve(configDir, specDirectory), '..', 'assets',
            entry.origin === 'adhoc' ? `icons-${entry.alias}` : 'icons'
          );
          await fs.ensureDir(iconsDir);

          let downloaded = 0;
          const CHUNK = 50;
          for (let i = 0; i < glyphs.length; i += CHUNK) {
            const chunk = glyphs.slice(i, i + CHUNK);
            const ids = chunk.map(g => g.id).join(',');
            const url = `https://api.figma.com/v1/images/${entry.key}?ids=${encodeURIComponent(ids)}&format=svg`;
            const result = await figmaFetch(url, token);
            if (result.status !== 200) {
              stopSpinner();
              const classification = classifyHttpStatus(result.status);
              if (classification === 'auth') {
                console.error(formatAuthError(result.status, entry.alias, 'glyphs', configPath));
                process.exit(ERROR_CODES.AUTH_ERROR);
              }
              if (classification === 'rate') {
                console.error(formatRateLimitError(entry.alias, 'glyphs', result.headers));
                process.exit(ERROR_CODES.RATE_LIMIT);
              }
              console.error(`Error: HTTP ${result.status} while exporting ${entry.alias} glyphs`);
              throw new SourceFetchError(ERROR_CODES.NETWORK_ERROR);
            }
            const payload = JSON.parse(await streamToString(result.stream)) as { err?: string; images: Record<string, string | null> };
            if (payload.err) {
              stopSpinner();
              console.error(`Error: images API error while exporting ${entry.alias} glyphs: ${payload.err}`);
              throw new SourceFetchError(ERROR_CODES.NETWORK_ERROR);
            }
            for (const glyph of chunk) {
              const imageUrl = payload.images[glyph.id];
              if (!imageUrl) continue;
              const svgRes = await fetch(imageUrl);
              if (!svgRes.ok) continue;
              await fs.writeFile(path.join(iconsDir, `${glyph.slug}.svg`), await svgRes.text(), 'utf-8');
              downloaded++;
            }
          }
          const elapsed = stopSpinner();
          console.log(`✓ Downloaded: ${entry.alias}.glyphs (${downloaded}/${glyphs.length}, ${elapsed})`);
          completedKinds.add('icons');
        }
        } catch (error) {
          clearInlineStatus();
          const timedOut = error instanceof FirstByteTimeoutError;
          const code = error instanceof SourceFetchError
            ? error.code
            : timedOut ? ERROR_CODES.NETWORK_ERROR : ERROR_CODES.GENERAL_ERROR;
          if (timedOut) {
            const lastBytes = lastFetchedBytes(outDir, entry.alias);
            console.error(`Error: Figma did not start sending ${entry.alias}.${activeKind} within ${formatElapsed(error.waitedMs)}.`);
            if (lastBytes !== null) {
              console.error(`  The last fetch of this source was ${formatPayloadSize(lastBytes)}.`);
            }
            console.error(`  Figma prepares a file only when it has changed, and discards that work when a request gives up — a retry starts the preparation over.`);
          } else if (!(error instanceof SourceFetchError)) {
            // A transport-level throw (connection reset, DNS, TLS) says only
            // "fetch failed" — the real reason rides the cause chain, and the
            // request context lives here, not on the error (specs#569).
            const causes: string[] = [];
            for (let e: unknown = error; e instanceof Error; e = e.cause) {
              causes.push(e.message);
              if (causes.length >= 4) break;
            }
            console.error(`  ${causes.join(' — caused by: ') || String(error)}`);
          }
          // Everything this source was asked for that did not land — the kind that
          // threw, plus every kind the loop never reached.
          const outstanding = entry.fetch.filter(k => wants(k) && !completedKinds.has(k));
          sourceFailures.push({ alias: entry.alias, code, outstanding });
          console.error(timedOut
            ? `✗ ${entry.alias}: fetch gave up waiting for "${activeKind}" — continuing with remaining sources`
            : `✗ ${entry.alias}: fetch failed while downloading "${activeKind}" — continuing with remaining sources`);
          // Naming every outstanding kind matters more than brevity: a hint that
          // names only the kind that threw recovers it and silently leaves the
          // rest missing (specs#572).
          const retryTarget = outstanding.length === entry.fetch.filter(wants).length
            ? entry.alias
            : `${entry.alias},${outstanding.join(',')}`;
          console.error(`  Retry just this work: specs fetch --only ${retryTarget}`);
          if (outstanding.length > 1) {
            console.error(`  Still missing for ${entry.alias}: ${outstanding.join(', ')}`);
          }
        }
      }

      // An ad-hoc source's key exists nowhere but the command line that named it, and
      // later commands (`generate --get-images`, and anything diffing these payloads)
      // need to know which file the alias came from. Recorded beside the payloads so it
      // is deleted with them.
      for (const entry of adHoc) {
        await fs.writeFile(
          path.join(outDir, `${entry.alias}.source.json`),
          JSON.stringify({
            alias: entry.alias,
            key: entry.key,
            // What this run actually downloaded, not what the source is
            // configured for: a branch inherits its parent's kinds so the two
            // payloads are comparable, and `--only` narrows that further.
            fetch: entry.fetch.filter(wants),
            mainFileKey: entry.mainFileKey ?? null,
            parentAlias: entry.parentAlias ?? null,
            branchName: entry.branchName ?? null,
            fetchedAt: new Date().toISOString()
          }, null, 2),
          'utf-8'
        );
      }

      clearInlineStatus();

      // Refresh the render caches from everything now on disk — the sources fetched this
      // run, plus any fetched previously. A source with no payload yet is skipped: not
      // having fetched it is a normal state, and only render treats it as an error.
      const dataDirectory = config.settings.data?.directory;
      let cacheOk = true;
      if (dataDirectory) {
        const dataDir = path.resolve(configDir, dataDirectory);
        const report = refreshCache({
          dataDir,
          // Ad-hoc aliases first: entries collide by node id and name, and later aliases
          // win, so a branch contributes only what the configured sources don't already
          // define. A branch fetch must not change how the durable library resolves.
          aliases: [...adHoc.map(s => s.alias), ...Object.keys(config.settings.data?.sources ?? {})],
          glyphs: figmaOf(config.conventions).glyphs,
        });
        cacheOk = reportCache(report, sourceFailures.map(f => f.alias));
      }

      if (sourceFailures.length > 0) {
        console.error(`✗ Fetch incomplete: ${sourceFailures.length} of ${selected.length} sources failed (${sourceFailures.map(f => f.alias).join(', ')})`);
        for (const failure of sourceFailures.filter(f => f.outstanding.length > 0)) {
          console.error(`  ${failure.alias}: still missing ${failure.outstanding.join(', ')}`);
        }
        process.exit(sourceFailures[0].code);
      }

      // Nothing above proves the payloads exist, and "✓ Fetch complete" is a claim
      // about disk. So it is checked against disk rather than inferred from the
      // absence of an error (specs#572).
      //
      // Two different situations, and conflating them would be wrong in both
      // directions. A kind this run asked for and did not land is a failure. A kind
      // the config declares but `--only` excluded is not — narrowing is the whole
      // point of the flag — yet leaving it unsaid is how a scoped retry reports
      // success while the source is still incomplete, which is the case that filed
      // this issue.
      const onDisk = (alias: string, kind: string): boolean =>
        fs.existsSync(path.join(outDir, `${alias}.${kind}.json`)) ||
        (kind === 'file' && fs.existsSync(splitDirFor(outDir, alias)));
      // Glyph assets are files under the spec directory rather than a payload here,
      // and the cache report already counts them.
      const payloadKinds = (kinds: readonly FetchKind[]): FetchKind[] => kinds.filter(k => k !== 'icons');

      const requestedMissing: string[] = [];
      const unrequestedMissing = new Map<string, string[]>();
      for (const entry of selected) {
        for (const kind of payloadKinds(entry.fetch)) {
          if (onDisk(entry.alias, kind)) continue;
          if (wants(kind)) {
            requestedMissing.push(`${entry.alias}.${kind}`);
          } else {
            unrequestedMissing.set(entry.alias, [...(unrequestedMissing.get(entry.alias) ?? []), kind]);
          }
        }
      }

      if (requestedMissing.length > 0) {
        console.error(`✗ Fetch did not complete: ${requestedMissing.length} requested ${requestedMissing.length === 1 ? 'kind is' : 'kinds are'} missing on disk — ${requestedMissing.join(', ')}`);
        process.exit(ERROR_CODES.GENERAL_ERROR);
      }

      for (const [alias, kinds] of unrequestedMissing) {
        console.warn(`⚠ ${alias}: configured ${kinds.length === 1 ? 'kind' : 'kinds'} not on disk and not fetched this run — ${kinds.join(', ')}`);
        console.warn(`  Fetch ${kinds.length === 1 ? 'it' : 'them'}: specs fetch --only ${alias},${kinds.join(',')}`);
      }
      if (!cacheOk) {
        console.error('✗ Fetch downloaded, but the cache could not read every payload (see above).');
        process.exit(ERROR_CODES.GENERAL_ERROR);
      }
      console.log('✓ Fetch complete');
      process.exit(ERROR_CODES.SUCCESS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(ERROR_CODES.GENERAL_ERROR);
    }
  });
