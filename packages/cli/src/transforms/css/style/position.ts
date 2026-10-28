// Absolute placement and inset offsets (specs#691).
import { dimensionValue } from '../values/dimensions.js';

/** True when any inset coordinate (top/bottom/start/end) is present and non-null. */
export function hasInsets(styles: Record<string, unknown>): boolean {
  return ['top', 'bottom', 'start', 'end'].some(
    k => k in styles && styles[k] !== null && styles[k] !== undefined
  );
}

/**
 * Whether coordinates imply Figma absolute placement, given the parent's
 * layout. Outside auto-layout, any coordinates do. Inside auto-layout,
 * children are flow-placed, so coordinates only mean layoutPositioning:
 * ABSOLUTE when they are meaningful — non-zero, or anchored on opposing
 * sides (top+bottom / start+end). Zero-only single anchors are canvas noise.
 */
export function impliesAbsolute(styles: Record<string, unknown>, parentAutoLayout: boolean): boolean {
  if ('position' in styles) return styles.position === 'ABSOLUTE';
  if (!hasInsets(styles)) return false;
  if (!parentAutoLayout) return true;
  const val = (k: string) => styles[k];
  const present = (k: string) => k in styles && val(k) !== null && val(k) !== undefined;
  const nonZero = ['top', 'bottom', 'start', 'end'].some(k => present(k) && val(k) !== 0);
  const opposing = (present('top') && present('bottom')) || (present('start') && present('end'));
  return nonZero || opposing;
}

/**
 * `position: ABSOLUTE` is emitted on the element that carries it in the spec.
 * `position: AUTO` means the element re-enters auto-layout flow (a variant
 * transition from ABSOLUTE back to AUTO); it emits `position: static` to undo a
 * prior absolute rule.
 */
export function positionDecls(
  styles: Record<string, unknown>,
  tokensFormat: string,
  inferAbsolute: boolean | undefined,
): string[] {
  const decls: string[] = [];

  if ('position' in styles) {
    if (styles.position === 'ABSOLUTE') decls.push('position: absolute');
    else if (styles.position === 'AUTO') decls.push('position: static');
  } else if (inferAbsolute && hasInsets(styles)) {
    decls.push('position: absolute');
  }

  for (const [specKey, cssKey] of [
    ['top', 'inset-block-start'],
    ['bottom', 'inset-block-end'],
    ['start', 'inset-inline-start'],
    ['end', 'inset-inline-end'],
  ] as const) {
    if (specKey in styles && styles[specKey] !== null && styles[specKey] !== undefined) {
      const d = dimensionValue(styles[specKey], tokensFormat);
      if (d) decls.push(`${cssKey}: ${d}`);
    }
  }

  decls.push(...centerDecls(styles, tokensFormat));

  return decls;
}

/**
 * A centre constraint, which pins the element's own centre to its parent's
 * rather than anchoring an edge.
 *
 * The spec records it as an offset from that centre — `centerVerticalOffset: 0`
 * is "stay vertically centred". Nothing translated it, so an element the design
 * centres got no block-axis placement at all and fell to `top: auto`, which
 * resolves to its static position: the top of the parent. A 4px slider track
 * inside a 20px control rendered 8px high of where the design draws it.
 *
 * `inset-*-start: 50%` puts the element's leading edge at the parent's centre
 * and the half-size `translate` pulls it back by its own measure, so this holds
 * whatever the element's size is — including a size given as a token, where
 * arithmetic on it is not available here.
 *
 * `translate` rather than `transform`: it is an independent property, so it
 * composes with whatever `transformDecls` emitted instead of replacing it.
 */
function centerDecls(styles: Record<string, unknown>, tokensFormat: string): string[] {
  const offset = (key: string): string | null => {
    if (!(key in styles) || styles[key] === null || styles[key] === undefined) return null;
    const raw = styles[key];
    if (raw === 0) return '50%';
    const d = dimensionValue(raw, tokensFormat);
    return d ? `calc(50% + ${d})` : '50%';
  };

  // An edge anchor on the same axis wins: the two are mutually exclusive in a
  // design file, and emitting both would put two values on one property.
  const anchored = (...keys: string[]) =>
    keys.some(k => k in styles && styles[k] !== null && styles[k] !== undefined);

  const vertical = anchored('top', 'bottom') ? null : offset('centerVerticalOffset');
  const horizontal = anchored('start', 'end') ? null : offset('centerHorizontalOffset');
  if (!vertical && !horizontal) return [];

  const decls: string[] = [];
  if (horizontal) decls.push(`inset-inline-start: ${horizontal}`);
  if (vertical) decls.push(`inset-block-start: ${vertical}`);
  decls.push(`translate: ${horizontal ? '-50%' : '0'} ${vertical ? '-50%' : '0'}`);
  return decls;
}
