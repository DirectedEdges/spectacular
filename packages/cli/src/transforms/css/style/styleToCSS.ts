// Spec style keys → CSS declarations.
//
// This file is the order they are emitted in. Each property family lives in its
// own module under `style/`, and none of them knows about the others — they are
// independent `'key' in styles` mappings, not a dispatch (specs#691).
//
// Order is the one thing that lives here, and it matters: later declarations win
// on equal specificity, so `rawCss` — what a rule pre-pass injected — comes after
// everything the mapping derived, and `position` last of all.
//
// Layout-group keys (layoutMode, mainAxisAlignment, crossAxisAlignment, wrap,
// wrapAlignment, itemSpacing, layoutSizingHorizontal, layoutSizingVertical) are
// handled by layoutToCSS — they require cross-key context and are skipped here.
import { fillDecls } from './fills.js';
import { opacityDecls } from './opacity.js';
import { borderDecls } from './border.js';
import { cornerRadiusDecls } from './cornerRadius.js';
import { effectDecls } from './effects.js';
import { sizeDecls } from './size.js';
import { paddingDecls } from './padding.js';
import { typographyDecls } from './typography.js';
import { textAlignDecls } from './textAlign.js';
import { truncationDecls } from './truncation.js';
import { aspectRatioDecls } from './aspectRatio.js';
import { visibilityDecls } from './visibility.js';
import { overflowDecls } from './overflow.js';
import { transformDecls } from './transform.js';
import { rawCssDecls } from './rawCss.js';
import { positionDecls } from './position.js';
import type { StyleToCSSOptions } from './options.js';

export type { StyleToCSSOptions };
export { hasInsets, impliesAbsolute } from './position.js';

export function styleToCSS(
  styles: Record<string, unknown>,
  tokensFormat = 'TOKEN',
  elemType?: string,
  options: StyleToCSSOptions = {},
): string[] {
  return [
    ...fillDecls(styles, tokensFormat, elemType),
    ...opacityDecls(styles, tokensFormat),
    ...borderDecls(styles, tokensFormat, options),
    ...cornerRadiusDecls(styles, tokensFormat),
    ...effectDecls(styles, tokensFormat),
    ...sizeDecls(styles, tokensFormat),
    ...paddingDecls(styles, tokensFormat),
    ...typographyDecls(styles, tokensFormat),
    ...textAlignDecls(styles),
    ...truncationDecls(styles),
    ...aspectRatioDecls(styles),
    ...visibilityDecls(styles),
    ...overflowDecls(styles),
    ...transformDecls(styles, tokensFormat),
    ...rawCssDecls(styles),
    ...positionDecls(styles, tokensFormat, options.inferAbsolute),
  ];
}
