# ADR: Stroke Dash Pattern

**Branch**: `059-border-style`
**Created**: 2026-06-26
**Status**: ACCEPTED
**Summary**: A `strokeDashPattern` property adds dashes to strokes already supported with color, weight and alignment.
**Decides**: strokeDashPattern, strokeDashPattern.dash, strokeDashPattern.gap
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`Styles` already carries `strokes` (color), `strokeAlign`, and `strokeWeight` — but has no way to express whether a stroke is dashed or its dash geometry. Figma exposes `strokeDashes` as an array of alternating dash and gap lengths. Code platforms expose dash geometry as a structured object with explicit `dash` and `gap` components.

Without this property, a component spec cannot describe common stroke treatments (dashed outlines, focus rings, divider rules) that are meaningful to both design and code consumers.

---

## Decision Drivers

- **Additive-only**: new fields must be optional to remain `MINOR`
- **Structural, not token-bindable**: dash geometry is a layout primitive in every target platform — not a value that would be token-bound; must use a named structural type (`StrokeDashPattern | null`) rather than `Style`
- **Code-platform naming first**: field names must reflect code-platform consensus before Figma API terminology (constitution rule VI)
- **No redundancy**: presence/absence of the dash pattern object is a complete discriminant between solid and dashed strokes; a separate enum field is not needed if it carries no independent information
- **Naming consistency with existing stroke family**: new fields should share the `stroke` prefix established by `strokes`, `strokeWeight`, and `strokeAlign`
- **Type ↔ schema symmetry**: new types require matching schema definitions

---

## Options Considered

### Option A: `strokeDashPattern` only *(Selected)*

Add a single `strokeDashPattern?: StrokeDashPattern | null` field to `Styles`. Presence signals a dashed stroke; absence (or `null`) signals a solid stroke. No separate style enum.

**Pros**:
- Presence/absence is a complete discriminant — `null` means solid, `{ dash, gap }` means dashed
- No redundancy: a `strokeStyle: DASHED` field without a `strokeDashPattern` is incomplete; the geometry *is* the style declaration
- Naming is consistent with the existing `stroke*` family (`strokes`, `strokeWeight`, `strokeAlign`)
- Simpler contract — one field instead of two; consumers check for presence, not enum value

**Cons / Trade-offs**:
- Consumers that want to emit `DASHED` without specifying geometry cannot do so — but Figma always provides explicit `strokeDashes` values, so this case does not arise in practice

---

### Option B: `strokeStyle` + `strokeDashPattern` *(Rejected)*

Add both a `strokeStyle: 'SOLID' | 'DASHED' | null` enum field and a `strokeDashPattern` geometry field.

**Rejected because**: `strokeStyle` is fully redundant — its value can always be inferred from whether `strokeDashPattern` is present. Two fields for one concept without independent information violates the minimal-surface driver. Additionally, `strokeStyle` risks reader confusion: `strokes` is the color field in this same `Styles` object, and `strokeStyle` sounds like a style variant of that color rather than a line-style enum.

---

### Option C: `borderStyle` + `borderDashPattern` *(Rejected)*

Use the `border` prefix (`borderStyle: 'SOLID' | 'DASHED'`, `borderDashPattern: { dash, gap }`) following the CSS box-model vocabulary.

**Rejected because**: CSS box model is the only major platform that uses "border" for this concept. SwiftUI uses `StrokeStyle` / `.stroke()`; Jetpack Compose uses `Stroke` and `PathEffect.dashPathEffect`. The existing `Styles` fields already establish the `stroke` prefix for this semantic family. Switching to `border` would create an inconsistent naming split within the same object — `strokes`/`strokeWeight`/`strokeAlign` on one side, `borderStyle`/`borderDashPattern` on the other — for no cross-platform naming gain.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Add `StrokeDashPattern` interface — `{ dash: number; gap: number }` | MINOR |
| `Styles.ts` | Add `strokeDashPattern?: StrokeDashPattern \| null` to `Styles` | MINOR |
| `Styles.ts` | Add `'strokeDashPattern'` to `StyleKey` union | MINOR |

**Example — new type** (`types/Styles.ts`):

```yaml
StrokeDashPattern:
  dash: number   # dash segment length in pixels
  gap: number    # gap segment length in pixels
```

**Example — new Styles field**:

```yaml
# Before
styles:
  strokes: "#FF0000"
  strokeWeight: 2

# After — strokeDashPattern presence indicates a dashed stroke
styles:
  strokes: "#FF0000"
  strokeWeight: 2
  strokeDashPattern:
    dash: 8
    gap: 4
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Add `StrokeDashPattern` definition — object with required `dash` and `gap` (both `number`) | MINOR |
| `styles.schema.json` | Add `StrokeDashPatternStyleValue` definition — `oneOf [StrokeDashPattern, null]` | MINOR |
| `styles.schema.json` | Add `strokeDashPattern` property to `Styles` referencing `StrokeDashPatternStyleValue` | MINOR |

**Example — new schema definitions** (`schema/styles.schema.json`):

```yaml
StrokeDashPattern:
  type: object
  description: "Dash geometry for a dashed stroke. dash and gap are in pixels."
  properties:
    dash:
      type: number
      description: "Dash segment length in pixels"
    gap:
      type: number
      description: "Gap segment length in pixels"
  required: [dash, gap]
  additionalProperties: false

StrokeDashPatternStyleValue:
  description: >
    Dash pattern for a stroke. Present (non-null) when the stroke is dashed;
    null or absent when the stroke is solid. Structural property — not token-bindable.
  oneOf:
    - $ref: "#/definitions/StrokeDashPattern"
    - type: null

# New Styles property
Styles.properties.strokeDashPattern:
  $ref: "#/definitions/StrokeDashPatternStyleValue"
  description: >
    Dash geometry for a dashed stroke. Presence indicates a dashed stroke;
    null or absent indicates solid. dash and gap are in pixels.
```

### Notes

- `strokeDashPattern` is not token-bindable — it is a structural property typed as a named type rather than `Style`, consistent with `LayoutMode`, `Position`, and `WrapAlignment`.
- Solid strokes are represented by omitting `strokeDashPattern` or setting it to `null`. No separate `strokeStyle` field is needed.
- Figma's `strokeDashes` array maps to `{ dash, gap }` using index 0 and 1. Patterns with more than two alternating values collapse to the first pair — transformer responsibility, not schema.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `StrokeDashPattern` → `StrokeDashPattern` definition (object `{ dash, gap }`)
  - `Styles.strokeDashPattern` → `Styles.properties.strokeDashPattern`
  - `StyleKey` addition is type-only; no schema counterpart needed (it is an internal utility type, not schema-serialized)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | New optional output field | Map Figma `strokeDashes` array to `strokeDashPattern: { dash, gap }` when non-empty; omit or emit `null` when the stroke is solid |
| `specs-cli` | Recompile against new types | No behavior change; new field passes through to output automatically |
| `specs-plugin-2` | Recompile against new types | No behavior change; new field rendered by existing style output path |

---

## Semver Decision

**Version bump**: `0.26.x → 0.27.0` (`MINOR`)

**Justification**: One new optional field on an existing type. No existing type signature, field name, or schema property is removed or renamed. Additive change → `MINOR` per constitution versioning rule.

---

## Consequences

- Consumers can represent dashed stroke treatments (dashed outlines, focus rings, divider rules) in component specs
- `strokeDashPattern` is a nullable structural property — consumers that do not support dashed strokes can safely ignore it
- Solid strokes require no change to existing output; the field is absent when not applicable
- Any tool validating against `schema/styles.schema.json` must update to the new version to accept the new property
