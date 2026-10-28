/**
 * The documented role vocabulary, as data.
 *
 * The schema deliberately types a role as an open string (`RoleConceptName = string`), so
 * nothing validates a concept name on the way in and transforms ignore concepts they do
 * not know. That openness is right for the contract and useless for a report: a tool that
 * cannot tell `checkbox` from `chekbox`, or a concept that emits from one that does not,
 * has nothing to say about a library's coverage.
 *
 * So this is the single machine-readable copy of what the docs state in prose, and it is
 * the list a proposal must choose from. `/roles/inventory/` is the human view of the same
 * facts and the two must agree — the docs pages remain the specification, and this follows
 * them rather than the reverse.
 *
 * Kept as literals rather than read from the docs at runtime, for the reason `analyze keys`
 * inlines the safe-key patterns: the CLI bundles to a single file, and a report that
 * depended on a resolvable docs path would fail in a published install.
 *
 * One known discrepancy, recorded rather than silently resolved: the `Anatomy` doc comment
 * in specs-from-figma lists `legend` as a part role. The docs site does not, treating
 * `<legend>` as what `label` emits on a `group`. This follows the site.
 */

/** What a concept names: an interactive or announced thing, or a piece of one. */
export type RoleKind = 'control' | 'part';

/**
 * Whether anything emits for a concept yet, mirroring `/roles/inventory/`.
 *
 * - `implemented` — emitted by `specs react` and `specs webcomponents`, built from its page
 * - `specified`   — its page is the specification; nothing emits yet
 * - `none`        — in the vocabulary, with no page describing it in detail
 *
 * Status describes the React and Web Components transforms, the two that emit today. A
 * concept that emits nothing is inert, not invalid: the spec carries it and nothing breaks.
 */
export type RoleStatus = 'implemented' | 'specified' | 'none';

export interface RoleConcept {
  kind: RoleKind;
  status: RoleStatus;
  /**
   * Whether this part wires to its control by id, and so must be named by a consumer
   * routing it across a component boundary. `indicator` is self-contained — it hides
   * itself wherever it renders — so naming it would wrongly suggest the consumer wires it.
   */
  wiresById?: boolean;
}

export const ROLE_VOCABULARY: Record<string, RoleConcept> = {
  // ── Control roles ──────────────────────────────────────────────────────────
  button: { kind: 'control', status: 'implemented' },
  togglebutton: { kind: 'control', status: 'implemented' },
  link: { kind: 'control', status: 'implemented' },
  disclosure: { kind: 'control', status: 'implemented' },
  textbox: { kind: 'control', status: 'implemented' },
  password: { kind: 'control', status: 'specified' },
  searchbox: { kind: 'control', status: 'specified' },
  textarea: { kind: 'control', status: 'specified' },
  spinbutton: { kind: 'control', status: 'none' },
  slider: { kind: 'control', status: 'none' },
  checkbox: { kind: 'control', status: 'implemented' },
  radio: { kind: 'control', status: 'specified' },
  switch: { kind: 'control', status: 'implemented' },
  group: { kind: 'control', status: 'specified' },
  alert: { kind: 'control', status: 'implemented' },
  status: { kind: 'control', status: 'implemented' },
  progressbar: { kind: 'control', status: 'implemented' },

  // ── Part roles ─────────────────────────────────────────────────────────────
  label: { kind: 'part', status: 'implemented', wiresById: true },
  description: { kind: 'part', status: 'implemented', wiresById: true },
  errormessage: { kind: 'part', status: 'implemented', wiresById: true },
  value: { kind: 'part', status: 'implemented', wiresById: true },
  placeholder: { kind: 'part', status: 'implemented', wiresById: true },
  indicator: { kind: 'part', status: 'implemented' },
  panel: { kind: 'part', status: 'implemented' },
  increment: { kind: 'part', status: 'none' },
  decrement: { kind: 'part', status: 'none' },
};

/** A concept name is a single flat lowercase alphanumeric token — the reader's shape. */
const CONCEPT = /^[a-z][a-z0-9]*$/;

/** Whether a value has the shape of a concept name at all, regardless of recognition. */
export function isConceptShaped(value: unknown): value is string {
  return typeof value === 'string' && CONCEPT.test(value);
}

export function isKnownConcept(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(ROLE_VOCABULARY, name);
}

/**
 * The concepts an element's `role` declares, normalized to a list.
 *
 * A role is a string or an array of them. The array form is meaningful only on an
 * `instance` element, where it routes several parts; on an element the component owns,
 * more than one is an authoring error, which the caller reports rather than this.
 */
export function conceptsOf(role: unknown): string[] {
  const raw = Array.isArray(role) ? role : [role];
  const out: string[] = [];
  for (const value of raw) {
    if (isConceptShaped(value) && !out.includes(value)) out.push(value);
  }
  return out;
}
