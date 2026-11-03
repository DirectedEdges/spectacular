# ADR: NumberProp — Numeric Property Type

**Branch**: `029-number-prop`
**Created**: 2026-03-17
**Status**: ACCEPTED
**Summary**: A `NumberProp` type and `inferNumberProps` option carry numeric properties alongside boolean, string, enum and slot props.
**Decides**: none
**Deciders**: (author)
**Supersedes**: *(none)*

---

## Context

Figma has no native number type. Numeric values like `maxCharacterCount`, `minRows`, and `tabIndex` are stored as TEXT component properties with string content. The transformer currently emits these as `type: string` props (`StringProp`), which is technically faithful to Figma's representation but semantically wrong for consumers — these values are numbers and should be typed as such.

**Precedent**: Boolean inference already exists. A VARIANT property with exactly the values `"true"` / `"false"` is emitted as `BooleanProp`. Number inference from TEXT props is the same pattern: deterministic when the inference guard is unambiguous, opt-in for the probabilistic case.

**Current state of `AnyProp`**:
```yaml
# types/Props.ts — current union
AnyProp: BooleanProp | StringProp | EnumProp | SlotProp
```

There is no `NumberProp` member in the union, no `type: 'number'` discriminant in the schema, and no `Config.processing` flag to control numeric inference.

**Gap**: Consumers reading a component spec today cannot distinguish a numeric string like `"24"` (a `maxCharacterCount`) from a semantic string like `"Submit"` (a label). Both appear as `StringProp`. A `NumberProp` type makes the distinction explicit in the contract.

---

## Decision Drivers

- **Type/schema parity (Principle I)**: `NumberProp` must be added to both `types/Props.ts` and `schema/component.schema.json` simultaneously. No drift.
- **No logic in this package (Principle II)**: The inference algorithm (parsing, leading-zero guard) lives in `anova-transformer`. This ADR adds only the type and schema; it does not embed parsing logic.
- **Minimal, stable, intentional API (Principle III)**: `NumberProp` represents a genuine shared concept — a numeric-valued component property — needed by all consumers. The `inferNumberProps` flag is a new optional field in `Config.processing`, which is additive.
- **Target release `0.14.0` (in-flight MINOR)**: All changes land within the current `0.14.0` release cycle, which is already a MINOR bump from `0.13.x`. No additional version increment is required.
- **Opt-in inference**: Numeric inference from TEXT props is probabilistic. An opt-in `Config.processing.inferNumberProps` flag ensures consumers that do not want inference are unaffected.

---

## Options Considered

### Option A: Add `NumberProp` + `Config.processing.inferNumberProps` opt-in flag *(Selected)*

Add a first-class `NumberProp` interface (`type: 'number'`, `default?: number`, `examples?: number[]`) to `types/Props.ts` and `AnyProp`. Add `inferNumberProps?: boolean` to `Config.processing`. Mirror both changes in `schema/component.schema.json`.

**Inference guard — values that WILL be inferred as `NumberProp`** (all conditions must hold):
- Source is a TEXT component property with `source.kind === 'codeOnlyProp'`
- The `default` value and every entry in `examples` pass `isNumericValue()`:
  - Not the empty string `""` or bare minus `"-"`
  - No leading zero before another digit (rejects `"007"`, `"0800"`, `"01"`, `"-01"`; allows `"0"`, `"0.5"`, `"-0.5"`)
  - `Number(value)` returns a finite number (not `NaN` or `±Infinity`)

**Values that will NOT be inferred** (remain `StringProp`):
- `"0800"`, `"007"`, `"01"` — leading zero before another digit; likely an identifier or formatted code
- `""` — empty string; no numeric content
- `"-"` — bare minus sign; no numeric content
- Any value where `Number(v)` returns `NaN` or `±Infinity`

**Values that WILL be inferred** (notable cases):
- `"1.0"`, `"2.0"` — trailing `.0` passes all guards; `Number("1.0")` → `1`
- `"0"`, `"0.5"`, `"-0.5"` — zero or zero-prefixed decimals are allowed
- `"-42"`, `"3.14"` — standard negative and decimal numbers

**Known false positives** (will be inferred, but may not be intended as numbers):
- `"90210"` — passes all guard conditions (no leading zero, finite, non-empty); inferred as `NumberProp` even though it is a zip code
- `"1.0"` — passes guards but could be a version string rather than a number

These false positives are the canonical examples of why the flag is opt-in: the guard is a heuristic and callers accept responsibility for false positives when enabling it.

**Pros**:
- Satisfies Principle I: symmetric type + schema addition.
- Satisfies Principle II: no logic added to this package — the inference guard lives in `anova-transformer`.
- Satisfies Principle III: `NumberProp` is a genuine shared concept; opt-in flag avoids forcing inference on consumers.
- `default` and `examples` are optional — aligns with `StringProp` which also has optional `default`.

**Cons / Trade-offs**:
- Adds a new discriminant (`type: 'number'`) to `AnyProp`; downstream consumers doing exhaustive type checks must handle the new branch.
- The leading-zero guard is a heuristic — edge cases exist (e.g., `"1.0"` as a version string, `"90210"` as a zip code), which is why the flag remains opt-in.

---

### Option B: Emit numeric values as `StringProp` with a semantic annotation *(Rejected)*

Keep `StringProp` but add a `format: 'number'` or similar metadata field to signal that the string content is numeric.

**Rejected because**: Creates implicit dual semantics on `StringProp` — consumers must inspect both `type` and `format` to determine the value's actual type. Violates the discriminated-union contract that the `type` field is the single source of truth. Also inconsistent with the `BooleanProp` precedent, which uses a distinct type discriminant.

---

### Option C: Always infer (no opt-in flag) *(Rejected)*

Emit `NumberProp` whenever the inference guard passes, without a `Config.processing` flag.

**Rejected because**: Numeric inference is probabilistic. `"0800"`, `"1.0"` (version string), and `"90210"` pass a naive `Number()` check but are not intended as numbers. An always-on inference would produce silent regressions for consumers with legitimate numeric-looking string props. Opt-in gives consumers explicit control.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Props.ts` | Add `NumberProp` interface | in-flight MINOR (`0.14.0`) |
| `Props.ts` | Add `NumberProp` to `AnyProp` union | in-flight MINOR (`0.14.0`) |
| `Config.ts` | Add `inferNumberProps?: boolean` to `Config.processing` | in-flight MINOR (`0.14.0`) |

**Before → After: `AnyProp`** (`types/Props.ts`):
```yaml
# Before
AnyProp: BooleanProp | StringProp | EnumProp | SlotProp

# After
AnyProp: BooleanProp | StringProp | EnumProp | SlotProp | NumberProp
```

**New type: `NumberProp`** (`types/Props.ts`):
```yaml
NumberProp:
  type: 'number'          # discriminant
  default?: number        # optional — omitted when no meaningful default exists
  examples?: number[]     # sample numeric values for documentation
```

**Before → After: `Config.processing`** (`types/Config.ts`):
```yaml
# Before
processing:
  subcomponentNamePattern: string
  glyphNamePattern?: string
  variantDepth: 1 | 2 | 3 | 9999
  details: 'FULL' | 'LAYERED'

# After
processing:
  subcomponentNamePattern: string
  glyphNamePattern?: string
  variantDepth: 1 | 2 | 3 | 9999
  details: 'FULL' | 'LAYERED'
  inferNumberProps?: boolean     # opt-in: infer NumberProp from numeric TEXT code-only props
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `NumberProp` definition under `#/definitions` | in-flight MINOR (`0.14.0`) |
| `component.schema.json` | Add `{ "$ref": "#/definitions/NumberProp" }` to `AnyProp.oneOf` | in-flight MINOR (`0.14.0`) |
| `component.schema.json` | Add `inferNumberProps` optional boolean to `Config.processing.properties` | in-flight MINOR (`0.14.0`) |

**New definition: `NumberProp`** (`schema/component.schema.json`):
```yaml
# Under #/definitions/NumberProp
NumberProp:
  type: object
  properties:
    type:
      type: string
      const: number
    default:
      type: number
    examples:
      type: array
      items:
        type: number
      description: Sample numeric values demonstrating typical content for this prop
  required:
    - type
  patternProperties:
    "^\\$": {}
  additionalProperties: false
```

**Updated `AnyProp.oneOf`** (`schema/component.schema.json`):
```yaml
# Before
AnyProp:
  oneOf:
    - $ref: '#/definitions/BooleanProp'
    - $ref: '#/definitions/StringProp'
    - $ref: '#/definitions/EnumProp'
    - $ref: '#/definitions/SlotProp'

# After
AnyProp:
  oneOf:
    - $ref: '#/definitions/BooleanProp'
    - $ref: '#/definitions/StringProp'
    - $ref: '#/definitions/EnumProp'
    - $ref: '#/definitions/SlotProp'
    - $ref: '#/definitions/NumberProp'
```

**Updated `Config.processing`** (`schema/component.schema.json`):
```yaml
# New property under #/definitions/Config/properties/processing/properties
inferNumberProps:
  type: boolean
  description: "When true, TEXT code-only props whose default and all examples pass isNumericValue (non-empty, no bare minus, no leading zeros before digits, finite) are emitted as NumberProp instead of StringProp"
# NOT added to required[] — optional field
```

### Notes

- `NumberProp.default` is optional (not in `required[]`) to mirror `StringProp`, which also has an optional `default`. Some numeric props may not have a meaningful default.
- `NumberProp.examples` mirrors `StringProp.examples` — an array of sample values for documentation purposes.
- `Config.processing.inferNumberProps` is optional and defaults to absent (falsy), preserving existing behavior for all current consumers.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `NumberProp` (interface in `types/Props.ts`) ↔ `#/definitions/NumberProp` (object definition in `schema/component.schema.json`)
  - `AnyProp` union (`types/Props.ts`) ↔ `AnyProp.oneOf` array (`schema/component.schema.json`)
  - `Config.processing.inferNumberProps` (`types/Config.ts`) ↔ `#/definitions/Config/properties/processing/properties/inferNumberProps` (`schema/component.schema.json`)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | New `NumberProp` member in `AnyProp` union; new optional `inferNumberProps` in `Config.processing` | Recompile; add exhaustive-switch handling for `type: 'number'` where `AnyProp` is branched on; optionally pass `inferNumberProps: true` in config to enable inference |

---

## Semver Decision

**Version bump**: none — ships within `0.14.0` (in-flight MINOR)

**Justification**: `0.14.0` is already a MINOR release cycle. All changes here are additive — a new optional type (`NumberProp`) in the `AnyProp` union and a new optional field (`inferNumberProps`) in `Config.processing`. No existing type, field, or schema property is removed or renamed. Per constitution Additional Constraints: "MINOR for additive types or new optional fields." No additional version increment is needed beyond the already-planned `0.14.0`.

---

## Consequences

- Consumers can now represent numeric-valued component properties (`maxCharacterCount`, `minRows`, `tabIndex`, etc.) as `NumberProp` in the spec output, preserving semantic type information.
- The `AnyProp` union gains a fifth discriminant (`type: 'number'`); any exhaustive type-switch over `AnyProp` must be updated to handle `NumberProp`.
- `Config.processing.inferNumberProps` is opt-in and absent by default — existing consumers and specs are unaffected until they enable the flag.
- The inference guard (TEXT source, code-only prop, all values pass `isNumericValue` — non-empty, no bare minus, no leading zeros before digits, finite) is enforced in `anova-transformer`, not in this package. This ADR records only the contract change.
- Enum props with numeric values (e.g., `1 | 2 | 3 | 4`) are out of scope for this ADR. If Figma represents them as VARIANT properties, they continue to emit as `EnumProp` with string members. A separate ADR may address `NumberEnumProp` if that need arises.
