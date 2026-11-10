import { PropConfigurations } from "./PropConfigurations.js";
import { Styles } from "./Styles.js";

/**
 * Ordered style patches an instance element applies inside the component it
 * instances (ADR-119). Entries layer in order, the later one winning per style
 * key, the same way `variants` layer over the default.
 * @since 0.40.0
 */
export type Overrides = Override[];

/**
 * One patch over the instanced component's own elements, applied after that
 * component has resolved its variants and interaction state.
 *
 * Shaped like {@link Variant} minus what a patch may not do: no `layout`,
 * because an override does not restructure, and no `invalid`, because an
 * override does not describe a variant's existence.
 * @since 0.40.0
 */
export type Override = {
  /**
   * Resolved prop values of the instanced component this entry applies under.
   * Absent applies the entry at every configuration, rather than at the base
   * one — so an unscoped patch survives the instanced component's own state
   * rules rather than being beaten by them.
   */
  configuration?: PropConfigurations;
  /** The patches this entry carries, keyed by the instanced component's element names. */
  elements: ElementOverrides;
};

/**
 * Per-element patches, keyed by the names the instanced component's own
 * `anatomy` uses. The instanced component's root is addressable here; which of
 * its properties take effect as the instance's own placement instead is
 * declared per platform, not in this contract (ADR-119).
 * @since 0.40.0
 */
export type ElementOverrides = Record<string, ElementOverride>;

/**
 * What one element of the instanced component may have patched.
 * @since 0.40.0
 */
export type ElementOverride = {
  /**
   * Style values to apply over the element's resolved styles. A property the
   * schema annotates `overridable: false` is not patchable here, which the
   * annotation carries rather than this type.
   */
  styles?: Styles;
  /**
   * Replacement content for a `text` or `glyph` element. A static value — a
   * `PropBinding` is not accepted, because an override describes a documented
   * instance rather than a live data flow.
   */
  content?: string;
  /**
   * Patches for the component this element instances, where the element is
   * itself an instance. Recursion follows instance boundaries only, matching
   * the `$nested` path rule (ADR-052).
   */
  overrides?: Overrides;
};
