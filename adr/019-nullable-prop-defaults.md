# ADR: Allow null in StringProp.default

**Branch**: `019-nullable-prop-defaults`
**Created**: 2026-03-11
**Status**: ACCEPTED
**Summary**: `StringProp.default` accepts `null`, expressing props whose absent value is meaningful.
**Decides**: props.string.nullable, props.enum.nullable, props.number.nullable, props.slot.nullable, props.image.nullable
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`StringProp` (the unified string property type, consolidated from the former `TextProp`, `GlyphProp`, and `IconProp`) declares a `nullable?: boolean` field that signals the prop can hold a null value in the design system output. However, the `default` field is typed as `string | undefined` (TypeScript) and `{ "type": "string" }` (JSON Schema). This means a nullable prop cannot express that its default value is `null`.

When a prop is nullable and has no meaningful default, the correct representation of its default state is `null` — not an empty string and not the absence of the field. The current contract forces producers to either omit `default` or use an empty string as a stand-in, both of which lose semantic information.

---

## Decision Drivers

- **Type–schema symmetry**: Every type change must have a corresponding schema change — no drift (Constitution I)
- **Additive-only when possible**: Widening an optional field's type union is additive and avoids a MAJOR bump (Constitution III, Versioning)
- **Semantic precision**: The contract should express what it means — `null` default for a nullable prop is a distinct concept from "no default" or "empty string default"
- **No runtime logic**: The change must remain purely declarative (Constitution II)

---

## Options Considered

### Option A: Widen `default` to `string | null` *(Selected)*

Change the `default` field type from `string` to `string | null` on `StringProp`. In the schema, change `"type": "string"` to `"type": ["string", "null"]` for the `default` property.

**Pros**:
- Directly expresses the semantic intent — nullable props can declare `null` as their default
- Additive change — existing `string` values remain valid; only `null` is newly permitted
- Symmetric across types and schema
- No new fields or structural changes required

**Cons / Trade-offs**:
- Downstream consumers reading `default` must now handle a possible `null` value (minimal impact — the field was already optional)

---

### Option B: Add a separate `nullDefault` boolean flag *(Rejected)*

Add a `nullDefault?: boolean` field to indicate the default is null rather than widening the `default` type.

**Rejected because**: Introduces redundancy — the same concept (default value) would be split across two fields. Violates semantic precision: the `default` field should carry the actual default value, not a companion flag. Adds unnecessary API surface.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Props.ts` | Widen `StringProp.default` from `string` to `string \| null` | MINOR |

**Example — new shape** (`types/Props.ts`):
```yaml
# Before
StringProp:
  type: 'string'
  default?: string
  nullable?: boolean
  examples?: string[]

# After
StringProp:
  type: 'string'
  default?: string | null
  nullable?: boolean
  examples?: string[]
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Widen `StringProp.default` type from `"string"` to `["string", "null"]` | MINOR |

**Example — new shape** (`schema/component.schema.json`):
```yaml
# Before — StringProp/properties/default
default:
  type: string

# After — StringProp/properties/default
default:
  type: ["string", "null"]
```

### Notes

- The `default` field remains optional (`?` in TypeScript, not in `required[]` in schema). The change only widens the set of valid values when the field is present.
- `BooleanProp`, `EnumProp`, and `SlotProp` are unaffected — their `default` fields have different semantics and are not nullable.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — `StringProp` receives identical changes in `types/Props.ts` and `schema/component.schema.json`
- **Parity check**: `StringProp.default: string | null` ↔ `StringProp/properties/default/type: ["string", "null"]`

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Recompile — `default` may now be `null` | Handle `null` when reading `StringProp.default` (field was already optional, so null-check paths likely exist) |

---

## Semver Decision

**Version bump**: MINOR

**Justification**: All changes are additive — widening an optional field's type union to include `null` does not remove or rename any existing field or type. Existing valid values remain valid. Per Constitution III and Versioning: "MINOR for additive types or new optional fields."

---

## Consequences

- Nullable `StringProp` instances can now express `default: null` to indicate the prop's default state is explicitly null
- Consumers reading `default` must account for a `null` value in addition to `string` and `undefined`
- Schema validation will accept `null` as a valid `default` value for `StringProp`
- No changes to `BooleanProp`, `EnumProp`, or `SlotProp`
