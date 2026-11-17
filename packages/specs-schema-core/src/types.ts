// The validator's public vocabulary. A violation names the rule that rejected
// the document — `DSPEC-nn` for a catalogue rule (SPECIFICATION.md §9),
// `schema` for a JSON Schema failure — because the conformance suite's
// negative fixtures assert the rule, not just the rejection (§10).

/** The eight document kinds of SPECIFICATION.md §2.1. */
export type DocumentKind =
  | 'component'
  | 'component-concern'
  | 'composition-concern'
  | 'components'
  | 'conventions'
  | 'settings'
  | 'supplemental'
  | 'guidelines';

export const DOCUMENT_KINDS: readonly DocumentKind[] = [
  'component',
  'component-concern',
  'composition-concern',
  'components',
  'conventions',
  'settings',
  'supplemental',
  'guidelines',
];

/** One failure, attributed to the rule that rejected the document. */
export interface Violation {
  /** `DSPEC-nn`, or `schema` for a JSON Schema failure. */
  rule: string;
  /** JSON Pointer to the offending node; empty string for the root. */
  path: string;
  message: string;
}

export interface ValidateResult {
  valid: boolean;
  /** Deterministic: sorted by path, then rule. */
  violations: Violation[];
}

/** Facts a single document cannot state about itself. Every member optional — a rule needing an absent member does not run. */
export interface RuleContext {
  /**
   * The document's workspace-relative file path. DSPEC-62 validates the
   * `foundations/<concern>` directory an authored document sits under, which
   * only the path carries.
   */
  documentPath?: string;
  /**
   * The workspace's parsed settings document. DSPEC-39 reads
   * `spec.color` to know which colour form every value must take.
   */
  settings?: Record<string, unknown>;
  /** Rule IDs to skip — for a caller that checks some rules itself with more context (e.g. workspace-wide resolution). */
  exclude?: ReadonlySet<string>;
}
