# ADR: Explicit `position: ABSOLUTE` for Children of Non-Auto-Layout Parents

**Branch**: `070-explicit-absolute-position`
**Created**: 2026-08-17
**Status**: ACCEPTED
**Summary**: Children of non-auto-layout parents always emit `position: ABSOLUTE` explicitly, so consumers never infer positioning from a suppressed `layoutMode`.
**Decides**: styles.bottom, styles.centerHorizontalOffset, styles.centerVerticalOffset, styles.end, styles.layoutMode, styles.position, styles.start, styles.top
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — clarifies the presence contract introduced by ADR-041)*

---

## Context

`Styles` carries two layout-positioning properties introduced by ADR-038 and ADR-041:

- `position: Position | null` — `'AUTO' | 'ABSOLUTE'`, set on a child to declare whether it participates in the parent's auto-layout or is absolutely positioned.
- `layoutMode: LayoutMode | null` — `'NONE' | 'HORIZONTAL' | 'VERTICAL'`, set on a container to declare its auto-layout direction. `NONE` is suppressed as a default, so a plain container emits no `layoutMode` at all.

Positioning offsets (`top`, `bottom`, `start`, `end`, `centerHorizontalOffset`, `centerVerticalOffset`) are emitted per the element's constraints.

A consumer reported the gap this ADR resolves. Given a component whose root is a plain container:

```yaml
# Current emission
root:
  styles:
    width: 24
    height: 24
    # layoutMode: NONE is suppressed as a default — nothing marks this as a non-auto-layout container
elements:
  icon:
    styles:
      top: 4
      start: 4
      # no position — absoluteness is implied only by the parent's (absent) layoutMode
```

The `icon` element carries offsets but no `position`. Nothing local to the element states that it is absolutely positioned; the consumer must locate the parent, observe that `layoutMode` is absent, and know that absence means `NONE`, which in turn means every child is absolutely positioned. The consumer expected `position: ABSOLUTE` to accompany `top`/`start`.

Half of the expected pairing already holds in emitted output. Offsets are emitted only for absolutely positioned elements: an auto-layout participant never emits them, even when a stale `x`/`y` remains set on the Figma node (Figma ignores those coordinates, and so does the emitted spec). The current emission rule for children of non-auto-layout containers, however, is deliberate: offsets are emitted with `position` suppressed. So today's output satisfies "offsets ⇒ absolutely positioned" but leaves the declaration implicit in exactly the case the consumer hit.

The question this ADR decides: **must a child of a non-auto-layout container declare `position: ABSOLUTE` explicitly, or is it implied by the parent's `layoutMode`?**

---

## Decision Drivers

- **Element locality**: an element's styles must be interpretable without walking the element tree. The shared contract serves all consumers equally (constitution III); requiring parent traversal to interpret a child's offsets pushes derivation logic into every consumer.
- **Code platforms first (constitution VI, rule 1)**: on the web, absolute positioning is declared on the child itself (`position: absolute`), and offsets (`top`, `inset-inline-start`) only take effect alongside that declaration. SwiftUI (`.position`/`.offset`) and Compose (`Modifier.offset`) likewise place the positioning declaration on the child. 2+ code platforms agree the child self-declares.
- **Implicit defaults must not create ambiguity**: `layoutMode: NONE` is an omitted default. An implication chain anchored to an *absent* property on a *different* element is invisible in the serialized output.
- **Minimal change class**: `position` and the offsets already exist with the right shapes; no new types or properties should be added to resolve this (constitution III — minimal public API).
- **Deterministic presence rules**: the contract must state exactly when `position` is present so identical input always yields identical output.

---

## Options Considered

### Option A: Pair `position: ABSOLUTE` with offsets *(Selected)*

`position` is present — with value `ABSOLUTE` — on every element that emits positioning offsets, regardless of the parent's `layoutMode`. Offsets never appear without `position`. This makes the existing behavior for absolute children of auto-layout containers the universal rule rather than a special case.

```yaml
# New emission — child of a plain (non-auto-layout) container
elements:
  icon:
    styles:
      position: ABSOLUTE
      top: 4
      start: 4
```

**Pros**:
- The element is self-describing; no parent traversal or default-knowledge required.
- Matches the web's child-declared `position: absolute` + offsets pairing (constitution VI, rule 1).
- No type or schema shape changes — only presence-contract documentation.
- One rule covers both parent contexts (auto-layout opt-out and plain container), eliminating the special case.
- No spurious `ABSOLUTE` is possible: since offsets are only ever emitted for absolutely positioned elements, keying `position` presence to offsets cannot mark an auto-layout participant — stale Figma coordinates included — as absolute.

**Cons / Trade-offs**:
- Children of plain containers gain one style entry each; regenerated specs will diff.
- `AUTO` never appears inside plain containers, so `position`'s value there is always `ABSOLUTE` — mildly redundant with the offsets, but redundancy is the point: it is the explicit declaration.

---

### Option B: Absoluteness implied by the parent's `layoutMode` *(Rejected)*

Document that every child of a container without auto-layout is absolutely positioned; emit nothing on the child.

**Rejected because**: the signal is the absence of an omitted-by-default property on a different element. A consumer reading an element in isolation cannot distinguish "absolutely positioned in a plain container" from "auto-layout participant whose offsets are meaningless." Violates element locality and contradicts the child-declared model shared by the code platforms (constitution VI).

---

### Option C: Emit `layoutMode: NONE` explicitly on the parent *(Rejected)*

Stop suppressing the `NONE` default so the parent visibly declares that its children are absolutely positioned.

**Rejected because**: the declaration is still non-local — the consumer must walk to the parent to interpret the child's offsets. It also expands emission of a default onto every plain container in every spec (far larger diff than Option A) while still leaving offsets unpaired with a positioning declaration on the element that carries them.

---

## Decision

Explicit `position: ABSOLUTE` is required. The presence contract is documented on the existing properties; no shapes change.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Doc comment on `position`: present as `ABSOLUTE` on every element that emits positioning offsets, including children of non-auto-layout containers; `AUTO` appears only inside auto-layout containers | PATCH |
| `Styles.ts` | Doc comments on `top`, `bottom`, `start`, `end`, `centerHorizontalOffset`, `centerVerticalOffset`: emitted only alongside `position` | PATCH |

**Example — documented contract** (`types/Styles.ts`):
```yaml
# Contract, expressed in the property documentation
position:
  presence: required whenever any positioning offset is present
  value inside auto-layout parents: AUTO (participant) or ABSOLUTE (opted out)
  value inside non-auto-layout parents: always ABSOLUTE
offsets (top / bottom / start / end / center*Offset):
  presence: only alongside position
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | `description` updates on `position` and the six offset properties stating the same presence contract | PATCH |
| `component.schema.json` | Satisfied by reference — it `$ref`s `styles.schema.json#/definitions/Styles`, so the updated descriptions apply without a second copy | PATCH |

### Notes

- No property is added, removed, renamed, or retyped, and nothing joins `required[]` — JSON Schema presence contracts of this kind (cross-property, cross-element) are documented rather than mechanically enforced, consistent with how other presence rules on `Styles` (e.g., constraint-conditional offsets) are expressed.
- The rule is stated in terms of the serialized output contract; producers are responsible for satisfying it.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — documentation-only updates applied to `types/Styles.ts` and to the corresponding `position`/offset property descriptions in `styles.schema.json` and `component.schema.json`.
- **Parity check**: `Styles.position` ↔ `#/definitions/Styles/properties/position`; each offset field ↔ its same-named schema property.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Emission rule change | Replace the current "offsets with `position` suppressed" rule for children of non-auto-layout containers with `position: ABSOLUTE`; never emit offsets without `position`. Offset suppression for auto-layout participants is already correct and unchanged |
| `specs-cli` | None (validation unchanged) | Regenerated specs include the new entries; no code change |
| `specs-plugin-2` | Output content change | Regenerated canvas output lists `position: ABSOLUTE` for affected elements; no UI change |

---

## Semver Decision

**Version**: `0.34.0` (active release branch) — `PATCH`-class change

**Justification**: All changes are documentation — doc comments in `types/` and `description` strings in `schema/`, with no change to any type signature, field presence, or schema structure ("PATCH for documentation, comments, or formatting" per the constitution's Versioning standard).

---

## Consequences

- An element carrying positioning offsets always declares `position: ABSOLUTE`; consumers interpret it without parent context.
- Offsets never appear without `position` — the pairing the consumer expected becomes a guaranteed invariant of the contract.
- The converse guarantee also holds: `position: ABSOLUTE` never appears spuriously. An auto-layout participant emits no offsets — including when a stale, Figma-ignored `x`/`y` remains set on the node — so the pairing rule can never fire for it.
- Regenerated specs gain a `position: ABSOLUTE` entry on each absolutely positioned child of a plain container; existing specs remain schema-valid, since no shape changed.
- Variant output changes shape where positioning context differs across variants: a child that is absolutely positioned in one variant and an auto-layout participant in another now shows `position: ABSOLUTE` appearing and disappearing in variant style differences, where previously it was uniformly suppressed. Parity and fidelity baselines will diff accordingly on regeneration.
- `layoutMode: NONE` remains a suppressed default; the parent's emission is unchanged.
