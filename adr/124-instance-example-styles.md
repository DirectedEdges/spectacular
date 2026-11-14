# ADR: Styles on InstanceExample

**Branch**: `124-instance-example-styles`
**Created**: 2026-11-14
**Status**: DRAFT
**Summary**: A `styles` property on `InstanceExample` records the authored box — `layoutSizingHorizontal: FIXED` and `width` — beside `title` and `propConfigurations`.
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

An `InstanceExample` (ADR-048) records a documented usage of a whole component: a `title` and `propConfigurations`. Its content arrives through `SlotContentRef` pointers into `slotContentExamples`, and every style inside that content is captured on the content's own elements.

What the capture cannot record today is the example instance's **own box**. An author sizes an example instance to the context it documents — a card example resized to a column width its component does not declare — and every fixed width inside the captured content was measured against that box. A consumer reproducing the example instantiates the component at the component's own size, so content captured at the author's width renders against a different one: interior fixed-width elements overflow or underfill, and the example no longer shows what it documents.

The gap is on the outside of the content, not within it: the slot content triplet correctly captures its elements, but no property of `InstanceExample` can say "this usage is 354 wide." Compositions already solve the analogous problem by carrying a fixed `width` on their root element's `styles`; an instance example has no element of its own to carry one.

## Decision Drivers

- **Additive only**: the change must be an optional property so existing specs remain valid (MINOR-class per Constitution III).
- **Type ↔ schema parity**: the type change and the schema change must land together (Constitution I).
- **No new vocabulary**: the schema already names what a sized box is — `Styles` with `layoutSizingHorizontal` and `width`. A second way of spelling the same concept would drift (Constitution III, VI).
- **Documented configuration, not live data**: `InstanceExample` excludes `PropBinding` by design (ADR-048); whatever carries the box must stay declarative data.
- **Conditional capture**: an example left at its component's natural size (`HUG`) declares nothing — the property must be omissible, not a required measurement.

## Options Considered

*(Pre-decided — the surface was set by the author: `InstanceExample` gains a `styles` property carrying `layoutSizingHorizontal: FIXED` and `width` when the example instance is not `HUG`.)*

One typing choice remained open within that directive:

### Option A: Reference the existing `Styles` definition *(Selected)*

`styles?: Styles`, the same type an `Element` carries.

**Pros**:
- No new named definition; parity obligation is a single `$ref` (Constitution I, III).
- Reads identically to every other `styles` block in a spec — authoring and tooling already understand it.
- Leaves room for an example to carry other root-level styling later without another schema change.

**Cons / Trade-offs**:
- The type admits more keys than the capture writes. The producer's rule — write `layoutSizingHorizontal: 'FIXED'` and `width` only when the instance is not `HUG` — is a capture behavior, documented on the property description rather than enforced by the type.

### Option B: A bespoke narrow type (`{ layoutSizingHorizontal?: 'FIXED'; width?: number }`) *(Rejected)*

**Rejected because**: it creates a second, divergent spelling of sizing that `Styles` already defines — a named definition with its own parity obligation, violating the no-new-vocabulary driver for no added safety the producer doesn't already provide.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `types/InstanceExample.ts` | Added optional field `styles?: Styles` to `InstanceExample` | MINOR |

**Example — new shape** (`types/InstanceExample.ts`):
```yaml
# Before
InstanceExample:
  title?: string
  propConfigurations?: Record<string, InstanceExampleConfigurationValue>

# After
InstanceExample:
  title?: string
  styles?: Styles          # optional — MINOR
  propConfigurations?: Record<string, InstanceExampleConfigurationValue>
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `schema/component.schema.json` | Added optional property `styles` to `#/definitions/InstanceExample`, `$ref` to `styles.schema.json#/definitions/Styles` | MINOR |

**Example — new shape** (`schema/component.schema.json`):
```yaml
# New property under #/definitions/InstanceExample/properties
styles:
  $ref: "styles.schema.json#/definitions/Styles"
  description: "The example instance's own styles — its box, not its content's.
    Captured when the instance declares them: an author-resized example records
    layoutSizingHorizontal: FIXED and width (raw px); an example left at its
    component's natural size (HUG) omits this property entirely."
```

### Notes

- The property is the example instance's **outside**: the box its author sized it to. Content inside the referenced `slotContentExamples` triplets is untouched by this ADR and continues to capture its own element styles.
- Capture is conditional by declaration, not measurement: `HUG` means the component sizes itself, so there is nothing to record and the property is omitted. Only a non-`HUG` instance records `layoutSizingHorizontal: 'FIXED'` with its `width` as a raw number.
- A rendering consumer applies these styles to the instantiated example as its final step, after configuration and content fills, so nothing re-measures underneath it.

**Example — spec output**:
```yaml
instanceExamples:
  card5:
    title: Card 5
    styles:
      layoutSizingHorizontal: FIXED
      width: 354
    propConfigurations:
      children:
        $slotContent: "#/components/egdsCardBeta/slotContentExamples/card5__children"
```

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `InstanceExample.styles` (`types/InstanceExample.ts`) ↔ `#/definitions/InstanceExample/properties/styles` (`schema/component.schema.json`), both referencing the existing `Styles` contract (`types/Styles.ts` ↔ `styles.schema.json#/definitions/Styles`). No new named definition.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-cli` | Recompile | Validation accepts the new optional property; no command surface change |
| `specs-from-figma` | Update output | Capture writes `styles` on an example whose instance is not `HUG` |
| `figma-from-specs` | Update usage | Render applies an example's `styles` to the instantiated example as the final step |
| `react-from-specs` | None | Examples render from content; the box is a canvas concern |
| `webcomponents-from-specs` | None | As `react-from-specs` |
| `from-specs` | Recompile | Shared spec-reading types pick up the new optional field |
| `specs-plugin-2` | Recompile | Consumes both direction packages from source |

---

## Semver Decision

**Target version**: `0.41.0` — the version of `release/next`, the active release branch this ADR merges into.

**Change class**: `MINOR` — additive optional property on an existing type and schema definition, referencing an existing definition (Constitution III).

---

## Consequences

- A spec can state the box an instance example was authored at, so a render reproduces the usage at the width its interior was measured against.
- Existing specs remain valid; an absent `styles` keeps today's behavior (the example renders at the component's own size).
- The capture rule — record `FIXED` + `width` only when the instance is not `HUG` — lives in the producer; the schema admits any `Styles` keys on an example, and future ADRs may put more of them to use.
