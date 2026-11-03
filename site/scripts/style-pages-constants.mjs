/**
 * The judgment calls the page generators cannot derive.
 *
 * Everything in a generated page should come from the schema. These are the
 * exceptions — facts a person decided that no file states — and they are here
 * rather than buried in a generator so that changing one is an edit to a named
 * list, not an archaeology exercise.
 *
 * Each entry says why it exists and what would retire it. A list with no
 * retirement condition is a list that will outlive its reason.
 */

// ─── Migration residue ───────────────────────────────────────────────────────
//
// The style reference was a flat `styles/` folder plus hand-written type pages
// at the schema root. It is now one tree. These three lists exist only to carry
// the old pages' content across, and all of them die with issue #856, which
// folds that content into the schema.

/**
 * A captured page's slug, mapped to the generated page that superseded it.
 *
 * `corners` has no page of its own because `Corners` is reached by exactly one
 * path, so its home is that path's page.
 *
 * Retires with #856.
 */
export const TYPE_PAGE_HOME = {
  'color-object': ['ColorObject'],
  'gradient-value': ['GradientValue'],
  sides: ['Sides'],
  typography: ['typography'],
  effects: ['effects'],
  corners: ['cornerRadius'],
};

/**
 * Links inside captured content point at pages that no longer exist. Rewriting
 * them at render keeps the capture file verbatim — it is the archive of what
 * those pages said, and editing it to track a move would make it a worse
 * record.
 *
 * Retires with #856.
 */
export const REHOMED = {
  'color-object': '/schema/styles/color-object/',
  'gradient-value': '/schema/styles/gradient-value/',
  sides: '/schema/styles/sides/',
  typography: '/schema/styles/typography/',
  effects: '/schema/styles/effects/',
  corners: '/schema/styles/corner-radius/',
};

/**
 * Folders the tree superseded, deleted on every run so a renamed page cannot
 * linger. `types/` was the flat catch-all; `typography/` and `effects/` were
 * sibling folders holding the member pages the tree now emits under the path
 * that reaches them.
 *
 * Retires with #856, or sooner — none of the three has existed for weeks.
 */
export const STALE_CONTENT_FOLDERS = ['types', 'typography', 'effects'];

// The editorial lists the schema tests hold — which keys carry no example, and
// which members declare no default — are in
// `packages/schema/tests/styles-exclusions.ts`, beside the tests that read
// them. A schema test importing from the site would invert the dependency.
