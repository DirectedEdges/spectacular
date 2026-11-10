import { PropConfigurations } from "./PropConfigurations.js";
import { Styles } from "./Styles.js";

/**
 * Style patches an instance element applies inside the component it instances
 * (ADR-119). Entries layer in order, the later winning per style key.
 * @since 0.40.0
 */
export type Overrides = Override[];

/**
 * One patch over the instanced component's elements, applied after that component
 * has resolved its own variants and interaction state.
 * @since 0.40.0
 */
export type Override = {
  /**
   * Resolved prop values of the instanced component this entry applies under.
   * Absent applies it at every configuration rather than at the base one.
   */
  configuration?: PropConfigurations;
  elements: ElementOverrides;
};

/**
 * Per-element patches, keyed by the names the instanced component's own `anatomy`
 * uses — its root included.
 * @since 0.40.0
 */
export type ElementOverrides = Record<string, ElementOverride>;

/**
 * What one element of the instanced component may have patched.
 * @since 0.40.0
 */
export type ElementOverride = {
  /** Styles to apply over the element's resolved styles, bounded by `overridable`. */
  styles?: Styles;
  /** Replacement content for a `text` or `glyph` element. Static — never a `PropBinding`. */
  content?: string;
  /** Patches for the component this element instances, where it is itself an instance. */
  overrides?: Overrides;
};
