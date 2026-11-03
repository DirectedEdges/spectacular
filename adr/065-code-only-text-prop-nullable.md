# ADR: Document the `nullable` Default and Add `NumberProp.nullable`

**Branch**: `065-code-only-text-prop-nullable`
**Created**: 2026-08-05
**Status**: ACCEPTED
**Summary**: `NumberProp` gains `nullable`, and JSDoc documents the default each prop type applies when `nullable` is absent.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — extends ADR-019 and ADR-022)*

---

## Context

`nullable?: boolean` is an optional field on `StringProp`, `EnumProp`, `SlotProp`, and `ImageProp`. Introduced by ADR-019 and extended to `SlotProp` by ADR-022, it has never had a documented meaning for its **absence**:

```yaml
# types/Props.ts — current
StringProp:
  type: 'string'
  default?: string | null
  nullable?: boolean        # no JSDoc at all
  examples?: string[]

EnumProp:
  type: 'string'
  default: string
  enum: string[]
  nullable?: boolean        # no JSDoc at all
```

The schema is equally silent — `"nullable": { "type": "boolean" }` with no `description` and no `default`. The docs table says only "Whether `null` is a valid value", Required: No. Neither ADR-019 nor ADR-022 states what omission means.

This is a genuine contract gap, and it has already produced divergence:

- **Producers treat omission as "nullable"**. `nullable` is written in only two situations: `false` on variant-derived enum props, and `true` on paired content props. Every other string prop, every number prop, and every code-only `TEXT` prop omits the field — because a string prop with no closed value set is understood to accept null.
- **Consumers treat omission as "not nullable"**. Reading tools test `prop.nullable === true`, so an omitted field collapses to `false`, and generated TypeScript emits `string` where `string | null` is meant. Other consumers ignore the field entirely.

The gap is not merely documentary — it produces incorrect generated types today, and the contract offers no text a consumer could have read to get it right.

A second, narrower gap compounds this. A code-only Figma `TEXT` prop materializes as either a `StringProp` or — when `processing.inferNumberProps` applies and the authored value is numeric — a `NumberProp`. `NumberProp` has no `nullable` field at all, so identical Figma authoring produces contract-inconsistent output based only on the inferred value type, and a numeric prop cannot assert non-nullability even when it demonstrably has a value.

---

## Decision Drivers

- **The contract must be self-describing** (Constitution III): a consumer reading `types/` and `schema/` alone must be able to determine nullability. An unstated convention that lives only in producer behavior is not a contract.
- **Consistent vocabulary across value types**: a `TEXT` code-only prop must express nullability the same way whether it materializes as `type: string` or `type: number`.
- **Open value sets differ from closed ones**: a prop with an `enum` enumerates every value it accepts; null is not among them unless stated. A prop with no enumerated set has no such closure.
- **Type ↔ schema symmetry** (Constitution I): every type change has a schema counterpart.
- **Additive where possible**: prefer a `MINOR` bump over forcing field presence on four types.
- **No logic in this package** (Constitution II): the default is a contract-level definition; evaluating it belongs to consumers.

---

## Options Considered

### Option A: Document the default as absent ≡ nullable for open-valued props; add `NumberProp.nullable` *(Selected)*

State the default explicitly in types, schema, and docs:

- `StringProp`, `NumberProp` — absent ≡ `true` (accepts null)
- `EnumProp`, `BooleanProp` — absent ≡ `false` (the value set is closed)

Add optional `nullable?: boolean` to `NumberProp` so the `false` override is expressible for numeric props.

**Pros**:
- Matches what producers already emit — no producer change is required for correctness.
- The discriminator is a structural fact already present in the prop (`enum` present or not), not an out-of-band convention.
- Structurally additive: one new optional field plus annotations → `MINOR`.
- Makes the emission rule for code-only `TEXT` props expressible: omit `nullable` when the authored default is empty; emit `nullable: false` when it is non-empty.

**Cons / Trade-offs**:
- Consumers currently reading `prop.nullable === true` must change; today they would report the opposite of the documented default. This is a behavioral change in generated output even though the schema change is annotation-only.

---

### Option B: Document the default as absent ≡ `false` for all prop types *(Rejected)*

Canonize the reading consumers use today, and require producers to emit `nullable: true` explicitly wherever null is accepted.

**Rejected because**: It contradicts producer behavior across every string and number prop, so it would require the transformer to start writing `nullable: true` on essentially every open-valued prop — a far larger producer change than the consumer change in Option A, and it makes the common case the verbose one. It also erases the `enum`/no-`enum` distinction that already carries the meaning structurally.

---

### Option C: Make `nullable` required on all prop types *(Rejected)*

Promote `nullable` to a required `boolean` on `StringProp`, `EnumProp`, `SlotProp`, `NumberProp`, and `ImageProp`.

**Rejected because**: Changing field presence on five types is breaking → `MAJOR` per the constitution's versioning rule. It also forces every prop to restate a fact that the presence or absence of `enum` already determines, inflating output for no gain in expressiveness.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Props.ts` | Added optional field `nullable?: boolean` to `NumberProp` | MINOR |
| `Props.ts` | Added JSDoc stating the documented default on `nullable` for `StringProp`, `EnumProp`, `SlotProp`, `NumberProp` | PATCH |
| `Image.ts` | Added JSDoc stating the documented default on `ImageProp.nullable` | PATCH |

**Example — new shape** (`types/Props.ts`):

```yaml
# Before
NumberProp:
  type: 'number'
  default?: number
  examples?: number[]

# After
NumberProp:
  type: 'number'
  default?: number
  nullable?: boolean   # optional — defaults to true when absent — MINOR
  examples?: number[]
```

**Documented default, by prop type**:

| Prop type | Absent `nullable` means | Rationale |
|-----------|-------------------------|-----------|
| `StringProp` | `true` | Open value set — no enumeration closes it |
| `NumberProp` | `true` | Open value set |
| `SlotProp` | `true` | Open content set; a slot may be empty |
| `ImageProp` | `true` | Open value set |
| `EnumProp` | `false` | `enum` enumerates every accepted value; null is not among them unless stated |
| `BooleanProp` | *(n/a — no field)* | Booleans are inherently non-nullable |

**Emission for code-only `TEXT` props** (the case that surfaced this):

```yaml
# Empty authored default — nullable omitted, reads as true
label:
  type: string
  $extensions:
    com.figma:
      type: TEXT
      source:
        kind: codeOnlyProp
        layer: label

# Non-empty authored default — nullable: false emitted explicitly
headingLevel:
  type: number
  default: 2
  nullable: false
  $extensions:
    com.figma:
      type: TEXT
      source:
        kind: codeOnlyProp
        layer: headingLevel
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Added property `nullable` to `#/definitions/NumberProp/properties` | MINOR |
| `component.schema.json` | Added `description` and `default` annotations to `nullable` under `#/definitions/StringProp`, `#/definitions/EnumProp`, `#/definitions/SlotProp`, `#/definitions/NumberProp`, `#/definitions/ImageProp` | PATCH |

**Example — new shape** (`schema/component.schema.json`):

```yaml
# New property under #/definitions/NumberProp/properties
nullable:
  type: boolean
  default: true
  description: "Whether this prop accepts a null value. Absent means true — a number prop has an open value set."

# Annotation added under #/definitions/EnumProp/properties
nullable:
  type: boolean
  default: false
  description: "Whether this prop accepts a null value. Absent means false — enum enumerates every accepted value."
```

### Notes

- `#/definitions/NumberProp` sets `additionalProperties: false`, so it rejects `nullable` today. Adding the property is required for the field to validate at all.
- The JSON Schema `default` keyword is an annotation, not a validation constraint. It records the contract; it does not cause validators to inject the value.
- `SlotProp` and `ImageProp` are included in the default table because leaving them undocumented perpetuates the exact gap this ADR closes. Both follow the open-value-set rule.
- Producers emitting `nullable: false` on variant-derived enum props are now redundant with the documented default. Removing that write is optional cleanup, not required — an explicit value that matches the default is always valid.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `NumberProp.nullable` in `types/Props.ts` ↔ `#/definitions/NumberProp/properties/nullable`, optional in both (not listed in `required`). Documented defaults appear as JSDoc in `types/` and as `default` + `description` annotations in `schema/` — the same statement in each artifact's native idiom.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Producer behavior already matches the documented default | Emit `nullable: false` on code-only `TEXT` props with a non-empty authored default, for both the `string` and `number` output types; omit `nullable` when the default is empty. Optionally drop the now-redundant `false` on variant-derived enum props |
| `specs-cli` | **Behavioral change** — contract generation and prop analysis currently read an omitted `nullable` as not-nullable, which inverts the documented default | Update nullability reads to apply the per-type default instead of testing for an explicit `true`. Generated TypeScript for open-valued props will widen to include `null` |
| `specs-cli` (react/stories transforms) | Nullability is not consulted when deriving prop optionality | Apply the documented default when deciding optional vs required props |
| `specs-plugin-2` | Widened prop shape only | Recompile; no behavioral change |
| `figma-from-specs` | Nullability is not consulted | No action required now; the documented default applies if nullability is honored later |

---

## Semver Decision

**Version bump**: `0.28.0 → 0.29.0` (`MINOR`) — folded into the unreleased `0.29.0` on `release/schema-0.29.0+cli-0.26.0`, which is already a `MINOR` in flight. No separate bump.

**Justification**: The only structural change is one additive optional field (`NumberProp.nullable`); everything else is `description`/`default` annotation and JSDoc. No field is removed, renamed, or made required, so nothing that validates today stops validating. Per the constitution's versioning rule — "`MINOR` for additive types or new optional fields."

**Flagged**: although the version bump is `MINOR` by the structural test, the documented default is semantically significant. Consumers that currently read `nullable === true` produce output contradicting the contract this ADR records, and correcting them changes their generated artifacts. The bump understates the consumer-visible effect; the `CHANGELOG` entry must call this out rather than listing the change as a plain additive field.

---

## Consequences

- Nullability is determinable from `types/` and `schema/` alone, without knowing producer conventions.
- The `enum`/no-`enum` distinction becomes the documented discriminator for the default, rather than an unwritten rule.
- A code-only Figma `TEXT` prop expresses nullability identically whether it materializes as `type: string` or `type: number`.
- Generated TypeScript for open-valued props widens to include `null` once consumers apply the default — correcting output that is wrong today.
- `nullable: false` becomes meaningful on open-valued props: an explicit assertion that a value always exists, distinct from the permissive default.
- Specs produced before this version are unchanged on disk; only their interpretation is corrected. No regeneration is required for validity.
