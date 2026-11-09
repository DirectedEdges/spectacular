/**
 * Copy that is byte-identical across generators today.
 *
 * Deliberately narrow. Prose should be free to diverge — forcing two
 * generators to share a sentence is how one ends up saying something subtly
 * wrong about its own subject — so this holds only strings that were already
 * the same in every copy, and nothing that reads as a claim about one tree.
 */

/** The field labels on a per-platform binding subsection. */
export const BINDING_LABELS = {
  disposition: '**Disposition**: ',
  realisedBy: ' · **Realised by**: ',
  rules: '**Rules**: ',
  /** Introduces the other units a rule resolves together with. */
  withSiblings: ' — with ',
  /** Stands in for a field a binding leaves unstated. */
  absent: '—',
};

/** Said rather than left blank, so an empty section is a fact and not a failure. */
export const DECISIONS_NONE = 'None.\n';
