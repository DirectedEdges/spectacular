# ADR: Add `aspectRatio` to `Styles`

**Branch**: `004-aspect-ratio`
**Created**: 2026-02-25
**Status**: ACCEPTED
**Summary**: An `aspectRatio` property carries an `x`/`y` ratio object on styles alongside width and height.
**Decides**: styles.aspectRatio, styles.aspectRatio.x, styles.aspectRatio.y, styles.cornerRadius, styles.height, styles.width
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`Styles` in `types/Styles.ts` and `#/definitions/Styles` in `schema/styles.schema.json` represent every serialisable style property emitted by the Anova Figma plugin. Currently there is no field for aspect ratio constraints — a property Figma exposes on frame and component nodes when a fixed ratio is locked.

Without an `aspectRatio` field, consumers cannot reconstruct whether a node was authored with a locked ratio, nor can they re-apply that constraint when generating code. The gap is especially visible for responsive layout tokens where "16:9 container" is a first-class design intent.

Four candidate representations were evaluated before selecting one.

---

## Decision Drivers

- **Type–schema sync**: Every new field in `types/Styles.ts` must have a corresponding `#/definitions/Styles` property and a new or reused value-type definition in `schema/styles.schema.json` — no drift.
- **Additive only**: The change must introduce only an optional field, keeping the bump MINOR and avoiding breaking downstream consumers.
- **No runtime logic**: No parsing helpers, no conversion functions. The chosen representation must be emittable directly from the Figma API without transformation inside this package.
- **Lossless fidelity**: The serialised form must round-trip without information loss; derived/computed representations that discard original operands are lower priority.
- **Minimal surface**: Prefer the simplest shape that satisfies the above; do not introduce auxiliary types unless required.
- **Strict-safe**: All new types must compile under `strict` TypeScript with no `any`.

---

## Options Considered

### Option A: `{ x: number; y: number }` object *(Selected)*

An object with integer (or rational) numerator and denominator components representing the two sides of the ratio.

```yaml
# Example output
aspectRatio:
  x: 16
  y: 9
```

**Pros**:
- Lossless — preserves both operands exactly as authored; round-trips without ambiguity.
- No parsing required in `anova-plugin` or `anova-transformer`; values are pulled directly from the Figma API ratio fields.
- Structurally consistent with existing two-component objects in the schema (`GradientCenter`, `Shadow` x/y) — reviewers can orient quickly.
- Trivially mappable to CSS (`aspect-ratio: 16 / 9`), SwiftUI (`.aspectRatio(16/9, ...)`), Compose, etc.
- No variable binding required — aspect ratio is a structural constraint authored as literal numbers in Figma, not a token-driven value.

**Cons / Trade-offs**:
- Slightly more verbose in JSON than a single number or string.
- Both `x` and `y` are required — a node with an irrational ratio (e.g., `1.618`) must still be expressed as `{ x: 1.618, y: 1 }`, which is valid but unusual.

---

### Option B: `string` *(Rejected)*

Represent the ratio as a human-readable string such as `"16:9"` or `"4:3"`.

**Rejected because**: Requires a parse step (`:` delimiter or `/` delimiter?) in every consumer package. Parsing logic belongs in `anova-transformer` or `anova-kit`, not in the schema contract. A string type is also too permissive — schema validation cannot enforce ratio semantics without a regex, which is fragile and not extensible to variable references. Violates the "lossless, parseable-free contract" implied by Constitution § II.

---

### Option C: `number` (pre-computed ratio) *(Rejected)*

Represent the ratio as a single floating-point number, e.g. `1.7778` for 16:9.

**Rejected because**: Loses the original operands (16 and 9). Consumers cannot reconstruct `aspect-ratio: 16 / 9` in CSS or a human-legible fraction for documentation without reverse-engineering the float, which is lossy and imprecise. Round-trip fidelity (Decision Driver 3) is violated.

---

### Option D: Enum of fixed values *(Rejected)*

A string union such as `"SQUARE" | "WIDESCREEN" | "PORTRAIT" | "ULTRAWIDE"`.

**Rejected because**: Figma does not enumerate ratios as named constants — it exposes a numeric pair. Mapping from that pair to a closed enum requires transformation logic that belongs in a downstream package, not in this contract package. The enum would also become stale as design systems introduce custom ratios outside the set. Violates Constitution § II (no logic) and § III (unstable, non-minimal API).

---

## Decision

Add `aspectRatio` as an optional field on `Styles`, using a new `AspectRatioValue` object type and a corresponding `AspectRatioStyleValue` schema definition.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Added optional field `aspectRatio: AspectRatioStyle` to `Styles` and `StyleKey` union | MINOR |
| `Styles.ts` | Added exported interface `AspectRatioValue { x: number; y: number }` | MINOR |
| `Styles.ts` | Added exported type `AspectRatioStyle = AspectRatioValue \| null` | MINOR |

**Example — new shape** (`types/Styles.ts`):
```yaml
# Before
Styles:
  cornerRadius?: Style
  # ... (no aspectRatio)

# After
Styles:
  cornerRadius?: Style
  aspectRatio?: AspectRatioStyle   # optional — MINOR

AspectRatioValue:
  x: number   # numerator (e.g. 16)
  y: number   # denominator (e.g. 9)

AspectRatioStyle: AspectRatioValue | null
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Added `aspectRatio` property to `#/definitions/Styles/properties` | MINOR |
| `styles.schema.json` | Added `AspectRatioValue` object definition to `#/definitions` | MINOR |
| `styles.schema.json` | Added `AspectRatioStyleValue` definition to `#/definitions` | MINOR |

**Example — new definitions** (`schema/styles.schema.json`):
```yaml
# New definition: #/definitions/AspectRatioValue
AspectRatioValue:
  type: object
  description: "Aspect ratio expressed as a numerator/denominator pair."
  properties:
    x:
      type: number
      description: "Ratio numerator (e.g. 16 for 16:9)"
    y:
      type: number
      description: "Ratio denominator (e.g. 9 for 16:9)"
  required: [x, y]
  additionalProperties: false

# New definition: #/definitions/AspectRatioStyleValue
AspectRatioStyleValue:
  description: "Aspect ratio value. Object pair when set; null when no ratio constraint is active."
  oneOf:
    - $ref: "#/definitions/AspectRatioValue"
    - type: "null"

# Addition to #/definitions/Styles/properties
aspectRatio:
  $ref: "#/definitions/AspectRatioStyleValue"
  description: "Aspect ratio constraint. Present only when the node has a locked ratio."
```

### Notes

- `AspectRatioValue` uses `x` / `y` rather than `width` / `height` or `numerator` / `denominator` for consistency with the existing `x` / `y` pair convention in `Shadow` and `GradientCenter`.
- **Naming — `AspectRatioValue` over `Vector`**: Figma's API uses the term `Vector` for generic `{x, y}` pairs, but a shared `Vector` primitive was rejected here. The existing schema precedent is specialised, scoped types (`GradientCenter` rather than a generic point). Ratio `{x, y}` is semantically distinct from positional `{x, y}` — the components are a numerator and denominator, not coordinates. A shared `Vector` primitive would require broader justification under Constitution § III; if three or more properties converge on the same two-number pair shape, that case warrants its own ADR.
- **No `VariableStyle`**: Aspect ratio in Figma is a structural lock expressed as literal numbers, not a variable token. Including `VariableStyle` in the union would misrepresent the Figma API surface and add schema permissiveness without any current emitter support. Unlike `cornerRadius` or `width`, there is no Figma variable mode that drives aspect ratio at authoring time.
- `aspectRatio` is **not** added to the `Styles` `required` array — it is omitted from output when no ratio constraint is active, preserving the existing sparse-output contract.
- `ReferenceValue` (prop binding) is intentionally excluded — aspect ratio is not a bindable prop in the Figma API at this time.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `AspectRatioValue` (TypeScript interface) ↔ `#/definitions/AspectRatioValue` (JSON Schema object)
  - `AspectRatioStyle = AspectRatioValue | null` (TypeScript type alias) ↔ `#/definitions/AspectRatioStyleValue` (JSON Schema `oneOf` of object + null)
  - `Styles.aspectRatio` (optional field) ↔ `#/definitions/Styles/properties/aspectRatio` (optional property, not in `required`)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Recompile | Update to `@directededges/anova@0.12.0`; no usage change required — field is new optional |

---

## Semver Decision

**Version bump**: `0.11.0` (included in this release; no additional bump required)

---

## Consequences

- Consumers can now represent a locked aspect ratio constraint in serialised `Styles` output.
- `anova-plugin` can emit `aspectRatio` for nodes with a ratio lock; emission is opt-in (field omitted when not set).
- `anova-transformer` can read and forward `aspectRatio` without transformation — the `{x, y}` shape maps directly to CSS `aspect-ratio: x / y`, SwiftUI `.aspectRatio(x/y, ...)`, and Compose `aspectRatio(x/y)`.
- Schema consumers (runtime validators) must update to `v0.12.0` to validate documents containing `aspectRatio`; documents without the field remain valid against both `v0.11.0` and `v0.12.0`.
- `StyleKey` union in `types/Styles.ts` must include `'aspectRatio'` to keep the key enumeration in sync with the `Styles` interface — this is a compile-time parity check, not a runtime contract change.
