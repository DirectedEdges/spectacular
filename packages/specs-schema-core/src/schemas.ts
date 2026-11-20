// The JSON Schema layer — the schema set from @directededges/specs-schema,
// registered and compiled once per process.
//
// The schema files reference each other by relative URI
// (`component.schema.json#/definitions/…`) but most declare no `$id`, so each
// file is registered under its basename to make those references resolve.
//
// The schema a document validates against depends on its kind (§2.1). A whole
// component validates against the `Component` definition; a concern document
// validates against its file's root, which carries the choice over document
// kinds — validating against one definition inside the file would silently
// narrow the check to that kind. `conventions` and `settings` declare no root
// schema at all, so their main definition is the target.

import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'node:module';
import type { ValidateFunction, ErrorObject } from 'ajv';
import type { DocumentKind, Violation } from './types.js';

const req = createRequire(import.meta.url);

/** Where each document kind's schema lives: a registered file name plus an optional pointer within it. */
const KIND_TARGETS: Record<DocumentKind, string> = {
  component: 'component.schema.json#/definitions/Component',
  'component-concern': 'component-concern.schema.json',
  'composition-concern': 'composition-concern.schema.json',
  components: 'components.schema.json',
  conventions: 'conventions.schema.json#/definitions/Conventions',
  settings: 'settings.schema.json#/definitions/Settings',
  supplemental: 'supplemental.schema.json',
  guidelines: 'guidelines.schema.json',
};

// The slice of an Ajv instance this file uses. Ajv ships CJS; naming its class
// as a type across the NodeNext ESM boundary trips interop, and the registry
// needs only these two members.
interface SchemaRegistry {
  addSchema(schema: unknown, key: string): void;
  getSchema(ref: string): ValidateFunction | undefined;
}

let registry: SchemaRegistry | undefined;
let schemaDirCache: string | undefined;

/** The directory the schema files are read from — also where DSPEC-58 resolves `schemaGap.path` pointers. */
export function schemaDir(): string {
  if (!schemaDirCache) {
    schemaDirCache = path.dirname(req.resolve('@directededges/specs-schema/schema/component'));
  }
  return schemaDirCache;
}

/** The parsed content of one schema file, by basename. */
export function schemaFile(basename: string): Record<string, unknown> | undefined {
  const file = path.join(schemaDir(), basename);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function ajv(): SchemaRegistry {
  if (registry) return registry;

  // ajv ships CJS; require sidesteps the ESM default-interop difference between
  // an esbuild bundle and vitest.
  const AjvExport = req('ajv');
  const AjvCtor = AjvExport.default ?? AjvExport;
  const instance: SchemaRegistry = new AjvCtor({ allErrors: true, strict: false, allowUnionTypes: true });
  // Without ajv-formats the `uri`, `uri-reference` and `date-time` constraints
  // in the schema set are silently ignored — the gap this package closes.
  const addFormatsExport = req('ajv-formats');
  (addFormatsExport.default ?? addFormatsExport)(instance);

  for (const file of fs.readdirSync(schemaDir()).filter(f => f.endsWith('.schema.json'))) {
    instance.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir(), file), 'utf8')), file);
  }
  registry = instance;
  return instance;
}

const compiled: Partial<Record<DocumentKind, ValidateFunction>> = {};

/** The compiled JSON Schema validator for one document kind. */
export function schemaValidator(kind: DocumentKind): ValidateFunction {
  const hit = compiled[kind];
  if (hit) return hit;
  const fn = ajv().getSchema(KIND_TARGETS[kind]);
  if (!fn) throw new Error(`schema target not found: ${KIND_TARGETS[kind]}`);
  compiled[kind] = fn;
  return fn;
}

/** A compiled validator for any registered `<file>#<pointer>` target — the concern-definition accessors below use it. */
export function validatorFor(target: string): ValidateFunction {
  const fn = ajv().getSchema(target);
  if (!fn) throw new Error(`schema target not found: ${target}`);
  return fn;
}

export type ConcernName = 'api' | 'variants' | 'examples';

export interface ConcernValidators {
  api: ValidateFunction;
  variants: ValidateFunction;
  examples: ValidateFunction;
}

/** Which kind of spec a concern document belongs to (ADR-096, ADR-109). */
export type ConcernKind = 'component' | 'composition';

const concernCache = new Map<ConcernKind, ConcernValidators>();

/**
 * The three definitions each kind's concern documents validate against.
 *
 * A composition's documents are its own exact shape, never a loosened form of a
 * component's (ADR-109): it declares no props and no variants, and its elements
 * and layout sit at the top level rather than under `default`. Validating one
 * against the component definitions reports three errors per spec that name
 * members a composition is not supposed to have and cannot be given.
 */
const CONCERN_DEFINITIONS: Record<ConcernKind, Record<ConcernName, string>> = {
  component: {
    api: 'component-concern.schema.json#/definitions/ComponentApiDocument',
    variants: 'component-concern.schema.json#/definitions/ComponentVariantsDocument',
    examples: 'component-concern.schema.json#/definitions/ComponentExamplesDocument',
  },
  composition: {
    api: 'composition-concern.schema.json#/definitions/CompositionApiDocument',
    variants: 'composition-concern.schema.json#/definitions/CompositionVariantsDocument',
    examples: 'composition-concern.schema.json#/definitions/CompositionExamplesDocument',
  },
};

/**
 * Per-concern document validators for one spec kind. A caller that already knows
 * which concern a file carries validates against that concern's definition
 * directly, for errors scoped to the right branch rather than a three-way
 * `oneOf` fan-out.
 *
 * The kind defaults to `component` so an existing caller keeps its behaviour.
 */
export function concernValidators(kind: ConcernKind = 'component'): ConcernValidators {
  const cached = concernCache.get(kind);
  if (cached) return cached;
  const defs = CONCERN_DEFINITIONS[kind];
  const validators: ConcernValidators = {
    api: validatorFor(defs.api),
    variants: validatorFor(defs.variants),
    examples: validatorFor(defs.examples),
  };
  concernCache.set(kind, validators);
  return validators;
}

export type AuthoredKind = 'supplemental' | 'guidelines';

/** The validator for one of the two authored document kinds. */
export function authoredValidator(kind: AuthoredKind): ValidateFunction {
  return schemaValidator(kind);
}

/**
 * One ajv error as a reportable line. `instancePath` is empty for a root-level
 * failure; the missing-property name is folded in so "required" errors point at
 * the property, not its parent.
 */
export function describeAjvError(err: ErrorObject): { path: string; message: string } {
  if (err.keyword === 'required') {
    const missing = (err.params as { missingProperty?: string }).missingProperty;
    return { path: `${err.instancePath}/${missing}`, message: 'required property is missing' };
  }
  if (err.keyword === 'additionalProperties') {
    const extra = (err.params as { additionalProperty?: string }).additionalProperty;
    return { path: `${err.instancePath}/${extra}`, message: 'property is not allowed here' };
  }
  if (err.keyword === 'enum') {
    const allowed = (err.params as { allowedValues?: unknown[] }).allowedValues;
    return {
      path: err.instancePath,
      message: `must be one of: ${(allowed ?? []).map(v => String(v)).join(', ')}`,
    };
  }
  if (err.keyword === 'const') {
    const value = (err.params as { allowedValue?: unknown }).allowedValue;
    return { path: err.instancePath, message: `must be ${JSON.stringify(value)}` };
  }
  return { path: err.instancePath || '/', message: err.message ?? err.keyword };
}

/**
 * Describe a whole error array, collapsing a failed `oneOf` over a closed vocabulary into
 * one message naming the permitted values — a union of `const` branches otherwise reports
 * one message per rejected branch, none of which names a legal value.
 *
 * Grouped by path, so unrelated failures never merge. A group with no union error, or one
 * whose branches are not a closed vocabulary, is described error by error.
 */
export function describeAjvErrors(errors: readonly ErrorObject[]): Array<{ path: string; message: string }> {
  const byPath = new Map<string, ErrorObject[]>();
  for (const err of errors) {
    const path = err.instancePath || '/';
    const group = byPath.get(path);
    if (group) group.push(err); else byPath.set(path, [err]);
  }

  const out: Array<{ path: string; message: string }> = [];
  for (const [path, group] of byPath) {
    const union = group.find(e => e.keyword === 'oneOf' || e.keyword === 'anyOf');
    const values: string[] = [];
    let nullable = false;
    for (const err of group) {
      if (err.keyword === 'const') values.push(String((err.params as { allowedValue?: unknown }).allowedValue));
      else if (err.keyword === 'enum') values.push(...((err.params as { allowedValues?: unknown[] }).allowedValues ?? []).map(String));
      else if (err.keyword === 'type' && err.params && (err.params as { type?: unknown }).type === 'null') nullable = true;
    }
    const vocabulary = [...new Set(values)];
    if (union && vocabulary.length > 0) {
      out.push({
        path,
        message: `must be one of: ${vocabulary.join(', ')}${nullable ? ', or null' : ''}`,
      });
      continue;
    }
    const seen = new Set<string>();
    for (const err of group) {
      const described = describeAjvError(err);
      const line = `${described.path}|${described.message}`;
      if (seen.has(line)) continue;
      seen.add(line);
      out.push(described);
    }
  }
  return out;
}

/**
 * Whether an ajv error is exactly the missing `metadata.source` an authored
 * spec cannot honestly state — the one requirement a caller may downgrade to
 * a warning. Everything else stands.
 */
export function isMissingSourceError(err: ErrorObject): boolean {
  if (err.keyword !== 'required') return false;
  const missing = (err.params as { missingProperty?: string }).missingProperty;
  return missing === 'source' && /(^|\/)metadata$/.test(err.instancePath);
}

/** Run the JSON Schema layer for a kind, as `rule: 'schema'` violations — the sibling of `checkRules` and the CLI's `checkReferences`. */
export function checkSchema(doc: unknown, kind: DocumentKind): Violation[] {
  const fn = schemaValidator(kind);
  if (fn(doc)) return [];
  return (fn.errors ?? []).map(err => {
    const { path: p, message } = describeAjvError(err);
    return { rule: 'schema', path: p, message: `${message} (${err.schemaPath})` };
  });
}
