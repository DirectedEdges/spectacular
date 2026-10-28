# ADR: Roles on a Collapsed Root — `childRole` Says Which Layer Was Annotated

**Branch**: `104-collapsed-root-roles`
**Created**: 2026-10-15
**Status**: ACCEPTED
**Summary**: A `childRole` extension joins `name` on a collapsed element, naming which of its two Figma layers carried a role.
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — extends ADR-058 and ADR-083)*

---

## Context

`spec.collapsePrimitiveWrapper` strips a root container that wraps a single child and promotes the child to the spec root. ADR-058 established it for a `text` or `glyph` child; ADR-083 extended it to a root wrapping one `slot`. In both forms the result is the same structural fact: **two Figma layers become one anatomy element.**

Roles are a separate, later concern. ADR-067 added `AnatomyElement.role`, populated by `specs generate` from a Figma Dev Mode annotation of the form `role:<concept>`, read from the component node or any layer beneath it. Nothing in that ADR anticipated an element with two source layers.

When both features are on, either source layer may carry a `role:` annotation — the component node, the collapsed child, or both. The spec has one element and therefore one `role` field, so the annotation's origin is unrecoverable from `role` alone. Three distinct Figma states collapse onto the same spec, and render (`figma-from-specs`) writes the annotation back onto whichever layer the schema happens to name — silently relocating it on a round trip.

`$extensions.com.figma` on an anatomy element already exists for exactly this class of fact. ADR-084 and the `name` field established the pattern: when collapse or formatting destroys a Figma-side detail the spec would otherwise need to invent, the detail is recorded as provenance rather than as contract. `name` is already recorded on every collapsed element for the same reason — the surviving layer's Figma name is not derivable from the anatomy key.

The gap: no field records which of a collapsed element's two source layers carried a role, so the round trip cannot be faithful and the rule has nowhere to be stated.

**Out of scope.** Whether a role on a non-root layer should influence emitted code at all is not resolved here — today only the root element's `role` reaches React and Web Components, and this ADR accepts that behavior rather than changing it. Any change to emission belongs in a transform ADR.

**Relationship to the collapse ADRs.** This ADR amends neither ADR-058 nor ADR-083; it describes what their shared structural consequence means for roles, and applies identically to both forms of collapse. ADR-102 (`$text` and `$glyph` in `anyOf`, draft) reshapes how primitive content is expressed and therefore which components remain collapse candidates. It does not affect this rule: the rule keys off collapse having happened, not off why the wrapper qualified.

---

## Decision Drivers

- **Round-trip fidelity** — a spec generated from Figma and rendered back must put each annotation on the layer it came from.
- **One fact, one field** — the spec must distinguish all four annotation states without a consumer inferring any of them.
- **Provenance, not contract** — a Figma-side authoring detail destroyed by collapse belongs in `$extensions.com.figma`, beside `name`, not in the element's public shape (ADR-084).
- **Additive only** — an optional field on an existing extension interface; absence reproduces today's behavior exactly.
- **Types ↔ schema symmetry** — `types/Anatomy.ts` and `schema/component.schema.json` change together (Constitution I).
- **No logic in this package** — the collapse algorithm and the annotation read live in `specs-from-figma` (Constitution II).

---

## Options Considered

### Decision 1 — How a collapsed element records which layer carried a role

#### Option A: A `childRole` field on `FigmaAnatomyElementExtension` *(Selected)*

`role` keeps its meaning unchanged: the element itself — the component node — was annotated. A sibling `childRole` under `$extensions.com.figma` records a role annotated on the layer collapse folded in.

Four cases, and the pair distinguishes all four:

| `role` | `childRole` | Annotated in Figma | Render writes back to |
|---|---|---|---|
| present | absent | the component node | the component node |
| absent | present | the collapsed child | the recreated child |
| present | present | both layers | both layers |
| absent | absent | neither | neither |

**Pros**:
- `role` never changes meaning — it means the root was annotated, and never that something was promoted into it. Every existing consumer reading `role` keeps reading the same fact.
- All four states are distinguishable with no inference.
- Sits beside `name`, the field already recorded for the same reason on the same elements.
- Optional and additive; a spec without collapse never carries it.

**Cons / Trade-offs**:
- A consumer wanting "every role anywhere on this element's source layers" reads two fields instead of one.
- Only `role` reaches emitted code, so a role on a collapsing component's child is traceable but inert (see Consequences).

---

#### Option B: Merge the child's role into `role` *(Rejected)*

Promote the child's annotation into the element's `role`, appending to the array when the root also has one.

**Rejected because**: it destroys the distinction the schema exists to carry. A single `role` after merge cannot say whether one layer or two were annotated, so child-only and both-annotated become the same spec — exactly the pair render must tell apart. It also silently redefines `role` from "this element was annotated" to "this element or something folded into it was", changing the meaning of a published field for every consumer.

---

#### Option C: A per-role source map (e.g. `roleSource: { textbox: "child" }`) *(Rejected)*

Keep one merged `role` and add a parallel structure naming each role's originating layer.

**Rejected because**: it is strictly more surface for the same two states, and it introduces a correctness burden — the map's keys must stay in step with the `role` array, an invariant the schema cannot express and no consumer can validate. It also reintroduces Option B's redefinition of `role`.

---

#### Option D: Drop the child's role *(Rejected)*

Record nothing; the annotation disappears with the collapsed layer.

**Rejected because**: it loses authored data. The designer's annotation is destroyed by a processing setting they did not apply per component, with no record of the loss, and the round trip cannot restore the layer's annotation.

---

### Decision 2 — Whether `childRole` is recorded when both layers name the same concept

#### Option A: Always record it *(Selected)*

`childRole` is present whenever the collapsed child was annotated, including when it names the same concept as `role`.

**Pros**:
- Presence means one thing only: the child layer was annotated. No consumer has to reason about when the field was suppressed.
- Round trip stays faithful. Omitting it would make "both layers annotated" indistinguishable from "only the root was", and render would drop the child's annotation.

**Cons / Trade-offs**:
- The same concept appears twice in the spec for an identical pair, which reads as redundant without the rule in hand.

---

#### Option B: Omit it when it duplicates `role` *(Rejected)*

Treat an identical pair as already covered by `role` and suppress `childRole`.

**Rejected because**: the duplication is not redundant — it is the second layer's annotation. Suppressing it discards the one fact the field exists to carry and loses the child's annotation on the next render.

---

### Decision 3 — The field name

#### Option A: `childRole` *(Selected)*

**Pros**:
- Names the relationship the field records — the role of the child that was folded in — in terms a consumer reading an anatomy element already has.
- Full unabbreviated words; mirrors `role` so the pair reads as a pair.
- No code-platform term exists for this concept, so Constitution VI rule 3 applies: the concept is Figma-structural and the schema names it plainly.

**Cons / Trade-offs**:
- "Child" is relative to a layer tree that no longer appears in the spec; the field's doc comment has to supply that context.

---

#### Option B: `collapsedChildRole` / `wrapperChildRole` *(Rejected)*

**Rejected because**: the qualifier restates what the containing extension already establishes — a `childRole` only ever exists because collapse happened — at the cost of a longer name on a field that appears beside `name` in every collapsed element.

---

#### Option C: `promotedRole` *(Rejected)*

**Rejected because**: it describes the mechanism rather than the layer, and reads as "the role that was promoted onto this element" — the Option B merge semantics this ADR rejects.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Anatomy.ts` | Added optional field `childRole` to `FigmaAnatomyElementExtension` | MINOR |

**Example — new shape** (`types/Anatomy.ts`):
```yaml
# Before
FigmaAnatomyElementExtension:
  name?: string

# After
FigmaAnatomyElementExtension:
  name?: string
  childRole?: RoleConceptName | RoleConceptName[]   # optional — MINOR
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Added property `childRole` under the anatomy element's `com.figma` extension | MINOR |

**Example — new property**:
```yaml
childRole:
  oneOf:
    - type: string
    - type: array
      items: { type: string }
      minItems: 1
  description: "A role annotated on the layer primitive-wrapper collapse folded into this element, rather than on the element itself."
```

**Example — the four cases in a spec** (`anatomy`):
```yaml
# Root annotated
root:
  type: text
  role: label
  $extensions:
    com.figma:
      name: Label Wrapper

# Collapsed child annotated
root:
  type: text
  $extensions:
    com.figma:
      name: Label Wrapper
      childRole: label

# Both annotated — recorded even when the concept is identical
root:
  type: text
  role: label
  $extensions:
    com.figma:
      name: Label Wrapper
      childRole: label
```

### Notes

- `childRole` mirrors `role`'s type exactly — `RoleConceptName | RoleConceptName[]` — because a layer may carry several `role:` annotations, and the two fields must be readable as a pair.
- Optional, and absent unless `collapsePrimitiveWrapper` collapsed a child that carried an annotation. A spec generated with collapse off never contains it.
- `RoleConceptName` is an open string, so the field adds no vocabulary. Role concepts continue to grow by docs-governed vocabulary ADRs without a schema change.
- The field applies identically to both collapse forms — the `text`/`glyph` child of ADR-058 and the `slot` child of ADR-083.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `FigmaAnatomyElementExtension.childRole` in `types/Anatomy.ts` maps to `childRole` in the anatomy element's `com.figma` extension properties in `schema/component.schema.json`. Both are optional, both accept a string or a non-empty array of strings, and neither appears in `required`.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Writes the field — when collapse folds in a layer carrying a `role:` annotation, the annotation is recorded as `childRole` instead of being merged or dropped | Record `childRole` on the collapsed element; leave `role` to the component node's own annotation |
| `figma-from-specs` | Reads the field — the pair tells it which source layer each annotation belongs on when recreating the two layers | Write `role` back to the component node and `childRole` to the recreated child |
| `specs-cli` | Recompile — new optional field on a published type | None beyond picking up the schema version |
| `specs-plugin-2` | Recompile — same type surface | None |

---

## Semver Decision

**Target version**: `0.36.0` — the version of `packages/schema` on the active `release/next` branch this ADR merges into.

**Change class**: `MINOR` — for CHANGELOG placement, not a version bump.

**Justification**: One optional field added to an existing interface, with a matching optional schema property and no change to any existing field's name, type, presence, or meaning. Additive optional fields are `MINOR` per the constitution's versioning rule.

---

## Consequences

- A collapsed element records which of its two source layers carried a role, so a Figma → spec → Figma round trip returns each annotation to the layer it came from.
- `role` keeps one meaning: this element was annotated. It never means a role was promoted into it from somewhere else.
- All four annotation states are distinguishable from the spec alone, including the identical pair, which is recorded rather than deduplicated.
- **Accepted cost**: a role annotated on a collapsing component's child reaches no emitted code. Only `role` is read by the React and Web Components transforms, so the child's annotation is preserved and traceable but inert.
- **Authoring guidance follows from that cost**: on a component whose root collapses, annotate the component node. Annotating the child is non-destructive and survives the round trip, but it changes no generated output. A library that needs the child's role to emit sets `collapsePrimitiveWrapper: false`.
- Consumers that want every role on an element's source layers must read `role` and `$extensions.com.figma.childRole` together; neither field alone is the complete picture.
