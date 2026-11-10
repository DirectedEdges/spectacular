// Running `specs validate` over a workspace: discover spec folders through the
// layout seam, validate each concern file against its JSON Schema definition,
// then check every cross-node reference. Findings are deterministic — sorted by
// spec, file, path — so two runs over the same tree print the same lines.

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { concernValidators, describeAjvError, isMissingSourceError, type ConcernName } from './schemas.js';
import {
  authoredFilesIn,
  authoredValidator,
  workspaceAuthoredFiles,
  type AuthoredFile,
} from './authored.js';
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

      // The two authored documents, when present (ADR-118). Both are hand-written,
      // so neither is required and an absent one is ordinary.
      let supplementalDoc: unknown;
      for (const location of authoredFilesIn({ dir, label: '' })) {
        const doc = validateAuthored(location, findings, kind, name);
        if (location.kind === 'supplemental') supplementalDoc = doc;
      }

      // An authored platform file nothing loads. The emitters pick up `component.tsx`
      // / `component.ts` by convention, so those are never dead; anything else beside
      // the scaffold is reached only if one of them imports it, and the sidecar's
      // `checks` pointers are the only place that records such a dependency.
      if (kind === 'component') {
        for (const w of unreachableAuthoredFiles(name, supplementalDoc, options.workspaceDir ?? path.dirname(path.resolve(options.specsPath)))) {
          findings.push({ kind, spec: name, file: 'supplemental.yaml', path: '/checks', message: w, level: 'warning' });
        }
      }

      // Layer 2 — references, with the concern name mapped back to its file name.
      for (const ref of checkReferences(name, parsed, index, tokens)) {
        findings.push({
          kind, spec: name,
          file: files[ref.file as ConcernName] ?? `${ref.file}.yaml`,
          path: ref.path || '/',
          message: ref.message,
          level: ref.level ?? 'error',
        });
      }
    }
  }

  // The authored documents outside a spec folder: the catalogue scope
  // (`components/`) and one per foundation concern. Validated on every run
  // rather than per requested spec, because an entry at a broader scope applies
  // to specs this run may not have been asked about (DSPEC-56).
  for (const location of workspaceAuthoredFiles(path.resolve(options.specsPath))) {
    validateAuthored(location, findings, 'component', location.label);
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

/**
 * The conventional authored entry point per platform tree. An emitter looks for
 * this name beside the scaffold it generates and imports it in place of the
 * scaffold when present, so a file under this name is never unreachable.
 *
 * These names are the transform packages' convention, declared in
 * `from-specs`'s `naming.ts` as `REACT_FILES.authored` and
 * `WEBCOMPONENT_FILES.authored`. Restated here because this repo cannot import
 * them, and a disagreement would make the check warn about a file that loads
 * perfectly well.
 */
const AUTHORED_ENTRY_POINTS: Record<string, ReadonlySet<string>> = {
  react: new Set(['component.tsx']),
  webcomponents: new Set(['component.ts']),
};

/**
 * Authored platform files that nothing appears to reach.
 *
 * The premise changed with ADR-118. `platforms` used to map a platform to the
 * authored file implementing an entry, and this check read those paths as the
 * record of what loads what. It no longer carries paths — and the emitters never
 * read them anyway, which is why D5 removed the field: an authored
 * `component.tsx` wins over the scaffold because of its *name*, not because a
 * sidecar entry declared it.
 *
 * So a conventional entry point is always reachable. Any other authored file is
 * reached only if an entry point imports it, and the sidecar's `checks` pointers
 * are the one place that records such a dependency — which makes this a weaker
 * check than it was, and a warning rather than an error.
 */
function unreachableAuthoredFiles(componentKey: string, supplemental: unknown, workspaceDir: string): string[] {
  const mentioned: string[] = [];
  const collectStrings = (node: unknown): void => {
    if (typeof node === 'string') { mentioned.push(node); return; }
    if (Array.isArray(node)) { for (const item of node) collectStrings(item); return; }
    if (node && typeof node === 'object') for (const value of Object.values(node)) collectStrings(value);
  };
  collectStrings(supplemental);
  const mentionedAnywhere = (file: string): boolean => mentioned.some(s => s.includes(file));
  const folder = componentKey.charAt(0).toUpperCase() + componentKey.slice(1);
  const warnings: string[] = [];
  for (const [tree, emitted] of Object.entries(EMITTED_FILES)) {
    const dir = path.join(workspaceDir, tree, 'src', 'components', folder);
    if (!fs.existsSync(dir)) continue;
    const entryPoints = AUTHORED_ENTRY_POINTS[tree] ?? new Set<string>();
    for (const file of fs.readdirSync(dir).sort()) {
      if (emitted.has(file)) continue;
      if (entryPoints.has(file)) continue;
      if (!fs.statSync(path.join(dir, file)).isFile()) continue;
      if (!mentionedAnywhere(file)) {
        warnings.push(
          `authored file ${tree}/src/components/${folder}/${file} may be unreachable — only ${[...entryPoints].join(' or ')} is loaded by convention, and no supplemental entry mentions this file`
        );
      }
    }
  }
  return warnings;
}

/** Shape-check one authored document, recording any failure as a finding. */
function validateAuthored(
  location: AuthoredFile,
  findings: Finding[],
  kind: SpecKind,
  spec: string,
): unknown {
  let doc: unknown;
  try {
    doc = yaml.parse(fs.readFileSync(location.file, 'utf8'));
  } catch (e) {
    findings.push({
      kind, spec, file: location.fileLabel, path: '/',
      message: `not parseable as YAML: ${(e as Error).message.split('\n')[0]}`,
      level: 'error',
    });
    return undefined;
  }
  const validate = authoredValidator(location.kind);
  if (!validate(doc) && validate.errors) {
    const seen = new Set<string>();
    for (const err of validate.errors) {
      const { path: errPath, message } = describeAjvError(err);
      const line = `${errPath}|${message}`;
      if (seen.has(line)) continue;
      seen.add(line);
      findings.push({ kind, spec, file: location.fileLabel, path: errPath, message, level: 'error' });
    }
  }
  return doc;
}
