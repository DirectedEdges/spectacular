// The JSON Schema layer of `specs validate` — the schema set from
// @directededges/specs-schema, registered and compiled once per process.
//
// The schema files reference each other by relative URI
// (`component.schema.json#/definitions/…`) but most declare no `$id`, so each
// file is registered under its basename to make those references resolve. The
// package's exports map names only some of the files, so the set is read from
// the directory the concern export resolves to.

import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'node:module';
import type { ValidateFunction, ErrorObject } from 'ajv';

const req = createRequire(import.meta.url);

export type ConcernName = 'api' | 'variants' | 'examples';

export interface ConcernValidators {
  api: ValidateFunction;
  variants: ValidateFunction;
  examples: ValidateFunction;
}

let cached: ConcernValidators | undefined;

/** Compile the three concern-document validators, once per process. */
export function concernValidators(): ConcernValidators {
  if (cached) return cached;

  // ajv ships CJS; require sidesteps the ESM default-interop difference between
  // the esbuild bundle and vitest.
  const AjvExport = req('ajv');
  const Ajv = AjvExport.default ?? AjvExport;
  const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
  // The schemas use standard formats (date-time, uri); without this they are
  // ignored and every compile prints an "unknown format" line.
  const addFormatsExport = req('ajv-formats');
  (addFormatsExport.default ?? addFormatsExport)(ajv);

  const schemaDir = path.dirname(req.resolve('@directededges/specs-schema/schema/component-concern'));
  for (const file of fs.readdirSync(schemaDir).filter(f => f.endsWith('.schema.json'))) {
    ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir, file), 'utf8')), file);
  }

  const compiled = (pointer: string): ValidateFunction => {
    const fn = ajv.getSchema(`component-concern.schema.json${pointer}`);
    if (!fn) throw new Error(`schema definition not found: component-concern.schema.json${pointer}`);
    return fn;
  };

  cached = {
    api: compiled('#/definitions/ComponentApiDocument'),
    variants: compiled('#/definitions/ComponentVariantsDocument'),
    examples: compiled('#/definitions/ComponentExamplesDocument'),
  };
  return cached;
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
  return { path: err.instancePath || '/', message: err.message ?? err.keyword };
}

/**
 * Whether an ajv error is exactly the missing `metadata.source` an authored
 * spec cannot honestly state — the one requirement `--authored` downgrades to
 * a warning. Everything else stands.
 */
export function isMissingSourceError(err: ErrorObject): boolean {
  if (err.keyword !== 'required') return false;
  const missing = (err.params as { missingProperty?: string }).missingProperty;
  return missing === 'source' && /(^|\/)metadata$/.test(err.instancePath);
}
