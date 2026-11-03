# ADR: Layout Positioning — Constraint-Based Naming

**Branch**: `041-layout-positioning`
**Created**: 2026-04-27
**Status**: ACCEPTED
**Summary**: `Position` and `PositionOffset` types describe constraint-based placement, replacing `x`, `y` and `layoutPositioning`.
**Decides**: bottom, centerHorizontalOffset, centerVerticalOffset, end, layoutMode, position, start, top
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The current `Styles` type exposes three Figma-derived positioning properties:

- `x` — horizontal pixel offset
- `y` — vertical pixel offset
- `layoutPositioning` — `"AUTO"` or `"ABSOLUTE"` string controlling whether a child participates in auto-layout

These names mirror the Figma API verbatim. However, `x` and `y` are opaque to platform consumers — they carry no information about *how* the element is anchored. Figma's `constraints` property (MIN, MAX, CENTER, STRETCH, SCALE per axis) determines anchor semantics, but that information is currently discarded at the schema boundary.

Meanwhile, `layoutPositioning` uses Figma's internal API name rather than the CSS-aligned `position` concept familiar to web and native platform engineers.

This creates two gaps:

1. **Lost anchor semantics**: A consumer receiving `x: 24` has no way to know whether `24` means "24 px from the left edge" (MIN constraint), "24 px from the right edge" (MAX), or "centered with a 24 px offset" (CENTER). This forces every downstream platform to re-derive semantics that should be declared at the schema level.
2. **Figma-coupled naming**: `layoutPositioning` is Figma jargon; `x`/`y` are axis-raw. Code-centric consumers expect CSS-aligned property names like `position`, `top`, `start`, `bottom`, `end`.

---

## Decision Drivers

- **Code-centric naming**: Property names should align with platform concepts (CSS logical/physical positioning) rather than Figma API names
- **Semantic completeness**: The schema should capture the *meaning* of a positional value (which edge it anchors to), not just the raw number
- **Additive-only change path**: New properties can be added as MINOR; removing `x`, `y`, and `layoutPositioning` is MAJOR — the ADR must define a clean deprecation/removal path
- **Type and schema symmetry**: Every type change must have a corresponding schema change (Constitution I)
- **No runtime logic in this package**: The constraint-to-property mapping is a transformation concern for `specs-from-figma`, not for `specs-schema` (Constitution II)

---

## Options Considered

### Option A: Constraint-Based Positioning Properties *(Selected)*

Replace `x`, `y`, and `layoutPositioning` with semantically richer properties derived from Figma's `constraints`:

**New types:**

- `Position` — `'AUTO' | 'ABSOLUTE'` string literal union. Structural property that cannot be token-bound (same pattern as `LayoutMode`, `MainAxisAlignment`, etc.)
- `PositionOffset` — `number | string | null`. A pixel value (`number`), a percentage string (`string`, e.g. `"25%"` for SCALE), or `null`. Narrower than `Style` — excludes `TokenReference`, `PropBinding`, and `Conditional` since positional offsets are computed from Figma layout, not token-bindable.

**New properties on `Styles`:**

| Property | Type | When present |
|----------|------|-------------|
| `position` | `Position \| null` | Always (replaces `layoutPositioning`) — `"AUTO"` or `"ABSOLUTE"` |
| `top` | `PositionOffset` | Vertical constraint is `MIN`, `STRETCH`, or `SCALE` |
| `bottom` | `PositionOffset` | Vertical constraint is `MAX` or `STRETCH` |
| `start` | `PositionOffset` | Horizontal constraint is `MIN`, `STRETCH`, or `SCALE` |
| `end` | `PositionOffset` | Horizontal constraint is `MAX` or `STRETCH` |
| `centerHorizontalOffset` | `PositionOffset` | Horizontal constraint is `CENTER` |
| `centerVerticalOffset` | `PositionOffset` | Vertical constraint is `CENTER` |

**Constraint mapping logic** (performed by `specs-from-figma`, not this package):

| Figma Constraint | Horizontal → | Vertical → | Dimension |
|-----------------|--------------|------------|-----------|
| `MIN` | `start` (px from inline-start edge) | `top` (px from block-start edge) | preserved |
| `MAX` | `end` (px from inline-end edge) | `bottom` (px from block-end edge) | preserved |
| `CENTER` | `centerHorizontalOffset` (px offset from center) | `centerVerticalOffset` (px offset from center) | preserved |
| `STRETCH` | `start` + `end` (both edges) | `top` + `bottom` (both edges) | `width`/`height` → `null` |
| `SCALE` | `start` (percentage string, e.g. `"25%"`) | `top` (percentage string, e.g. `"25%"`) | `width`/`height` → `null` |

For `STRETCH`, both edge properties are emitted simultaneously (e.g., `start` + `end` or `top` + `bottom`).

For `SCALE`, the value is emitted on the same property as `MIN` (`start` or `top`) but as a percentage string instead of a pixel number, signaling proportional positioning to consumers.

**Dimension suppression for `STRETCH` and `SCALE`**: When a constraint yields `STRETCH` or `SCALE` on an axis, the corresponding dimension (`width` for horizontal, `height` for vertical) is explicitly set to `null` on that variant. The rationale:

- **STRETCH**: The element's size is determined by the container minus the two edge offsets (`start` + `end` or `top` + `bottom`). An explicit pixel dimension is meaningless — it would conflict with the edge-defined sizing. This mirrors CSS behavior where `left: 0; right: 0` on an absolutely positioned element implicitly defines width.
- **SCALE**: The element scales proportionally with its container. A fixed pixel dimension would contradict the proportional intent.

This suppression is per-variant — a component may have one variant with `STRETCH` (width nulled) and another with `MIN` (width preserved).

**Removed properties:** `x`, `y`, `layoutPositioning`

**Pros**:
- Consumers immediately know anchor semantics without re-deriving from Figma constraints
- Names align with CSS logical properties (`start`/`end`) and physical properties (`top`/`bottom`)
- `position` is universally understood across web, iOS, and Android platforms
- `STRETCH` naturally decomposes into two edges, matching how CSS `inset` works
- `SCALE` represented as percentage strings avoids type ambiguity (number vs. percentage)

**Cons / Trade-offs**:
- Breaking change: removes three existing properties (`x`, `y`, `layoutPositioning`)
- Requires `specs-from-figma` to implement constraint-to-property mapping transformation
- `centerHorizontalOffset` / `centerVerticalOffset` are longer names, but they're unambiguous

---

### Option B: Keep `x`/`y`, Add Constraint Metadata *(Rejected)*

Keep `x`, `y`, and `layoutPositioning` unchanged. Add a new `constraints` composite object alongside them that describes the anchor mode per axis.

```yaml
# Example output
x: 24
y: 16
layoutPositioning: "ABSOLUTE"
constraints:
  horizontal: "MIN"
  vertical: "CENTER"
```

**Rejected because**: This duplicates information — the consumer still receives `x: 24` and must cross-reference `constraints.horizontal` to interpret it. The schema grows without improving ergonomics. Consumers already have the raw numbers; the gap is in naming and semantics, not in missing metadata.

---

### Option C: Do Nothing *(Rejected)*

Keep the current `x`, `y`, and `layoutPositioning` properties unchanged.

**Rejected because**: Consumers remain unable to determine anchor semantics from the schema output alone. Every platform integration must independently solve the same mapping problem that should be resolved at the schema level. This violates the "semantic completeness" driver.

---

## Decision

### Type changes (`types/Styles.ts`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Remove field `x` | MAJOR |
| `Styles.ts` | Remove field `y` | MAJOR |
| `Styles.ts` | Remove field `layoutPositioning` | MAJOR |
| `Styles.ts` | Add type `Position` (`'AUTO' \| 'ABSOLUTE'`) | MINOR |
| `Styles.ts` | Add type `PositionOffset` (`number \| string \| null`) | MINOR |
| `Styles.ts` | Add optional field `position: Position \| null` | MINOR |
| `Styles.ts` | Add optional field `top: PositionOffset` | MINOR |
| `Styles.ts` | Add optional field `bottom: PositionOffset` | MINOR |
| `Styles.ts` | Add optional field `start: PositionOffset` | MINOR |
| `Styles.ts` | Add optional field `end: PositionOffset` | MINOR |
| `Styles.ts` | Add optional field `centerHorizontalOffset: PositionOffset` | MINOR |
| `Styles.ts` | Add optional field `centerVerticalOffset: PositionOffset` | MINOR |
| `Styles.ts` | Update `StyleKey` union: remove `'x'`, `'y'`, `'layoutPositioning'`; add `'position'`, `'top'`, `'bottom'`, `'start'`, `'end'`, `'centerHorizontalOffset'`, `'centerVerticalOffset'` | MAJOR |

**Example — new shape** (`types/Styles.ts`):
```yaml
# Before
Styles:
  x: Style
  y: Style
  layoutPositioning: Style

# After — new types
Position: 'AUTO' | 'ABSOLUTE'      # structural enum, not token-bindable
PositionOffset: number | string | null  # px number, percentage string, or null

# After — new properties on Styles
Styles:
  position: Position | null         # replaces layoutPositioning
  top: PositionOffset               # vertical: MIN, STRETCH, or SCALE
  bottom: PositionOffset            # vertical: MAX or STRETCH
  start: PositionOffset             # horizontal: MIN, STRETCH, or SCALE
  end: PositionOffset               # horizontal: MAX or STRETCH
  centerHorizontalOffset: PositionOffset  # horizontal: CENTER
  centerVerticalOffset: PositionOffset    # vertical: CENTER
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Remove properties `x`, `y`, `layoutPositioning` | MAJOR |
| `styles.schema.json` | Add definition `Position` (enum: `AUTO`, `ABSOLUTE`) | MINOR |
| `styles.schema.json` | Add definition `PositionOffset` (number, string, or null) | MINOR |
| `styles.schema.json` | Add properties `position`, `top`, `bottom`, `start`, `end`, `centerHorizontalOffset`, `centerVerticalOffset` | MINOR |

**Example — new shape** (`schema/styles.schema.json`):
```yaml
# Removed properties
x: { $ref: "#/definitions/NumberStyleValue" }
y: { $ref: "#/definitions/NumberStyleValue" }
layoutPositioning: { $ref: "#/definitions/StringStyleValue" }

# New definitions
Position:
  type: string
  enum: [AUTO, ABSOLUTE]
  description: "Layout positioning mode. Structural — not token-bindable."

PositionOffset:
  description: "Positional offset value. Pixel number, percentage string (SCALE), or null."
  oneOf:
    - type: number
    - type: string
    - type: "null"

# New properties
position:
  description: "Layout positioning mode — AUTO (participates in parent auto-layout) or ABSOLUTE"
  oneOf:
    - $ref: "#/definitions/Position"
    - type: "null"
top:
  $ref: "#/definitions/PositionOffset"
  description: "Offset from block-start (top) edge. Present when vertical constraint is MIN, STRETCH, or SCALE."
bottom:
  $ref: "#/definitions/PositionOffset"
  description: "Offset from block-end (bottom) edge. Present when vertical constraint is MAX or STRETCH."
start:
  $ref: "#/definitions/PositionOffset"
  description: "Offset from inline-start edge. Present when horizontal constraint is MIN, STRETCH, or SCALE."
end:
  $ref: "#/definitions/PositionOffset"
  description: "Offset from inline-end edge. Present when horizontal constraint is MAX or STRETCH."
centerHorizontalOffset:
  $ref: "#/definitions/PositionOffset"
  description: "Horizontal offset from center. Present when horizontal constraint is CENTER."
centerVerticalOffset:
  $ref: "#/definitions/PositionOffset"
  description: "Vertical offset from center. Present when vertical constraint is CENTER."
```

### Notes

- **Narrower than `Style`**: Both `Position` and `PositionOffset` are deliberately narrower than the general `Style` type. Positional values are computed from Figma's layout engine — they cannot be token-bound, prop-bound, or conditional. This follows the precedent set by `LayoutMode`, `MainAxisAlignment`, `CrossAxisAlignment`, and `WrapAlignment`.
- `position` is `Position | null` — the `null` case follows the same pattern as `layoutMode: LayoutMode | null` for properties that may be absent.
- `PositionOffset` is `number | string | null` — `number` for pixel values, `string` for percentage values (SCALE constraint, e.g. `"25%"`), `null` when absent.
- Only properties relevant to the node's constraints are emitted. A node with horizontal `MIN` + vertical `CENTER` would produce `start`, `centerVerticalOffset`, and `position` — no other positioning fields.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — every removed and added type field has a corresponding schema property change
- **Parity check**:
  - `Styles.position` ↔ `styles.schema.json#/definitions/StylesObject/properties/position`
  - `Styles.top` ↔ `…/properties/top`
  - `Styles.bottom` ↔ `…/properties/bottom`
  - `Styles.start` ↔ `…/properties/start`
  - `Styles.end` ↔ `…/properties/end`
  - `Styles.centerHorizontalOffset` ↔ `…/properties/centerHorizontalOffset`
  - `Styles.centerVerticalOffset` ↔ `…/properties/centerVerticalOffset`

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Must implement constraint-to-property mapping: read Figma `constraints` per axis and emit the appropriate directional property instead of raw `x`/`y`. Rename `layoutPositioning` → `position` in output. When constraint is `STRETCH` or `SCALE`, set `width` (horizontal) or `height` (vertical) to `null` on the variant. | Implement new transformation logic for constraint mapping; add dimension suppression for STRETCH/SCALE; update style key references |
| `specs-cli` | Recompile against updated types. No logic change — the CLI passes through whatever `specs-from-figma` produces. | Recompile |
| `specs-plugin` | Recompile against updated types. Same passthrough behavior as CLI. | Recompile |

---

## Semver Decision

**Version bump**: `0.18.0 → 0.19.0` (`MINOR` within pre-1.0 — removing fields before 1.0 is acceptable as a minor bump per pre-1.0 convention)

**Justification**: The package is pre-1.0. Removing `x`, `y`, and `layoutPositioning` while adding replacement properties constitutes a breaking schema change, but pre-1.0 semver allows breaking changes in MINOR bumps. This change ships in the `0.19.0` release.

---

## Consequences

- Consumers receive semantically meaningful positioning properties that map directly to CSS positioning concepts
- The `x`/`y` ambiguity is eliminated — every positional value now indicates which edge it's anchored to
- `STRETCH` is naturally represented as two simultaneous edge values, matching CSS `inset` behavior
- `SCALE` (percentage) is distinguishable from pixel values by string type (`"25%"` vs `24`)
- `CENTER` gets dedicated offset properties, avoiding overloading `top`/`start` with center semantics
- `STRETCH` and `SCALE` suppress `width`/`height` respectively, preventing conflicting size declarations — the dimension is edge-defined or proportional, not fixed
- `specs-from-figma` must implement the constraint-aware transformation (including dimension suppression) — this is the primary implementation cost
- All existing test fixtures containing `x`, `y`, or `layoutPositioning` will need updating across `specs-testing`
