# ADR 058: Collapsing Wrapped Primitives

**Branch**: `058-wrapper-collapse`
**Created**: 2026-06-16
**Status**: ACCEPTED
**Summary**: A `collapsePrimitiveWrapper` processing option strips plain wrappers, promoting a single text or glyph child to the spec root.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

A common Figma construction — particularly for text and icon primitives — is a component whose root layer is a plain, style-free container holding a single `text` or `glyph` child. The wrapper adds no semantic styling (no corner radius, strokes, spacing, effects, or background) and carries no slot binding. From a spec consumer's perspective, the root element *is* the leaf; the container is a Figma-side convenience with no design-system meaning.

Common design-system components that exhibit this pattern:

- **Heading / Title** — a frame named `Heading` or `Title` wrapping a single `Text` layer, where the frame itself carries no visual styling.
- **Paragraph / Body** — a `Paragraph` or `Body` frame wrapping a single `Text` layer with no border, background, or padding.
- **Label / Caption** — small typographic components structured identically: one unstyled frame around one text node.
- **Icon** — a frame wrapping a single vector/glyph node (e.g. a Figma component set for an icon library where each variant is a plain frame containing one `glyph`).

When the generator encounters such a component today, it faithfully emits the wrapper as `root` and the leaf as a child element. This produces a two-node anatomy and a `container` root type even though the component is semantically a single primitive. Consumers (code generators, documentation tools) must either detect and unwrap this pattern themselves or tolerate a structurally inflated spec.

**Collapse eligibility** — a component qualifies for collapse when *all* of the following are true:

- The root element's type is `container`.
- The root has exactly one anatomy-visible child (children present in both the Figma layer tree and the `Elements` collection after exclusions).
- That child's type is `text` or `glyph`.
- The child has no children of its own.
- The root carries no slot binding on its children.
- The root carries none of the following styles after default/zero values are stripped: `clipContent`, `cornerRadius`, `strokes`, `strokeAlign`, `strokeWeight`, `itemSpacing`, `padding`, `effects`, `backgroundColor`, `cornerSmoothing`.

**Collapse is blocked** by any of:

- A root that already is a `text` or `glyph` (no wrapper present).
- A root with more than one visible child (e.g. an icon with a background layer).
- A root with a slot binding on its children (the wrapper has semantic slot structure).
- Any non-default value on the disqualifying style keys above (e.g. a corner radius, a border, padding, or a fill color on the container).
- Any variant where the root fails the check — collapse is all-or-nothing across the component's variant set.

The gap: no `Config` flag exists to tell the generator to collapse this wrapper, leaving downstream tools to implement their own heuristics or accept unnecessary structural noise.

---

## Decision Drivers

- **Additive change** — must not break existing specs or consumers; absence/`false` must reproduce current behavior exactly.
- **Config parity** — the new flag must follow the established `processing` boolean pattern (`slotConstraints`, `inferNumberProps`): optional in `Config`, required in `ResolvedConfig`, defaulted in `DEFAULT_CONFIG`.
- **Types ↔ schema symmetry** — `types/Config.ts` and `schema/workspace.schema.json` must change together (Constitution I).
- **No logic in this package** — the ADR adds only a type field and schema property; the collapse algorithm lives in `specs-from-figma` (Constitution II).
- **Naming: code-platform first** — the field name should describe what the configuration controls in terms a spec consumer recognizes, independent of Figma's layer vocabulary (Constitution VI).

---

## Options Considered

### Option A: `processing.collapsePrimitiveWrapper` *(Selected)*

A boolean field on `Config.processing`. When `true`, the generator promotes the single text/glyph child to root and strips the container wrapper. Default: `false`.

**Name rationale**: Follows the verb-noun pattern established by `inferNumberProps` (infer + number props). `collapsePrimitiveWrapper` = collapse + primitive wrapper. "Primitive" identifies the element type being revealed (a leaf `text` or `glyph`, the primitive element types in the schema), and "wrapper" names the thing being removed — a code-platform-neutral term that React, iOS, and Android all use for decorative containers that carry no semantic substance. This is more precise than a bare noun phrase (`wrapperCollapse`, `leafCollapse`), which read as noun-verb or noun-noun compounds inconsistent with the rest of the `processing` block.

**Pros**:
- Additive optional field → MINOR bump only.
- `false` default leaves all existing specs unchanged.
- Verb-noun form is consistent with `inferNumberProps`.
- "Primitive" scopes the eligible leaf types without needing to enumerate them in the field name.
- Symmetric: one field in type, one property in schema.

**Cons / Trade-offs**:
- Longer than a bare noun phrase; consumers must opt in explicitly.

---

### Option B: `processing.leafCollapse` *(Rejected)*

Same boolean, named from the leaf's perspective (the thing being promoted) rather than the wrapper's (the thing being removed).

**Rejected because**: "Collapse" as a verb applied to the leaf is misleading — the leaf isn't collapsed, it's promoted. The wrapper is what collapses. `collapsePrimitiveWrapper` more accurately describes the observable effect (the container disappears) and avoids the semantic mismatch.

---

### Option C: `processing.promoteLeaf` *(Rejected)*

Active-verb framing — "promote the leaf to root."

**Rejected because**: Describes the effect from the leaf's perspective rather than the operation being performed on the structure. "Promote" is also less precise — it applies broadly to any elevation operation, whereas "collapse" specifically means removing the intermediate container. `collapsePrimitiveWrapper` names both the subject (the primitive wrapper) and the action (collapse), making the config's effect self-evident without consulting documentation.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `types/Config.ts` | Add optional `collapsePrimitiveWrapper?: boolean` to `Config.processing` | MINOR |
| `types/Config.ts` | Add required `collapsePrimitiveWrapper: boolean` to `ResolvedConfig.processing` | MINOR |
| `types/Config.ts` | Add `collapsePrimitiveWrapper: false` to `DEFAULT_CONFIG.processing` | MINOR |

**Example — `Config` (partial, `types/Config.ts`)**:
```yaml
# Before
processing:
  slotConstraints?: boolean
  inferNumberProps?: boolean

# After
processing:
  slotConstraints?: boolean
  inferNumberProps?: boolean
  collapsePrimitiveWrapper?: boolean   # optional — MINOR
```

**Example — `ResolvedConfig` (partial, `types/Config.ts`)**:
```yaml
# Before
processing:
  slotConstraints: boolean
  inferNumberProps: boolean

# After
processing:
  slotConstraints: boolean
  inferNumberProps: boolean
  collapsePrimitiveWrapper: boolean    # required — mirrors resolved pattern
```

**Example — `DEFAULT_CONFIG` (partial, `types/Config.ts`)**:
```yaml
# Before
processing:
  slotConstraints: false
  inferNumberProps: false

# After
processing:
  slotConstraints: false
  inferNumberProps: false
  collapsePrimitiveWrapper: false
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `schema/workspace.schema.json` | Add `collapsePrimitiveWrapper` boolean property under `#/definitions/Config/properties/processing/properties` | MINOR |

**Example — new property (`schema/workspace.schema.json`)**:
```yaml
# Under #/definitions/Config/properties/processing/properties
collapsePrimitiveWrapper:
  type: boolean
  default: false
  description: >
    When true, a component whose root is a plain container wrapping a single
    text or glyph element (no meaningful container styles, no slot bindings)
    is collapsed: the wrapper is stripped and the leaf becomes the spec root.
    All-or-nothing across variants — if any variant fails the eligibility
    check, no collapse occurs. Defaults to false.
```

### Notes

- `collapsePrimitiveWrapper` is not added to `required` in the schema — it is optional with a `default` of `false`, matching the pattern for `slotConstraints` and `inferNumberProps`.
- The eligibility criteria (disqualifying container styles, slot-bound root, non-singleton children) are implementation details of `specs-from-figma` and are not expressed in the schema.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — one field added to `Config.processing` in `types/Config.ts`; one property added to `Config.properties.processing.properties` in `schema/workspace.schema.json`. Both carry `false` as default, both are optional in the user-facing contract.
- **Parity check**: `Config.processing.collapsePrimitiveWrapper?: boolean` ↔ `#/definitions/Config/properties/processing/properties/collapsePrimitiveWrapper` (`type: boolean`, `default: false`). Both are absent from `required[]`.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | New config field must be read from `ResolvedConfig` and used to gate the wrapper-collapse pass | Read `config.processing.collapsePrimitiveWrapper`; run collapse only when `true` |
| `specs-plugin-2` | Recompile against updated types; no behavioral change unless the user enables the flag | Recompile; optionally expose toggle in plugin UI |
| `specs-cli` | Recompile against updated types; config resolution and `DEFAULT_CONFIG` merge continue to work as-is | Recompile; no code changes required |

---

## Semver Decision

**Version bump**: `0.25.0 → 0.26.0` (`MINOR`)

**Justification**: All changes are additive — a new optional field on `Config.processing`, a new required field on `ResolvedConfig.processing` (with a guaranteed default), and a new schema property. No existing fields are removed or renamed. Per the constitution's versioning rule: additive types or new optional fields → `MINOR`.

---

## Consequences

- Consumers can opt in to structurally simpler specs for wrapper-only components by setting `processing.collapsePrimitiveWrapper: true` in their config.
- Existing specs and consumers are unaffected — `false` default reproduces the current behavior exactly.
- The anatomy `root` entry for a collapsed component will carry the leaf's element type (`text` or `glyph`) rather than `container`, and `$extensions.com.figma.originalName` will record the original Figma layer name.
- `layout` is cleared on collapsed variants (the wrapper's layout properties are not meaningful on a promoted primitive).
- Any tool validating specs against `schema/workspace.schema.json` will accept the new field after upgrading to the version that ships this ADR.
