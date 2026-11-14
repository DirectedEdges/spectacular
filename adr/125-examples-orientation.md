# ADR: Instance-example orientation

**Branch**: `feat/render-instance-examples`
**Created**: 2026-11-14
**Status**: DRAFT
**Summary**: An `InstanceExamples` wrapper pairs the named `items` with their `orientation`, so a render reproduces the authored row or column.
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`Component.instanceExamples` (ADR-048/050) records a component's documented usages, and ADR-124 gave each example its own `styles` box so a captured example renders at its captured size. What the spec still cannot say is how the examples sit **relative to each other** on the canvas: a designer arranges Card usages in a row and Alert usages in a column, and a render of that spec stacks both vertically. The arrangement is itself authored documentation — a row of cards reads as a gallery, a column of alerts reads as a severity ladder — and it is lost on every round trip.

The capture side can detect the arrangement cheaply from the example instances' canvas positions, and the render side can lay the written `Examples` section out to match. What is missing is a place in the contract to carry it — and `InstanceExamples` was a bare `Record<string, InstanceExample>`, which has no room for a fact about the set: its keyspace is open (formatted layer names), so any field folded in beside the items could collide with a legitimately named example.

---

## Decision Drivers

- **The fact belongs to the set** — orientation describes the examples' arrangement, not any one example and not the component; the shape must make that ownership legible.
- **Open keyspace stays open** — example keys are formatted layer names; no set-level field may share their namespace.
- **Type ↔ schema parity** — the shape lands in `types/` and in every schema document that validates the examples concern (constitution I).
- **No logic in this package** — detection and layout live in the transform packages; this package carries only the value (constitution II).
- **Naming governance** — the term and its values follow code-platform vocabulary (constitution VI).
- **Enum declaration** — closed string sets declare `oneOf` branches of `const`, each described (ADR-114), in `SCREAMING_CASE`.

---

## Options Considered

### Shape — where a fact about the example set lives

#### Option A: Wrapper — `InstanceExamples` becomes `{ orientation?, items }` *(Selected)*

The record of examples moves under an `items` key; `orientation` sits beside it as a set-level fact.

**Pros**:
- Ownership is structural: the orientation is visibly *of* the examples, not a stray component field.
- The items record's open keyspace is untouched — a designer naming an example layer "Orientation" cannot collide with the field.
- Every future set-level fact (spacing, grouping) has a home without another restructure.

**Cons / Trade-offs**:
- Breaking: every consumer reading `instanceExamples` as a record migrates to `instanceExamples.items`, and existing Pro specs regenerate.

#### Option B: Flat sibling — `Component.orientation` beside `instanceExamples` *(Rejected)*

An optional top-level `Component` field, additive and spiked end to end first.

**Rejected because**: the connection to the examples is implicit — at the component level, "orientation" reads as ambiguous — and each further set-level fact would add another disconnected top-level field. The restructure only gets more expensive with time; 0.x releases already carry breaking entries, so the cheaper moment is now.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `InstanceExample.ts` | `InstanceExamples` restructured from `Record<string, InstanceExample>` to a wrapper interface with optional `orientation` and required `items` | MAJOR |
| `Component.ts` | None — `instanceExamples?: InstanceExamples` picks up the new shape | — |

**Example — new shape** (`types/InstanceExample.ts`):
```yaml
# Before
InstanceExamples: Record<string, InstanceExample>

# After
InstanceExamples:
  orientation?: 'HORIZONTAL' | 'VERTICAL'   # absent means VERTICAL
  items: Record<string, InstanceExample>     # the former record, unchanged inside
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | `#/definitions/InstanceExamples` restructured: `properties.orientation` (`oneOf` const branches per ADR-114) + required `properties.items` carrying the former pattern-keyed record | MAJOR |
| `component-concern.schema.json` | None — the examples concern `$ref`s `InstanceExamples` and picks up the new shape | — |

**Example — what a spec carries** (examples concern):
```yaml
instanceExamples:
  orientation: HORIZONTAL
  items:
    cardOffer1:
      propConfigurations: { appearance: Secondary }
```

### Notes

- **Default by absence.** `VERTICAL` is the absent meaning, not a schema `default` keyword — a wrapper without `orientation` renders as a column.
- **Naming (constitution VI, rule 1).** `orientation` with `horizontal`/`vertical` values is the shared code-platform term: ARIA's `aria-orientation` and Android's linear-layout `orientation` both use exactly this word and value pair.
- **Scope: the whole example set, component level only.** One value describes the arrangement of the set — per-example orientation is meaningless. Subcomponents' `instanceExamples` take the same wrapper shape by reference, but no subcomponent capture emits an orientation.
- **Inline union, no named definition.** The value set is two members used by one field; a named type and schema definition would grow the public API (constitution III) for no consumer need. The `SCREAMING_CASE` members match `LayoutMode`'s existing `HORIZONTAL`/`VERTICAL`.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `InstanceExamples` (types) ↔ `component.schema.json#/definitions/InstanceExamples` — `orientation` and `items` in both; the examples concern document and subcomponent slices reach the same definition by `$ref`.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-cli` | Update usage | Validation fixtures and authoring templates emit the wrapper; the concern split and merge carry `instanceExamples` opaquely |
| `specs-from-figma` | Update usage | Capture emits `{ orientation, items }`, detecting orientation from the first two example instances' canvas positions |
| `figma-from-specs` | Update usage | Render reads `items` and lays the `Examples` section out along the declared axis |
| `react-from-specs` | None | Instance examples are not emitted as code |
| `webcomponents-from-specs` | None | Instance examples are not emitted as code |
| `from-specs` (shared core) | Recompile | Type passthrough only |
| `specs-plugin-2` | Recompile | Receives the merged spec; behavior lives in `figma-from-specs` |

---

## Semver Decision

**Target version**: `0.41.0` — the version of the active `release/next` branch this ADR merges into.

**Change class**: `MAJOR` — `InstanceExamples` is restructured; a spec or consumer using the former bare record no longer validates or compiles (constitution III).

---

## Consequences

- A spec records how its instance examples are arranged, and a render reproduces the arrangement instead of always stacking vertically.
- Specs carrying the pre-wrapper bare record no longer validate — they regenerate, or move their entries under `items`.
- Consumers reading `instanceExamples` as a record migrate to `instanceExamples.items`; a wrapper without `orientation` behaves exactly as today.
