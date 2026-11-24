// Running `specs validate` over a workspace: discover spec folders through the
// layout seam, validate each concern file against its JSON Schema definition,
// then check every cross-node reference. Findings are deterministic — sorted by
// spec, file, path — so two runs over the same tree print the same lines.

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { checkRules, concernOfPath, mergeConcerns, type Violation } from '@directededges/specs-schema-core';
import { concernValidators, describeAjvErrors, isMissingSourceError, type ConcernName } from './schemas.js';
import {
  authoredFilesIn,
  authoredValidator,
  workspaceAuthoredFiles,
  type AuthoredFile,
} from './authored.js';
import { checkReferences, type ParsedSpec, type WorkspaceIndex } from './references.js';
import { loadTokenIndex, type TokenIndex } from './tokens.js';
import { platformGaps as gapsForSpec, elementScopeGaps as scopeGapsForSpec, type PlatformGap, type ElementScopeGap } from './platformGaps.js';
import { checkPromotionMap } from './promotionMap.js';
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
  /** The `config/` directory, for cross-referencing the promotion table. */
  configDir?: string;
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
  /**
   * Set on a finding from an authored document outside any spec folder when the run named
   * specific specs. Those documents are always validated — an entry at a broader scope can
   * apply to a spec the run was not asked about (DSPEC-56) — so they are tagged out of the
   * requested scope's tally and exit code rather than skipped.
   */
  scope?: 'workspace';
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
  /** Style properties a platform declares it cannot deliver — correct spec, limited surface. */
  platformGaps: PlatformGap[];
  /** Style keys bound on a platform but scoped to element types that exclude the carrying element. */
  elementScopeGaps: ElementScopeGap[];
  /**
   * What a scoped run did not check. Absent when the run covered the catalogue.
   *
   * Only the JSON Schema layer runs over these — the cheap half, and where a catalogue-wide
   * breakage shows. A scoped run otherwise reports a clean workspace while most of it fails.
   */
  skipped?: { specs: number; errors: number };
}

const CONCERNS: readonly ConcernName[] = ['api', 'variants', 'examples'];

/**
 * Catalogue rules the reference layer (`references.ts`) already checks with
 * workspace context — cross-file pointers, declared props, legal values. The
 * in-document versions would double-report the same defects, so Layer 3 skips
 * them.
 */
const WORKSPACE_CHECKED = new Set(['DSPEC-01', 'DSPEC-02', 'DSPEC-03', 'DSPEC-11', 'DSPEC-12', 'DSPEC-14']);

/** Which concern file a merged-document violation path came from; root-spanning paths report under api. */
function concernOf(violationPath: string): ConcernName {
  return concernOfPath(violationPath) ?? 'api';
}

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
  // One set per kind. A composition's concern documents are its own exact shape
  // (ADR-109) — no props, no variants, elements and layout at the top level — so
  // validating one against the component definitions reports errors naming
  // members a composition cannot have.
  const validatorsFor = (kind: SpecKind) =>
    concernValidators(kind === 'composition' ? 'composition' : 'component');

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
  const platformGaps: PlatformGap[] = [];
  const elementScopeGaps: ElementScopeGap[] = [];
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
        const validate = validatorsFor(kind)[concern];
        if (!validate(doc) && validate.errors) {
          // The one omission `--authored` exists to forgive is not reported at
          // all: three guaranteed warnings per spec on every run trained real
          // sessions to grep warnings away, which is how a real one gets lost.
          const reportable = options.authored
            ? validate.errors.filter(err => !isMissingSourceError(err))
            : validate.errors;
          for (const { path: errPath, message } of describeAjvErrors(reportable)) {
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

      // What this spec asks for that a platform declares it cannot deliver. Never a
      // finding — the spec is right and the surface is limited.
      platformGaps.push(...gapsForSpec(name, [parsed.api, parsed.variants, parsed.examples]));
      // Bound on the platform, but not for the element type carrying it — the
      // strokes-on-glyph class: passes schema validation, silently skipped at render.
      elementScopeGaps.push(...scopeGapsForSpec(name, [parsed.api, parsed.variants, parsed.examples]));

      for (const dup of duplicatedFills(parsed)) {
        findings.push({ kind, spec: name, file: 'examples.yaml', path: dup.path, message: dup.message, level: 'warning' });
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
        // The finding names the platform file it is about — a workspace-relative
        // path, not a spec-folder file. Pointing at `supplemental.yaml /checks`
        // when no such file existed sent a session to inspect nothing.
        for (const w of unreachableAuthoredFiles(name, supplementalDoc, options.workspaceDir ?? path.dirname(path.resolve(options.specsPath)))) {
          findings.push({ kind, spec: name, file: w.file, path: '/', message: w.message, level: 'warning' });
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

      // Layer 3 — the specification's semantic rule catalogue (§9), run over
      // the whole document the concern files carry between them. Each finding
      // names its rule, the way the conformance suite requires.
      const merged = mergeConcerns(parsed);
      const catalogueKind = kind === 'component' ? 'component' : 'composition-concern';
      for (const v of checkRules(merged, catalogueKind, { exclude: WORKSPACE_CHECKED }) as Violation[]) {
        const concern = concernOf(v.path);
        findings.push({
          kind, spec: name,
          file: files[concern] ?? `${concern}.yaml`,
          path: v.path || '/',
          message: `[${v.rule}] ${v.message}`,
          level: 'error',
        });
      }
    }
  }

  // The authored documents outside a spec folder: the catalogue scope
  // (`components/`) and one per foundation concern. Validated on every run
  // rather than per requested spec, because an entry at a broader scope applies
  // to specs this run may not have been asked about (DSPEC-56).
  // Their findings are tagged out-of-scope when this run named specific specs, so the
  // requested scope's error count is about the requested specs. See `Finding.scope`.
  const workspaceFindings: Finding[] = [];
  for (const location of workspaceAuthoredFiles(path.resolve(options.specsPath))) {
    validateAuthored(location, workspaceFindings, 'component', location.label);
  }
  for (const promotion of checkPromotionMap({ configDir: options.configDir, specsPath: options.specsPath, known: allNames })) {
    workspaceFindings.push({
      kind: 'component',
      spec: '',
      file: 'config/conventions/figma.primitives.yaml',
      path: promotion.at,
      message: promotion.message,
      level: 'warning',
    });
  }

  for (const finding of workspaceFindings) {
    findings.push(requested.size > 0 ? { ...finding, scope: 'workspace' } : finding);
  }

  findings.sort((a, b) =>
    a.kind.localeCompare(b.kind) || a.spec.localeCompare(b.spec)
    || a.file.localeCompare(b.file) || a.path.localeCompare(b.path)
    || a.message.localeCompare(b.message));

  resolved.sort((a, b) => a.spec.localeCompare(b.spec) || a.prop.localeCompare(b.prop) || a.token.localeCompare(b.token));
  let skipped: ValidateResult['skipped'];
  if (requested.size > 0) {
    let specs = 0;
    let errors = 0;
    for (const kind of SPEC_KINDS) {
      for (const name of specsByKind.get(kind) ?? []) {
        if (requested.has(name)) continue;
        specs += 1;
        errors += schemaErrorCount(path.join(layout.dirFor(kind), name), validatorsFor(kind), options.authored);
      }
    }
    if (specs > 0) skipped = { specs, errors };
  }

  return { findings, counts, missing, notes, resolved, platformGaps, elementScopeGaps, skipped };
}

/** Schema errors in one spec folder, counted without building findings for it. */
function schemaErrorCount(
  dir: string,
  validators: ReturnType<typeof concernValidators>,
  authored: boolean | undefined,
): number {
  const { parsed, failures } = readSpec(dir);
  let count = failures.length;
  for (const concern of CONCERNS) {
    const doc = parsed[concern];
    if (!doc) continue;
    const validate = validators[concern];
    if (validate(doc) || !validate.errors) continue;
    const reportable = authored
      ? validate.errors.filter(err => !isMissingSourceError(err))
      : validate.errors;
    count += describeAjvErrors(reportable).length;
  }
  return count;
}

/**
 * Slot fills in one spec that hold the same elements, defined identically. Nothing points
 * between fills, so shared content is written out once per fill and an edit to one has to
 * be mirrored by hand.
 *
 * Which fill is the original is unknowable here, so this reports the overlap and judges
 * nothing. Five shared elements, because three identically-defined primitives is ordinary
 * coincidence; half the smaller fill, so a large fill incidentally containing five of a
 * small one's elements does not warn.
 */
function duplicatedFills(parsed: ParsedSpec): Array<{ path: string; message: string }> {
  const examples = parsed.examples as { slotContentExamples?: Record<string, unknown> } | undefined;
  const fills = examples?.slotContentExamples;
  if (!fills || typeof fills !== 'object') return [];

  const signatures = new Map<string, Map<string, string>>();
  for (const [name, fill] of Object.entries(fills)) {
    const elements = (fill as { elements?: Record<string, unknown> } | undefined)?.elements;
    if (!elements || typeof elements !== 'object') continue;
    signatures.set(name, new Map(
      Object.entries(elements).map(([key, value]) => [key, JSON.stringify(value)]),
    ));
  }

  const out: Array<{ path: string; message: string }> = [];
  const names = [...signatures.keys()];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = signatures.get(names[i])!;
      const b = signatures.get(names[j])!;
      const shared = [...a].filter(([key, value]) => b.get(key) === value).map(([key]) => key);
      if (shared.length < 5) continue;
      if (shared.length * 2 < Math.min(a.size, b.size)) continue;
      out.push({
        path: `/slotContentExamples/${names[i]}`,
        message: `${shared.length} elements are defined identically in "${names[j]}" (${shared.slice(0, 4).join(', ')}${shared.length > 4 ? ', …' : ''}) — a fill cannot include another fill, so an edit to one has to be mirrored by hand`,
      });
    }
  }
  return out;
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
  react: new Set(['contract.ts', 'metadata.ts', 'scaffold.tsx', 'stories.tsx', 'styles.css']),
  webcomponents: new Set(['api.ts', 'contract.ts', 'host.css', 'light.css', 'metadata.ts', 'scaffold.ts', 'stories.ts']),
};

/**
 * This list restates another package's output roster and has drifted once
 * already (metadata.ts arrived and authored specs were warned about generated
 * files) — so the header the emitters stamp on every file they own is the
 * authoritative check, and the list is only a fast path.
 */
function isGeneratedFile(file: string): boolean {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(120);
    const n = fs.readSync(fd, buf, 0, 120, 0);
    fs.closeSync(fd);
    return /^(\/\/|\/\*)\s*Generated\. Do not edit/.test(buf.toString('utf8', 0, n));
  } catch {
    return false;
  }
}

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
function unreachableAuthoredFiles(componentKey: string, supplemental: unknown, workspaceDir: string): Array<{ file: string; message: string }> {
  const mentioned: string[] = [];
  const collectStrings = (node: unknown): void => {
    if (typeof node === 'string') { mentioned.push(node); return; }
    if (Array.isArray(node)) { for (const item of node) collectStrings(item); return; }
    if (node && typeof node === 'object') for (const value of Object.values(node)) collectStrings(value);
  };
  collectStrings(supplemental);
  const mentionedAnywhere = (file: string): boolean => mentioned.some(s => s.includes(file));
  const folder = componentKey.charAt(0).toUpperCase() + componentKey.slice(1);
  const warnings: Array<{ file: string; message: string }> = [];
  for (const [tree, emitted] of Object.entries(EMITTED_FILES)) {
    const dir = path.join(workspaceDir, tree, 'src', 'components', folder);
    if (!fs.existsSync(dir)) continue;
    const entryPoints = AUTHORED_ENTRY_POINTS[tree] ?? new Set<string>();
    for (const file of fs.readdirSync(dir).sort()) {
      if (emitted.has(file)) continue;
      if (entryPoints.has(file)) continue;
      const full = path.join(dir, file);
      if (!fs.statSync(full).isFile()) continue;
      if (isGeneratedFile(full)) continue;
      if (!mentionedAnywhere(file)) {
        warnings.push({
          file: `${tree}/src/components/${folder}/${file}`,
          message: `authored file may be unreachable — only ${[...entryPoints].join(' or ')} is loaded by convention, and no supplemental entry mentions this file`,
        });
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
    for (const { path: errPath, message } of describeAjvErrors(validate.errors)) {
      findings.push({ kind, spec, file: location.fileLabel, path: errPath, message, level: 'error' });
    }
  }
  // The authored-document catalogue rules: schemaGap pointers resolve
  // (DSPEC-58), foundation directories use the vocabulary (DSPEC-62).
  for (const v of checkRules(doc, location.kind, { documentPath: location.file })) {
    findings.push({ kind, spec, file: location.fileLabel, path: v.path || '/', message: `[${v.rule}] ${v.message}`, level: 'error' });
  }
  return doc;
}
