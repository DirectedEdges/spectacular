# ADR: `PrimitiveEntry.match` — Promoting a Layer by Its Name, Short-Circuiting Style Scoring

**Branch**: `100-primitive-layer-name-match`
**Created**: 2026-10-05
**Status**: ACCEPTED
**Summary**: A `match` member names the layer-name prefixes selecting a promotion entry, taking precedence over `elementType` scoring.
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — amends ADR-075's selection rule)*

---

## Context

`Conventions.primitives` (ADR-074, ADR-075) is the promotion table: a component-keyed map
of `PrimitiveEntry`, each naming the `elementType` it promotes *from* and a `map` of rules
turning what the captured layer carries into that component's props.

Selection between entries sharing an `elementType` is **by score** — the entry with the
most rules resolving against the element wins, and at least one rule must resolve so
`elementType` alone never promotes:

```yaml
# config/conventions/figma.primitives.yaml — today
Heading:
  elementType: text
  map:
    - source: typography
      values: { 'Type/Heading/Large': { size: L } }
Body:
  elementType: text
  map:
    - source: typography
      values: { 'Type/Body': { size: M } }
```

Scoring works when entries are **distinguishable by styling**, because that is the only
evidence it reads. A layout family breaks that premise. `Section`, `Block` and `Container`
are three distinct components whose container styling is the same closed vocabulary —
`layoutMode`, `itemSpacing`, `padding`, `mainAxisAlignment` — drawn from the same scale.
Their rule sets are near-identical, so every one of them scores identically against any
given frame, and which component a frame promotes to is decided by a tie the table cannot
break. The design system's own distinction between them is carried by the layer name, and
nothing in the contract can read it.

The entries are correct; the evidence available to selection is incomplete. A table author
has no way to state "a frame named `Section 1` is a `Section`", even though that is exactly
what the library's authoring discipline guarantees.

Two adjacent facts shape the shape of the fix:

- Every other "which assets are these" convention in `PlatformConventions` already reads
  layer names — `glyphs.match`, `codeOnlyProps.match`, `subcomponents.match`,
  `instanceExamples.match`, `slots.default.match`. Name-based identification is the
  established mechanism in this contract, not a new idea.
- `primitives` deliberately sits beside `platforms` rather than inside it (ADR-075): a
  component's props are the same whichever platform renders it. The file is nonetheless
  `figma.primitives.yaml`, qualified because what its `source` and `values` keys *read* is
  Figma (ADR-073 Decision 5).

**Out of scope**: whether the honoured `source` set should widen (ADR-090 owns that), and
duplicate layer-name disambiguation (ADR-044 owns that). This ADR adds one new input to
entry **selection** and does not change what a resolved rule writes.

---

## Decision Drivers

- **Additive only** — existing `figma.primitives.yaml` files declare no name match, and
  their selection behaviour must be byte-for-byte unchanged. MINOR-class per constitution III.
- **Type ↔ schema symmetry** — one new member, declared in both artifacts (constitution I).
- **No logic in this package** — the contract states the matching rule in prose; no matcher,
  normaliser or comparator is exported (constitution II).
- **Deterministic across consumers** — every consumer reading the same workspace must select
  the same component. A mismatched promotion emits a component the design system does not
  have (`Conventions` doc comment), so any rule whose outcome depends on map iteration order
  or on a host's string collation is a defect, not a nuance.
- **Closed, authorable value space** — a table author must be able to read a value and know
  what it matches, with no pattern language to learn and no way to express something the
  contract cannot validate.
- **Vocabulary reuse** — a convention that identifies assets by name should be spelled the
  way the other five are, so a reader recognises it rather than learning a second word.

---

## Options Considered

### Decision 1 — Where a name match is declared

#### Option 1A: A `match` member on `PrimitiveEntry` *(Selected)*

A sibling of `elementType` and `map`, holding the names that select this entry.

```yaml
Section:
  elementType: container
  match: ['DS Section', 'Section']
  map:
    - source: layoutMode
      values: { VERTICAL: { direction: column } }
```

**Pros**:
- Selection evidence lives on the thing being selected. One entry states everything about
  one component: what shape it promotes from, what names identify it, what its props are.
- Optional member on an existing interface — additive, MINOR-class.
- Keeps the table's one-component-one-entry structure intact; nothing about a component is
  declared in a second place.

**Cons / Trade-offs**:
- A layer name is a Figma-side fact sitting on a platform-neutral entry. Mitigated by what
  the file already is: `figma.primitives.yaml` is qualified precisely because its keys read
  Figma, and `match` reads Figma exactly as `source: typography` does.

---

#### Option 1B: A rule in `map` with `source: name` *(Rejected)*

Express the match as another `PrimitiveRule`, reading the layer's name as a source.

**Rejected because**: a `map` rule maps a source **to props** — its `oneOf` requires `prop`
or `values`, and a name match writes neither. It also inverts the precedence this ADR
decides: `map` rules are counted by the scorer, so a name match expressed as a rule becomes
one more point of score instead of the thing that overrides scoring. Two different jobs
cannot share one shape without one of them lying.

---

#### Option 1C: A name table under `platforms.figma` *(Rejected)*

A `primitiveNames` map under the Figma platform entry, keyed by component name.

**Rejected because**: it splits one component's promotion across two files — the names in
`figma.yaml`, the rules in `figma.primitives.yaml` — so neither file can be read on its own
and the two can drift. The platform-neutrality it protects is already handled: `primitives`
sits outside `platforms` because a component's **props** are platform-neutral, which this
does not change.

---

### Decision 2 — What a declared name means

#### Option 2A: Prefix match, as an array of literal strings *(Selected)*

A name matches when the layer's name **starts with** one of the strings. The member is an
array, so a library mid-rename can name both of its conventions.

```yaml
match: ['DS Section', 'Section']
# matches 'Section', 'Section 1', 'Section — Hero', 'DS Section/Footer'
# does not match 'Hero Section'
```

Comparison is exact and case-sensitive, on the layer's name as captured — no trimming, no
case folding, no normalisation. Matching is the only semantics; nothing is extracted from
the name.

**Pros**:
- Fits how the instances are actually named. Composed example content holds many frames of
  one kind, and they are distinguished by suffix (`Section 1`, `Section 2`) because a
  composition should not repeat a layer name.
- Closed and readable: a table author sees a string and knows exactly what it matches.
- Case-sensitivity and no-normalisation keep the rule host-independent — satisfies the
  determinism driver, where locale-aware folding would not.

**Cons / Trade-offs**:
- A shorter prefix can shadow a longer one (`Section` also matches `Section Header`).
  Decision 4 resolves that, and the array form makes the overlap visible in one place.
- Cannot express a match anchored anywhere but the start. Accepted: names in these
  libraries lead with the component's identity.

---

#### Option 2B: Exact full-name equality *(Rejected)*

A name matches when it equals the layer name.

**Rejected because**: it only ever matches one layer per composition. The names that need
matching are `Section 1`, `Section 2`, `Section 3` — a composition deliberately avoids
duplicate layer names — so an exact rule would require a table row per instance, which is
authoring the content rather than the convention.

---

#### Option 2C: Regular expressions *(Rejected)*

`match` entries are regexes.

**Rejected because**: it opens an unbounded value space the schema cannot validate and the
contract cannot pin down. Flavour, flag and anchoring differences across consumers make the
same table select different components in the CLI and the plugin — a direct hit on the
determinism driver — and it hands table authors a language to debug.

---

#### Option 2D: The `{C}`/`{S}` placeholder grammar used by `subcomponents.match` *(Rejected)*

Reuse the established pattern syntax, e.g. `match: ['Section {n}']`.

**Rejected because**: that grammar exists to **extract** a name from a pattern — `{C}` says
where the component name sits so it can be read out. Here nothing is extracted; the entry
already knows which component it is, and the suffix is arbitrary noise. Borrowing the
syntax for a match-only job would imply a capture that does not happen.

---

### Decision 3 — Precedence against style scoring

#### Option 3A: A resolved name match short-circuits scoring *(Selected)*

When an entry's `match` resolves, that entry is selected immediately. No score is computed,
and no other entry is considered. Scoring is unchanged and still governs every entry that
declares no `match`, and every element no `match` resolves against.

**Pros**:
- It is the stronger evidence. A name match is the library's own declaration of what a layer
  is; a score is an inference from styling that happens to overlap.
- Makes the layout-family case actually work: `Section` and `Block` scoring identically
  stops mattering the moment either one is named.
- No interaction between the two mechanisms to reason about — a selection is decided by one
  or the other, never by a blend.

**Cons / Trade-offs**:
- A too-broad prefix now wins outright instead of being outvoted by styling evidence. The
  error becomes louder, which is preferable to a silent near-tie, but it is a real sharp edge.

---

#### Option 3B: Name match as a tiebreak only *(Rejected)*

Score first; use a name match to break a tie.

**Rejected because**: the premise of the problem is that the scores are **equal and
correct**. A tiebreak leaves the better-scoring entry winning whenever styling differs at
all — so a frame named `Section` promotes to `Block` because `Block` happens to map one more
container source. The authored name loses to an incidental rule count.

---

#### Option 3C: Name match adds weight to the score *(Rejected)*

A resolved `match` contributes *n* points.

**Rejected because**: it makes correctness depend on a tuned constant nobody can read off
the table, and the contract would have to publish that constant to stay deterministic. It
also re-introduces exactly the blend Option 3A avoids.

---

### Decision 4 — Resolving two entries whose names both match

#### Option 4A: Longest matching prefix wins *(Selected)*

Among the entries whose `match` resolves, the one whose matching string is longest is
selected. `Section Header` beats `Section` for a layer named `Section Header 2`.

**Equal-length matches can only be the same string.** Both matching strings are prefixes
of one layer name, so two of equal length are character-for-character identical — there is
no case where two entries match equally well by declaring *different* names. A tie
therefore means two entries declared the same string, which is an authoring error in the
table: one component's name is being claimed by two entries, and no rule can know which
was meant. The table is wrong, and the fix is to edit it.

Selection still has to do something, so: **the first entry in authored order wins, with a
warning naming both components and the duplicated string.** This is the one place the
contract reads authored order, which is what Option 4B is rejected for below — accepted
here because the input is already a defect being reported. A re-serialisation that reorders
the keys can change which of the two is selected, and both selections are equally wrong;
the warning is the output that matters.

**Pros**:
- Deterministic without depending on map ordering. `primitives` is a keyed object; key order
  survives YAML and JSON round-trips only by convention, and a contract that reads it is one
  re-serialisation away from selecting a different component.
- The specific beats the general — the same rule the contract already applies when a
  per-component annotation meets a library-wide convention (`SpecsConventions` doc comment).
- Needs nothing from the author: the overlap resolves the way a reader expects on sight.

**Cons / Trade-offs**:
- Not literally "first match wins". The intent — a name match is decided on names alone and
  never falls back to scoring — is preserved; what changes is that the winner is chosen by
  specificity rather than by position.

---

#### Option 4B: First match in authored order wins *(Rejected)*

Iterate the table in authored order; the first entry whose `match` resolves is selected.

**Rejected because**: `primitives` is an object keyed by component name, and authored order
is not a property the contract can promise. Any consumer that parses, merges or re-emits the
conventions file may reorder the keys, and the same table would then promote the same frame
to a different component — a determinism failure the author cannot see in their file. It is
also the more fragile reading in practice: adding a new entry silently changes which of the
existing ones wins.

---

#### Option 4C: Overlap is a validation error *(Rejected)*

Refuse a table where two entries' `match` values can both resolve.

**Rejected because**: overlap is not a mistake here. `Section` and `Section Header` is a
legitimate pair, and so is a library mid-rename declaring both `DS Section` and `Section`.
Deciding overlap statically would also require comparing prefixes for subsumption, which is
validation logic this package cannot carry (constitution II).

---

### Decision 5 — Whether `elementType` still gates a name match

#### Option 5A: `elementType` must match first *(Selected)*

Name matching is evaluated only among entries whose `elementType` equals the captured
element's type. A `text` layer named `Section` does not promote to a `container` entry.

**Pros**:
- `elementType` is required and states the layer shape a promotion starts from. Promoting
  across shapes would emit a component fed by an element it cannot be built from.
- Keeps `match` a narrowing device within a kind, which is where the indistinguishability
  problem lives.

**Cons / Trade-offs**:
- A library that names a layer for its component but draws it as another shape is not served.
  That is an authoring mistake, and the table correctly declines to encode it.

---

#### Option 5B: A name match overrides `elementType` *(Rejected)*

A resolved name selects the entry whatever the element is.

**Rejected because**: it lets one authored name defeat the only structural fact in the entry,
and `elementType` would stop being a contract — its value would hold for scored selection and
not for named selection. Every consumer would need two models of the same required field.

---

### Decision 6 — Whether a name-matched entry must still resolve a rule

#### Option 6A: A name match promotes on its own *(Selected)*

With `match` resolved, the entry is selected whether or not any rule in `map` resolves. Rules
that do resolve still write their props; styling nothing mapped goes to the platform's
`stylesProp` as it already does. `map` stays required and may be an empty array.

**Pros**:
- Follows from Decision 3: if scoring is short-circuited, a minimum score cannot still be a
  gate. "At least one rule must resolve" is a rule *about scoring* — it exists so
  `elementType` alone never promotes, and a declared name is not `elementType` alone.
- Serves the real case directly: a `Container` whose every prop is a default needs a name and
  no rules at all.
- `map` stays required, so no consumer has to newly handle its absence — an empty array
  already validates today.

**Cons / Trade-offs**:
- An entry can promote while contributing no props. Intended: the component is correct, and
  its styling still reaches output through `stylesProp`.

---

#### Option 6B: A rule must still resolve *(Rejected)*

Keep the at-least-one-rule gate for named entries.

**Rejected because**: it reinstates scoring as a veto one line after Decision 3 removes it as
a selector, and it fails the `Container`-with-no-mapped-props case for a reason the author
cannot act on — they would have to invent a rule to satisfy a gate rather than to express a
prop.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Conventions.ts` | Added optional field `match?: string[]` to `PrimitiveEntry` | MINOR |
| `Conventions.ts` | Doc comment on `PrimitiveEntry` restated: selection is by name where `match` resolves, by score otherwise | PATCH |

`PrimitiveEntry` is reused verbatim by `ResolvedConventions.primitives`, so the resolved
contract gains the member with no second declaration. `MetadataConventions` records only
`platforms` and is untouched.

**Example — new shape** (`types/Conventions.ts`):
```yaml
# Before
PrimitiveEntry:
  elementType: PrimitiveKind
  map: PrimitiveRule[]

# After
PrimitiveEntry:
  elementType: PrimitiveKind
  match?: string[]          # optional — MINOR; layer-name prefixes selecting this entry
  map: PrimitiveRule[]
```

**Example — authored table** (`config/conventions/figma.primitives.yaml`):
```yaml
Section:
  elementType: container
  match: ['DS Section', 'Section']
  map:
    - source: layoutMode
      values: { VERTICAL: { direction: column } }

Block:
  elementType: container
  match: ['Block']
  map: []                    # named, and every prop is a default

Body:
  elementType: text          # no match — selected by score, exactly as today
  map:
    - source: typography
      values: { 'Type/Body': { size: M } }
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `conventions.schema.json` | Added property `match` to `#/definitions/PrimitiveEntry` — `array` of `string`, `minItems: 1`, not in `required[]` | MINOR |
| `conventions.schema.json` | `#/definitions/PrimitiveEntry` description restated with the selection rule | PATCH |

**Example — new shape** (`schema/conventions.schema.json`):
```yaml
# New property under #/definitions/PrimitiveEntry/properties
match:
  type: array
  minItems: 1
  items:
    type: string
  description: >-
    Layer-name prefixes selecting this entry. A name matches when the captured layer's
    name starts with one of these strings — exact, case-sensitive, no normalisation.
    A resolved match selects the entry immediately, within the entries whose elementType
    matches: no score is computed and no rule need resolve. Where several entries match,
    the longest matching prefix wins; two entries declaring the same string is an
    authoring error in the table, reported as a warning naming both, with the first in
    authored order selected. Absence means this entry is selected by score.
```

`minItems: 1` because an empty array declares nothing and is only ever a mistake —
the member's absence is how an entry says it has no names.

### Notes

- **Optional, not required**: an entry distinguishable by styling needs no names, and every
  existing table has none. Requiring `match` would be a MAJOR change that invalidates every
  workspace's file to no benefit.
- **Naming**: `match` is the member name the other five name-reading conventions already use
  (`glyphs.match`, `codeOnlyProps.match`, `subcomponents.match`, `instanceExamples.match`,
  `slots.default.match`). Constitution VI rule 3 applies — layer naming is a Figma-side fact
  with no code-platform opinion, and the governing consideration is internal consistency
  with the five established spellings. `names` was rejected on that basis alone.
- **Array, not string**: every established `match` that identifies a set of assets is already
  an array (`subcomponents.match`, `instanceExamples.match`, `slots.default.match`); only the
  two that name exactly one asset (`glyphs.match`, `codeOnlyProps.match`) are scalars. This
  identifies a set.
- **A duplicated string is an authoring error, not a selection rule.** Two entries can only
  match a layer equally well by declaring the identical string, since both matches are
  prefixes of one name. The contract reports it and picks the first in authored order so a
  run continues; it does not pretend either pick is correct (Decision 4).
- **No matcher is exported.** The prefix rule, case-sensitivity, longest-wins, the
  duplicate warning and the short-circuit are stated in the doc comment and the schema
  description. Implementation lives in whoever performs promotion (constitution II).

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**: `PrimitiveEntry.match?: string[]` in `types/Conventions.ts` ↔
  `#/definitions/PrimitiveEntry/properties/match` in `schema/conventions.schema.json`
  (`array` of `string`, absent from `required[]`). `additionalProperties: false` on that
  definition means the schema would reject the member until added, so the two must land
  together. No other definition changes; `ResolvedConventions.primitives` and the
  `conventions.schema.json` reference to `PrimitiveEntry` both pick the member up by reuse.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Promotion selection gains a new input — a resolved `match` selects an entry before any score is computed | Read `match`, apply prefix/longest-wins/short-circuit selection ahead of scoring; warn on an exact duplicate across entries |
| `specs-cli` | Recompile against the new types; the conventions file it loads and validates may now carry `match` | Recompile; ensure `figma.primitives.yaml` loading and validation pass the member through unchanged |
| `specs-plugin-2` | Recompile; promotion runs during capture, so the plugin selects entries by the same rule | Recompile; apply the same selection order as the CLI — divergence here promotes to different components from the same table |
| Docs site (`specs/site`) | The promotion-table page documents selection as score-only | Document `match`, the short-circuit, and longest-prefix-wins on the promotion table page |

---

## Semver Decision

**Target version**: `0.35.0` — the version of `packages/schema/package.json` on the branch
this ADR merges into.

**Change class**: `MINOR` — for CHANGELOG placement, not a version bump.

**Justification**: the only contract change is one additive optional field on an existing
interface, with its schema counterpart — MINOR per constitution III and the versioning rule
("`MINOR` for additive types or new optional fields"). No field is removed, renamed or made
required; `map` stays required. Selection behaviour changes only for a table that declares
`match`, which no existing table does, so no published spec or workspace file becomes invalid.

---

## Consequences

- A design system whose layout components share a prop signature — `Section`, `Block`,
  `Container` — can be promoted correctly, by name, where scoring could only tie.
- An entry may promote on its name alone, with an empty `map`, and still reach output
  complete: unmapped styling flows to the platform's `stylesProp`.
- Selection now has two modes. A table author reads `match` to know an entry is chosen by
  name, and its absence to know it is chosen by score.
- A prefix that is too broad wins outright rather than being outvoted, so a mis-authored
  `match` mis-promotes every layer under it. The longest-prefix rule contains the common case
  (a narrower sibling entry still wins); nothing contains a prefix with no sibling.
- Every consumer must apply the same selection order. A consumer that scores first and treats
  `match` as a tiebreak produces different components from the same table — the incorrect-output
  failure `Conventions` warns about, not merely different output.
- Authored key order in `primitives` stays insignificant for every well-formed table, so
  merging or re-emitting a conventions file cannot change which component a layer promotes
  to. The single exception is two entries declaring the same `match` string — an authoring
  error the run warns about, where order decides between two answers that are both wrong.
