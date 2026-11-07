# ADR: Subcomponent Pattern Matching Rules

**Branch**: `093-curation-settings`
**Created**: 2026-09-28
**Status**: ACCEPTED
**Summary**: Five rules fix how `{C}` and `{S}` match a name, so one `subcomponents` pattern means the same thing in every consumer.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — amends ADR-031)*

---

## Context

ADR-031 introduced `subcomponents.match` and `subcomponents.exclude`, both written as
template patterns using `{C}` and `{S}`. It defined the placeholders in one sentence:
`{C}` is replaced with the component name, `{S}` matches any subcomponent name. Its
resolution rules — match first, exclude wins, otherwise ignore — are unchanged by this
ADR and remain in force.

That sentence left four questions unanswered:

- Can `{S}` cross a `/`?
- When no parent is known, how much of a name does `{C}` cover?
- Are whitespace and `/` matched exactly, or normalised first?
- When several `match` patterns hit one name, which one applies?

Consumers answered them differently, so the same convention selected different
components depending on which one read it. Two observed consequences:

- A workspace declaring one exclusion pattern had it honoured in one consumer and
  ignored in another, producing a manifest and a spec that disagreed about whether the
  same components were parts or components in their own right.
- One consumer normalised `_` segments out of a name before matching, so a pattern
  written without `_` silently also meant the same pattern with `_`. A pattern written
  *with* `_` could then never match anything there.

The rules below make the syntax fully determined. They are normative for every consumer
and describe the contract, not any one implementation.

---

## Decision Drivers

- **One pattern, one meaning** — a convention that selects different components in
  different consumers is not a shared contract.
- **A pattern means what it says** — no silent broadening of an authored pattern.
- **Authorable without special syntax knowledge** — ADR-031's ergonomics driver still
  applies; these rules must be explainable in a sentence each.
- **No change to ADR-031's resolution rules** — match first, exclude wins.
- **Additive to the contract** — no type or schema surface changes.

---

## Options Considered

### Decision 1 — Can `{S}` cross a `/`?

#### Option A: `{S}` matches everything after it, including `/` *(Selected)*

`{C} / {S}` matches `DS Card / _ / Header`, with `{S}` = `_ / Header`.

**Pros**:
- A name nests to arbitrary depth; the tail of a name is one idea however many
  segments it spans.
- Keeps ADR-031's existing patterns working as authored — `{C} / {S}` continues to
  reach nested assets.

**Cons / Trade-offs**:
- `{C} / {S}` is close to a catch-all for anything with two or more segments. That is
  the pattern's meaning as written; a workspace that wants less lists the exceptions in
  `exclude`.

---

#### Option B: `{S}` matches one segment *(Rejected)*

**Rejected because**: every depth would need its own pattern, so a library nesting parts
two levels deep would carry a pattern per level. It also silently stops matching names
that ADR-031's own examples assume are matched.

---

### Decision 2 — With no parent known, how much does `{C}` cover?

#### Option A: Exactly one segment *(Selected)*

`{C} / Examples / {S}` does not match `DS Slider /_ / Examples / Steps` — `{C}` cannot
stretch across the `/` to cover `DS Slider /_`.

**Pros**:
- A pattern without `_` stops silently also meaning the pattern with `_`. Whatever the
  author wrote is what is matched.
- Makes the `_` handling in Decision 4 the only way a hidden folder is skipped, rather
  than one of two.

**Cons / Trade-offs**:
- A library whose component names themselves contain `/` cannot be addressed by a
  bare `{C}` in an exclusion. Those names are addressed where the parent is known —
  Decision 3 — or by writing the segments out.

---

#### Option B: `{C}` matches everything before the rest of the pattern *(Rejected)*

**Rejected because**: `{C}` absorbing `/` is what made `{C} / Examples / {S}` also mean
`{C} / _ / Examples / {S}`. The broadening is invisible in the pattern and cannot be
turned off.

---

### Decision 3 — With the parent known, what is `{C}`?

#### Option A: The parent's name exactly, slashes included *(Selected)*

Asking whether `DS Asset / Mark / Flag / Icon` belongs to `DS Asset / Mark / Flag`,
`{C}` is the whole three-segment name.

**Pros**:
- `{C}` is not a placeholder in this position — it is a known string being substituted,
  so there is nothing to bound.
- A component whose own name has slashes can have parts.

**Cons / Trade-offs**:
- `{C}` behaves differently in the two positions. Decision 2 bounds a blank; this
  substitutes a value. Stated plainly so it reads as one rule with two cases.

---

#### Option B: Bound to one segment here too *(Rejected)*

**Rejected because**: it would make a component whose name contains `/` incapable of
having parts, which the libraries in use today would break on immediately.

---

### Decision 4 — Are whitespace and `/` normalised before matching?

#### Option A: Every character outside `{C}` and `{S}` matches exactly *(Selected)*

`{C} / _ / {S}` matches `DS Card / _ / Header` but not `DS Button /_ / End Visual`.
A library using both spacings declares a pattern for each.

**Pros**:
- The pattern is the specification. Nothing is added to it or removed from it.
- Removes the class of bug where two consumers normalise differently and disagree.

**Cons / Trade-offs**:
- A library inconsistent about spacing around a separator needs a pattern per spelling,
  or the names fixed. Making the tool absorb the inconsistency is what produced the
  divergence in the first place.

---

#### Option B: Canonicalise spacing around `/` *(Rejected)*

**Rejected because**: it makes `{C} /_ / {S}` and `{C} / _ / {S}` the same pattern, so a
workspace loses the ability to distinguish two spellings its library actually uses. It
also has to be implemented identically everywhere to be worth anything.

---

#### Option C: Drop `_` segments from the name before matching *(Rejected)*

**Rejected because**: this is the specific behaviour that made a pattern mean more than
it says. It also renders any pattern containing `_` unmatchable, so the two spellings
cannot coexist.

---

### Decision 5 — Which pattern applies when several `match`?

#### Option A: The first one listed wins, and it names the part *(Selected)*

With `match` ordered `{C} / {S}` then `{C} / _ / {S}`, `DS Card / _ / Header` gives a
part named `_ / Header`. Reversing the order gives `Header`.

**Pros**:
- The author controls the outcome by ordering the list — no hidden ranking.
- A list is already ordered; using that order needs no new concept.

**Cons / Trade-offs**:
- Order matters, and a reader must know it does. With Decision 1 making overlap common,
  most workspaces will want their most specific patterns listed first.

---

#### Option B: The most specific pattern wins *(Rejected)*

**Rejected because**: "most specific" needs its own definition — longest literal run,
fewest placeholders, most segments — and each gives a different answer on some pattern
pair. An implicit ranking that is hard to predict is worse than an explicit order the
author sets.

---

## Decision

### Type changes (`types/`)

*(none)*

### Schema changes (`schema/`)

*(none)*

### Notes

This ADR fixes the meaning of a convention already in the contract. `subcomponents`,
`match` and `exclude` keep their current types and schema definitions; only what a
pattern matches is decided here.

The five rules, as they should be read together:

1. `{S}` matches everything after it, including `/`.
2. When no parent is known, `{C}` fills exactly one segment.
3. When the parent is known, `{C}` is that name exactly, slashes included.
4. Every character outside `{C}` and `{S}` matches exactly — spaces and slashes included.
5. When more than one `match` pattern hits, the first one listed wins, and it names the part.

Rules 1 and 2 are asymmetric on purpose: `{S}` is the tail of a name and may nest to any
depth, while `{C}` stands in for one component's name at one level. Rule 3 is not an
exception to rule 2 — a known parent is a literal string, not a placeholder to bound.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — neither artifact changes.
- **Parity check**: Not applicable. `Conventions.subcomponents` and its schema
  definition are unchanged.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Pattern matching changes where it normalised names before comparing | Match per the five rules; no recompile needed for types |
| `specs-from-figma` | Already matches characters exactly; `{C}` bounding and first-match naming need confirming | Confirm against the five rules |
| `specs-plugin-2` | Reads the same conventions through the processing engine | None beyond the engine's own change |

A workspace whose library uses more than one spelling of a separator declares a pattern
per spelling. That is a configuration change, not a migration: no authored pattern
changes meaning except by becoming narrower, and the narrowing is what was asked for.

---

## Semver Decision

**Target version**: `0.35.0` — the version of `@directededges/specs-schema` on the
active `release/next` branch.

**Change class**: `PATCH` — for CHANGELOG placement, not a version bump.

**Justification**: No type, schema, or default changes in this package. The ADR records
the meaning of an existing convention. Constitution: "`PATCH` for documentation,
comments, or formatting."

---

## Consequences

- One `subcomponents` pattern selects the same components in every consumer.
- A pattern is never broader than what was written, so an authored exclusion cannot be
  silently widened.
- A library inconsistent about separator spacing must say so in config, or fix the
  names. The inconsistency is now visible rather than absorbed.
- Pattern order in `match` is meaningful, and a workspace relying on the old order may
  get a differently-named part until it reorders.
- ADR-031's resolution rules are untouched: an asset must match before an exclusion can
  apply, and an exclusion always wins.
