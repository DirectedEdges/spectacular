/**
 * The name of a component or component set, as written in this spec's
 * `format.keys` (ADR-066).
 *
 * A named alias rather than a bare `string` so the sites that hold one —
 * `AnatomyElement.instanceOf`, `Element.instanceOf`, `SlotProp.anyOf` — say
 * what the string is, and so docs can link the three together.
 * @since 0.39.0
 */
export type ComponentName = string;
