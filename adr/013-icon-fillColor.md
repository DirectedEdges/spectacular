# ADR: Add `fillColor` style property for icon elements

**Branch**: `013-icon-fillColor`
**Created**: 2026-03-09
**Status**: ACCEPTED
**Summary**: A `fillColor` property colors icon elements alongside `backgroundColor`, `textColor` and `strokes`.
**Decides**: backgroundColor, fillColor, strokes, textColor
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The `Styles` type currently has two color-fill properties:

- `backgroundColor` — present on all non-text element types (frames, rectangles, components, etc.), representing the node's fill layer
- `textColor` — present on TEXT element types only, representing the text fill

Icon elements (ICON element type) carry a fill color that is semantically distinct from both: it is neither a background fill of a container nor a text fill. Icons use their fill to colorize glyph content. Today there is no dedicated property for this, forcing icon fill to piggyback on `backgroundColor`, which misrepresents its semantic role.

A dedicated `fillColor` property gives consumers a clear signal that the color applies to an icon glyph, enabling correct platform mapping (e.g., `tintColor` on iOS, `colorFilter` on Android, `color` on SVG icons in web).

---

## Decision Drivers

- **Additive-only change**: New optional field avoids a MAJOR bump; all existing output remains valid
- **Type ↔ schema symmetry**: Both `types/Styles.ts` and `schema/styles.schema.json` must be updated together
- **No runtime logic**: This package defines the field shape only; extraction logic belongs in `anova-transformer`
- **Semantic clarity**: Each color property should map to a distinct element-type role — background fills, text fills, and icon fills are different concepts

---

## Options Considered

### Option A: Add `fillColor` as a new `ColorStyle` property *(Selected)*

Add a new optional `fillColor` field to `Styles` with the same `ColorStyle` type used by `backgroundColor`, `textColor`, and `strokes`.

```yaml
# types/Styles.ts — new field in Styles
fillColor: ColorStyle;   # optional (Partial<>)

# schema/styles.schema.json — new property in Styles
fillColor:
  $ref: "#/definitions/ColorStyleValue"
  description: "Icon fill color. Present on ICON element type only."
```

**Pros**:
- Consistent with existing color property pattern (`backgroundColor`, `textColor`)
- Reuses the established `ColorStyle` / `ColorStyleValue` type — no new definitions needed
- Additive optional field — MINOR bump only

**Cons / Trade-offs**:
- Adds another color property to `Styles`, increasing the surface area slightly

---

### Option B: Reuse `backgroundColor` for icons with no schema change *(Rejected)*

Continue emitting icon fill as `backgroundColor` and rely on consumers to infer semantics from the element type.

**Rejected because**: Violates the semantic clarity driver. Consumers would need to cross-reference element type to interpret `backgroundColor` correctly, and the property description ("Background fill color. Present on all non-text element types") misrepresents the icon case. The spec contract should be self-describing.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Added optional field `fillColor: ColorStyle` to `Styles` | MINOR |
| `Styles.ts` | Added `'fillColor'` to `StyleKey` union | MINOR |
| `Styles.ts` | Updated `ColorStyle` JSDoc to include `fillColor` | PATCH |

**Example — new shape** (`types/Styles.ts`):
```yaml
# Before
Styles (Partial):
  backgroundColor: ColorStyle
  textColor: ColorStyle

# After
Styles (Partial):
  backgroundColor: ColorStyle
  fillColor: ColorStyle        # optional — MINOR
  textColor: ColorStyle
```

**`StyleKey` addition**:
```yaml
# After — new member
StyleKey:
  - 'fillColor'   # added alongside existing color keys
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Added property `fillColor` referencing `ColorStyleValue` to `Styles` | MINOR |

**Example — new shape** (`schema/styles.schema.json`):
```yaml
# New property under #/definitions/Styles/properties
fillColor:
  $ref: "#/definitions/ColorStyleValue"
  description: "Icon fill color. Present on ICON element type only. Represented in Figma as fills."
  # not in required[] — optional field
```

### Notes

- `fillColor` uses the same `ColorStyle` / `ColorStyleValue` type as `backgroundColor`, `textColor`, and `strokes`. All four are color-semantic properties that support inline color values, token references, gradients, and null.
- The property is placed between `backgroundColor` and `textColor` in the `Styles` definition for logical grouping among color properties.
- The `ColorStyle` JSDoc comment is updated to list `fillColor` alongside the other three color properties.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**: `fillColor: ColorStyle` in `types/Styles.ts` maps to `"fillColor": { "$ref": "#/definitions/ColorStyleValue" }` in `schema/styles.schema.json`. `'fillColor'` added to `StyleKey` union. No asymmetry.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Recompile — new optional field available in typed output | None required; `fillColor` will appear in output when `anova-transformer` populates it for icon elements |

---

## Semver Decision

**Version bump**: `0.13.0` (`MINOR`)

**Justification**: All changes are additive optional fields and a new union member — no existing fields are removed or renamed. MINOR per constitution §III ("MINOR for additive types or new optional fields").

---

## Consequences

- Consumers can distinguish icon fill color from background fill color in spec output
- Platform code generators can map `fillColor` to platform-appropriate icon tint APIs
- `anova-transformer` will need to populate `fillColor` for ICON element types (managed via its own change workflow)
- The `ColorStyle` JSDoc and schema descriptions accurately reflect all four color-semantic properties
