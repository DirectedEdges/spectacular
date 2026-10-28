// visual-ignore.yaml — the one place a workspace states what its own fixtures
// cannot settle. Scoring keys (passPct, dimTolerancePx, threshold, skip,
// skipVariants, note) are read at diff time and re-score in seconds;
// sampleVariants, pinWidth and driveInteractions are consumed when the
// manifest is built and need a rebuild plus a re-shoot.
//
// Kind-aware: `components:` / `compositions:` sections key each kind
// separately (a shared name is legal). Flat top-level keys — the shape every
// pre-existing ignore file has — apply to components.
import fs from 'fs-extra';
import YAML from 'yaml';
import type { ScoringKeys, SpecKind } from './types.js';

export const SCORING_DEFAULTS = { threshold: 0.12, passPct: 1.0, dimTolerancePx: 0 };

const KIND_SECTIONS = ['components', 'compositions'];

export interface IgnoreFile {
  defaults: Record<string, any>;
  /** Per-kind per-key entries. */
  byKind: Record<SpecKind, Record<string, any>>;
  /** Entries lacking the required `note:` — suppressed signal with no reason. */
  noteless: string[];
}

export function loadIgnore(ignorePath: string): IgnoreFile {
  const empty: IgnoreFile = {
    defaults: {},
    byKind: { component: {}, composition: {} },
    noteless: [],
  };
  if (!fs.existsSync(ignorePath)) return empty;
  const raw = YAML.parse(fs.readFileSync(ignorePath, 'utf8')) ?? {};
  const out = { ...empty, defaults: raw.$defaults ?? {} };

  // Only keys that SUPPRESS signal demand a justification. driveInteractions
  // adds coverage (hover/press poses) rather than hiding anything, so an
  // entry carrying only it has nothing to justify.
  const SUPPRESSING = ['skip', 'skipVariants', 'passPct', 'dimTolerancePx', 'threshold', 'sampleVariants', 'pinWidth'];

  const absorb = (kind: SpecKind, entries: Record<string, any>, prefix: string) => {
    for (const [key, value] of Object.entries(entries)) {
      if (!value || typeof value !== 'object') continue;
      out.byKind[kind][key] = value;
      if (!value.note && SUPPRESSING.some((k) => k in value)) out.noteless.push(`${prefix}${key}`);
    }
  };

  if (raw.components || raw.compositions) {
    absorb('component', raw.components ?? {}, 'components/');
    absorb('composition', raw.compositions ?? {}, 'compositions/');
  } else {
    const flat = Object.fromEntries(
      Object.entries(raw).filter(([k]) => k !== '$defaults' && !KIND_SECTIONS.includes(k)),
    );
    absorb('component', flat, '');
  }
  return out;
}

/** Resolve $defaults → per-spec → skipVariants matcher for one pair. */
export function scoringFor(
  ignore: IgnoreFile,
  kind: SpecKind,
  key: string,
  config: Record<string, string> | undefined,
): ScoringKeys {
  const comp = ignore.byKind[kind][key] ?? {};
  const out: ScoringKeys = {
    threshold: comp.threshold ?? ignore.defaults.threshold ?? SCORING_DEFAULTS.threshold,
    passPct: comp.passPct ?? ignore.defaults.passPct ?? SCORING_DEFAULTS.passPct,
    dimTolerancePx:
      comp.dimTolerancePx ?? ignore.defaults.dimTolerancePx ?? SCORING_DEFAULTS.dimTolerancePx,
    skip: comp.skip === true,
    note: comp.note ?? null,
  };
  for (const matcher of comp.skipVariants ?? []) {
    if (Object.entries(matcher).every(([p, v]) => config?.[p] === v)) out.skip = true;
  }
  return out;
}

/** Manifest-time keys for one kind: sampleVariants, pinWidth, driveInteractions. */
export function manifestKeysFor(ignore: IgnoreFile, kind: SpecKind): {
  sampleTargets: Record<string, number>;
  noPin: Set<string>;
  driveInteractions: Set<string>;
} {
  const sampleTargets: Record<string, number> = {};
  const noPin = new Set<string>();
  const driveInteractions = new Set<string>();
  for (const [key, v] of Object.entries(ignore.byKind[kind])) {
    if (Number.isFinite(v.sampleVariants)) sampleTargets[key] = v.sampleVariants;
    if (v.pinWidth === false) noPin.add(key);
    if (v.driveInteractions === true) driveInteractions.add(key);
  }
  return { sampleTargets, noPin, driveInteractions };
}
