import { Scalar } from "./Scalar.js";
import { SlotContentRef } from "./SlotContentRef.js";
import { ObjectPropValue } from "./PropConfigurations.js";
import { Styles } from "./Styles.js";

/**
 * The value of one prop in an `InstanceExample`: a scalar, `null` when the prop
 * is unset (ADR-080), a `SlotContentRef` for a slot prop, or an
 * `ObjectPropValue` for an object prop (ADR-111).
 *
 * A deliberate subset of `PropConfigurationValue` — no `PropBinding` and no
 * `ImageBinding` — because an instance example is a documented configuration
 * for human readers and tooling, not a live data flow.
 * @since 0.39.0
 */
export type InstanceExampleConfigurationValue =
  | Scalar
  | null
  | SlotContentRef
  | ObjectPropValue;

/**
 * A pre-configured usage of a whole component (ADR-048).
 *
 * Scalar props are set directly; slot props are filled via `SlotContentRef`
 * pointing into the component's `slotContentExamples` registry. Slot fills
 * encountered inside an example instance are contributed to that shared
 * registry (deduplicated against existing entries), so an `InstanceExample`
 * holds no slot content of its own. `PropBinding` is not accepted — an
 * `InstanceExample` is a documented configuration for human readers and
 * tooling, not a live data flow.
 */
export type InstanceExample = {
  /** Human-readable label for this example. */
  title?: string;

  /**
   * The example instance's own styles — its box, not its content's (ADR-124).
   * An author-resized example records `layoutSizingHorizontal: 'FIXED'` and
   * `width` (raw px), the box its interior fixed widths were measured against;
   * an example left at its component's natural size (`HUG`) omits this property
   * entirely. A rendering consumer applies these styles to the instantiated
   * example as its final step. @since 0.41.0
   */
  styles?: Styles;

  /**
   * Prop values for this example. Scalar types for scalar props;
   * `SlotContentRef` (into `Component.slotContentExamples`) for slot props;
   * `ObjectPropValue` for object props (ADR-111);
   * `null` when the prop is unset in this example (ADR-080).
   * `PropBinding` is not permitted here. Since ADR-111 this union cannot enforce
   * that on its own — `ObjectPropValue` is a scalar-valued record, which a
   * `{ $binding }` object satisfies structurally — so the rule is carried by the
   * JSON Schema, where a member name may not begin with `$`.
   */
  propConfigurations?: Record<string, InstanceExampleConfigurationValue>;
};

/**
 * The component's instance examples: the named items and how they sit relative
 * to each other (ADR-125). The wrapper keeps set-level facts out of the items
 * record, whose keys are formatted layer names and could collide with any
 * field folded in beside them.
 */
export interface InstanceExamples {
  /**
   * How the items sit relative to each other. Absent means `VERTICAL`.
   * @since 0.41.0
   */
  orientation?: 'HORIZONTAL' | 'VERTICAL';

  /**
   * Named record of `InstanceExample` entries. Keys are plain identifier
   * strings (`^[a-zA-Z0-9_-]+$`). Before 0.41.0 this record was
   * `Component.instanceExamples` itself.
   */
  items: Record<string, InstanceExample>;
}
