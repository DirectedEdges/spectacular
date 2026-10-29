/**
 * Type-level tests for Metadata.
 * These files are intentionally never executed — they are compiled with tsc
 * to assert that the type shape is correct.
 */
import type { Metadata, RunMetadata } from '../types/index.js';

// Exactly one platform entry — the one that produced this spec (ADR-079)
const baseConventions: RunMetadata['conventions'] = {
  platforms: {
    figma: {
      naming: 'SENTENCE',
      subcomponents: { scope: 'NESTED', match: ['{C} / _ / {S}'] },
      slotConstraints: false,
      inferNumberProps: false,
      slotPrimitives: true,
    },
  },
};

const baseSettings: RunMetadata['settings'] = {
  curation: {
    defaultSelection: 'READY_FOR_DEV',
    preserveManualSelections: false,
    includeDependencies: true,
  },
  spec: {
    format: 'JSON',
    keys: 'SAFE',
    layout: 'LAYOUT',
    tokens: 'TOKEN',
    color: 'HEX',
    variantDepth: 9999,
    details: 'LAYERED',
    collapsePrimitiveWrapper: false,
    promotePrimitives: false,
    roles: false,
    roleValidation: 'warn',
    invalidVariants: false,
    invalidCombinations: true,
    emptyVariants: false,
    defaultSlotContent: false,
    splitComponents: true,
    splitConcerns: true,
    useSubfolders: true,
  },
};

// Minimal valid Metadata — license absent (optional field)
const withoutLicense: Metadata = {
  author: 'test',
  lastUpdated: '2026-02-24T00:00:00Z',
  generator: { url: 'https://example.com', version: '1.10.0', name: 'test' },
  schema: { url: 'https://example.com/schema', version: '1.0.0' },
  source: { pageId: 'p1', nodeId: 'n1', nodeType: 'COMPONENT' },
  conventions: baseConventions,
  settings: baseSettings,
};

// With generator.license present — both subfields required
const withLicense: Metadata = {
  ...withoutLicense,
  generator: {
    url: 'https://example.com',
    version: '1.10.0',
    name: 'test',
    license: {
      status: 'VALID',
      level: 'PRO',
    },
  },
};

// status and level are strings
const _status: string = withLicense.generator!.license!.status;
const _level: string = withLicense.generator!.license!.level;

// generator.license is optional — can be undefined
const _optional: { status: string; level: string } | undefined = withoutLicense.generator!.license;

// generator.version is a string (semver), not a number
const _version: string = withoutLicense.generator!.version;
// @ts-expect-error — number is not assignable to string
const _versionBad: Metadata['generator'] = { url: '', version: 1, name: '' };

// ─── schema.latest — optional discovery URL (ADR 023) ───────────────────────

// latest is optional — absent is valid
const withoutLatest: Metadata = {
  ...withoutLicense,
  schema: { url: 'https://example.com/schema/v0.13.0/component.schema.json', version: '0.13.0' },
};

// latest can be provided
const withLatest: Metadata = {
  ...withoutLicense,
  schema: { url: 'https://example.com/schema/v0.13.0/component.schema.json', version: '0.13.0', latest: 'https://example.com/schema/main/component.schema.json' },
};

// latest is a string when present
const _latestVal: string | undefined = withLatest.schema!.latest;

// ─── RunMetadata — the run's facts, stated once (ADR-089) ───────────────────

// All six keys are required on RunMetadata — a run states its facts in full
const run: RunMetadata = {
  author: 'test',
  lastUpdated: '2026-09-15T00:00:00Z',
  generator: { url: 'https://example.com', version: '1.10.0', name: 'test' },
  schema: { url: 'https://example.com/schema', version: '1.0.0' },
  conventions: baseConventions,
  settings: baseSettings,
};

// @ts-expect-error — settings is required on RunMetadata
const _runMissingSettings: RunMetadata = {
  author: 'test',
  lastUpdated: '2026-09-15T00:00:00Z',
  generator: { url: 'https://example.com', version: '1.10.0', name: 'test' },
  schema: { url: 'https://example.com/schema', version: '1.0.0' },
  conventions: baseConventions,
};

// RunMetadata carries no per-component data
// @ts-expect-error — source is not a RunMetadata key
const _runWithSource: RunMetadata = { ...run, source: { pageId: 'p1', nodeId: 'n1', nodeType: 'COMPONENT' } };

// ─── Reduced Metadata — source only (ADR-089) ───────────────────────────────

// A component document may carry source alone; the run's facts live elsewhere
const reduced: Metadata = {
  source: { pageId: 'p1', nodeId: 'n1', nodeType: 'COMPONENT' },
};

// @ts-expect-error — source is required whenever a metadata block is present
const _empty: Metadata = {};

// The run keys are optional, so reading one yields a possibly-undefined value
const _maybeSettings: RunMetadata['settings'] | undefined = reduced.settings;
const _maybeAuthor: string | undefined = reduced.author;

// The full form is a RunMetadata spread onto the required source
const full: Metadata = { ...run, source: { pageId: 'p1', nodeId: 'n1', nodeType: 'COMPONENT' } };
const _fullAuthor: string | undefined = full.author;
