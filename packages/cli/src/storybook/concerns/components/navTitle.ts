// Where a spec sits in the Storybook sidebar.
//
// A component is a FOLDER and every view of it is a leaf inside it: the two
// platform docs pages the emitters write, and the spec and testing pages this
// concern publishes beside them. So the pages published here have to land in the
// same folder the emitters put their pages in, which means deriving the folder
// exactly the way `storyTitle` in from-specs does — the normalization below is
// that derivation, and a disagreement with it silently splits one component into
// two sidebar folders.
import { toPascalCase } from '../../../transforms/naming.js';
import type { SpecKind } from '../../../utilities/specsLayout.js';

/** The nav leaves the emitters claim. Published views must not collide with them. */
export const PLATFORM_LEAVES = { react: 'React', webcomponents: 'Web components' } as const;

/** The top-level section each kind browses under (ADR-097). */
const SECTION: Record<SpecKind, string> = { component: 'Components', composition: 'Compositions' };

/**
 * The folder a spec's views sit in — `Components/DS Button`.
 *
 * `title` is the spec's own, falling back to the folder key as the emitters do.
 * Figma-style " / " separators collapse so they do not create nav levels with
 * stray spaces, and a segment that sanitizes to nothing is dropped: Storybook's
 * manager crashes on an empty id part.
 */
export function specNavFolder(kind: SpecKind, key: string, title: string | undefined): string {
  const own = (title ?? toPascalCase(key)).replace(/\s*\/\s*/g, '/');
  const segments = own
    .split('/')
    .filter((seg) => seg.toLowerCase().replace(/[^a-z0-9]+/g, '').length > 0);
  return [SECTION[kind], ...segments].join('/');
}
