# ADR: Add `examples` to `TextProp` and `IconProp`, deprecate `default`

**Branch**: `014-prop-examples`
**Created**: 2026-03-09
**Status**: ACCEPTED
**Summary**: An `examples` array on `TextProp` and `IconProp` carries sample values, and `default` becomes optional.
**Decides**: props.string.examples, props.number.examples
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`TextProp` and `IconProp` each carry a required `default` field that stores a single string value (e.g., `"Label"` for text, `"Check"` for an icon). In practice, these values originate from Figma's `componentPropertyReferences` under `.default` and represent **demonstration content**, not a true semantic default that consumers should rely on.

Treating demo content as `default` is misleading: downstream consumers may interpret it as the authoritative fallback value for rendering, when it is actually sample data intended to illustrate usage. The current shape provides no way to distinguish "this is a genuine default" from "this is just an example."

JSON Schema's `examples` keyword (an array of values) is the established convention for expressing sample/demo data without implying it is a default.

---

## Decision Drivers

- **Semantic accuracy**: The field name must correctly convey the role of the data — sample content is not a default
- **Additive-only change**: Avoid a MAJOR bump; new fields should be optional to preserve backward compatibility during the transition
- **Type ↔ Schema symmetry**: Every type change must have a corresponding schema change (Constitution I)
- **No runtime logic**: This package must remain types and schema only (Constitution II)
- **JSON Schema alignment**: Prefer standard JSON Schema conventions (`examples`) over custom vocabulary

---

## Options Considered

### Option A: Add optional `examples` array, make `default` optional *(Selected)*

Add an optional `examples: string[]` field to both `TextProp` and `IconProp`. Simultaneously make `default` optional (not required) so that producers can migrate to `examples` without a breaking change. During the transition period, both fields may coexist.

**Pros**:
- Follows the JSON Schema `examples` convention — familiar to consumers
- Additive change: new optional field → MINOR bump
- Making `default` optional (rather than removing it) preserves backward compatibility
- Supports multiple example values, which is more expressive than a single default

**Cons / Trade-offs**:
- Temporary overlap: both `default` and `examples` may be present until a future MAJOR removes `default`
- Consumers must handle the optional nature of `default` during the transition

---

### Option B: Rename `default` to `example` (singular) *(Rejected)*

Replace `default` with a single `example: string` field.

**Rejected because**: Renaming a required field is a breaking change (MAJOR bump). A singular field also does not accommodate multiple examples, limiting expressiveness. Breaks backward compatibility immediately with no transition path.

---

### Option C: Keep `default` and add a `isExample` boolean flag *(Rejected)*

Add a boolean `isExample` flag to indicate when `default` is actually demo content.

**Rejected because**: This works around the naming problem without solving it. The field is still called `default`, which remains semantically misleading. Adds a boolean to distinguish meaning rather than using the correct vocabulary. Does not align with JSON Schema conventions.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Props.ts` | Add optional `examples?: string[]` to `TextProp` | MINOR |
| `Props.ts` | Make `default` optional on `TextProp` (`default?: string`) | MINOR |
| `Props.ts` | Add optional `examples?: string[]` to `IconProp` | MINOR |
| `Props.ts` | Make `default` optional on `IconProp` (`default?: string`) | MINOR |

**Example — new shape** (`types/Props.ts`):
```yaml
# Before
TextProp:
  type: 'string'        # required
  default: string        # required
  nullable?: boolean

IconProp:
  type: 'string'        # required
  default: string        # required
  nullable?: boolean

# After
TextProp:
  type: 'string'        # required
  default?: string       # optional — MINOR (relaxed from required)
  nullable?: boolean
  examples?: string[]    # optional — MINOR

IconProp:
  type: 'string'        # required
  default?: string       # optional — MINOR (relaxed from required)
  nullable?: boolean
  examples?: string[]    # optional — MINOR
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add optional `examples` property (array of strings) to `TextProp` definition | MINOR |
| `component.schema.json` | Remove `default` from `required` array in `TextProp` | MINOR |
| `component.schema.json` | Add optional `examples` property (array of strings) to `IconProp` definition | MINOR |
| `component.schema.json` | Remove `default` from `required` array in `IconProp` | MINOR |

**Example — new shape** (`schema/component.schema.json`):
```yaml
# TextProp definition — properties
type:
  type: string
  const: "string"
default:
  type: string
nullable:
  type: boolean
examples:
  type: array
  items:
    type: string
  description: "Sample values demonstrating typical content for this prop"
# required: ["type"] — "default" removed from required

# IconProp definition — properties (same structure)
type:
  type: string
  const: "string"
default:
  type: string
nullable:
  type: boolean
examples:
  type: array
  items:
    type: string
  description: "Sample values demonstrating typical content for this prop"
# required: ["type"] — "default" removed from required
```

### Notes

- The `examples` property on the JSON Schema definitions is a **custom property** within the object definition (under `properties`), not the JSON Schema meta-keyword `examples` at the definition level. This avoids collision with the schema-level `examples` keyword already present on each definition.
- `default` is made optional, not removed, to allow a deprecation period. A future MAJOR version can remove `default` from `TextProp` and `IconProp` entirely.
- `BooleanProp`, `EnumProp`, and `SlotProp` are unaffected — their `default` fields carry genuine semantic defaults.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `TextProp.examples` (type) ↔ `#/definitions/TextProp/properties/examples` (schema)
  - `TextProp.default` optional (type) ↔ `default` removed from `#/definitions/TextProp/required` (schema)
  - `IconProp.examples` (type) ↔ `#/definitions/IconProp/properties/examples` (schema)
  - `IconProp.default` optional (type) ↔ `default` removed from `#/definitions/IconProp/required` (schema)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Recompile; `default` on `TextProp`/`IconProp` becomes possibly `undefined` | Update any code that reads `.default` without a null check; optionally begin reading `.examples` |

---

## Semver Decision

**Version bump**: `MINOR`

**Justification**: All changes are additive optional fields or relaxation of required constraints. No fields are removed or renamed. Per Constitution III: "MINOR for additive types or new optional fields."

---

## Consequences

- Producers can populate `examples` with demo content instead of misusing `default`
- Consumers must handle `default` being optional on `TextProp` and `IconProp` (it may be `undefined`)
- A future MAJOR version can cleanly remove `default` from these two prop types once all producers have migrated to `examples`
- `BooleanProp`, `EnumProp`, and `SlotProp` are unchanged — their `default` semantics remain correct
