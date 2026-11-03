# ADR: Collapsing a Slot-Only Wrapper

**Branch**: `083-slot-wrapper-collapse`
**Created**: 2026-09-01
**Status**: ACCEPTED
**Summary**: `collapsePrimitiveWrapper` extends to a root wrapping one `slot`, merging both containers and keeping the slot's value on shared keys.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — amends ADR-058)*

---

## Context

ADR-058 introduced `spec.collapsePrimitiveWrapper`. When true, a component whose root is a plain container holding a single `text` or `glyph` leaf is collapsed: the wrapper is stripped and the leaf becomes the spec root. Its stated rationale is that such a wrapper is *"a Figma-side convenience with no design-system meaning."*

That ADR explicitly refuses the same shape when the child is a **slot**:

> Collapse is blocked by … a root with a slot binding on its children (the wrapper has semantic slot structure).

The refusal treats a slot binding as evidence that the wrapper means something. Often it is not. A layout component authored in Figma as a frame containing one slot frame is the same convenience: one box that lays out its children, expressed as two layers because that is how a slot is authored.

### What the refusal costs

A container primitive binding (ADR-074, ADR-076) substitutes a design-system component for a box that holds children. ADR-076 records the precondition:

> **A bound component's root must be the box its children land in.**

A component authored as root + slot fails it. The collapsed-away wrapper survives into generated markup, so everything the substituted element carried — spacing, padding, alignment, sizing — lands on an outer box whose only child is the wrapper. Spacing is silently lost, and a wrapper carrying a zero flex-basis inside a hug-height parent collapses the subtree to nothing. Neither failure raises an error.

Collapsing the slot-only wrapper removes the second box and makes such components valid binding targets.

### The shape, measured

Across a 115-component catalogue, exactly **four** components are a root container with one slot child:

| Component | Root styles vs slot styles |
|---|---|
| layout | identical |
| action list | identical |
| list | disjoint; no shared key differs |
| bottom bar | root `VERTICAL` vs slot `HORIZONTAL`; differing `height`, `cornerRadius` |

The bottom bar is the interesting case: a vertical wrapper around a horizontal row, with a surface and padding of its own. It still collapses — the slot's `HORIZONTAL` wins, and the wrapper's `VERTICAL` is exactly the meaningless axis a single-child box carries. Its surface and padding are preserved by the split rule.

### Why no style test is needed

ADR-058 needs an eligibility list because the two nodes it merges are **different kinds**: a container and a `text` or `glyph` leaf. A container's styles have nowhere to go on a leaf, so the ADR enumerates the ones whose loss would matter.

The slot case is not that. **Both nodes are containers with the same style signature** — every key one can carry, the other can carry, and both mean the same thing on either. Nothing has to be discarded to merge them, so nothing has to be tested for.

That also disposes of the wrapper's own `layoutMode`. A wrapper holds exactly one child — the slot box — and a lone child lays out the same in a row as in a column. The wrapper's layout axis is close to meaningless by construction, which is what makes the merge safe rather than a judgement call.

---

## Decision Drivers

- **Consistency with ADR-058** — the same argument that justifies collapsing a text wrapper justifies collapsing a slot wrapper
- **Same kind, same signature** — root and slot are both containers, so the merge discards nothing and needs no eligibility test
- **Round-trip stability** — `figma-from-specs` reverses ADR-058's collapse; the slot case needs a stated rule for splitting merged styles back across two boxes
- **Absence must reproduce current behaviour exactly** — a workspace that does not enable the setting sees no change
- **No logic in this package (Constitution II)** — the schema declares the setting; collapse and expansion live in the consuming packages
- **Type ↔ schema symmetry (Constitution I)** — whatever changes in `types/` changes in `schema/`
- **Minimal, stable, intentional public API (Constitution III)** — reuse the existing setting rather than adding a second one that would have to be explained against the first

---

## Options Considered

*(Pre-decided — the merge rule, the split rule and the governing setting were settled before drafting.)*

An eligibility test gated on the root's styles was drafted and discarded. It assumed the two nodes might lose something in the merge, which is true when merging a container into a leaf (ADR-058) and false when merging a container into a container. Testing styles here would refuse components for carrying values that survive the merge intact.

Adding a second setting was also considered and rejected: a reader would have to learn why two switches exist for one idea, and every workspace wanting either would set both.

---

## Decision

Widen `spec.collapsePrimitiveWrapper` to cover a slot-only wrapper. **No member is added, removed, or retyped** — the setting's documented meaning widens, and the behaviour it selects is implemented by consumers.

### Eligibility

A component collapses when **all** hold:

- The root element's type is `container`
- The root has exactly one anatomy-visible child
- That child is a container whose `children` is bound to a slot property, and that property is the component's **only** slot
- No variant overrides the binding — it holds in `default` and is never replaced
- Every valid variant is eligible — collapse stays all-or-nothing, as in ADR-058

The test is the **binding**, not the anatomy label. The eligible child is a container layer whose `children` maps to the sole slot prop:

```yaml
# default.elements.<layer>
children:
  children: { $binding: "#/props/children" }
  styles:   { layoutMode: HORIZONTAL, layoutSizingHorizontal: FILL }
```

Requiring the slot to be the component's only one keeps the collapsed root unambiguous: a component with two slots has two places children can go, and promoting one onto the root would silently privilege it. Requiring the binding to hold across every variant keeps collapse all-or-nothing, matching ADR-058.

No style participates in eligibility. Both nodes are containers, so the merge discards nothing.

### Merging — the slot wins

Styles merge onto one element, and where both carry a key, **the slot's value is kept**. The slot is the box the children actually sit in, so its layout is the one the composed result must preserve; the wrapper's is an artifact of holding a single child.

```yaml
# Before — two boxes
anatomy:
  root: { type: container }
  children: { type: slot }
elements:
  root:     { styles: { layoutMode: VERTICAL, padding: 8, backgroundColor: "#fff" } }
  children: { styles: { layoutMode: HORIZONTAL, itemSpacing: 4 } }

# After — one box; layoutMode taken from the slot
anatomy:
  root: { type: container }
elements:
  root:
    styles: { layoutMode: HORIZONTAL, padding: 8, backgroundColor: "#fff", itemSpacing: 4 }
    children: { $binding: "#/props/children" }
```

The collapsed form needs no new representation — a slot binding on a container's `children` is already expressible.

### The Figma layer name survives

Where a layer's Figma name diverges from its spec key, that name is recorded in `$extensions['com.figma'].name` (ADR-066). The merge must not drop it: the collapsed element carries the **slot layer's** extension, consistent with the slot winning every other shared key.

```yaml
# Before
elements:
  root:     { $extensions: { com.figma: { name: "Layout" } } }
  children: { $extensions: { com.figma: { name: "Children" } } }

# After — the slot layer's name is what expansion needs to rebuild
elements:
  root:
    $extensions: { com.figma: { name: "Children" } }
    children: { $binding: "#/props/children" }
```

On expansion the rebuilt inner box takes that name, and the wrapper is named for the component. The wrapper's own original name is not recoverable — it is the layer the collapse exists to remove, and no member carries a second name.

### Expansion, for the reverse direction

Rebuilding two boxes from one requires a rule, since the merge does not record which box a style came from. Styles split by what they act on:

| Style group | Goes to | Keys |
|---|---|---|
| **Parent layout** — how a box arranges what it holds | **both** boxes | `layoutMode`, `itemSpacing`, `padding`, `mainAxisAlignment`, `crossAxisAlignment`, `wrap`, `wrapAlignment` |
| **Child layout** — how a box sizes within its own parent | the **slot** box | `layoutSizingHorizontal`, `layoutSizingVertical`, `primaryAxisSizingMode` |
| **Everything else** | the **root** | `backgroundColor`, `backgroundImage`, `cornerRadius`, `cornerSmoothing`, `strokes`, `strokeAlign`, `strokeWeight`, `effects`, `clipsContent`, `opacity`, `rotation`, … |

Parent-layout keys go to both because the chain has two boxes and the children must arrange as they did in the collapsed one. Most are no-ops on the wrapper by construction — it holds exactly one child, so `itemSpacing` has nothing to space and the alignments have nothing to distribute, and its `layoutMode` axis cannot show.

Values are never summed. A root with `padding: 8` and a slot with `padding: 12` collapses to `12` — the slot's value — and re-expands as `12` on both boxes. A slot carrying padding at all is an authoring mistake rather than a case the split rule has to accommodate: padding belongs to the box with the surface, and the slot has none.

Visual styles stay on the root, where a surface belongs: the outer box is what a caller sees, and painting a background on the inner box would sit it inside any padding rather than behind it.

Layer styling may therefore be distributed differently than a designer authored it, while the re-generated spec is identical. That is the trade: spec → Figma → spec is stable; Figma → Figma is not byte-identical.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `types/Settings.ts` | `Settings.spec.collapsePrimitiveWrapper` — doc comment widened to include a slot-only wrapper and to state the eligibility difference from ADR-058 | PATCH |
| `types/Settings.ts` | `ResolvedSettings.spec.collapsePrimitiveWrapper` — same | PATCH |

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `schema/settings.schema.json` | `description` of `spec.collapsePrimitiveWrapper` widened to match | PATCH |

### Notes

The setting keeps its name. "Primitive wrapper" reads as the wrapper being removed rather than the leaf being promoted (ADR-058's own naming rationale), and that reading holds for a slot child as well as a text or glyph one.

Absence or `false` reproduces current behaviour exactly. A workspace that already sets it to `true` **will** see specs change shape for components of this form — the deliberate consequence of widening one setting rather than adding a second.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — documentation-only, applied to both artifacts
- **Parity check**: `Settings.spec.collapsePrimitiveWrapper` and `ResolvedSettings.spec.collapsePrimitiveWrapper` ↔ `settings.schema.json` `#/properties/spec/properties/collapsePrimitiveWrapper`. No property is added or removed, so parity is preserved by construction

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Widen collapse eligibility to a slot-only root and merge the two elements' styles | Implement |
| `figma-from-specs` | Reverse the collapse for a slot-only root, splitting merged styles per the expansion rule | Implement |
| `specs-cli` | None — the setting is passed through unchanged | Recompile |
| `specs-plugin-2` | Output for components of this form changes when the setting is enabled | Recompile |

---

## Semver Decision

**Version**: `0.31.0` (release branch `release/schema-0.31.0+cli-0.28.0`) — **PATCH**

**Justification**: no type, property, or default changes. The setting already exists (`@since 0.26.0`); only its documented meaning widens, and the behaviour it selects belongs to the consuming packages (Constitution II). The observable change in generated specs is a consumer behaviour change, not a change to this package's contract.

---

## Consequences

- Components authored as a root container around a single slot emit one box, and so satisfy ADR-076's precondition for a container primitive binding
- ADR-058's eligibility list is not universal, and this ADR explains why it does not carry over: that list exists because a container is merged into a **leaf**, where container styles have nowhere to go. Merging a container into a container discards nothing, so no list is needed
- A root with its own surface never collapses, so a component that is genuinely two boxes stays two boxes
- The reverse direction gains a stated rule for splitting merged styles. Figma layer styling may differ from what a designer authored while spec → Figma → spec stays stable — an explicit trade, not an accident
- A slot that carries `padding` is an authoring mistake, not a case the split rule accommodates — padding belongs to the box with the surface
- **Enabling the setting now does more than it did.** A workspace already setting it to `true` sees specs change shape for this class of component with no configuration change of its own. This is the cost of one setting rather than two, accepted deliberately
