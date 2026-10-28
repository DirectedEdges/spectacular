// Shapes the stylesheet modules share (specs#691).
//
// Their own module because every module under `css/` needs them and none owns
// them. They used to be declared inside `Css.ts`, which is why nothing could be
// split out of it without dragging the whole file along.
import type { ExamplesData } from '../examples.js';

/**
 * Which element the stylesheet treats as the component's root.
 *
 * `class` targets the root by its block class, which is what a React scaffold
 * renders. `host` targets `:host` — the custom element itself is the root, so
 * its qualifiers go inside the functional form (`:host([data-size="L"]:hover)`)
 * rather than being appended. Element rules match inside the shadow tree and are
 * identical in both forms.
 */
export type RootForm = 'class' | 'host';

/** What a `$image` reference needs in order to become a `url()`. */
export interface ImagesCssContext {
  examples: ExamplesData | undefined;
  relPrefix: string;
}
