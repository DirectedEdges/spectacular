# ADR: Gradient Support for Color Style Properties

**Branch**: `003-gradients`
**Created**: 2026-02-25
**Status**: ACCEPTED
**Summary**: Gradient types and a `ColorStyle` alias let `backgroundColor`, `textColor` and `strokes` carry linear, radial and angular gradients.
**Decides**: styles.backgroundColor, styles.strokes, styles.textColor
**Deciders**: Nathan Curtis
**Supersedes**: *(none)*

---

## Context

Anova's `types/Styles.ts` defines `backgroundColor`, `textColor`, and `strokes` as `Style` values — the catch-all union for any serialisable style property. The schema, however, already has a more specific definition for these three fields:

In `schema/styles.schema.json`, `ColorStyleValue` is used for all color-bearing properties:

```yaml
ColorStyleValue:
  oneOf:
    - type: string          # hex/rgba
    - $ref: VariableStyle
    - $ref: FigmaStyle
    - type: null
```

Figma uses **gradient fills** (LINEAR, RADIAL, ANGULAR, and DIAMOND paint types) as a first-class alternative to solid color fills. DIAMOND is Figma-only and has no native equivalent across CSS, iOS, or Android — it is excluded from this ADR. When a node's `backgroundColor`, `textColor`, or `strokes` is a gradient, the current contract has no representation for it. The outcomes today are:

- **Named gradient style** (`fillStyleId` set): captured as `FigmaStyle { id }` — handled.
- **Variable bound to gradient fill**: captured as `VariableStyle { id, rawValue }` — `rawValue` is whatever the raw color processor returns (likely `null` for non-solid).
- **Inline gradient fill (no style, no variable)**: falls through `raw()` → `ColorStyle.value()` → emits `null` because no solid paint is present.

The gap is the **inline gradient case** and the lack of a structured cross-platform shape when gradient data should be emitted rather than just a style reference. `backgroundColor` and `textColor` are treated symmetrically to `strokes` in the fill-style detection pipeline (`FILL_SPEC_KEYS` covers all three).

This ADR also surfaces a type-schema asymmetry: the schema already isolates color properties under `ColorStyleValue`, but `types/Styles.ts` uses the catch-all `Style` for those fields with no corresponding `ColorStyle` TypeScript type. This ADR closes both gaps simultaneously.

---

## Decision Drivers

- **Type-schema symmetry (Constitution I)**: Any change to `types/Styles.ts` must have a matching change in `schema/styles.schema.json` before publish.
- **No logic permitted (Constitution II)**: Only types, interfaces, and schema definitions. No gradient parsing algorithms belong here.
- **Stable, intentional public API (Constitution III)**: New types must represent a genuine shared concept — not Figma internals. `GradientValue` must be cross-platform; Figma-internal constructs (affine transform matrices, DIAMOND type) must be excluded.
- **Minimal structure (Constitution III)**: The type must capture what is needed for cross-platform use, not faithfully mirror Figma's `GradientPaint` (which uses transform matrices and per-stop alpha separately from color).
- **Additive = MINOR (Constitution versioning)**: Adding new optional variants to existing type unions without removing existing ones qualifies as MINOR if no consumer's existing valid code breaks.
- **Strict TypeScript (Constitution V)**: The new interface must compile cleanly under `tsconfig.build.json` with no `any`.
- **`fills` arrays are out of scope**: Anova maps Figma's `fills` array down to the semantic properties `backgroundColor`, `textColor`, and `strokes` — the raw `fills` array is never surfaced in the type or schema contract. Gradient support therefore applies only to those mapped properties; there is no requirement to represent Figma's multi-fill array or its ordering.

---

## Options Considered

### Option A: Discriminated `GradientValue` + new `ColorStyle` type *(Selected)*

Introduce a discriminated union `GradientValue = LinearGradient | RadialGradient | AngularGradient` exported from `types/Gradient.ts`. Introduce a `ColorStyle` type alias in `types/Styles.ts` that mirrors `ColorStyleValue` in the schema. Update `backgroundColor`, `textColor`, and `strokes` to use `ColorStyle` instead of `Style`.

```yaml
# New GradientStop interface
GradientStop:
  position: number              # 0–1 along the gradient vector
  color: string | VariableStyle # hex/rgba or variable reference

# Discriminated variants
LinearGradient:
  type: "LINEAR"
  angle: number   # degrees — required
  stops: GradientStop[]

RadialGradient:
  type: "RADIAL"
  center: { x: number; y: number }   # normalised 0–1 — required
  stops: GradientStop[]

AngularGradient:
  type: "ANGULAR"
  center: { x: number; y: number }   # normalised 0–1 — required
  stops: GradientStop[]

GradientValue: LinearGradient | RadialGradient | AngularGradient

# New ColorStyle type (TypeScript mirror of ColorStyleValue schema)
ColorStyle:
  oneOf:
    - string          # hex/rgba solid color
    - VariableStyle   # variable reference
    - FigmaStyle      # named Figma style reference
    - ReferenceValue  # prop binding
    - GradientValue   # ← new — inline gradient
    - null
```

**Pros**:
- Discriminated union enforces required fields per type at compile time — no optional `angle` leaking onto RADIAL/ANGULAR shapes
- `stops[].color` supports both raw hex and variable references, matching how Figma lets individual stops be bound to variables
- `ColorStyle` closes the type-schema asymmetry: TypeScript consumers now have a named type that maps directly to `ColorStyleValue` in the schema
- DIAMOND excluded — only `LINEAR | RADIAL | ANGULAR` are cross-platform
- Additive — `Style` union is unchanged; only `backgroundColor`, `textColor`, `strokes` fields are narrowed to `ColorStyle`
- Named-style (`FigmaStyle`) and variable (`VariableStyle`) paths are preserved unchanged

**Cons / Trade-offs**:
- Narrowing `backgroundColor` / `textColor` / `strokes` from `Style` to `ColorStyle` is technically a type-level narrowing — existing code assigning a `boolean` to `backgroundColor` would fail to compile, but this was never semantically valid and is unlikely in practice
- `anova-kit` consumers narrowing `Style` values for color fields must update to `ColorStyle`

---

### Option B: Figma `GradientPaint` model *(Rejected)*

Expose Figma's own `GradientPaint` shape: `{ type, gradientTransform: Transform, gradientStops: [{ position, color: {r, g, b, a} }] }`.

**Rejected because**: `gradientTransform` is a 3×2 affine matrix that is Figma-specific and carries no semantic meaning outside Figma. It couples the Anova contract permanently to a single tool's internal representation, violating the cross-platform intent of Constitution III ("genuine, shared concept").

---

### Option C: CSS-like string *(Rejected)*

Accept gradient as a raw CSS string, e.g. `"linear-gradient(90deg, #000 0%, #fff 100%)"`. No new types added — `Style` already accepts `string`.

**Rejected because**: This is structurally opaque. Downstream tools (`anova-kit`, `anova-plugin`) cannot parse or validate gradient intent without reimplementing a CSS gradient parser. It also excludes non-CSS platforms (iOS, Android) from consuming a structured value. Constitution III requires types to represent genuine shared concepts — hiding structure inside a string is the opposite.

---

### Option D: References only — no inline gradient values *(Rejected)*

Do nothing. Gradients must always be expressed via a named Figma style (`FigmaStyle`) or variable (`VariableStyle`). Inline gradients are emitted as `null`.

**Rejected because**: This is a lossy contract — a component with an inline gradient fill would silently emit `null`, making the output schema-valid but semantically wrong. It also does not address the user question about whether `backgroundColor` / `textColor` are handled correctly (they are, via the fill-style path, but the inline case remains broken).

---

### Option E: Platform-specific definitions *(Rejected)*

Add keyed sub-objects per platform, e.g. `{ css: "linear-gradient(...)", swiftUI: { ... }, compose: { ... } }`.

**Rejected because**: This couples the shared type contract to n platform grammars simultaneously, multiplying the maintenance surface in violation of Constitution III (minimal, stable API). Platform adaptation belongs in downstream tooling, not in the shared type definition.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Gradient.ts` | New file — exports `GradientStop`, `GradientCenter`, `LinearGradient`, `RadialGradient`, `AngularGradient`, `GradientValue` | MINOR |
| `Styles.ts` | New `ColorStyle` type alias; `backgroundColor`, `textColor`, `strokes` narrowed from `Style` to `ColorStyle` | MINOR |
| `index.ts` | Add exports for all types from `Gradient.ts`; add `ColorStyle` | MINOR |

**Example — new `types/Gradient.ts`**:
```yaml
# types/Gradient.ts — new file

GradientCenter:          # reusable point type for RADIAL / ANGULAR
  x: number              # normalised 0–1
  y: number              # normalised 0–1

GradientStop:
  position: number        # 0–1
  color: string | VariableStyle   # hex/rgba or variable reference

LinearGradient:
  type: "LINEAR"
  angle: number           # degrees — required
  stops: GradientStop[]

RadialGradient:
  type: "RADIAL"
  center: GradientCenter  # required
  stops: GradientStop[]

AngularGradient:
  type: "ANGULAR"
  center: GradientCenter  # required
  stops: GradientStop[]

GradientValue: LinearGradient | RadialGradient | AngularGradient
```

**Example — new `ColorStyle` type in `types/Styles.ts`**:
```yaml
# Before: backgroundColor / textColor / strokes typed as Style
# (Style is the catch-all union and includes boolean, number, etc.)

# After: a ColorStyle type mirrors ColorStyleValue from the schema
ColorStyle:
  oneOf:
    - string          # hex/rgba solid
    - VariableStyle
    - FigmaStyle
    - ReferenceValue
    - GradientValue   # ← new
    - null

# Styles type — affected fields
Styles:
  backgroundColor: ColorStyle   # was: Style
  textColor: ColorStyle         # was: Style
  strokes: ColorStyle           # was: Style
  # all other fields: Style unchanged
```

---

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | New definitions `GradientCenter`, `GradientStop`, `LinearGradient`, `RadialGradient`, `AngularGradient`, `GradientValue`; `ColorStyleValue` gains `{ "$ref": "#/definitions/GradientValue" }` | MINOR |

**Example — new schema definitions**:
```yaml
# Under #/definitions

GradientCenter:
  type: object
  required: [x, y]
  properties:
    x:
      type: number
      minimum: 0
      maximum: 1
      description: "Horizontal centre position, normalised 0–1"
    y:
      type: number
      minimum: 0
      maximum: 1
      description: "Vertical centre position, normalised 0–1"
  additionalProperties: false

GradientStop:
  type: object
  required: [position, color]
  properties:
    position:
      type: number
      minimum: 0
      maximum: 1
      description: "Stop position along the gradient vector (0–1)"
    color:
      oneOf:
        - type: string
          description: "Stop color as hex or rgba string"
        - $ref: "#/definitions/VariableStyle"
          description: "Stop color as a variable reference"
  additionalProperties: false

LinearGradient:
  type: object
  required: [type, angle, stops]
  properties:
    type:
      type: string
      const: "LINEAR"
    angle:
      type: number
      description: "Angle in degrees"
    stops:
      type: array
      items:
        $ref: "#/definitions/GradientStop"
      minItems: 2
  additionalProperties: false

RadialGradient:
  type: object
  required: [type, center, stops]
  properties:
    type:
      type: string
      const: "RADIAL"
    center:
      $ref: "#/definitions/GradientCenter"
    stops:
      type: array
      items:
        $ref: "#/definitions/GradientStop"
      minItems: 2
  additionalProperties: false

AngularGradient:
  type: object
  required: [type, center, stops]
  properties:
    type:
      type: string
      const: "ANGULAR"
    center:
      $ref: "#/definitions/GradientCenter"
    stops:
      type: array
      items:
        $ref: "#/definitions/GradientStop"
      minItems: 2
  additionalProperties: false

GradientValue:
  oneOf:
    - $ref: "#/definitions/LinearGradient"
    - $ref: "#/definitions/RadialGradient"
    - $ref: "#/definitions/AngularGradient"

# Updated ColorStyleValue
ColorStyleValue:
  oneOf:
    - type: string          # hex/rgba (solid, no change)
    - $ref: VariableStyle   # no change
    - $ref: FigmaStyle      # no change — named gradient style
    - $ref: GradientValue   # ← new — inline gradient
    - type: null            # no change
```

### Notes

- `backgroundColor`, `textColor`, and `strokes` all reference `ColorStyleValue` in the schema; all three gain gradient support implicitly via this single definition change.
- DIAMOND is intentionally excluded — it is not natively representable in CSS, SwiftUI, or Jetpack Compose without approximation, making it unsuitable for the cross-platform contract.
- Each gradient variant is a separate schema object with `const` on its `type` field, enabling JSON Schema validators to discriminate correctly.
- `GradientValue` is distinguishable from `FigmaStyle` / `VariableStyle` / `ReferenceValue` at runtime via the presence of the `type` field with a gradient-specific constant value — the `type` key does not appear on any other `ColorStyle` variant.
- No dedicated `Angle` schema definition is introduced. CSS `linear-gradient()` and equivalent platform APIs treat angle as a wrapping modular value: `-45deg`, `405deg`, and `315deg` are all semantically valid in different contexts. A `minimum: 0, maximum: 360` constraint would cause false validation failures for legitimately out-of-range but equivalent values. The `angle` field remains `type: number` with a description of `"Angle in degrees"` — sufficient to communicate the unit without imposing invalid bounds.

### Rationale

- **Platform Neutrality**: `LINEAR`, `RADIAL`, and `ANGULAR` map directly to native gradient APIs across CSS, SwiftUI, and Jetpack Compose — no platform-specific translation layer is required to consume the shared type.
- **Flexibility**: Allowing `stops[].color` to be either a raw hex/rgba string or a `VariableStyle` reference means individual stop colors can participate in token-based theming without requiring the entire gradient to be wrapped in a named style.
- **Simplicity**: A discriminated union of three concrete variants is easier to narrow and validate than a single flat object with optional fields — each variant carries only the fields that are semantically meaningful for its type.
- **Completeness**: Introducing `ColorStyle` alongside `GradientValue` closes the existing type-schema asymmetry, ensuring every color-bearing property has a precise TypeScript type that corresponds 1:1 with `ColorStyleValue` in the schema.
- **Consistency**: Using `type` as the discriminant key aligns with the existing pattern in `EffectsGroup` and Figma's own paint model, making the contract familiar to consumers already working with those types.
- **Maintainability**: Each gradient variant (`LinearGradient`, `RadialGradient`, `AngularGradient`) is a standalone interface with no shared mutable state, so adding or adjusting a variant in a future ADR requires only an additive change to the `GradientValue` union — no existing variants need modification.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `GradientCenter` (TypeScript) ↔ `#/definitions/GradientCenter` (schema)
  - `GradientStop` (TypeScript) ↔ `#/definitions/GradientStop` (schema)
  - `LinearGradient` (TypeScript) ↔ `#/definitions/LinearGradient` (schema)
  - `RadialGradient` (TypeScript) ↔ `#/definitions/RadialGradient` (schema)
  - `AngularGradient` (TypeScript) ↔ `#/definitions/AngularGradient` (schema)
  - `GradientValue` discriminated union ↔ `#/definitions/GradientValue` oneOf (schema)
  - `ColorStyle` type alias ↔ `#/definitions/ColorStyleValue` (schema)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Recompile; any code narrowing `backgroundColor`, `textColor`, or `strokes` must handle `GradientValue` | Add `type` discriminant guard (`'LINEAR' \| 'RADIAL' \| 'ANGULAR'`) in any switch/if chain over `ColorStyle` values |

---

## Semver Decision

**Version bump**: `0.11.0 → 0.12.0` (`MINOR`)

**Justification**: All changes are additive — new types (`GradientCenter`, `GradientStop`, `LinearGradient`, `RadialGradient`, `AngularGradient`, `GradientValue`, `ColorStyle`) and a narrowing of three existing fields in `Styles` from the catch-all `Style` to the more precise `ColorStyle`. No existing valid gradient-assignment code would have compiled against these fields before (no gradient type existed), so there is no regression. The `Style` union itself is unchanged. Per Constitution versioning rules: "MINOR for additive types or new optional fields."

---

## Consequences

- `backgroundColor`, `textColor`, and `strokes` can now represent inline gradients in the serialized output — no data is silently dropped to `null` for in-file gradient fills.
- The new `ColorStyle` type closes the type-schema asymmetry for color properties: TypeScript consumers now have a named type that maps directly to `ColorStyleValue` in the schema.
- Named gradient Figma styles continue to be emitted as `FigmaStyle { id }` — the reference path is unchanged and preferred.
- Variable-bound gradients continue to emit as `VariableStyle { id, rawValue }` — `rawValue` semantics for gradient variables are deferred (a separate ADR may address what `rawValue` means when the variable resolves to a gradient).
- Individual gradient stops may have their color bound to a variable via `VariableStyle` — this is captured in `GradientStop.color`.
- `anova-kit` consumers must handle `GradientValue` in any code that narrowed over color-property values. TypeScript will surface missing cases at compile time via the `type` discriminant (`'LINEAR' | 'RADIAL' | 'ANGULAR'`).
- DIAMOND gradients remain out-of-scope. A future MAJOR ADR would be required to add them, as DIAMOND has no stable cross-platform equivalent.
- The `type` discriminant field does not collide with any existing `ColorStyle` variant shape, enabling safe runtime narrowing without `instanceof` checks.
