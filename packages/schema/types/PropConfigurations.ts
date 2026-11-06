import { PropBinding } from "./PropBinding.js";
import { SlotContentRef } from "./SlotContentRef.js";
import { ImageBinding } from "./Image.js";

/**
 * A member-keyed object value configuring an `ObjectProp` (ADR-111). Keys are the
 * prop's member names; values are scalar member values, or `null` to unset a member.
 *
 * Layering is evaluated per member, reusing existing semantics: an absent member key
 * inherits, a `null` member value unsets (ADR-080). Member names must not begin with
 * `$` (schema-enforced), which is what keeps this form distinguishable from
 * `PropBinding`, `SlotContentRef`, and `ImageBinding`.
 * @since 0.39.0
 */
export type ObjectPropValue = Record<string, string | number | boolean | null>;

/**
 * The value of a single prop configuration entry (ADR-049).
 *
 * - Scalar values (`string | number | boolean`) — static prop values.
 * - `null` — the prop is **unset** in this configuration (ADR-080). A value, not
 *   an absence: an absent key inherits from the layer beneath, a `null` key
 *   overrides an inherited value with "no value". Meaningful only under a
 *   nullable prop.
 * - `PropBinding` — pass-through binding to a parent prop, e.g.
 *   `{ $binding: "#/props/label" }`. Forwards a parent prop value into a
 *   nested instance's prop.
 * - `SlotContentRef` — reference to a named slot fill, e.g.
 *   `{ $slotContent: "#/components/pill/slotContentExamples/composedLabel" }`.
 *   Used under a slot-prop key to fill a nested instance's slot with named
 *   content.
 * - `ImageBinding` — a `PropBinding` under an image-prop key carrying
 *   authoring-default example images (`examples: ImageValue[]`), used to
 *   forward a parent image prop into a nested image instance's source prop.
 * - `ObjectPropValue` — a member-keyed object under an object-prop key (ADR-111).
 */
export type PropConfigurationValue =
  | string
  | number
  | boolean
  | null
  | PropBinding
  | SlotContentRef
  | ImageBinding
  | ObjectPropValue;

/**
 * A path-addressed configuration of a nested descendant instance (ADR-052).
 *
 * `path` is an ordered list of `instanceOf` element keys from the anchoring
 * instance down to the descendant being configured; the terminal instance owns
 * the configured slot/prop. The remaining keys are the prop configurations
 * applied at that terminal instance — scalars, a `PropBinding`, or a
 * `SlotContentRef` for slot fills (a deep slot fill is the ADR-049 single-hop
 * fill reached by a path, not a new payload).
 *
 * Paths contain `instanceOf` keys only — slot descents are not segments: a
 * filled slot points to another `slotContentExamples` / `Composition` entry,
 * which recurses with its own `$nested` paths.
 */
export type NestedPropConfiguration = {
  path: string[];
  [propKey: string]: PropConfigurationValue | string[];
};

/**
 * Per-element prop configurations (ADR-049, ADR-052).
 *
 * Regular keys are prop names whose values are a {@link PropConfigurationValue}.
 * The reserved `$nested` key carries path-addressed configurations of nested
 * descendant instances reached through instance boundaries (e.g. deep slot
 * fills) — see {@link NestedPropConfiguration}. `Element` is unchanged; this
 * extends the value type it already references.
 *
 * `InstanceExample.propConfigurations` does **not** widen to `$nested`: an
 * instance example selects composed fills by reference, and deep configuration
 * data lives in `slotContentExamples`.
 */
export type PropConfigurations = {
  [propKey: string]: PropConfigurationValue | NestedPropConfiguration[] | undefined;
  $nested?: NestedPropConfiguration[];
};
