# ADR: Subcomponent `$ref` for `instanceOf`

**Branch**: `030-subcomponent-refs`
**Created**: 2026-03-23
**Status**: ACCEPTED
**Summary**: A `SubcomponentRef` lets `instanceOf` point at a subcomponent definition rather than repeat its name.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

When a component contains subcomponents, anatomy items and elements that are instances of those subcomponents currently record `instanceOf` as a plain formatted string (e.g., `"dsRadioButtonFormLabel"`). This is opaque — a consumer cannot distinguish a subcomponent reference from an arbitrary component name, nor can tooling follow the relationship programmatically.

The `$ref` pattern already exists in this package: `ElementTypeRef` uses `{ $ref: string }` on `AnatomyElement.type` to express a machine-followable pointer to an external definition. The same pattern should apply to `instanceOf` when the target is a sibling subcomponent within the same spec.

The transformer spec `016-subcomponent-references` defines the downstream behavior: when `instanceOf` matches a detected subcomponent, the serialized output should emit `{ $ref: "#/subcomponents/{key}" }` instead of a plain string. This ADR records the types/schema change required to support that output.

---

## Decision Drivers

- **Additive-only change**: Widening a union type preserves backward compatibility and avoids a MAJOR bump. Existing plain-string `instanceOf` values remain valid.
- **Type ↔ schema symmetry**: Both the TypeScript type and the JSON schema must reflect the new shape simultaneously (Constitution §I).
- **No runtime logic**: This package defines types and schema only. The `$ref` resolution logic belongs in downstream packages (Constitution §II).
- **Reuse existing patterns**: `ElementTypeRef` already establishes the `{ $ref: string }` object shape. A new `SubcomponentRef` type should follow the same structure for consistency.
- **Schema-level validation for internal pointers**: Unlike `ElementTypeRef` (which targets arbitrary external URIs), `SubcomponentRef` always points within the same document at `#/subcomponents/{key}`. The schema should enforce this with a `pattern` constraint so malformed references are caught at validation time.
- **PropBinding priority**: On `Element.instanceOf`, `PropBinding` (instance-swap binding) already occupies one union branch. The new `$ref` shape is a third branch — the three are mutually exclusive at runtime.

---

## Options Considered

### Option A: Reuse `ElementTypeRef` for subcomponent references *(Rejected)*

Use the existing `ElementTypeRef` type directly on `instanceOf`.

**Rejected because**: `ElementTypeRef` is documented as referencing *element type definitions* (e.g., `foundations#/definitions/glyph`). Subcomponent references point to `#/subcomponents/{key}` — a different concept. Overloading the type conflates two distinct reference targets and makes schema documentation misleading.

---

### Option B: New `SubcomponentRef` type with `{ $ref: string }` *(Selected)*

Introduce a dedicated `SubcomponentRef` type structurally identical to `ElementTypeRef` but semantically scoped to subcomponent pointers. Widen `instanceOf` on both `AnatomyElement` and `Element` to accept it.

**Pros**:
- Clear semantic distinction between element-type references and subcomponent references
- Follows the established `{ $ref: string }` pattern — no new structural concepts
- Additive union widening — fully backward-compatible

**Cons / Trade-offs**:
- Two structurally identical `{ $ref: string }` types exist. This is intentional: they represent different reference targets and may diverge in the future (e.g., `SubcomponentRef` could gain a `version` field).

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Anatomy.ts` | Add `SubcomponentRef` type; widen `AnatomyElement.instanceOf` to `string \| SubcomponentRef` | MINOR |
| `Element.ts` | Widen `Element.instanceOf` to `string \| PropBinding \| SubcomponentRef` | MINOR |
| `index.ts` | Export `SubcomponentRef` | MINOR |

**New type** (`types/Anatomy.ts`):
```yaml
# New type
SubcomponentRef:
  $ref: string   # e.g., "#/subcomponents/formLabel"
```

**Before / after** — `AnatomyElement.instanceOf`:
```yaml
# Before
instanceOf?: string

# After
instanceOf?: string | SubcomponentRef
```

**Before / after** — `Element.instanceOf`:
```yaml
# Before
instanceOf?: string | PropBinding

# After
instanceOf?: string | PropBinding | SubcomponentRef
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `SubcomponentRef` definition; widen `AnatomyElement.instanceOf` and `Element.instanceOf` to `oneOf` including the new definition | MINOR |

**New definition** (`schema/component.schema.json`):
```yaml
# #/definitions/SubcomponentRef
SubcomponentRef:
  type: object
  description: "Reference to a subcomponent definition within the same spec."
  properties:
    $ref:
      type: string
      pattern: "^#/subcomponents/.+"
      description: "JSON Pointer to a subcomponent (e.g. '#/subcomponents/formLabel')"
  required: [$ref]
  additionalProperties: false
```

> **Why `pattern` here but not on `ElementTypeRef`?** `ElementTypeRef` targets arbitrary external URIs (e.g., `foundations#/definitions/glyph`) where constraining the format would be overly restrictive. `SubcomponentRef` is internal-only — it always points to `#/subcomponents/{key}` within the same document, so the target space is small, well-defined, and appropriate for schema-level enforcement.

**Before / after** — `AnatomyElement.instanceOf`:
```yaml
# Before
instanceOf:
  type: string

# After
instanceOf:
  oneOf:
    - type: string
    - $ref: "#/definitions/SubcomponentRef"
```

**Before / after** — `Element.instanceOf`:
```yaml
# Before
instanceOf:
  oneOf:
    - type: string
    - $ref: "#/definitions/PropBinding"

# After
instanceOf:
  oneOf:
    - type: string
    - $ref: "#/definitions/PropBinding"
    - $ref: "#/definitions/SubcomponentRef"
```

### Notes

- `SubcomponentRef` is placed in `Anatomy.ts` alongside `ElementTypeRef` since both are reference-object types used within anatomy/element contexts.
- The `FigmaCodeOnlySource.instanceOf` field (`Props.ts` line 24) is **not** widened — it records a raw component name for enum derivation, not a followable pointer. No change needed.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `SubcomponentRef` type → `#/definitions/SubcomponentRef` schema definition
  - `AnatomyElement.instanceOf` union widened in both type and schema
  - `Element.instanceOf` union widened in both type and schema

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Recompile — `instanceOf` values may now be `{ $ref }` objects instead of strings | Update any code that reads `instanceOf` to handle the `SubcomponentRef` shape |

---

## Semver Decision

**Version bump**: `0.15.0` → `0.15.0` (no version change — this is a MINOR-compatible addition within the current release cycle)

**Justification**: All changes are additive: a new optional type (`SubcomponentRef`), a new schema definition, and union widening on existing optional fields. No existing valid values are invalidated. MINOR per Constitution §III and Versioning policy.

---

## Consequences

- Consumers can programmatically distinguish subcomponent references from plain component names via the `{ $ref }` object shape
- The `$ref` pattern is now used for two distinct reference types: element types (`ElementTypeRef`) and subcomponents (`SubcomponentRef`), establishing `{ $ref }` as the standard reference mechanism in the spec
- Downstream packages (`anova-transformer`, `anova-kit`) that read `instanceOf` must handle the new union branch — but since the field is optional and additive, existing code continues to compile
- Schema validators will accept both `"someString"` and `{ "$ref": "#/subcomponents/key" }` for `instanceOf` fields
