import { TokenReference, ColorObject, ColorString } from "./Styles.js";

/**
 * A single stop in a gradient definition.
 */
export interface GradientStop {
  /** Position along the gradient vector, normalised 0–1. */
  position: number;
  /** Stop color. A stop cannot itself hold a gradient, so this is `ColorStyle` without the gradient and null arms. */
  color: ColorString | ColorObject | TokenReference;
}

/**
 * Normalised 2-D point used as the gradient centre for RADIAL and ANGULAR variants.
 * Both axes are in the range 0–1 relative to the fill bounding box.
 */
export interface GradientCenter {
  /** Horizontal centre position, normalised 0–1. */
  x: number;
  /** Vertical centre position, normalised 0–1. */
  y: number;
}

/**
 * A linear gradient, defined by an angle and two or more colour stops.
 */
export interface LinearGradient {
  /** Discriminant — always `"LINEAR"`. */
  type: 'LINEAR';
  /** Angle of the gradient line, in degrees. */
  angle: number;
  /** Ordered list of colour stops. Minimum two stops required. */
  stops: GradientStop[];
}

/**
 * A radial gradient, defined by a centre point and two or more colour stops.
 * Maps to `radial-gradient()` (CSS), `RadialGradient` (SwiftUI / Compose).
 */
export interface RadialGradient {
  /** Discriminant — always `"RADIAL"`. */
  type: 'RADIAL';
  /** Normalised centre point of the gradient ellipse. */
  center: GradientCenter;
  /** Ordered list of colour stops. Minimum two stops required. */
  stops: GradientStop[];
}

/**
 * An angular (conic) gradient, defined by a centre point and two or more colour stops.
 * Maps to `conic-gradient()` (CSS), `AngularGradient` (SwiftUI / Compose).
 */
export interface AngularGradient {
  /** Discriminant — always `"ANGULAR"`. */
  type: 'ANGULAR';
  /** Normalised centre point of the gradient sweep. */
  center: GradientCenter;
  /** Ordered list of colour stops. Minimum two stops required. */
  stops: GradientStop[];
}

/**
 * A discriminated union of the three supported cross-platform gradient types.
 * The `type` field is the discriminant and does not collide with any other
 * `ColorStyle` variant shape.
 *
 * DIAMOND is intentionally excluded — it has no native equivalent in CSS,
 * SwiftUI, or Jetpack Compose without approximation.
 */
export type GradientValue = LinearGradient | RadialGradient | AngularGradient;
