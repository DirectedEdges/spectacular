# ADR: Slot Quantity and Content Constraints

**Branch**: `028-slot-constraints`
**Created**: 2026-03-16
**Status**: ACCEPTED
**Summary**: `minItems`, `maxItems` and `anyOf` on `SlotProp`, with a `slotConstraints` option, describe what a slot accepts.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`SlotProp` currently describes a slot's default content, nullability, and platform extensions, but has no way to express **how many items** a slot accepts or **which component types** are permitted. These constraints are essential for slots that represent repeating items — e.g., an avatar group that requires 1–4 `Avatar` instances.

In Figma, these constraints cannot be enforced visually because slots are inherently open. Designers encode them as **code-only props** (ADR 027) on the slot's container layer — props named things like "Min Items", "Max Items", and "Permitted Items". The transformer detects these code-only props and needs a first-class place to express them in the spec output.

Unlike general code-only props (which carry provenance metadata via `$extensions`), slot constraints describe **intrinsic slot semantics** — they define what the slot *is*, not where the data came from. This justifies promoting them to first-class `SlotProp` fields rather than burying them under platform extensions.

A secondary design question is how to express permitted content types. The values are component names (e.g., `"Avatar"`, `"Badge"`), which raises the question of whether they should be plain strings (consistent with `instanceOf` on `AnatomyElement`) or structured references (e.g., `$ref`-style pointers to component definitions).

---

## Decision Drivers

- **Intrinsic semantics over provenance**: Slot constraints describe the slot's contract, not its Figma origin — they belong on the type itself, not in `$extensions`
- **Additive-only change**: All new fields must be optional to remain a MINOR bump
- **Type ↔ Schema symmetry**: Every type field must have a corresponding schema property (Constitution §I)
- **No runtime logic**: Only type declarations and schema — no validation functions (Constitution §II)
- **Consistent naming**: Field names should leverage familiar vocabulary — `anyOf`, `minItems`, and `maxItems` deliberately echo JSON Schema's array-constraint keywords for intuitive semantics
- **Alignment with existing patterns**: `instanceOf` on `AnatomyElement` is a plain string; new component-name references should follow the same convention unless there's a strong reason to diverge

---

## Options Considered

### Option A: First-class `SlotProp` fields with `anyOf`, `minItems`, `maxItems` *(Selected)*

Add three optional fields directly to `SlotProp`:

- `minItems?: number` — minimum item count
- `maxItems?: number` — maximum item count
- `anyOf?: string[]` — permitted component type names

```yaml
# SlotProp — new shape
items:
  type: slot
  default: null
  nullable: true
  minItems: 1
  maxItems: 4
  anyOf:
    - Avatar
```

**Pros**:
- Constraints are immediately visible at the prop level — no indirection through `$extensions`
- All three names deliberately echo JSON Schema's array-constraint vocabulary (`minItems`, `maxItems`, `anyOf`), making the semantics immediately intuitive to anyone familiar with JSON Schema
- `anyOf` as a property name inside `SlotProp.properties` is just a data field — the JSON Schema keyword only has special meaning at the schema validation level, not inside property definitions
- Plain strings are consistent with `instanceOf` on `AnatomyElement` — component names are already strings throughout the schema
- All fields optional — purely additive MINOR change

**Cons / Trade-offs**:
- Plain strings offer no structural validation that the named component exists; this is acceptable because `instanceOf` already uses the same pattern without structural validation

---

### Option B: First-class fields with `$ref`-style references for permitted types *(Rejected)*

Same as Option A for `minItems`/`maxItems`, but `anyOf` would use structured references:

```yaml
anyOf:
  - $ref: "avatar#/definitions/Component"
  - $ref: "badge#/definitions/Component"
```

**Rejected because**:
- No existing cross-component reference mechanism exists in the schema — `instanceOf` and all other component-name fields use plain strings
- Introduces a reference resolution requirement that no consumer currently implements
- The anova spec describes a single component; cross-component references would require a registry concept that doesn't exist yet
- Over-engineering for the current use case — string names are sufficient and consistent

---

### Option C: Encode constraints inside `$extensions["com.figma"]` *(Rejected)*

Keep `SlotProp` unchanged and store constraints under the Figma platform extension:

```yaml
items:
  type: slot
  $extensions:
    com.figma:
      type: INSTANCE_SWAP
      source:
        kind: codeOnlyProp
        layer: Items
      minItems: 1
      maxItems: 4
      anyOf: [Avatar]
```

**Rejected because**:
- Slot constraints are platform-agnostic semantics, not Figma provenance metadata — a code implementation would enforce the same min/max regardless of whether the spec came from Figma
- Consumers would need to reach into platform extensions to read fundamental slot behavior, violating the principle that `$extensions` is supplementary metadata
- Conflates two concerns: where the data came from (provenance) and what the slot means (semantics)

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Props.ts` | Add optional `minItems?: number` to `SlotProp` | MINOR |
| `Props.ts` | Add optional `maxItems?: number` to `SlotProp` | MINOR |
| `Props.ts` | Add optional `anyOf?: string[]` to `SlotProp` | MINOR |
| `Config.ts` | Add optional `processing.slotConstraints?: boolean` to `Config` | MINOR |

**Example — new shape** (`types/Props.ts`):
```yaml
# Before
SlotProp:
  type: 'slot'
  default?: string | null
  nullable?: boolean
  $extensions?: PropExtensions

# After
SlotProp:
  type: 'slot'
  default?: string | null
  nullable?: boolean
  minItems?: number             # optional — MINOR
  maxItems?: number             # optional — MINOR
  anyOf?: string[]  # optional — MINOR
  $extensions?: PropExtensions
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `minItems` property to `SlotProp` definition | MINOR |
| `component.schema.json` | Add `maxItems` property to `SlotProp` definition | MINOR |
| `component.schema.json` | Add `anyOf` property to `SlotProp` definition | MINOR |
| `component.schema.json` | Add `slotConstraints` property to `Config.processing` definition | MINOR |

**Example — new shape** (`schema/component.schema.json`):
```yaml
# New properties under #/definitions/SlotProp/properties
minItems:
  type: integer
  minimum: 0
  description: "Minimum number of items this slot accepts"

maxItems:
  type: integer
  minimum: 0
  description: "Maximum number of items this slot accepts"

anyOf:
  type: array
  items:
    type: string
  description: "Component type names permitted in this slot"
```

### Notes

- `minItems` and `maxItems` use `integer` in the schema (not `number`) because fractional item counts are meaningless. The TypeScript type uses `number` because TypeScript has no native integer type.
- The schema uses `minimum: 0` — negative item counts are invalid.
- No `required` changes — all three fields are optional. A `SlotProp` without constraints behaves exactly as it does today (unconstrained).
- The transformer is responsible for detecting code-only props named "Min Items", "Max Items", etc. on slot layers and promoting them to these first-class fields. That mapping logic belongs in `anova-transformer`, not here.
- `Config.processing.slotConstraints` is an opt-in boolean (defaults to `false` when omitted) that controls whether the transformer consolidates slot constraint code-only props into first-class `SlotProp` fields. This follows the same optional-pattern pattern as `glyphNamePattern` and `codeOnlyPropsPattern`.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — each new TypeScript field maps 1:1 to a new schema property
- **Parity check**:
  - `SlotProp.minItems` (TS) ↔ `SlotProp.properties.minItems` (schema)
  - `SlotProp.maxItems` (TS) ↔ `SlotProp.properties.maxItems` (schema)
  - `SlotProp.anyOf` (TS) ↔ `SlotProp.properties.anyOf` (schema)
  - `Config.processing.slotConstraints` (TS) ↔ `Config.properties.processing.properties.slotConstraints` (schema)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | New optional fields appear in slot prop output | No breaking change — new fields render automatically if present in spec data |

---

## Semver Decision

**Version bump**: `0.14.0` → `0.14.0` (deferred — cumulative MINOR with other 0.14.0 ADRs)

**Justification**: All changes are additive optional fields on an existing type — MINOR per Constitution §III ("Removing or renaming … is a breaking change"; additive types or new optional fields are MINOR).

---

## Consequences

- Consumers can now express slot quantity constraints (`minItems`, `maxItems`) and content constraints (`anyOf`) directly on `SlotProp`
- The transformer gains a target shape for promoting slot-related code-only props from Figma into first-class spec fields
- Slot constraints are platform-agnostic — any source (not just Figma) can populate these fields
- No migration required — existing `SlotProp` values without these fields remain valid
- Future ADRs could add additional slot constraint fields (e.g., `exactItems`, `defaultItems`) following the same pattern
