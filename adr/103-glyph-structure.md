# ADR: Structural glyph membership — `glyphs.structure` convention

**Branch**: `103-glyph-structure`
**Created**: 2026-10-08
**Status**: ACCEPTED
**Summary**: A `glyphs.structure` form identifies glyph components by child structure and fill, joining `match` with naming from the component name.
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — extends the `glyphs` block introduced with `glyphNamePattern`'s migration to `conventions`)*

---

## Context

The `glyphs` block in `PlatformConventions` (`types/Conventions.ts`) holds a single required `match` string — a name pattern with an `{i}` placeholder. That one string does two jobs (issue DirectedEdges/specs#579):

- **Membership** — is this component a glyph? (the pattern matches)
- **Naming** — what is the glyph called? (the `{i}` capture)

Libraries whose glyph components are plainly named — `Image`, `Cross`, `Chevron down` — cannot be expressed: any pattern loose enough to match them matches every component in the file. Because membership and naming are fused, a library with no name signal loses both, and the `fetch` icons kind becomes unusable with it.

Those same libraries do carry a strong *structural* signal. Their glyph components are shallow, consistent, and near-unique in shape:

| Library | Structure | Glyph name |
|---|---|---|
| Carbon | component → single `VECTOR` named `Vector` | component name |
| IBM UI Kit | component → single `VECTOR` named `Vector` | component name |
| GitHub Primer | component → single `VECTOR` named `Icon` | component name |
| Atlassian | component → single `VECTOR` named `Vector` | `{i}Icon` capture of component name |
| DS (ignoring its name convention) | component → `BOOLEAN_OPERATION` → `VECTOR`s named `Glyph - …` | component name |

A further discriminant: glyph assets in a library are typically stored with one shared fill — the same raw color or the same token — across the whole set. Declaring that expected fill sharply reduces false positives from non-glyph vector-only components (logos, dividers, illustrations).

This ADR adds a second, structural membership form to the `glyphs` block, splitting membership from naming. It is the config-surface prerequisite that #579 names; the detect/propose/curate mechanism (scored detectors, glyph manifest, reconcile) is out of scope here and stays with #579.

---

## Decision Drivers

- **Membership and naming must be separable** — a library can have a membership signal (structure) with no naming pattern beyond the component name itself (#579 root cause).
- **Declared fact, not heuristic** — `conventions` entries are deterministic library facts; the same declaration must evaluate identically in REST and plugin runtimes. Scored/fuzzy detection does not belong in this block.
- **No logic in this package** (Constitution II) — the ADR defines shape and semantics; evaluation lives downstream.
- **Type ↔ schema parity** (Constitution I) — `types/Conventions.ts` and `schema/conventions.schema.json` change together.
- **Minimal property surface** (Constitution III) — prefer one generalized structural primitive over per-library special cases.
- **Naming governance** (Constitution VI, rule 3) — node-type vocabulary: code platforms have no vocabulary for Figma layer types, and deviating from Figma's node-type names (`VECTOR`, `BOOLEAN_OPERATION`) would cost data faithfulness in a block that is explicitly a *Figma* platform convention.
- **Absence is a statement** — an undeclared form means the library has no such convention, consistent with every other `PlatformConventions` block.

---

## Options Considered

### Decision 1 — Where structural membership lives

#### Option A: `structure` key inside the existing `glyphs` block *(Selected)*

```yaml
glyphs:
  match: 'DS Icon Glyph / {i}'   # name form (existing)
  structure:                     # structural form (new)
    ...
```

**Pros**:
- One home for one concept: everything that answers "what is a glyph in this library" stays under `glyphs`.
- Both forms may coexist; membership is the union (a component matching either form is a glyph).
- No new top-level key in `PlatformConventions` — minimal surface.

**Cons / Trade-offs**:
- The block's semantics grow from "naming pattern" to "membership declaration"; documentation must be retitled.

#### Option B: New top-level `glyphDetection` block *(Rejected)*

**Rejected because**: splits one concept across two keys; every consumer must merge two blocks to answer one question. Violates minimal-surface driver.

#### Option C: Generalize `match` into an array of tagged matcher objects *(Rejected)*

**Rejected because**: breaks every existing `figma.yaml` (`match` is a plain string today) for no expressive gain over Option A — a MAJOR cost with an additive alternative available.

---

### Decision 2 — Shape of the structural pattern

#### Option A: Recursive node matcher with set-cover semantics *(Selected)*

A `children` list of node matchers, each with `type` (Figma node type), optional `name` (literal with `*` wildcard), and optional nested `children`. A node satisfies its `children` list when **every actual child matches at least one entry** — the exhaustiveness is the discriminant (a component containing anything besides the declared shapes is not a glyph).

```yaml
# Carbon / IBM UI Kit
structure:
  children:
    - type: VECTOR
      name: 'Vector'

# DS, one level deeper
structure:
  children:
    - type: BOOLEAN_OPERATION
      children:
        - type: VECTOR
          name: 'Glyph - *'
```

**Pros**:
- Expresses all five surveyed libraries with one primitive; depth is unbounded by the shape but shallow in practice.
- Set-cover semantics make "vector-only leaf structure" declarative rather than a hardcoded predicate.
- Mirrors how a designer reads the layers panel.

**Cons / Trade-offs**:
- Richer than a flat string; schema definition is recursive.

#### Option B: Flat path strings (e.g. `'VECTOR:Vector'`, `'BOOLEAN_OPERATION/VECTOR:Glyph - *'`) *(Rejected)*

**Rejected because**: invents a private micro-grammar needing its own escaping and parsing rules; cannot express sibling alternatives cleanly; harder to validate in JSON Schema than a structured object.

#### Option C: Fixed boolean predicates (`vectorOnly: true`, `maxDepth: 2`) *(Rejected)*

**Rejected because**: a catalog of special cases, not a contract — each new library shape needs a new flag. Fails the generalized-primitive driver and cannot state child names at all (Primer's `Icon` vs Carbon's `Vector`).

---

### Decision 3 — Naming rule under structural membership

#### Option A: Optional `structure.name` pattern over the component name, default `'{i}'` *(Selected)*

```yaml
structure:
  name: '{i}Icon'   # Atlassian: "ChevronDownIcon" → "ChevronDown"
  children:
    - type: VECTOR
      name: 'Vector'
```

Absent, the whole component name is the glyph name (`name: '{i}'`) — the common case for Carbon, IBM, Primer, DS.

**Pros**:
- Reuses the established `{i}` grammar — no second naming syntax.
- The default makes the minimal declaration minimal: membership alone suffices for plainly named libraries.

**Cons / Trade-offs**:
- Two naming rules may now be declared (`match`'s capture and `structure.name`); each applies only to components its own form matched, so they cannot conflict on one component. A component matched by both forms takes `match`'s capture (the more specific declaration).

#### Option B: Require `match` to stay as the naming rule for all forms *(Rejected)*

**Rejected because**: re-fuses what this ADR splits — a plainly named library would have to invent a vacuous pattern (`'{i}'`) that matches every component in the file, recreating the #579 failure for membership.

#### Option C: Dedicated sibling `naming` key at the `glyphs` level *(Rejected)*

**Rejected because**: a third key whose value duplicates what `match` and `structure.name` already express; ambiguous precedence against `match`'s capture.

---

### Decision 4 — Fill-color discriminant

#### Option A: Block-level `structure.fill` list applied to leaf vectors *(Selected)*

An optional list of accepted fills. When declared, every leaf node matched by the structure must carry a solid fill that is one of the listed values — a raw color (`'#161616'`) or a token/variable/style name (`'DS Color/Icon/Default'`).

The fill describes how the library **stores** its glyphs, so it is tested only on a component's own structure. A placed instance is recolored by its context — a themed button re-fills the glyph — so when membership is read from an instance mirror, the fill constraint is skipped and structure/name carry the evidence alone.

```yaml
structure:
  fill: ['#161616']
  children:
    - type: VECTOR
      name: 'Vector'
```

**Pros**:
- Matches the observed reality: a library's glyph set shares one raw or token fill; one declaration covers the set.
- Sharply reduces false positives from vector-only non-glyphs (logos, dividers) without adding geometry rules.
- Optional — libraries with mixed fills simply omit it.

**Cons / Trade-offs**:
- String-typed values carry two vocabularies (raw color, token name); the distinction is syntactic (`#` prefix) and documented rather than typed as a union of named forms.

#### Option B: Per-node `fill` on each child matcher *(Rejected)*

**Rejected because**: repeats the same value at every depth for the dominant single-shared-fill case; the per-node precision has no surveyed library needing it.

#### Option C: Boolean `uniformFill` ("all leaves share *some* fill") *(Rejected)*

**Rejected because**: a two-vector logo with a uniform brand fill passes; the discriminating power comes from naming *which* fill, not from uniformity alone.

---

### Decision 5 — Presence requirement within `glyphs`

#### Option A: Both forms optional; the block requires at least one *(Selected)*

`match` becomes optional in the type; the schema enforces `anyOf` (`match` present, or `structure` present). An empty `glyphs: {}` is invalid — a declared block must declare something.

**Pros**:
- Each library declares only the form it has; Carbon never invents a name pattern.
- Existing `figma.yaml` files remain valid unchanged.

**Cons / Trade-offs**:
- `match` moves from required to optional in `PlatformConventions`, `ResolvedPlatformConventions`, and the schema — a field-presence change for readers of the type (see Semver Decision).

#### Option B: Keep `match` required; `structure` only refines it *(Rejected)*

**Rejected because**: same flaw as Decision 3 Option B — structure-only libraries are forced into a vacuous match-everything pattern, which is the exact failure #579 documents.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Conventions.ts` | `PlatformConventions.glyphs.match` becomes optional | MAJOR |
| `Conventions.ts` | Added `PlatformConventions.glyphs.structure?: GlyphStructure` | MINOR |
| `Conventions.ts` | Added exported `GlyphStructure` interface (`name?`, `fill?`, `children`) | MINOR |
| `Conventions.ts` | Added exported `GlyphStructureNode` interface (`type`, `name?`, `children?`) | MINOR |
| `Conventions.ts` | `ResolvedPlatformConventions.glyphs` mirrors the same shape | MAJOR (same `match` presence change) |

**Example — new shape** (`types/Conventions.ts`):
```yaml
# Before
glyphs?:
  match: string            # required

# After
glyphs?:                   # at least one of match / structure (documented; enforced in schema)
  match?: string           # name form — membership + {i} naming capture
  structure?:              # structural form — membership
    name?: string          # {i} naming rule over the component name; default '{i}'
    fill?: string[]        # accepted leaf fills: raw '#RRGGBB' or token/variable/style name
    children:              # node matchers; every actual child must match some entry
      - type: string       # Figma node type, e.g. 'VECTOR', 'BOOLEAN_OPERATION'
        name?: string      # literal with '*' wildcard
        children?: [...]   # recursive
```

Membership semantics (recorded here, evaluated downstream): a component is a glyph when it matches **any** declared form. Under `structure`, the component's children must be covered by the `children` matchers (set-cover, exhaustive), and when `fill` is declared every matched leaf must carry one of the listed fills — on the component's **stored** structure only; an instance mirror is contextually recolored, so fill is not tested there. **A glyph cannot have properties**: a component declaring component properties — variants, text, swaps — is a configurable component, and the structural form never claims it; a component set and its variants are property-bearing by construction. This is a semantic rule, not a schema member — the shape above does not grow for it. The glyph's name comes from the form that matched; a component matched by both takes `match`'s capture.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `conventions.schema.json` | `glyphs.match` removed from `required`; block gains `anyOf` requiring `match` or `structure` | MAJOR |
| `conventions.schema.json` | Added `glyphs.structure` definition (`name`, `fill`, recursive `children` via a `glyphStructureNode` definition) | MINOR |

**Example — new property** (`schema/conventions.schema.json`):
```yaml
# under glyphs.properties
structure:
  type: object
  properties:
    name: { type: string }          # {i} pattern
    fill:
      type: array
      items: { type: string }
    children:
      type: array
      minItems: 1
      items: { $ref: '#/definitions/glyphStructureNode' }
  required: [children]
  additionalProperties: false
# glyphs gains:
anyOf:
  - required: [match]
  - required: [structure]
```

### Notes

- `structure.children` is required within `structure` — a structure declaration with no shape declares nothing.
- `fill` is an array even for the single-value common case, so the DS two-variant case (two vectors, two declared fills) needs no shape change later.
- Node `type` is an open string, not an enum of Figma node types: the schema does not chase Figma's node-type catalog, and an unknown type simply never matches (Constitution VI rule 3 — Figma vocabulary, data-faithful).
- The detect/propose/curate mechanism, glyph manifest, and reconcile semantics of #579 are explicitly out of scope; this ADR only gives them a convention surface to propose *into*.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `PlatformConventions.glyphs.structure` ↔ `conventions.schema.json` `glyphs.properties.structure`; `GlyphStructureNode` ↔ `#/definitions/glyphStructureNode`; the type-level "at least one form" documentation ↔ the schema `anyOf`. `ResolvedPlatformConventions` mirrors `PlatformConventions`, as today.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Glyph membership is currently evaluated from `glyphs.match` alone, at element detection and at instance-swap name resolution | Evaluate the structural form in both REST and plugin runtimes; name-only resolution points need access to the candidate component's child structure |
| `specs-cli` | `scan` partitions components and `fetch` collects icon exports from `glyphs.match`; the icons cache records the pattern for staleness | Partition/collect on either form; key cache staleness on the whole `glyphs` block; update config templates, validation, and migration notes |
| `specs-plugin-2` | Passes conventions through to the engine | Recompile against the updated types |
| `figma-from-specs` (render) | Reads spec metadata conventions optional-chained; consumes glyph identity via the icons manifest, not the pattern | Recompile; verify no `glyphs.match` presence assumption |
| `react-from-specs` / `webcomponents-from-specs` | Read `type: 'glyph'` elements from the spec; never evaluate the convention | None — more libraries now produce glyph elements and icon assets for them to consume |

---

## Semver Decision

**Target version**: `0.35.0` — the version of the active `release/next` branch this ADR merges into.

**Change class**: `MAJOR` — for CHANGELOG placement, not a version bump.

**Justification**: `GlyphStructure`, `GlyphStructureNode`, and `glyphs.structure` are additive optional surface (MINOR-class per constitution versioning). But `glyphs.match` moves from required to optional — a field-presence change, which the constitution classes MAJOR: code that narrows `glyphs` and reads `.match` as `string` no longer compiles. Serialized data is unaffected (every previously valid `figma.yaml` remains valid).

---

## Consequences

- A library with plainly named glyph components (Carbon, IBM UI Kit, Primer, Atlassian community files) can declare glyph detection without renaming anything in Figma — the first acceptance criterion of #579 becomes expressible.
- Membership and naming are now separate declarations; #579's detector/manifest work can propose `structure` blocks instead of being limited to name patterns.
- The declared fill discriminant gives vector-only false positives (logos, dividers) a deterministic exclusion without geometry heuristics.
- A property-bearing component is never structurally claimed as a glyph — a configurable icon button that happens to be vector-only stays a component.
- Consumers reading `glyphs.match` must handle its absence; every read becomes "which forms are declared", not "what is the pattern".
- `glyphs` documentation (settings page, guide) must be retitled from "naming pattern" to "glyph conventions" with both forms.
- The structural form reads child trees at evaluation time; runtimes that resolve membership from a name alone (instance-swap resolution) need structure access, which downstream packages must provide.
