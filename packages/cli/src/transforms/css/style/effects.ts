// Shadows and blurs (specs#691).
import { isTokenRef, resolveTokenVar } from '../values/tokens.js';
import { dimensionValue } from '../values/dimensions.js';
import { colorValue } from '../values/colors.js';

/**
 * Inline Effects object → CSS declarations.
 *
 *   shadows (inset absent/false) → box-shadow entries
 *   shadows (inset true)         → inset box-shadow entries
 *   layerBlur                    → filter: blur()
 *   backgroundBlur               → backdrop-filter: blur()
 *
 * Invisible entries are dropped; a present-but-fully-invisible group emits an
 * explicit reset so variant overrides can turn a lower layer's effect off.
 * When one effects value fans out into multiple CSS properties, each carries a
 * trace comment tying the individual declarations back to the single spec value
 * they came from.
 */
function inlineEffectDecls(effects: Record<string, unknown>, tokensFormat: string): string[] {
  const decls: string[] = [];

  if (Array.isArray(effects.shadows)) {
    const visible = (effects.shadows as Array<Record<string, unknown>>).filter(s => s.visible !== false);
    if (visible.length === 0) {
      decls.push('box-shadow: none');
    } else {
      const parts = visible.map(s => {
        const x = dimensionValue(s.offsetX, tokensFormat) ?? '0';
        const y = dimensionValue(s.offsetY, tokensFormat) ?? '0';
        const blur = dimensionValue(s.blur, tokensFormat) ?? '0';
        const spread = dimensionValue(s.spread, tokensFormat) ?? '0';
        const color = colorValue(s.color, tokensFormat) ?? 'currentColor';
        return `${s.inset ? 'inset ' : ''}${x} ${y} ${blur} ${spread} ${color}`;
      });
      decls.push(`box-shadow: ${parts.join(', ')}`);
    }
  }

  const blur = (key: 'layerBlur' | 'backgroundBlur', prop: string): void => {
    const b = effects[key] as Record<string, unknown> | undefined;
    if (!b || typeof b !== 'object') return;
    if (b.visible === false) {
      decls.push(`${prop}: none`);
      return;
    }
    const r = dimensionValue(b.radius, tokensFormat);
    if (r) decls.push(`${prop}: blur(${r})`);
  };
  blur('layerBlur', 'filter');
  blur('backgroundBlur', 'backdrop-filter');

  return decls.length > 1 ? decls.map(d => `${d} /* effects */`) : decls;
}

export function effectDecls(styles: Record<string, unknown>, tokensFormat: string): string[] {
  if (!('effects' in styles) || styles.effects === undefined) return [];
  const decls: string[] = [];
  const v = styles.effects;

  if (v === null) {
    // Variant removes the layer's effects — reset every property the
    // Effects mapping can emit.
    decls.push('box-shadow: none');
    decls.push('filter: none');
    decls.push('backdrop-filter: none');
  } else if (isTokenRef(v)) {
    // An effect-style reference names up to three role vars — <name>-shadows,
    // <name>-layer-blur, <name>-background-blur (mirroring the Effects schema
    // keys) — each holding its CSS property's complete value. All three
    // properties are emitted with a `none` fallback, so only the roles the
    // consumer actually defines take effect; `none` is a true no-op (unlike
    // blur(0), which would still create a stacking context).
    const base = resolveTokenVar(v, tokensFormat);
    if (base) {
      const role = (suffix: string) => base.replace(/\)$/, `-${suffix}, none)`);
      decls.push(`box-shadow: ${role('shadows')} /* effects */`);
      decls.push(`filter: ${role('layer-blur')} /* effects */`);
      decls.push(`backdrop-filter: ${role('background-blur')} /* effects */`);
    }
  } else if (typeof v === 'object') {
    decls.push(...inlineEffectDecls(v as Record<string, unknown>, tokensFormat));
  }

  return decls;
}
