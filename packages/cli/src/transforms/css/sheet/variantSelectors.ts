// Turning one variant's configuration into the selectors its rule is written
// against (specs#691).
//
// This is the subtlest step in the stylesheet, and the one with the quietest
// failure: expand wrongly and a state simply has no rule, so it renders as the
// default. Nothing errors, nothing warns, and the prop still reaches the
// contract and the stories — so the state looks supported. It lived inside a
// 600-line function where it could only ever be exercised end to end.
//
// Pure by design: no config loading, no console, no filesystem. Everything it
// needs is an argument, and everything it finds comes back in the result —
// including the values it could not name, which the caller reports because
// de-duplication and the resting-value exemption are the caller's business.
import { normalizeEnumValue } from '../values/enumCase.js';

/** A classified prop value a concept should have named, but none does. */
export interface UnnamedValue {
  prop: string;
  value: string;
}

export interface VariantSelectorInput {
  /** The variant's `configuration` block: prop → value. */
  configuration: Record<string, unknown>;
  /** Props the states convention routes through real CSS selectors. */
  classifiedProps: ReadonlySet<string>;
  /** `prop::value` → concept name. */
  stateLookup: ReadonlyMap<string, string>;
  /**
   * `prop::value` pairs whose concept a nested role claimed, so the
   * classification was dropped and the root carries the data attribute instead.
   */
  nestedClaimedPairs: ReadonlySet<string>;
  /** A concept's CSS selector, already narrowed for this root and target. */
  selectorFor(concept: string): string | undefined;
  /** The attribute name a prop is written as on this root form. */
  attrNameFor(prop: string): string;
  /** True when the states convention names a disabled concept. */
  guardsDisabled: boolean;
}

export interface VariantSelectorResult {
  /**
   * This variant emits no rule.
   *
   * Correct for a classified prop's *resting* value — the base block already
   * says what it looks like. For any other unnamed value it means declared
   * styling is being dropped, which is what `unnamed` is for.
   */
  skip: boolean;
  /** Attribute qualifiers, concatenated onto the root selector. */
  dataAttrs: string[];
  /**
   * One suffix per rule to emit. A concept whose selector is a comma-separated
   * list expands to several, because each needs its own rule — the cartesian
   * product across every classified prop in the configuration.
   */
  stateSelSuffixes: string[];
  /** Values that are classified but named by no concept. At most one: the walk stops there. */
  unnamed: UnnamedValue[];
}

/**
 * Negating a concept is an AND of nots, never a cartesian expansion.
 *
 * `:disabled, [aria-disabled="true"]` means "either of these". Its negation is
 * "neither", so the parts join into `:not(:disabled):not([aria-disabled="true"])`
 * — expanding them into two suffixes would emit a rule matching anything that
 * merely fails one of them.
 */
function negate(selector: string): string {
  return selector.split(',').map(part => `:not(${part.trim()})`).join('');
}

export function expandVariantSelectors(input: VariantSelectorInput): VariantSelectorResult {
  const { configuration, classifiedProps, stateLookup, nestedClaimedPairs, selectorFor, attrNameFor } = input;

  const dataAttrs: string[] = [];
  const unnamed: UnnamedValue[] = [];
  let stateSelSuffixes: string[] = [''];

  for (const [key, value] of Object.entries(configuration)) {
    const valueStr = String(value);

    if (!classifiedProps.has(key)) {
      // Scaffolds emit booleans as presence: the attribute is set to "" when
      // true and omitted when false — never written as "false". So a false
      // variant is the ABSENCE of the attribute; `[data-x="false"]` would match
      // nothing and the variant's styling would never apply.
      dataAttrs.push(
        value === true ? `[${attrNameFor(key)}]`
          : value === false ? `:not([${attrNameFor(key)}])`
            : `[${attrNameFor(key)}="${normalizeEnumValue(valueStr)}"]`
      );
      continue;
    }

    const concept = stateLookup.get(`${key}::${valueStr}`) ?? stateLookup.get(`${key}::${valueStr.toLowerCase()}`);

    // A classified boolean's FALSE value has no concept of its own — it is the
    // NEGATION of the true concept. Without this the whole variant is dropped as
    // base/rest state, so an unselected/unchecked variant (and every
    // hover/pressed pairing with it) emits no rule at all.
    let negated: string | undefined;
    if (!concept && value === false) {
      const trueConcept = stateLookup.get(`${key}::true`);
      const trueSel = trueConcept ? selectorFor(trueConcept) : undefined;
      if (trueSel) negated = negate(trueSel);
    }

    if (!concept && !negated) {
      // A value whose concept was claimed by a nested role is not unnamed — it
      // was declassified deliberately, and the root carries the variant prop's
      // data attribute for exactly this case. Route it there.
      if (nestedClaimedPairs.has(`${key}::${valueStr}`) || nestedClaimedPairs.has(`${key}::${valueStr.toLowerCase()}`)) {
        dataAttrs.push(`[${attrNameFor(key)}="${normalizeEnumValue(valueStr)}"]`);
        continue;
      }
      // Unmatched value: the base block covers the resting one; anything else is
      // declared styling that will not be emitted, so report it and stop.
      unnamed.push({ prop: key, value: valueStr });
      return { skip: true, dataAttrs, stateSelSuffixes, unnamed };
    }

    const selector =
      negated ?? (concept ? selectorFor(concept) : undefined) ?? `[${attrNameFor(key)}="${normalizeEnumValue(valueStr)}"]`;
    const parts = negated ? [negated] : selector.split(',').map(s => s.trim());
    const expanded: string[] = [];
    for (const existing of stateSelSuffixes) {
      for (const part of parts) expanded.push(existing + part);
    }
    stateSelSuffixes = expanded;
  }

  // Guard :hover and :active against firing while disabled. A disabled control
  // still receives pointer events, so without this the hover rule paints over
  // the disabled one.
  if (input.guardsDisabled) {
    const notGuard = negate(selectorFor('disabled') ?? ':disabled');
    stateSelSuffixes = stateSelSuffixes.map(suffix =>
      suffix.includes(':hover') || suffix.includes(':active') ? suffix + notGuard : suffix,
    );
  }

  return { skip: false, dataAttrs, stateSelSuffixes, unnamed };
}
