# ADR: Tighten layoutMode to String Literal Enum

**Branch**: `038-layout-mode-enum`
**Created**: 2026-04-20
**Status**: ACCEPTED
**Summary**: A `LayoutMode` enum types `layoutMode` as `NONE`, `HORIZONTAL` or `VERTICAL` rather than an open string.
**Decides**: styles.layoutMode
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The `Styles` type currently defines `layoutMode` as `Style`, which is the broadest value union in the schema — accepting string, number, boolean, null, `TokenReference`, `PropBinding`, and `Conditional`. In the JSON schema, it maps to `StringStyleValue` (string | TokenReference | null).

In practice, `layoutMode` only ever holds one of three Figma API values:
- `"NONE"` — no auto-layout
- `"HORIZONTAL"` — horizontal auto-layout
- `"VERTICAL"` — vertical auto-layout

This field is a structural layout declaration, not a visual property. It is never token-bound (you don't reference a variable for "should this be a row or column"), never prop-bound, and never conditional. The current loose typing allows impossible values that no producer will ever emit.

---

## Decision Drivers

- **Type precision**: The public contract should reflect the actual value domain. Accepting `number`, `boolean`, `PropBinding`, or `Conditional` for a layout direction enum is misleading.
- **Consumer safety**: Narrowing the type lets consumers exhaustively switch on the three values without needing a fallback for impossible branches.
- **Schema as documentation**: An `enum` constraint in the JSON schema is self-documenting — consumers can read the allowed values directly from the schema without consulting Figma docs.
- **TokenReference exclusion**: Layout mode is a structural property (like `aspectRatio`). Figma does not support variable-binding for `layoutMode`. Excluding `TokenReference` is accurate to the data model.
- **Semver discipline**: Narrowing a type from `Style` to a string literal union is a breaking change — existing consumers that type-check against the broader union will get compile errors.

---

## Options Considered

### Option A: Narrow to `LayoutMode | null` with enum type *(Selected)*

Replace `layoutMode: Style` with a dedicated type:

```typescript
type LayoutMode = 'NONE' | 'HORIZONTAL' | 'VERTICAL';
```

And the field becomes:

```yaml
layoutMode: LayoutMode | null
```

In the schema, replace the `StringStyleValue` ref with a dedicated `LayoutModeStyleValue` using a string enum.

**Pros**:
- Precise — only valid values are representable
- Self-documenting enum in the schema
- Enables exhaustive pattern matching in consumers
- Consistent with `aspectRatio` pattern (structural property, no TokenReference)

**Cons / Trade-offs**:
- Breaking change — consumers typed against `Style` will need to update
- If Figma ever adds a new layout mode value, the enum must be updated (low risk — this API has been stable since auto-layout was introduced)

---

### Option B: Keep `StringStyleValue` but add `enum` constraint in schema only *(Rejected)*

Leave the TypeScript type as `Style` but add an `enum` constraint in the JSON schema.

**Rejected because**: Creates drift between types and schema. The TypeScript type would still accept impossible values while the schema rejects them. Violates constitution principle I (types and schema must describe the same structure).

---

### Option C: Keep current type as-is *(Rejected)*

Leave `layoutMode: Style` unchanged.

**Rejected because**: Allows impossible values (numbers, booleans, conditionals) that no producer will ever emit. Misses an opportunity for type precision that benefits all consumers.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Change field `layoutMode` from `Style` to `LayoutMode \| null` | MAJOR |
| `Styles.ts` | Add new type `LayoutMode = 'NONE' \| 'HORIZONTAL' \| 'VERTICAL'` | MINOR (part of MAJOR) |

**Example — new shape** (`types/Styles.ts`):

```yaml
# Before
Styles (partial):
  layoutMode: Style

# After
Styles (partial):
  layoutMode: LayoutMode | null

LayoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL'
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Change `layoutMode` from `StringStyleValue` ref to `LayoutModeStyleValue` | MAJOR |
| `styles.schema.json` | Add definition `LayoutModeStyleValue` (oneOf: enum string, null) | MINOR (part of MAJOR) |

**Example — new shape** (`schema/styles.schema.json`):

```yaml
# New definition
LayoutModeStyleValue:
  description: "Layout mode. Structural property — not token-bindable."
  oneOf:
    - type: string
      enum: ["NONE", "HORIZONTAL", "VERTICAL"]
    - type: "null"

# Updated property
properties.layoutMode:
  $ref: "#/definitions/LayoutModeStyleValue"
  description: "Auto-layout direction. NONE (no auto-layout), HORIZONTAL (row), or VERTICAL (column)."
```

### Notes

- `null` is retained because `layoutMode` is optional on `Styles` (it's `Partial<{...}>`), and the schema allows null for absent/omitted values.
- `TokenReference` is intentionally excluded — Figma does not support variable-binding for layout mode. This matches the `AspectRatioStyle` precedent.
- The `StyleKey` union is unchanged — `'layoutMode'` remains a valid key.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**: `LayoutMode` type literal union ↔ `LayoutModeStyleValue` schema enum constraint; null allowed in both; TokenReference excluded from both.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Breaking — type narrows from `Style` to `LayoutMode \| null` | Update any code that handles `layoutMode` as a generic `Style`. The narrower type simplifies display logic (no token/binding branches needed). |

---

## Semver Decision

**Version bump**: `0.18.0` (`MAJOR` relative to 0.x convention — type narrowing is breaking)

**Justification**: Narrowing `layoutMode` from `Style` to `LayoutMode | null` removes previously valid type branches (TokenReference, PropBinding, Conditional, number, boolean). Per constitution III: removing valid values from a field type is a breaking change. Under 0.x conventions, this is captured within the existing 0.18.0 minor bump.

---

## Consequences

- Consumers can exhaustively match on `'NONE' | 'HORIZONTAL' | 'VERTICAL'` without impossible-value fallbacks
- The schema is self-documenting — allowed values are visible in the enum constraint
- `TokenReference` is excluded, accurately reflecting that layout mode cannot be variable-bound in Figma
- If Figma adds a new layout mode in the future, both the type and schema must be updated (acceptable maintenance cost for a rarely-changing structural enum)
- Pattern established for tightening other structural string properties (e.g., `layoutWrap`, `layoutPositioning`) in future ADRs
