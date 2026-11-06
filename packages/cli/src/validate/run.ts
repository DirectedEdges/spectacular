// Running `specs validate` over a workspace: discover spec folders through the
// layout seam, validate each concern file against its JSON Schema definition,
// then check every cross-node reference. Findings are deterministic — sorted by
// spec, file, path — so two runs over the same tree print the same lines.

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { concernValidators, describeAjvError, isMissingSourceError, type ConcernName } from './schemas.js';
import { supplementalValidator } from './supplemental.js';
import { checkReferences, type ParsedSpec, type WorkspaceIndex } from './references.js';
import { loadTokenIndex, type TokenIndex } from './tokens.js';
import { resolveSpecsLayout, SPEC_KINDS, type SpecKind } from '../utilities/specsLayout.js';

export interface ValidateOptions {
  /** Specs root. */
  specsPath: string;
  /** Narrow to these spec folder keys; empty means the whole catalogue. */
  components?: string[];
  /** Downgrade the missing `metadata.source` an authored spec cannot state. */
  authored?: boolean;
  /** Data directory holding the render caches, for the token-existence check. */
  dataDir?: string;
  /**
   * Token path → default-mode numeric value, for the resolved-value report.
   * Values are themed (one mode's resolution) — printed to orient the author,
   * never used to pass or fail anything.
   */
  tokenValues?: ReadonlyMap<string, number>;
  /** Workspace root holding the platform trees; defaults to the specs root's parent. */
  workspaceDir?: string;
}

/** One dimension token a spec uses, with what it resolves to in the default mode. */
export interface ResolvedToken {
  spec: string;
  /** The style property the token sits on. */
  prop: string;
  token: string;
  value: number;
}

export interface Finding {
  kind: SpecKind;
  spec: string;
  /** Concern file name, e.g. `api.yaml`. */
  file: string;
  /** JSON-pointer path to the offending node. */
  path: string;
  message: string;
  level: 'error' | 'warning';
}

export interface ValidateResult {
  findings: Finding[];
  /** Specs that were read, per kind. */
  counts: Record<SpecKind, number>;
  /** Requested names that matched no spec folder. */
  missing: string[];
  /** What this run could not check, stated once. */
  notes: string[];
  /** Dimension tokens used, with their default-mode values — orientation, not judgment. */
  resolved: ResolvedToken[];
}

const CONCERNS: readonly ConcernName[] = ['api', 'variants', 'examples'];

function readSpec(dir: string): { parsed: ParsedSpec; files: Partial<Record<ConcernName, string>>; failures: Finding[] } {
  const parsed: ParsedSpec = {};
  const files: Partial<Record<ConcernName, string>> = {};
  const failures: Finding[] = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    const m = /^(api|variants|examples)\.ya?ml$/.exec(entry);
    if (!m) continue;
    const concern = m[1] as ConcernName;
    files[concern] = entry;
    try {
      const doc = yaml.parse(fs.readFileSync(path.join(dir, entry), 'utf8'));
      if (doc && typeof doc === 'object') parsed[concern] = doc as Record<string, unknown>;
    } catch (e) {
      failures.push({
        kind: 'component', spec: '', file: entry, path: '/',
        message: `not parseable as YAML: ${(e as Error).message.split('\n')[0]}`,
        level: 'error',
      });
    }
  }
  return { parsed, files, failures };
}

export function runValidate(options: ValidateOptions): ValidateResult {
  const layout = resolveSpecsLayout(options.specsPath);
  const validators = concernValidators();

  const notes: string[] = [];
  let tokens: TokenIndex | undefined;
  if (options.dataDir) {
    tokens = loadTokenIndex(options.dataDir);
    if (!tokens.variables) notes.push('variables cache is empty or missing — variable $token references were not checked (run `specs cache`)');
    if (!tokens.styles) notes.push('styles cache is empty or missing — typography/effect $token references were not checked (run `specs cache`)');
  } else {
    notes.push('no data directory configured — $token references were not checked');
  }

  const specsByKind = new Map<SpecKind, string[]>(
    SPEC_KINDS.map(kind => [kind, layout.folderNames(kind, 'yaml')]),
  );

  const requested = new Set(options.components ?? []);
  const allNames = new Set([...specsByKind.values()].flat());
  const missing = [...requested].filter(name => !allNames.has(name)).sort();

  // The workspace index reads other specs lazily and caches them — a catalogue
  // run touches each folder once whether it is validated, referenced, or both.
  // Components and compositions share one spec-key space here, matching the
  // `#/components/<key>` pointer namespace, which addresses both kinds.
  const parsedCache = new Map<string, ParsedSpec>();
  const index: WorkspaceIndex = {
    components: new Set(specsByKind.get('component')),
    compositions: new Set(specsByKind.get('composition')),
    spec(name: string): ParsedSpec | undefined {
      const kind = this.components.has(name) ? 'component'
        : this.compositions.has(name) ? 'composition' : undefined;
      if (!kind) return undefined;
      let cached = parsedCache.get(name);
      if (!cached) {
        cached = readSpec(path.join(layout.dirFor(kind), name)).parsed;
        parsedCache.set(name, cached);
      }
      return cached;
    },
  };

  const findings: Finding[] = [];
  const resolved: ResolvedToken[] = [];
  const counts: Record<SpecKind, number> = { component: 0, composition: 0 };

  for (const kind of SPEC_KINDS) {
    for (const name of specsByKind.get(kind) ?? []) {
      if (requested.size > 0 && !requested.has(name)) continue;
      counts[kind] += 1;

      const dir = path.join(layout.dirFor(kind), name);
      const { parsed, files, failures } = readSpec(dir);
      for (const f of failures) findings.push({ ...f, kind, spec: name });
      if (kind === 'component') parsedCache.set(name, parsed);

      if (!files.api) {
        findings.push({ kind, spec: name, file: 'api.yaml', path: '/', message: 'spec folder has no api file', level: 'error' });
      }

      // Layer 1 — each concern file against its schema definition.
      for (const concern of CONCERNS) {
        const doc = parsed[concern];
        if (!doc) continue;
        const validate = validators[concern];
        if (!validate(doc) && validate.errors) {
          const seen = new Set<string>();
          for (const err of validate.errors) {
            const { path: errPath, message } = describeAjvError(err);
            const line = `${errPath}|${message}`;
            if (seen.has(line)) continue;
            seen.add(line);
            // The one omission `--authored` exists to forgive is not reported at
            // all: three guaranteed warnings per spec on every run trained real
            // sessions to grep warnings away, which is how a real one gets lost.
            if (options.authored && isMissingSourceError(err)) continue;
            findings.push({
              kind, spec: name, file: files[concern]!, path: errPath, message,
              level: 'error',
            });
          }
        }
      }

      // Dimension tokens this spec uses, with default-mode values — the 16px-outline
      // class of mistake (a multiplier name read as pixels) is invisible to existence
      // checking and obvious the moment the number is printed.
      if (options.tokenValues) {
        collectResolvedTokens(parsed, name, options.tokenValues, resolved);
      }

      // The supplemental sidecar, when present — shape only (experimental contract).
      const suppEntry = fs.readdirSync(dir).sort().find(f => /^supplemental\.ya?ml$/.test(f));
      let supplementalDoc: unknown;
      if (suppEntry) {
        try {
          const doc = yaml.parse(fs.readFileSync(path.join(dir, suppEntry), 'utf8'));
          supplementalDoc = doc;
          const validate = supplementalValidator();
          if (!validate(doc) && validate.errors) {
            const seen = new Set<string>();
            for (const err of validate.errors) {
              const { path: errPath, message } = describeAjvError(err);
              const line = `${errPath}|${message}`;
              if (seen.has(line)) continue;
              seen.add(line);
              findings.push({ kind, spec: name, file: suppEntry, path: errPath, message, level: 'error' });
            }
          }
        } catch (e) {
          findings.push({
            kind, spec: name, file: suppEntry, path: '/',
            message: `not parseable as YAML: ${(e as Error).message.split('\n')[0]}`,
            level: 'error',
          });
        }
      }

      // An authored platform file nothing loads: the emitters pick up an authored
      // component.* only when a supplemental entry declares it under platforms.<tree>,
      // so an undeclared file sits dead beside the scaffold while everything reports
      // clean. Warn per undeclared authored file.
      if (kind === 'component') {
        for (const w of undeclaredAuthoredFiles(name, supplementalDoc, options.workspaceDir ?? path.dirname(path.resolve(options.specsPath)))) {
          findings.push({ kind, spec: name, file: suppEntry ?? 'supplemental.yaml', path: '/platforms', message: w, level: 'warning' });
        }
      }

      // Layer 2 — references, with the concern name mapped back to its file name.
      for (const ref of checkReferences(name, parsed, index, tokens)) {
        findings.push({
          kind, spec: name,
          file: files[ref.file as ConcernName] ?? `${ref.file}.yaml`,
          path: ref.path || '/',
          message: ref.message,
          level: 'error',
        });
      }
    }
  }

  findings.sort((a, b) =>
    a.kind.localeCompare(b.kind) || a.spec.localeCompare(b.spec)
    || a.file.localeCompare(b.file) || a.path.localeCompare(b.path)
    || a.message.localeCompare(b.message));

  resolved.sort((a, b) => a.spec.localeCompare(b.spec) || a.prop.localeCompare(b.prop) || a.token.localeCompare(b.token));
  return { findings, counts, missing, notes, resolved };
}

/** Walk a spec's parsed docs for `{$token}` values and record the resolvable dimension ones, deduped. */
function collectResolvedTokens(
  parsed: ParsedSpec,
  spec: string,
  values: ReadonlyMap<string, number>,
  out: ResolvedToken[],
): void {
  const seen = new Set<string>();
  const walk = (node: unknown, parentKey: string): void => {
    if (Array.isArray(node)) { for (const item of node) walk(item, parentKey); return; }
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const token = obj.$token;
    if (typeof token === 'string') {
      const value = values.get(token);
      if (value !== undefined) {
        const id = `${spec}|${parentKey}|${token}`;
        if (!seen.has(id)) {
          seen.add(id);
          out.push({ spec, prop: parentKey, token, value });
        }
      }
      return;
    }
    for (const [key, child] of Object.entries(obj)) walk(child, key);
  };
  for (const doc of [parsed.api, parsed.variants, parsed.examples]) walk(doc, '');
}

/** The filenames each platform's emitter owns — anything else in a component's folder is authored. */
const EMITTED_FILES: Record<string, ReadonlySet<string>> = {
  react: new Set(['contract.ts', 'scaffold.tsx', 'stories.tsx', 'styles.css']),
  webcomponents: new Set(['api.ts', 'contract.ts', 'host.css', 'light.css', 'scaffold.ts', 'stories.ts']),
};

/** Authored files in the component's platform folders that no supplemental entry declares. */
function undeclaredAuthoredFiles(componentKey: string, supplemental: unknown, workspaceDir: string): string[] {
  // Accounted-for means mentioned anywhere in the sidecar: `platforms.<tree>`
  // declarations are the loaders, and files those loaders import (a stylesheet)
  // are noted in prose like `regenerationRisk` — both count. Only a file the
  // sidecar never mentions is plausibly dead.
  const mentioned: string[] = [];
  const collectStrings = (node: unknown): void => {
    if (typeof node === 'string') { mentioned.push(node); return; }
    if (Array.isArray(node)) { for (const item of node) collectStrings(item); return; }
    if (node && typeof node === 'object') for (const value of Object.values(node)) collectStrings(value);
  };
  collectStrings(supplemental);
  const accounted = (file: string): boolean => mentioned.some(s => s.includes(file));
  const folder = componentKey.charAt(0).toUpperCase() + componentKey.slice(1);
  const warnings: string[] = [];
  for (const [tree, emitted] of Object.entries(EMITTED_FILES)) {
    const dir = path.join(workspaceDir, tree, 'src', 'components', folder);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).sort()) {
      if (emitted.has(file)) continue;
      if (!fs.statSync(path.join(dir, file)).isFile()) continue;
      if (!accounted(file)) {
        warnings.push(`authored file ${tree}/src/components/${folder}/${file} is loaded by nothing — no supplemental entry declares it under platforms.${tree}`);
      }
    }
  }
  return warnings;
}
