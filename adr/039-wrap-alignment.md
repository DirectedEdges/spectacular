# ADR: Replace `layoutWrap` and `counterAxisAlignContent` with `wrap` and `wrapAlignment`

**Branch**: `039-wrap-alignment`
**Created**: 2026-04-20
**Status**: ACCEPTED
**Summary**: `wrap` and `wrapAlignment` with a `WrapAlignment` enum replace `layoutWrap` and `counterAxisAlignContent`.
**Decides**: layoutMode, start, wrap, wrapAlignment
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The `Styles` type currently exposes two Figma-derived properties for layout wrapping:

- `layoutWrap: Style` — a boolean-like value indicating whether auto-layout wrapping is enabled
- `counterAxisAlignContent: Style` — controls space distribution across the counter axis when wrapping is active; Figma values are `'AUTO'` and `'SPACE_BETWEEN'`

These names are direct Figma API pass-throughs. They have two problems:

1. **`layoutWrap` is redundant with the `layout` prefix** — the property already lives inside a layout-aware context. The simpler name `wrap` is sufficient and consistent with CSS terminology.
2. **`counterAxisAlignContent` is opaque** — the name describes a Figma implementation detail (counter-axis alignment of content lines) rather than the user-facing concept it represents: how wrapped lines are spaced. `wrapAlignment` captures the intent directly and is only meaningful when `wrap` is true.

The current string union for `counterAxisAlignContent` (`'AUTO' | 'SPACE_BETWEEN'`) uses Figma's internal enum names. The values should be renamed to match the schema's own vocabulary (`START`, `SPACE_BETWEEN`) while retaining ALL CAPS casing consistent with other Styles-level enums like `LayoutMode`.

---

## Decision Drivers

- **Platform-neutral naming**: Field names should describe what a property means to consumers, not mirror Figma's internal API naming
- **Minimal, stable API** (Constitution III): Renaming fields is a breaking change; the new names should be durable enough to avoid a second rename
- **Types and schema symmetry** (Constitution I): Both artifacts must be updated together
- **Clarity over Figma fidelity**: `wrapAlignment` is only meaningful when `wrap: true`; this semantic dependency should be documented
- **Precedent consistency**: ADR 038 established the pattern of narrowing structural layout properties from generic `Style` to dedicated string literal union types (e.g., `LayoutMode`). `wrapAlignment` should follow the same pattern

---

## Options Considered

### Option A: `wrap` + `wrapAlignment` *(Selected)*

Rename `layoutWrap` → `wrap` (boolean) and `counterAxisAlignContent` → `wrapAlignment` (dedicated `WrapAlignment` string literal union: `'START' | 'SPACE_BETWEEN'`). Type the field as `WrapAlignment | null` following the `LayoutMode | null` pattern from ADR 038.

**Pros**:
- `wrap` is concise, CSS-aligned, and self-evident
- `wrapAlignment` clearly scopes its meaning to wrapped layouts
- `WrapAlignment` as a dedicated type narrows the field from generic `Style` to a finite enum, matching the ADR 038 precedent (`LayoutMode`)
- ALL CAPS values (`START`, `SPACE_BETWEEN`) are consistent with the adjacent `LayoutMode` enum and other Styles-level enums

**Cons / Trade-offs**:
- Breaking change: removes two fields and adds two new ones — requires a MAJOR bump within the current release

---

### Option B: Keep Figma names, only remap values *(Rejected)*

Keep `layoutWrap` and `counterAxisAlignContent` but remap `'AUTO'` → `'start'` and `'SPACE_BETWEEN'` → `'spaceBetween'`.

**Rejected because**: Retains opaque Figma naming (`counterAxisAlignContent`) that violates the platform-neutral naming driver. Half-measures create an inconsistent API where some names are platform-neutral and others are not.

---

### Option C: `wrap` + `wrapDistribution` *(Rejected)*

Use `wrap` (same as Option A) but name the alignment property `wrapDistribution`.

**Rejected because**: "distribution" implies a continuous spacing algorithm. The property is a binary choice between start-aligned and space-between — `wrapAlignment` is more accurate for a two-value enum describing line alignment.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Remove field `layoutWrap: Style` | MAJOR |
| `Styles.ts` | Remove field `counterAxisAlignContent: Style` | MAJOR |
| `Styles.ts` | Add field `wrap: Style` | MAJOR (part of rename) |
| `Styles.ts` | Add field `wrapAlignment: WrapAlignment \| null` | MAJOR (part of rename) |
| `Styles.ts` | Add type `WrapAlignment = 'start' \| 'spaceBetween'` | MINOR (new export) |
| `Styles.ts` | Remove `'layoutWrap'` from `StyleKey` union | MAJOR |
| `Styles.ts` | Remove `'counterAxisAlignContent'` from `StyleKey` union | MAJOR |
| `Styles.ts` | Add `'wrap'` to `StyleKey` union | MAJOR (part of rename) |
| `Styles.ts` | Add `'wrapAlignment'` to `StyleKey` union | MAJOR (part of rename) |

**Example — new shape** (`types/Styles.ts`):
```yaml
# Before
Styles:
  layoutWrap: Style
  counterAxisAlignContent: Style

StyleKey:
  - 'layoutWrap'
  - 'counterAxisAlignContent'

# After
WrapAlignment: 'START' | 'SPACE_BETWEEN'   # new exported type

Styles:
  wrap: Style                       # boolean — enables multi-line wrapping (default: false)
  wrapAlignment: WrapAlignment | null  # only meaningful when wrap: true

StyleKey:
  - 'wrap'
  - 'wrapAlignment'
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Remove property `layoutWrap` | MAJOR |
| `styles.schema.json` | Remove property `counterAxisAlignContent` | MAJOR |
| `styles.schema.json` | Add property `wrap` (ref `BooleanStyleValue`) | MAJOR (part of rename) |
| `styles.schema.json` | Add property `wrapAlignment` (ref `WrapAlignmentStyleValue`) | MAJOR (part of rename) |
| `styles.schema.json` | Add definition `WrapAlignmentStyleValue` | MINOR (new definition) |

**Example — new shape** (`schema/styles.schema.json`):
```yaml
# Before
layoutWrap:
  $ref: "#/definitions/StringStyleValue"
  description: "Layout wrap mode"
counterAxisAlignContent:
  $ref: "#/definitions/StringStyleValue"
  description: "Counter axis content alignment"

# After — properties
wrap:
  $ref: "#/definitions/BooleanStyleValue"
  description: "Whether auto-layout wrapping is enabled (default: false)"
wrapAlignment:
  $ref: "#/definitions/WrapAlignmentStyleValue"
  description: "Space distribution between wrapped lines. Only meaningful when wrap is true."

# After — new definition (follows LayoutModeStyleValue pattern)
WrapAlignmentStyleValue:
  description: "Wrap alignment value. Structural property — not token-bindable."
  oneOf:
    - type: string
      enum: [START, SPACE_BETWEEN]
    - type: "null"
```

### Notes

- `wrap` uses `BooleanStyleValue` (not `StringStyleValue`) because the property is a true boolean toggle — this corrects the current `layoutWrap` which was typed as a generic `Style`/`StringStyleValue` despite being boolean in practice.
- `wrapAlignment` uses a dedicated `WrapAlignment` type (`'START' | 'SPACE_BETWEEN'`) and `WrapAlignmentStyleValue` schema definition, following the ADR 038 precedent where `layoutMode` was narrowed from `Style` to `LayoutMode | null`. Both are structural layout properties that are not token-bindable.
- The value mapping from Figma is: `counterAxisAlignContent: 'AUTO'` → `wrapAlignment: 'START'`, `counterAxisAlignContent: 'SPACE_BETWEEN'` → `wrapAlignment: 'SPACE_BETWEEN'` (same value, unchanged).

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — both `types/Styles.ts` and `schema/styles.schema.json` gain `wrap` and `wrapAlignment`, and both lose `layoutWrap` and `counterAxisAlignContent`
- **Parity check**:
  - `Styles.wrap: Style` ↔ `styles.schema.json#/properties/wrap` (`BooleanStyleValue`)
  - `Styles.wrapAlignment: WrapAlignment | null` ↔ `styles.schema.json#/properties/wrapAlignment` (`WrapAlignmentStyleValue`)
  - `WrapAlignment` type ↔ `WrapAlignmentStyleValue` definition (enum: `START`, `SPACE_BETWEEN`)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Recompile | Update any references to `layoutWrap` → `wrap` and `counterAxisAlignContent` → `wrapAlignment` in output formatting or display logic |
| `specs-from-figma` | Update value mapping | Map Figma `layoutWrap` → `wrap` (boolean) and `counterAxisAlignContent` values (`AUTO` → `START`) to new field names and enum values |
| `specs-plugin` | Update value mapping | Same Figma-to-schema mapping changes as `specs-from-figma` |

---

## Semver Decision

**Version bump**: `0.18.0` (MAJOR within pre-1.0 minor — breaking rename of two fields)

**Justification**: Removing `layoutWrap` and `counterAxisAlignContent` and replacing them with `wrap` and `wrapAlignment` constitutes renaming exported fields within a published type — a breaking change per Constitution III. Since the package is pre-1.0, this is absorbed into the current `0.18.0` minor release cycle.

---

## Consequences

- Consumers referencing `layoutWrap` or `counterAxisAlignContent` by name will get compile-time errors after upgrading — the rename is intentionally breaking to force migration
- `wrap` establishes a simpler, CSS-aligned vocabulary that is unlikely to require further renaming
- `wrapAlignment` documents its semantic dependency on `wrap: true` — consumers can safely omit it when wrapping is disabled
- Schema validators accepting `counterAxisAlignContent: 'AUTO'` will need to accept `wrapAlignment: 'START'` instead
