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
            const downgraded = options.authored && isMissingSourceError(err);
            findings.push({
              kind, spec: name, file: files[concern]!, path: errPath, message,
              level: downgraded ? 'warning' : 'error',
            });
          }
        }
      }

      // The supplemental sidecar, when present — shape only (experimental contract).
      const suppEntry = fs.readdirSync(dir).sort().find(f => /^supplemental\.ya?ml$/.test(f));
      if (suppEntry) {
        try {
          const doc = yaml.parse(fs.readFileSync(path.join(dir, suppEntry), 'utf8'));
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

  return { findings, counts, missing, notes };
}
