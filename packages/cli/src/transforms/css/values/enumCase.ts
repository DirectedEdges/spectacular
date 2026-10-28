/**
 * Normalizing a design-tool enum value for a web target.
 *
 * Variant option labels arrive in the source vocabulary — `Filled`, `Medium`,
 * `Very small`. HTML attribute selectors are case-sensitive, so an author
 * writing the natural `appearance="filled"` gets a silently unstyled component,
 * and once shipped the source casing is fossilised into every consumer callsite
 * and every override.
 *
 * The transform therefore lowercases at the web boundary. **The spec is not
 * modified** — it keeps the source vocabulary, so the lossless-formatting promise
 * across transformation boundaries holds and provenance is unaffected.
 *
 * Lowercasing is the *only* change. Characters are never stripped or replaced:
 * a value like `20x20` or `Body/Large` keeps its digits and separators, because
 * removing them would change what the value denotes and surface as a user-facing
 * defect. `Very small` becomes `very small`, not `very-small`.
 *
 * This is one-way for now. Reversing it would need value-level provenance the
 * spec does not yet carry — see ADR 066 for the key-level equivalent.
 */
export function normalizeEnumValue(value: string): string {
  return value.toLowerCase();
}

/** Normalize where the value is a string; pass anything else through untouched. */
export function normalizeEnumLike(value: unknown): unknown {
  return typeof value === 'string' ? normalizeEnumValue(value) : value;
}
