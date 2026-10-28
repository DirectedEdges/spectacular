// Gradients (specs#691).
import { colorValue } from './colors.js';
import { isTokenRef } from './tokens.js';

const GRADIENT_TYPES = new Set(['LINEAR', 'RADIAL', 'ANGULAR']);

interface GradientLike {
  type: string;
  angle?: number;
  center?: { x?: number; y?: number };
  stops: Array<{ position?: number; color?: unknown }>;
}

/**
 * A token reference whose value is a gradient.
 *
 * The spec carries the reference, not the gradient — the value arrives through
 * the custom property the tokens transform writes. `$type` is the only thing
 * that says which kind it is, and while it said `color` a gradient token was
 * indistinguishable from a colour one and fell through to `border-color`,
 * which cannot hold a gradient.
 */
export function isGradientToken(v: unknown): boolean {
  return isTokenRef(v) && (v as { $type?: string }).$type === 'gradient';
}

export function isGradient(v: unknown): v is GradientLike {
  if (typeof v !== 'object' || v === null) return false;
  const g = v as Record<string, unknown>;
  return typeof g.type === 'string' && GRADIENT_TYPES.has(g.type) && Array.isArray(g.stops);
}

/** Normalised 0–1 position → CSS percentage (trailing zeros trimmed). */
function percent(n: unknown): string {
  const v = typeof n === 'number' ? n : 0;
  return `${+(v * 100).toFixed(2)}%`;
}

/**
 * Render a GradientValue as a CSS gradient function.
 *
 *   LINEAR  → linear-gradient(Ndeg, …)   — spec angle is already CSS convention
 *   RADIAL  → radial-gradient(at X% Y%, …)
 *   ANGULAR → conic-gradient(from 0deg at X% Y%, …) — both start at 12
 *             o'clock. An angular gradient carries no angle (ADR-003); the
 *             rotation it appears at is the node's, applied as a transform
 *
 * Stop colors run through colorValue, so token references become var(--…).
 */
export function gradientValue(v: unknown, tokensFormat = 'TOKEN'): string | null {
  if (!isGradient(v)) return null;
  const stops = v.stops
    .map(s => {
      const c = colorValue(s.color, tokensFormat);
      return c ? `${c} ${percent(s.position)}` : null;
    })
    .filter((s): s is string => s !== null);
  if (stops.length < 2) return null;
  const stopList = stops.join(', ');
  const at = `at ${percent(v.center?.x ?? 0.5)} ${percent(v.center?.y ?? 0.5)}`;
  switch (v.type) {
    case 'LINEAR': return `linear-gradient(${v.angle ?? 0}deg, ${stopList})`;
    case 'RADIAL': return `radial-gradient(${at}, ${stopList})`;
    case 'ANGULAR': return `conic-gradient(from 0deg ${at}, ${stopList})`;
    default: return null;
  }
}
