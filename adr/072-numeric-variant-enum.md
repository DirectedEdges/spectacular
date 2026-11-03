# ADR: Numeric Enum on NumberProp

**Branch**: `072-numeric-variant-enum`
**Created**: 2026-08-24
**Status**: ACCEPTED
**Summary**: `NumberProp` carries an `enum` of the numeric values a variant prop accepts, so a numeric variant set keeps its options instead of widening to an unbounded number.
**Decides**: props.number.enum
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

Figma has no numeric variant. A designer who wants a component to carry a count — how many dots a pager shows, which one is selected — authors a VARIANT property whose options are the strings `"1"`, `"2"`, `"3"`, and so on. The transformer reads that faithfully and emits an `EnumProp`: `type: string` with a `string[]` enum.

Consumers then receive a string where the domain has a number. A React scaffold types the prop `"1" | "2" | "3"`, arithmetic on it needs a cast, and a Storybook control renders a select of quoted digits. The same value, authored as a code-only TEXT prop instead, already becomes a `NumberProp` — ADR-029 added that inference behind `inferNumberProps`. Only the variant path is left behind.

**Precedent, twice over.** ADR-029 established that a numeric string from Figma may be re-typed to `number` when a guard makes the inference unambiguous. And the VARIANT path *already* re-types: a property whose options are exactly `"true"`/`"false"` is emitted as `BooleanProp`, not a two-value string enum. Numeric variant inference is the third instance of a rule the schema already lives by — Figma's string is a transport, not the type.

**Current state of `NumberProp`**:
```yaml
NumberProp:
  type: 'number'
  default?: number
  nullable?: boolean
  examples?: number[]
```

There is no way to say "a number, drawn from this closed set". `EnumProp` carries a closed set but fixes `type: 'string'`; `NumberProp` carries the numeric type but leaves the range open. A numeric variant needs both at once, and neither type provides it.

**Gap**: the option set is not incidental — it is the authored content of the variant axis. Dropping it to gain the numeric type would lose what the designer enumerated, and the reverse direction (`figma-from-specs`) rebuilds the variant axis *from* that enum. Losing it would make the round-trip lossy.

---

## Decision Drivers

- **Type/schema parity (Principle I)**: any field added to `NumberProp` lands in `types/Props.ts` and `schema/component.schema.json` together.
- **No logic in this package (Principle II)**: the all-options-numeric test and the existing `isNumericValue` guard live in `specs-from-figma`. This ADR adds a field, not an inference.
- **Lossless round-trip**: the emitted prop must carry enough for `figma-from-specs` to rebuild the same variant axis, in the same order.
- **Additive only**: the field must be optional so every existing `NumberProp` stays valid and the release stays MINOR.
- **Reuse the existing gate**: numeric variant inference is governed by `conventions.figma.inferNumberProps`, the flag ADR-029 introduced. No new configuration surface.

---

## Options Considered

### Option A: Add optional `enum?: number[]` to `NumberProp` *(Selected)*

A numeric variant is emitted as `type: number` with a numeric `default`, a numeric `enum` preserving the authored option order, and an explicit `nullable: false`.

```yaml
selection:
  type: number
  default: 1
  enum: [1, 2, 3, 4, 5, 6, 7, 8]
  nullable: false
```

**Pros**:
- Carries the numeric type and the closed set at once — the two facts a numeric variant holds.
- Round-trip is lossless: the enum is the variant axis, in order, and stringifies back to Figma's option names.
- Purely additive; `NumberProp` without `enum` keeps its present meaning of an open numeric range.
- Mirrors `EnumProp.enum` in name and shape, so the discriminated union stays readable.

**Cons / Trade-offs**:
- `nullable`'s documented default (`true`, open set) now reads oddly for an enumerated number prop. Addressed by emitting `nullable: false` explicitly rather than by changing the default, which would be a breaking reinterpretation of existing specs.
- Two types can now express a closed set, so consumers must check `type` before assuming the enum's element type.

---

### Option B: Widen `EnumProp.enum` to `(string | number)[]` *(Rejected)*

Keep the prop `type: 'string'` and allow numbers among its enum values.

**Rejected because**: it violates the discriminated union — `type: 'string'` would no longer describe the values. A consumer switching on `type` gets `string` and is wrong. It also leaves the prop's `default` a string while its options are numbers.

---

### Option C: Emit `type: number` and drop the option set *(Rejected)*

Re-type to `NumberProp` with `examples`, discarding the enumeration.

**Rejected because**: it violates the lossless round-trip driver. `figma-from-specs` builds the variant axis from the enum; without it the rendered component loses every variant beyond the default, and the designer's authored option set is unrecoverable from the spec.

---

### Option D: A distinct `NumberEnumProp` type *(Rejected)*

Add a fifth prop type alongside `EnumProp` for the numeric case.

**Rejected because**: it fails the minimal-API driver. The discriminant is `type`, and a `NumberEnumProp` would also carry `type: 'number'` — indistinguishable from `NumberProp` without inspecting `enum` anyway. An optional field on the existing type says the same thing with less surface.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Props.ts` | Added optional field `enum?: number[]` to `NumberProp` | MINOR |
| `Props.ts` | Widened the `NumberProp` doc comment to name the VARIANT source | PATCH |

**Example — new shape** (`types/Props.ts`):
```yaml
# Before
NumberProp:
  type: 'number'
  default?: number
  nullable?: boolean
  examples?: number[]

# After
NumberProp:
  type: 'number'
  default?: number
  enum?: number[]      # optional — MINOR
  nullable?: boolean
  examples?: number[]
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Added property `enum` (array of number) to `#/definitions/NumberProp` | MINOR |
| `component.schema.json` | Widened the `NumberProp` description to name the VARIANT source | PATCH |

**Example — new shape** (`schema/component.schema.json`):
```yaml
# New property under #/definitions/NumberProp/properties
enum:
  type: array
  items:
    type: number
  description: "The closed set of accepted values, when the source enumerates them rather than leaving the range open. Absent means the prop accepts any number."
  # not in required[] — optional field
```

### Notes

**Why `nullable` is emitted explicitly.** `NumberProp.nullable` defaults to `true` because an open numeric range admits absence. An enumerated number prop is the opposite case — the enum lists every accepted value — so the reader writes `nullable: false` rather than leaning on the default. The default is left alone: changing it would reinterpret every `NumberProp` already written.

**Why the enum order matters.** The array is the variant axis in the order the designer authored it. `figma-from-specs` reads it positionally when rebuilding the component set, and the first entry is the default variant. Sorting it would silently reorder the designer's panel.

**What does not become a number.** The guard is all-or-nothing across the option set. A single non-numeric option leaves the whole prop a `StringProp` enum — `["2","3","4","5","6","7","8 or more"]` stays a string enum, because `"8 or more"` is a value the domain genuinely holds and no numeric type can represent it.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `NumberProp.enum?: number[]` ↔ `#/definitions/NumberProp/properties/enum` (`type: array`, `items.type: number`), absent from `required[]` in both.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Emits the new shape | Detect an all-numeric VARIANT option set behind `conventions.figma.inferNumberProps`; emit numeric `default`, `enum`, and `nullable: false`. Cast the matching variant configuration values to numbers |
| `figma-from-specs` | Reads the new shape | Treat `type: number` with an `enum` as a variant axis; stringify enum values when naming variants |
| `specs-cli` | Recompile | None beyond picking up the schema version |
| `specs-plugin-2` | Recompile | None — it compiles engine source |
| transformers (`react-from-specs`, `webcomponents-from-specs`) | Richer types available | May narrow a numeric union instead of a string union. Not required by this ADR |

---

## Semver Decision

**Version bump**: `0.31.0` (`MINOR`)

**Justification**: one new optional field on an existing type, with a matching optional schema property. No existing document becomes invalid and no field changes meaning — additive optional field → MINOR per constitution III. The change lands inside the in-flight `0.31.0` release cycle, which is already a MINOR bump.

---

## Consequences

- A numeric variant axis reaches consumers as numbers with a closed set, so a generated union is `1 | 2 | 3` rather than `"1" | "2" | "3"`.
- Two prop types can now carry an `enum`. Consumers must branch on `type` before assuming the element type of the array.
- A mixed option set is unchanged, by design — one non-numeric option keeps the prop a string enum, which is what `itemCount` with `"8 or more"` needs.
- The inference is gated by `conventions.figma.inferNumberProps`, so a library that leaves the flag off sees no change at all.
