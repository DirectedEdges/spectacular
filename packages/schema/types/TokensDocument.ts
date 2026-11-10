/**
 * What each token in a foundation is for, authored as
 * `foundations/<concern>/tokens.yaml` (ADR-118).
 *
 * A reference table, not a rulebook. `useWhen` says what each token is for;
 * `dontUseWhen` says which are off-limits, why, and what replaces them. Neither
 * binds a reader the way a guideline does — a subject describes a thing, and
 * that is a different kind of statement from a rule.
 *
 * It is its own document because the two kinds were conflated while they shared
 * one. A foundation's `guidelines.yaml` is about how tokens, themes and raw
 * values are applied across the catalogue; thirty tokens with a sentence each is
 * reference material that was drowning those rules.
 *
 * A token is identified by the path the rest of the system spells it with —
 * `<collection>/<group>/<name>`, spaces and capitals included, exactly as
 * `analysis/foundations.yaml` and every spec's `$token` carry it. A DSDS-legal
 * identifier is derived at export (DSPEC-60), never authored here.
 *
 * This file is self-contained, declaring its own header and reference types
 * rather than sharing them with its sibling documents.
 */

/** Where a tokens document sits in its review cycle. @since 0.40.0 */
export type TokensStatus =
  /** Drafted and awaiting a ratifier; its descriptions are not yet the system's position. */
  | 'proposed'
  /** Reviewed and adopted; its descriptions are the system's position. */
  | 'ratified'
  /** Superseded or withdrawn; kept for the record and not to be followed. */
  | 'deprecated';

/**
 * The header a tokens document opens with. Every member is optional.
 * @since 0.40.0
 */
export type TokensMeta = {
  /** The foundation this document covers, restating what the containing directory names. */
  concern?: string;
  /** Where the document sits in its review cycle. */
  status?: TokensStatus;
  /** Who authored it. Duplicates git history, and is here for a reader who will not consult git. */
  author?: string;
  /** When it was last revised, as `YYYY-MM-DD`. Hand-maintained, so it can go stale. */
  updated?: string;
  /** The generated reports this document was synthesized from, as workspace-relative paths. */
  sources?: string[];
};

/** What a `TokenRef` says its target is to the token carrying it. @since 0.40.0 */
export type TokenRefRelationship =
  /** The target describes the same token at another scope, and the duplication is deliberate. */
  | 'same-as'
  /** The target is an issue or document bearing on this token, without describing it. */
  | 'relates-to'
  /** The target is the code or package this token comes from. */
  | 'source'
  /** The target is the design file or collection this token comes from. */
  | 'design'
  /** The target is a running example of this token in use. */
  | 'demo';

/**
 * A reference to one thing, either inside this workspace or outside it. Exactly
 * one of `to` or `href` is present; the schema rejects both and neither.
 * @since 0.40.0
 */
export type TokenPointer = {
  /** What this points at inside the workspace — normally another token's path. Resolution is DSPEC-57. */
  to?: string;
  /** What this points at outside the workspace, as an absolute URL. */
  href?: string;
};

/**
 * A pointer that states its relationship explicitly, for the relationships that
 * have no field of their own.
 * @since 0.40.0
 */
export type TokenRef = TokenPointer & {
  /** What the target is to the token carrying this ref. */
  rel: TokenRefRelationship;
};

/**
 * One token, and what it is for.
 * @since 0.40.0
 */
export type TokenSubject = {
  /** The token, as a `<collection>/<group>/<name>` path spelled as the library spells it. */
  $token: string;
  /** What it is for, or why it is off-limits. */
  $description: string;
  /**
   * What to reach for instead of this one. Meaningful under `dontUseWhen`, where
   * its absence says something true: nothing replaces this token.
   */
  alternatives?: TokenPointer[];
  /** Related references, including `same-as` when this restates a token at another scope. */
  refs?: TokenRef[];
};

/**
 * A `tokens.yaml` document: a header, and the two tables.
 *
 * Neither table is required, and a document carrying only a header is valid.
 * @since 0.40.0
 */
export type TokensDocument = {
  /** Authorship and review status for the document as a whole. */
  meta?: TokensMeta;
  /** What each token is for. */
  useWhen?: TokenSubject[];
  /** Which tokens are off-limits, why, and what replaces them. */
  dontUseWhen?: TokenSubject[];
};
