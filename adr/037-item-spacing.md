# ADR: Consolidate Item Spacing into a Bi-Axial Model

**Branch**: `037-item-spacing`
**Created**: 2026-04-20
**Status**: ACCEPTED
**Summary**: An `ItemSpacing` type gives `itemSpacing` a bi-axial shape, replacing the separate `counterAxisSpacing` property.
**Decides**: styles.itemSpacing, styles.itemSpacing.horizontal, styles.itemSpacing.vertical
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The `Styles` type currently exposes two separate properties for auto-layout gap spacing:

- `itemSpacing` — gap between children along the primary axis
- `counterAxisSpacing` — gap between wrapped rows/columns (only relevant when `layoutWrap` is enabled)

In Figma's underlying API these are distinct fields (`itemSpacing` and `counterAxisSpacing`), but from a design-system consumer's perspective they represent a single concept: **the gap between items in a layout container**, which may differ between the horizontal and vertical axes.

This mirrors how CSS `gap` works — a single property with `row-gap` and `column-gap` sub-values. The current schema splits this into two unrelated fields with Figma-specific naming (`counterAxisSpacing`) that leaks implementation vocabulary into the shared contract.

---

## Decision Drivers

- **Consumer clarity**: Field names should communicate intent without requiring knowledge of Figma's axis model. `counterAxisSpacing` is opaque to consumers unfamiliar with Figma internals.
- **Structural coherence**: The schema already uses compound objects for related per-axis/per-side values (`padding` → `Sides`, `cornerRadius` → `Corners`). Spacing should follow the same pattern.
- **No abbreviations**: Constitution requires full, unabbreviated words. Both `horizontal` and `vertical` satisfy this.
- **Semver discipline**: Removing `counterAxisSpacing` is a breaking change (field removal). This must be a MAJOR-bump change within this release cycle.
- **Type ↔ Schema symmetry**: Any structural change must be reflected identically in both `types/Styles.ts` and `schema/styles.schema.json`.

---

## Options Considered

### Option A: Bi-axial `itemSpacing` with `{ horizontal, vertical }` model *(Selected)*

Replace both `itemSpacing: Style` and `counterAxisSpacing: Style` with a single field:

```yaml
itemSpacing: Style | ItemSpacing
```

Where `ItemSpacing` is a new interface:

```typescript
interface ItemSpacing {
  horizontal?: Style;
  vertical?: Style;
}
```

When spacing is uniform across both axes (or only one axis applies because wrap is off), the value remains a scalar `Style`. When horizontal and vertical gaps differ, the value becomes an `ItemSpacing` object.

This follows the same scalar-or-object pattern used by `padding` (`Style | Sides`) and `cornerRadius` (`Style | Corners`).

**Pros**:
- Single, well-named property covers both cases
- Matches CSS mental model (`gap` → `row-gap` / `column-gap`)
- Eliminates Figma-specific vocabulary (`counterAxis`) from the public contract
- Follows the established scalar-or-compound pattern already in `Styles`

**Cons / Trade-offs**:
- Breaking change — consumers using `counterAxisSpacing` must migrate
- Axis naming (`horizontal` / `vertical`) is absolute rather than relative to layout direction; this is intentional — it maps to the resolved visual direction rather than requiring consumers to reason about primary/counter axis

---

### Option B: Rename `counterAxisSpacing` to `wrapSpacing` *(Rejected)*

Keep two separate fields but rename `counterAxisSpacing` to something more readable:

```yaml
itemSpacing: Style
wrapSpacing: Style
```

**Rejected because**: Still splits a single concept into two fields. Does not follow the scalar-or-compound pattern. Still a MAJOR bump (rename = removal + addition) with less structural benefit.

---

### Option C: Keep current fields as-is *(Rejected)*

Leave `itemSpacing` and `counterAxisSpacing` unchanged.

**Rejected because**: `counterAxisSpacing` violates the naming clarity driver. The field name requires Figma-specific knowledge to understand. Does not leverage the scalar-or-compound pattern the schema already uses for similar concepts.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Remove field `counterAxisSpacing: Style` | MAJOR |
| `Styles.ts` | Change field `itemSpacing` from `Style` to `Style \| ItemSpacing` | MAJOR |
| `Styles.ts` | Add new interface `ItemSpacing` | MINOR (part of MAJOR) |
| `Styles.ts` | Update `StylePropertyName` union — remove `'counterAxisSpacing'` | MAJOR |

**Example — new shape** (`types/Styles.ts`):

```yaml
# Before
Styles (partial):
  itemSpacing: Style
  counterAxisSpacing: Style

# After
Styles (partial):
  itemSpacing: Style | ItemSpacing

ItemSpacing:
  horizontal?: Style   # gap between items along horizontal axis
  vertical?: Style     # gap between items along vertical axis
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Remove property `counterAxisSpacing` from `Styles/properties` | MAJOR |
| `styles.schema.json` | Change `itemSpacing` from `NumberStyleValue` ref to `ItemSpacingStyleValue` (new oneOf) | MAJOR |
| `styles.schema.json` | Add definition `ItemSpacingValue` (object with optional `horizontal`, `vertical`) | MINOR (part of MAJOR) |
| `styles.schema.json` | Add definition `ItemSpacingStyleValue` (oneOf: number, ItemSpacingValue, TokenReference, null) | MINOR (part of MAJOR) |

**Example — new shape** (`schema/styles.schema.json`):

```yaml
# New definition
ItemSpacingValue:
  type: object
  properties:
    horizontal:
      $ref: "#/definitions/NumberStyleValue"
    vertical:
      $ref: "#/definitions/NumberStyleValue"
  additionalProperties: false

ItemSpacingStyleValue:
  description: "Item spacing. Scalar number when uniform; ItemSpacingValue when axes differ."
  oneOf:
    - type: number
    - $ref: "#/definitions/ItemSpacingValue"
    - $ref: "#/definitions/TokenReference"
    - type: "null"

# Updated property
properties.itemSpacing:
  $ref: "#/definitions/ItemSpacingStyleValue"
  description: "Gap between items. Scalar when uniform; object with horizontal/vertical when axes differ."

# Removed
properties.counterAxisSpacing: (deleted)
```

### Notes

- The `horizontal` / `vertical` naming uses absolute visual axes rather than relative primary/counter terminology. This is consistent with the schema's existing use of absolute directions (e.g., `top`, `end`, `bottom`, `start` in `Sides`).
- When `layoutWrap` is off, only one axis is meaningful and the value will typically be scalar. The `ItemSpacing` object form only appears when both axes have distinct gap values.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**: `ItemSpacing` interface ↔ `ItemSpacingValue` schema definition; `Style | ItemSpacing` union on `itemSpacing` field ↔ `ItemSpacingStyleValue` oneOf; `counterAxisSpacing` removed from both type and schema simultaneously.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Breaking — field rename affects output shape | Update any references to `counterAxisSpacing` in formatting/display logic. Consumers of CLI output must handle the new `itemSpacing` object form. |

---

## Semver Decision

**Version bump**: `0.18.0` (`MAJOR` relative to 0.x convention — field removal is breaking)

**Justification**: Removing `counterAxisSpacing` and changing the type of `itemSpacing` from `Style` to `Style | ItemSpacing` constitutes removal and restructuring of existing public API fields. Per constitution III: "Removing or renaming an exported type or a named field within a type is a breaking change and MUST follow semantic versioning." Under 0.x conventions, this is captured by the minor version bump (0.17 → 0.18).

---

## Consequences

- Consumers can represent horizontal and vertical item gaps in a single, coherent property using familiar axis terminology
- The Figma-specific term `counterAxisSpacing` is eliminated from the public contract
- All consumers validating against `styles.schema.json` must update to handle the new `itemSpacing` oneOf shape
- The scalar-or-compound pattern (`Style | CompoundType`) is reinforced as the standard approach for multi-value style properties
- `specs-from-figma` and `anova-plugin` will need to map Figma's `itemSpacing` + `counterAxisSpacing` fields into the new unified structure (managed by their own release processes)
