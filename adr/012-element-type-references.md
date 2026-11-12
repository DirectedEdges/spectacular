# ADR: Element Type References

**Branch**: `012-element-type-references`
**Created**: 2026-03-05
**Status**: ACCEPTED
**Summary**: An `ElementTypeRef` widens `AnatomyElement.type`, letting an element type point at a shared definition.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`AnatomyElement.type` is currently typed as `string` in `types/Anatomy.ts` and `{ "type": "string" }` in `schema/component.schema.json`. The transformer populates it with values like `text`, `icon`, `vector`, `container`, etc. — plain strings identifying the Figma-derived element type.

Some consumers want to enrich the anatomy output beyond Figma detection. A design system team may maintain a **foundations schema** — an external definition of element types with associated style constraints, documentation, and semantic meaning. For example, instead of:

```yaml
anatomy:
  decorativeIcon:
    type: icon
  label:
    type: text
```

a team wants to express:

```yaml
anatomy:
  decorativeIcon:
    type:
      $ref: "foundations#/definitions/icon"
  label:
    type:
      $ref: "foundations#/definitions/text"
```

This enables:
- Linking element types to external definitions that carry richer metadata (applicable styles, semantic roles, documentation)
- Implementers providing alternative foundation schemas without modifying the core element type values
- Tools resolving `$ref` values to retrieve style constraints, validation rules, or documentation from the referenced definition

Today, `AnatomyElement.type` only accepts plain strings. There is no way to express a reference to an external definition.

---

## Decision Drivers

- **Type–schema symmetry**: Every type change must have a corresponding schema change (Constitution I)
- **No runtime logic**: The `$ref` object is a pure data shape — resolution logic belongs in downstream packages (Constitution II)
- **Stable, intentional API**: The reference type must represent a genuine shared concept — external element type definitions — not an internal detail of any one package (Constitution III)
- **Additive-only for MINOR**: The plain string form must continue to work; the `$ref` form is additive (Constitution — Versioning)
- **Backward compatibility**: Existing output with plain string types must remain valid without modification

---

## Options Considered

### Option A: Widen `AnatomyElement.type` to accept `string | ElementTypeRef` *(Selected)*

Introduce an `ElementTypeRef` type — `{ $ref: string }` — and widen `AnatomyElement.type` from `string` to `string | ElementTypeRef`.

```yaml
# New type
ElementTypeRef:
  $ref: string    # URI reference to an external element type definition

# Widened AnatomyElement.type
AnatomyElement:
  type: string | ElementTypeRef
```

**Pros**:
- Plain string types continue to work unchanged — fully backward compatible
- The `$ref` pattern is already established in the codebase (`PropBinding.$binding` uses a similar pointer pattern)
- Implementers can point to any external schema URI without modifying the core type values
- Additive change — existing consumers that only handle strings can ignore the object form until they're ready

**Cons / Trade-offs**:
- Consumers must now handle a union (`string | object`) when reading `AnatomyElement.type` — they need a type guard to distinguish plain strings from references
- The `$ref` value is an opaque URI string — this package does not define what the referenced schema must look like (resolution is a downstream concern)

---

### Option B: Add a separate `typeRef` field alongside `type` *(Rejected)*

Keep `AnatomyElement.type` as `string` only. Add a new optional `typeRef?: string` field for the external reference.

```yaml
AnatomyElement:
  type: string
  typeRef?: string    # external reference URI
```

**Rejected because**: Two fields for the same concept creates ambiguity — what happens when both `type` and `typeRef` are present? Consumers must handle conflict resolution. A union on a single field is cleaner: the value is either a plain type or a reference, never both.

---

### Option C: Allow arbitrary strings including URIs in `type` *(Rejected)*

Keep `type` as `string` and allow consumers to use URI-like strings (e.g., `"foundations#/definitions/icon"`) directly.

**Rejected because**: There is no way to discriminate between a plain element type name and a URI string. A consumer reading `type: "icon"` vs. `type: "foundations#/definitions/icon"` must parse the string to determine intent. A structurally distinct form (object vs. string) makes discrimination trivial with `typeof`.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Anatomy.ts` | Add `ElementTypeRef` type (`{ $ref: string }`); widen `AnatomyElement.type` to `string \| ElementTypeRef` | MINOR |
| `index.ts` | Export `ElementTypeRef` | MINOR |

**Example — `AnatomyElement.type` after change** (`types/Anatomy.ts`):
```yaml
# Before
AnatomyElement:
  type: string
  detectedIn?: string
  instanceOf?: string

# After
ElementTypeRef:
  $ref: string      # URI reference to external element type definition

AnatomyElement:
  type: string | ElementTypeRef
  detectedIn?: string
  instanceOf?: string
```

**Example — usage in output**:
```yaml
# Plain string (unchanged)
anatomy:
  label:
    type: text

# ElementTypeRef (new)
anatomy:
  decorativeIcon:
    type:
      $ref: "foundations#/definitions/icon"
  primaryAction:
    type:
      $ref: "foundations#/definitions/container"
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `ElementTypeRef` definition; widen `AnatomyElement.properties.type` to `oneOf: [string, ElementTypeRef]` | MINOR |

**Example — `AnatomyElement` schema after change** (`schema/component.schema.json`):
```yaml
# Before
AnatomyElement:
  properties:
    type:
      type: string

# After
ElementTypeRef:
  type: object
  description: "Reference to an external element type definition."
  properties:
    $ref:
      type: string
      description: "URI reference to an external element type definition (e.g. 'foundations#/definitions/icon')"
  required: ["$ref"]
  additionalProperties: false

AnatomyElement:
  properties:
    type:
      oneOf:
        - type: string
        - $ref: "#/definitions/ElementTypeRef"
```

### Notes

- Resolution of `$ref` URIs is entirely a downstream concern. This package defines the shape; it does not resolve, fetch, or validate referenced definitions.
- The `ElementTypeRef.$ref` value is an opaque string. No URI format validation is imposed at the schema level — consumers define their own URI resolution strategy.
- The `$ref` field name inside `ElementTypeRef` follows JSON Reference (RFC 3986) conventions. It is a data field in the serialized output, not a JSON Schema `$ref` keyword — the schema defines `ElementTypeRef` as a named definition to avoid confusion.
- If ADR 011 (which constrains `type` from `string` to `ElementType`) is also accepted, the combined result would be `ElementType | ElementTypeRef`. The two ADRs are independently valid and can be merged in either order.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `ElementTypeRef` type in `types/Anatomy.ts` ↔ `ElementTypeRef` definition in `schema/component.schema.json`
  - `AnatomyElement.type: string | ElementTypeRef` in `types/Anatomy.ts` ↔ `AnatomyElement.properties.type.oneOf` in `schema/component.schema.json`

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | `AnatomyElement.type` may now be an object (`{ $ref: string }`) instead of a plain string | Recompile against updated types. Add type guard when reading `AnatomyElement.type` to distinguish `string` from `ElementTypeRef`. No breaking changes — existing plain-string output remains valid. |

---

## Semver Decision

**Version bump**: `0.12.0` → `0.12.0` (changes included in current unreleased minor)

**Justification**: All changes are additive — new type (`ElementTypeRef`), widened union on existing field. The plain string form continues to work. This is MINOR per Constitution III and versioning rules. Since `0.12.0` is the current unreleased version, these changes are included in the existing minor bump.

---

## Consequences

- `AnatomyElement.type` now supports both plain strings and `$ref`-based references to external definitions
- Implementers can provide foundation schemas with element type definitions that carry style constraints, documentation, and semantic roles — without modifying the core element type values
- Consumers must handle the `string | ElementTypeRef` union when reading `type` — a type guard (`typeof type === 'string'`) distinguishes the two forms
- The Anova transformer can produce plain string output by default and optionally enrich it with `$ref` references when a foundations schema is configured
- Future ADRs may define a standard structure for referenced foundation definitions; this ADR intentionally leaves the `$ref` target opaque
