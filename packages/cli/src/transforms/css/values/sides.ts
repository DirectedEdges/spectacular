// Per-side values — padding, border widths — and the property names they
// expand to (specs#691).
import { dimensionValue } from './dimensions.js';

/**
 * The property names one Sides object expands to.
 *
 * A side is not a suffix. `padding` takes it as one (`padding-inline-start`),
 * but `border-width` splits around it (`border-inline-start-width`), so
 * appending the side to the property name produces `border-width-left` — a
 * name no browser implements, silently dropping every per-side stroke weight.
 *
 * The names are logical because the spec's vocabulary is: it keys these by
 * `start` and `end`, never `left` and `right`, and positioning already emits
 * `inset-inline-start`. Physical names would flip under RTL while the insets
 * beside them stayed put.
 */
interface SideNames {
  top: string;
  end: string;
  bottom: string;
  start: string;
  /**
   * Two-value shorthands, used when all four sides are known.
   *
   * Optional because only the logical properties have them. The physical
   * fallback below has no four-value logical form, and saying so in the type is
   * what lets `sidesValue` branch on it — it used to be declared required and
   * the fallback cast over it, which is the one shape the compiler rejected.
   */
  block?: string;
  inline?: string;
}

const SIDE_NAMES: Record<string, SideNames> = {
  padding: {
    top: 'padding-block-start',
    end: 'padding-inline-end',
    bottom: 'padding-block-end',
    start: 'padding-inline-start',
    block: 'padding-block',
    inline: 'padding-inline',
  },
  'border-width': {
    top: 'border-block-start-width',
    end: 'border-inline-end-width',
    bottom: 'border-block-end-width',
    start: 'border-inline-start-width',
    block: 'border-block-width',
    inline: 'border-inline-width',
  },
};

/**
 * Render a Sides object (top/end/bottom/start) as shorthand or per-side
 * declarations.
 *
 * A property with no entry in {@link SIDE_NAMES} falls back to appending the
 * physical side, which is what every caller got before the table existed.
 */
export function sidesValue(v: Record<string, unknown>, prop: string, tokensFormat = 'TOKEN'): string[] {
  const names: SideNames = SIDE_NAMES[prop] ?? {
    top: `${prop}-top`,
    end: `${prop}-right`,
    bottom: `${prop}-bottom`,
    start: `${prop}-left`,
  };

  const { top, end, bottom, start } = v;
  const vals = [top, end, bottom, start].map(x => dimensionValue(x, tokensFormat));

  if (vals.every(x => x !== null)) {
    const [t, e, b, s] = vals as string[];
    // There is no four-value logical shorthand, so all-four collapses to the
    // block and inline pair rather than to `prop: t e b s` — which would read
    // as top/right/bottom/left and put `start` on the left in every direction.
    if (names.block && names.inline) {
      return [`${names.block}: ${t === b ? t : `${t} ${b}`}`, `${names.inline}: ${s === e ? s : `${s} ${e}`}`];
    }
    return [`${prop}: ${t} ${e} ${b} ${s}`];
  }

  const decls: string[] = [];
  if (top !== undefined) { const d = dimensionValue(top, tokensFormat); if (d) decls.push(`${names.top}: ${d}`); }
  if (end !== undefined) { const d = dimensionValue(end, tokensFormat); if (d) decls.push(`${names.end}: ${d}`); }
  if (bottom !== undefined) { const d = dimensionValue(bottom, tokensFormat); if (d) decls.push(`${names.bottom}: ${d}`); }
  if (start !== undefined) { const d = dimensionValue(start, tokensFormat); if (d) decls.push(`${names.start}: ${d}`); }
  return decls;
}
