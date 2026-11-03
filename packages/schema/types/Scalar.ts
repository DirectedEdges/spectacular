/**
 * A string, number or boolean value.
 *
 * The primitive value shape shared by prop configurations, instance example
 * configurations, and conditional operands. It deliberately excludes `null`:
 * `null` means *unset* (ADR-080) at each of those sites, which is a meaning
 * about the enclosing entry rather than a value kind, so each union adds it
 * for itself.
 * @since 0.39.0
 */
export type Scalar = string | number | boolean;
