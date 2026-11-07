# ADR: Replace `primaryAxisAlignItems` and `counterAxisAlignItems` with `mainAxisAlignment` and `crossAxisAlignment`

**Branch**: `040-layout-alignment`
**Created**: 2026-04-23
**Status**: ACCEPTED
**Summary**: `mainAxisAlignment` and `crossAxisAlignment` with named enums replace `primaryAxisAlignItems` and `counterAxisAlignItems`.
**Decides**: styles.crossAxisAlignment, styles.mainAxisAlignment
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The `Styles` type currently exposes two Figma-derived properties for layout alignment:

- `primaryAxisAlignItems: Style` — controls alignment of children along the primary layout axis
- `counterAxisAlignItems: Style` — controls alignment of children perpendicular to the primary axis

These names are direct Figma API pass-throughs (`primaryAxisAlignItems`, `counterAxisAlignItems`). They have two problems:

1. **Figma-specific vocabulary**: `primaryAxis` and `counterAxis` are Figma internal naming. Platform-standard terminology uses `mainAxis` and `crossAxis` (CSS Flexbox, SwiftUI). The current names leak Figma implementation details into the shared contract.
2. **Over-broad typing**: Both fields are typed as `Style`, accepting `number`, `boolean`, `PropBinding`, `Conditional`, and `TokenReference`. In practice, these are structural layout declarations with a finite set of valid string values. They are never token-bound, never prop-bound, and never conditional.

ADR 038 (`LayoutMode`) and ADR 039 (`WrapAlignment`) established the pattern for narrowing structural layout properties from generic `Style` to dedicated string literal union types. Alignment properties should follow the same pattern.

---

## Decision Drivers

- **Platform-neutral naming** (Constitution — no abbreviations, clarity over Figma fidelity): Field names should match cross-platform conventions, not Figma's internal API naming
- **Type precision**: The public contract should reflect the actual value domain. Structural layout enums should not accept impossible values (numbers, booleans, conditionals)
- **Precedent consistency**: ADR 038 (`LayoutMode`) and ADR 039 (`WrapAlignment`) established the pattern for typed structural layout enums. Alignment should follow the same approach
- **Consumer safety**: Narrowing to a string literal union enables exhaustive switch/match without impossible-value fallbacks
- **Semver discipline**: Renaming fields and narrowing types is a breaking change

---

## Options Considered

### Option A: `mainAxisAlignment` + `crossAxisAlignment` with axis-relative enum types *(Selected)*

Rename `primaryAxisAlignItems` → `mainAxisAlignment` and `counterAxisAlignItems` → `crossAxisAlignment`. Type each as a dedicated string literal union (`MainAxisAlignment | null` and `CrossAxisAlignment | null`) following the `LayoutMode | null` pattern from ADR 038.

Value sets:
- `MainAxisAlignment`: `'START' | 'END' | 'CENTER' | 'SPACE_BETWEEN'`
- `CrossAxisAlignment`: `'START' | 'END' | 'CENTER' | 'STRETCH' | 'BASELINE'`

**Pros**:
- `mainAxis` / `crossAxis` is the standard vocabulary across CSS Flexbox and SwiftUI
- Dedicated enums make valid values self-documenting in the schema
- Follows the precedent set by `LayoutMode` and `WrapAlignment`
- Enables exhaustive pattern matching in consumers

**Cons / Trade-offs**:
- Breaking change — renames two fields and narrows their types
- Consumers must update references to both the old field names and the old type

---

### Option B: Dimension-absolute naming (`horizontalAlignment`, `verticalAlignment`) *(Rejected)*

Use absolute axis names instead of relative main/cross terminology.

**Rejected because**: Axis-relative naming is the platform consensus (CSS Flexbox, SwiftUI, Figma itself). Dimension-absolute naming would require consumers to reason about layout direction when interpreting the values, since "horizontal alignment" means different things in horizontal vs vertical layouts. This also loses the direct conceptual mapping to the `layoutMode` property from ADR 038.

---

### Option C: Keep Figma names, only narrow the types *(Rejected)*

Keep `primaryAxisAlignItems` and `counterAxisAlignItems` but narrow from `Style` to enum types.

**Rejected because**: Retains opaque Figma naming that violates the platform-neutral naming driver. Half-measures create an inconsistent API where some layout properties use platform-neutral names (`wrap`, `wrapAlignment`, `layoutMode`) while others retain Figma-specific names.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Remove field `primaryAxisAlignItems: Style` | MAJOR |
| `Styles.ts` | Remove field `counterAxisAlignItems: Style` | MAJOR |
| `Styles.ts` | Add field `mainAxisAlignment: MainAxisAlignment \| null` | MAJOR (part of rename) |
| `Styles.ts` | Add field `crossAxisAlignment: CrossAxisAlignment \| null` | MAJOR (part of rename) |
| `Styles.ts` | Add type `MainAxisAlignment = 'START' \| 'END' \| 'CENTER' \| 'SPACE_BETWEEN'` | MINOR (new export) |
| `Styles.ts` | Add type `CrossAxisAlignment = 'START' \| 'END' \| 'CENTER' \| 'STRETCH' \| 'BASELINE'` | MINOR (new export) |
| `Styles.ts` | Remove `'primaryAxisAlignItems'` from `StyleKey` union | MAJOR |
| `Styles.ts` | Remove `'counterAxisAlignItems'` from `StyleKey` union | MAJOR |
| `Styles.ts` | Add `'mainAxisAlignment'` to `StyleKey` union | MAJOR (part of rename) |
| `Styles.ts` | Add `'crossAxisAlignment'` to `StyleKey` union | MAJOR (part of rename) |

**Example — new shape** (`types/Styles.ts`):
```yaml
# Before
Styles:
  primaryAxisAlignItems: Style
  counterAxisAlignItems: Style

StyleKey:
  - 'primaryAxisAlignItems'
  - 'counterAxisAlignItems'

# After
MainAxisAlignment: 'START' | 'END' | 'CENTER' | 'SPACE_BETWEEN'   # new exported type
CrossAxisAlignment: 'START' | 'END' | 'CENTER' | 'STRETCH' | 'BASELINE'   # new exported type

Styles:
  mainAxisAlignment: MainAxisAlignment | null    # primary axis alignment (depends on layoutMode)
  crossAxisAlignment: CrossAxisAlignment | null  # cross axis alignment (perpendicular to layoutMode)

StyleKey:
  - 'mainAxisAlignment'
  - 'crossAxisAlignment'
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Remove property `primaryAxisAlignItems` | MAJOR |
| `styles.schema.json` | Remove property `counterAxisAlignItems` | MAJOR |
| `styles.schema.json` | Add property `mainAxisAlignment` (ref `MainAxisAlignmentStyleValue`) | MAJOR (part of rename) |
| `styles.schema.json` | Add property `crossAxisAlignment` (ref `CrossAxisAlignmentStyleValue`) | MAJOR (part of rename) |
| `styles.schema.json` | Add definition `MainAxisAlignmentStyleValue` | MINOR (new definition) |
| `styles.schema.json` | Add definition `CrossAxisAlignmentStyleValue` | MINOR (new definition) |

**Example — new shape** (`schema/styles.schema.json`):
```yaml
# Before
primaryAxisAlignItems:
  $ref: "#/definitions/StringStyleValue"
  description: "Primary axis item alignment"
counterAxisAlignItems:
  $ref: "#/definitions/StringStyleValue"
  description: "Counter axis item alignment"

# After — properties
mainAxisAlignment:
  $ref: "#/definitions/MainAxisAlignmentStyleValue"
  description: "Alignment along the main axis (depends on layoutMode). Structural property — not token-bindable."
crossAxisAlignment:
  $ref: "#/definitions/CrossAxisAlignmentStyleValue"
  description: "Alignment along the cross axis (perpendicular to layoutMode). Structural property — not token-bindable."

# After — new definitions (follow LayoutModeStyleValue pattern)
MainAxisAlignmentStyleValue:
  description: "Main axis alignment value. Structural property — not token-bindable."
  oneOf:
    - type: string
      enum: [START, END, CENTER, SPACE_BETWEEN]
    - type: "null"

CrossAxisAlignmentStyleValue:
  description: "Cross axis alignment value. Structural property — not token-bindable."
  oneOf:
    - type: string
      enum: [START, END, CENTER, STRETCH, BASELINE]
    - type: "null"
```

### Notes

- `TokenReference` is intentionally excluded — Figma does not support variable-binding for alignment properties. This follows the `LayoutMode` and `WrapAlignment` precedent (structural properties, not token-bindable).
- `null` is retained because alignment fields are optional on `Styles` (it's `Partial<{...}>`), and the schema allows null for absent/omitted values.
- The Figma value mapping is: `primaryAxisAlignItems: 'MIN'` → `mainAxisAlignment: 'START'`, `'MAX'` → `'END'`, `'CENTER'` → `'CENTER'`, `'SPACE_BETWEEN'` → `'SPACE_BETWEEN'`. For cross axis: `counterAxisAlignItems: 'MIN'` → `crossAxisAlignment: 'START'`, `'MAX'` → `'END'`, `'CENTER'` → `'CENTER'`, `'STRETCH'` → `'STRETCH'`, `'BASELINE'` → `'BASELINE'`.
- `BASELINE` is included on `CrossAxisAlignment` despite limited Android support because it is well-supported on CSS and iOS and represents valid Figma output.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — both `types/Styles.ts` and `schema/styles.schema.json` gain `mainAxisAlignment` and `crossAxisAlignment`, and both lose `primaryAxisAlignItems` and `counterAxisAlignItems`
- **Parity check**:
  - `Styles.mainAxisAlignment: MainAxisAlignment | null` ↔ `styles.schema.json#/properties/mainAxisAlignment` (`MainAxisAlignmentStyleValue`)
  - `Styles.crossAxisAlignment: CrossAxisAlignment | null` ↔ `styles.schema.json#/properties/crossAxisAlignment` (`CrossAxisAlignmentStyleValue`)
  - `MainAxisAlignment` type ↔ `MainAxisAlignmentStyleValue` definition (enum: `START`, `END`, `CENTER`, `SPACE_BETWEEN`)
  - `CrossAxisAlignment` type ↔ `CrossAxisAlignmentStyleValue` definition (enum: `START`, `END`, `CENTER`, `STRETCH`, `BASELINE`)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Recompile | Update any references to `primaryAxisAlignItems` → `mainAxisAlignment` and `counterAxisAlignItems` → `crossAxisAlignment` in output formatting or display logic |

---

## Semver Decision

**Version bump**: `0.18.0` (MAJOR within pre-1.0 minor — breaking rename and type narrowing of two fields)

**Justification**: Removing `primaryAxisAlignItems` and `counterAxisAlignItems` and replacing them with `mainAxisAlignment` and `crossAxisAlignment` constitutes renaming exported fields within a published type — a breaking change per Constitution III. Additionally, narrowing the type from `Style` to a string literal union removes previously valid type branches. Under 0.x conventions, this is absorbed into the current `0.18.0` minor release cycle.

---

## Consequences

- Consumers referencing `primaryAxisAlignItems` or `counterAxisAlignItems` by name will get compile-time errors after upgrading — the rename is intentionally breaking to force migration
- `mainAxisAlignment` / `crossAxisAlignment` use standard flexbox vocabulary that aligns with CSS, SwiftUI, and Figma conceptual models
- Valid values are self-documenting via schema enum constraints — no need to consult Figma docs
- `TokenReference` is excluded, accurately reflecting that alignment cannot be variable-bound in Figma
- Pattern of narrowing structural layout properties to typed enums is now applied consistently across `layoutMode`, `wrapAlignment`, `mainAxisAlignment`, and `crossAxisAlignment`
- Alignment semantics depend on `layoutMode` (ADR 038) — `mainAxisAlignment` controls the horizontal axis when `layoutMode: 'HORIZONTAL'` and the vertical axis when `layoutMode: 'VERTICAL'`
