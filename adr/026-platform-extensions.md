# ADR: Unify Platform-Specific Properties Under `$extensions`

**Branch**: `026-platform-extensions`
**Created**: 2026-03-16
**Status**: ACCEPTED
**Summary**: An `$extensions` object on every prop type unifies platform-specific metadata, replacing the Figma-only `x-platform` field.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The schema currently uses **two different patterns** to carry Figma-specific metadata:

1. **`x-platform`** on `BooleanProp` (`component.schema.json`) — an object keyed by platform name (`FIGMA`) that stores Figma's native prop type. This property exists only in the schema; it has **no TypeScript counterpart** in `types/Props.ts`, which means types and schema have drifted.

2. **`$extensions`** on `TokenReference` (`types/Styles.ts`, `styles.schema.json`) — follows the DTCG (Design Tokens Community Group) `$extensions` convention with reverse-domain namespacing (`com.figma`). Types and schema are in sync.

As more Figma-specific metadata needs arise (e.g., native prop types on `StringProp`, `EnumProp`, `SlotProp`; element-level Figma node IDs; other extraction provenance), the inconsistency will spread. A single, well-defined pattern is needed before additional Figma extensions are added.

### Industry precedent

Three established standards address the problem of attaching tool-specific or platform-specific metadata to structured data:

- **JSON Schema `x-` prefix** — JSON Schema officially treats any keyword starting with `x-` as a custom annotation that does not affect validation. This is the same convention OpenAPI/Swagger uses for vendor extensions (e.g., `x-logo`, `x-internal`). Simple and familiar, but provides no formal namespacing — collisions are prevented only by convention.
- **DTCG `$extensions` with reverse-domain notation** — The Design Tokens Community Group specification (§5.2.3) defines a dedicated `$extensions` object where keys use reverse-domain notation (`com.figma`, `com.sketch`). Content is freeform. The rationale: it eliminates naming collisions, keeps metadata in a designated container, and lets tokens pass through multiple tools without data loss.
- **XState `meta` property** — XState attaches a `meta` object to state nodes for static metadata (UI hints, analytics, documentation). XState ignores its contents entirely — a passthrough bag with no namespacing.

| Pattern | Convention | Namespacing | Used by |
|---------|-----------|-------------|---------|
| `x-` prefix | Top-level properties | By convention only | JSON Schema, OpenAPI, HTTP headers |
| `$extensions` | Dedicated container object | Reverse-domain keys | DTCG Design Tokens |
| `meta` | Dedicated container object | None (freeform) | XState |

---

## Decision Drivers

- **Types ↔ schema symmetry (Constitution I)**: Both artifacts must describe the same structure. `x-platform` exists only in the schema today — this is already a drift bug.
- **No logic (Constitution II)**: The solution must be pure type/schema additions only.
- **Stable, intentional API (Constitution III)**: The chosen pattern should align with established community standards to avoid inventing a bespoke convention.
- **Additive change preferred**: A MINOR bump is preferable to a MAJOR bump. The existing `x-platform` field is schema-only with no typed consumer, so removing it is low-risk.
- **Extensibility**: The pattern must scale to additional design tool platforms (Figma, Sketch, Penpot) and code implementation platforms (React, Web Components, iOS, Android) without schema restructuring.

---

## Options Considered

### Option A: `$extensions` with DTCG reverse-domain namespacing *(Selected)*

Adopt the DTCG `$extensions` pattern already used on `TokenReference` as the single standard for all platform-specific metadata throughout the schema. Design tool metadata (Figma extraction provenance) lives under keys like `com.figma`. Code implementation platform hints live under keys like `com.reactjs`, `org.webcomponents`, `com.apple.swiftui`, or `dev.android.compose`.

```yaml
# Design tool provenance — Figma-native prop type
showLabel:
  type: boolean
  default: true
  $extensions:
    com.figma:
      type: BOOLEAN

# Code platform hints — React
showLabel:
  type: boolean
  default: true
  $extensions:
    com.reactjs:
      propName: showLabel       # mapped React prop name
      type: boolean             # React/TS prop type

# Code platform hints — Web Components
showLabel:
  type: boolean
  default: true
  $extensions:
    org.webcomponents:
      attribute: show-label     # HTML attribute (kebab-case)
      property: showLabel       # JS property (camelCase)
      reflect: true             # attribute reflects to property

# Code platform hints — iOS (SwiftUI)
showLabel:
  type: boolean
  default: true
  $extensions:
    com.apple.swiftui:
      parameter: showLabel
      type: Bool

# Code platform hints — Android (Jetpack Compose)
showLabel:
  type: boolean
  default: true
  $extensions:
    dev.android.compose:
      parameter: showLabel
      type: Boolean

# Combined — design tool + multiple code platforms on one prop
showLabel:
  type: boolean
  default: true
  $extensions:
    com.figma:
      type: BOOLEAN
    com.reactjs:
      propName: showLabel
      type: boolean
    org.webcomponents:
      attribute: show-label
      reflect: true

# On TokenReference (already uses this pattern — no change)
$token: "DS Color.Text.Primary"
$type: color
$extensions:
  com.figma:
    id: "VariableID:1234"
    name: "Text/Primary"
```

**Pros**:
- Aligns with the DTCG Design Tokens specification (§5.2.3) — the same standard `TokenReference` already follows
- Aligns with the JSON Schema community's direction on structured extension metadata (the `x-` prefix convention solves annotation but not namespacing; `$extensions` solves both)
- Reverse-domain namespacing (`com.figma`, `com.reactjs`, `org.webcomponents`, `com.apple.swiftui`, `dev.android.compose`) scales to arbitrary platforms without schema changes
- Eliminates the current inconsistency — one pattern everywhere
- Already validated in production on `TokenReference`
- `$`-prefixed properties are already permitted by `patternProperties: { "^\\$": {} }` on all prop schemas
- Multiple platform keys can coexist on the same node — a prop can carry Figma provenance alongside React, Web Components, and iOS hints simultaneously

**Cons / Trade-offs**:
- **Not a JSON Schema standard** — unlike the `x-` prefix, `$extensions` is not recognized by JSON Schema itself. It originates from the DTCG spec, which is a domain-specific standard for design tokens. JSON Schema tooling will not treat `$extensions` specially; it's just another property.
- **Deeper nesting than `x-` prefix** — accessing a value requires three levels (`$extensions` → `com.figma` → `type`) versus two with `x-platform` (`x-platform` → `FIGMA` → `type`) or one with a flat `x-` annotation (`x-figma-type`). This adds verbosity to both the schema definitions and any code that reads the values.
- **Reverse-domain keys are not validated** — nothing enforces that `com.figma` is actually Figma's domain or that keys follow reverse-domain notation. A consumer could write `figma` or `FIGMA` and the schema would accept it (since the top-level `$extensions` uses `additionalProperties: true`). Discipline is convention-only, same as `x-` prefixes.
- **DTCG is a community group standard, not a W3C recommendation** — the Design Tokens Community Group specification is stable and broadly adopted by design tooling (Figma, Style Dictionary, Tokens Studio), but it carries community group status rather than full W3C recommendation status. In practice this distinction is largely academic — the `$extensions` pattern is well-established and unlikely to change.
- Requires removing `x-platform` from the schema (low-risk: no typed consumer exists)

---

### Option B: `x-platform` everywhere *(Rejected)*

Standardize on `x-platform` across all types, including refactoring `TokenReference` to use `x-platform.FIGMA` instead of `$extensions["com.figma"]`.

```yaml
# TokenReference would become:
$token: "DS Color.Text.Primary"
$type: color
x-platform:
  FIGMA:
    id: "VariableID:1234"
    name: "Text/Primary"
```

**Rejected because**:
- Contradicts the DTCG specification that `TokenReference` was designed to follow
- Requires a **breaking change** to `TokenReference` (which has typed consumers and is in active use) — forces a MAJOR bump
- `x-platform` is a bespoke convention — while `x-` prefixed properties are valid JSON Schema annotations, the nested `FIGMA` keying scheme has no external standard backing it
- Uses SCREAMING_CASE platform keys (`FIGMA`) instead of reverse-domain notation, making it unclear how to add code platforms (React? `REACT`? `REACTJS`?) — the convention doesn't scale

---

### Option C: Keep both patterns *(Rejected)*

Leave `x-platform` on props and `$extensions` on `TokenReference` as-is, documenting when to use each.

**Rejected because**:
- Perpetuates the inconsistency that prompted this ADR
- Forces downstream consumers to understand and handle two different extension mechanisms
- Violates the principle of a stable, intentional API — two patterns for the same concept is confusing
- The `x-platform` schema has no TypeScript counterpart, which is already a Constitution I violation

---

## Decision

### Type hierarchy

Three types compose the extension system. Each platform extension interface describes the **known** metadata fields for that platform while remaining open to additional fields — platform extensions are inherently extensible and should not reject unknown properties. `PropExtensions` is the container that maps reverse-domain keys to their platform extension types:

```typescript
// Platform-specific metadata shape — known fields typed, additional fields pass through
interface FigmaPropExtension {
  type?: string;   // Figma-native prop type (BOOLEAN, TEXT, INSTANCE_SWAP, VARIANT)
  [key: string]: unknown;
}

// Container: maps reverse-domain keys to platform extension types
interface PropExtensions {
  'com.figma'?: FigmaPropExtension;
}

// Usage on each prop interface
interface BooleanProp {
  type: 'boolean';
  default: boolean;
  $extensions?: PropExtensions;   // optional — MINOR
}
```

When a second platform is added, create a new extension interface and add it as a property on `PropExtensions`:

```typescript
interface ReactPropExtension {
  propName?: string;
  type?: string;
}

interface PropExtensions {
  'com.figma'?: FigmaPropExtension;
  'com.reactjs'?: ReactPropExtension;
}
```

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Props.ts` | Add `FigmaPropExtension`, `PropExtensions`; add optional `$extensions` to `BooleanProp`, `StringProp`, `EnumProp`, `SlotProp` | MINOR |

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Remove `x-platform` from `BooleanProp`; add shared `FigmaPropExtension` and `PropExtensions` definitions; add `$extensions` via `$ref` to all four prop types | MINOR |

The schema mirrors the type hierarchy using `$ref`:

```yaml
# FigmaPropExtension — the Figma metadata shape
FigmaPropExtension:
  type: object
  properties:
    type:
      type: string
      enum: [BOOLEAN, TEXT, INSTANCE_SWAP, VARIANT]
  additionalProperties: true          # open — validates known fields, passes unknown ones through

# PropExtensions — container mapping reverse-domain keys to platform types
PropExtensions:
  type: object
  properties:
    com.figma:
      $ref: "#/definitions/FigmaPropExtension"
  additionalProperties: true          # allows unknown platform keys to pass

# Each prop type uses a one-line $ref
BooleanProp:
  properties:
    $extensions:
      $ref: "#/definitions/PropExtensions"
```

The existing `patternProperties: { "^\\$": {} }` on all prop definitions already permits `$`-prefixed keys, so adding explicit `$extensions` properties is purely additive.

### Notes

- `TokenReference.$extensions` in `types/Styles.ts` and `styles.schema.json` is **unchanged** — it already follows the target pattern.
- The `x-platform` property has no TypeScript counterpart today, so its removal from the schema does not break any typed consumer. Downstream transformers that emit `x-platform` will need to emit `$extensions` instead.
- Both levels of the extension hierarchy use `additionalProperties: true`: `PropExtensions` accepts unknown platform keys, and each platform extension object (e.g., `FigmaPropExtension`) accepts unknown fields within that platform's namespace. This is intentional — extensions are inherently extensible. The schema validates the fields it knows about (e.g., `type` must be one of `BOOLEAN`, `TEXT`, `INSTANCE_SWAP`, `VARIANT` if present) but does not reject additional platform-specific metadata (e.g., `visibilityProp`, `source`). This avoids forcing a schema change every time a new Figma-specific field is added to the transformer output.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — after this change, every prop type in `types/Props.ts` that gains `$extensions` will have a matching schema property in `component.schema.json`.
- **Parity check**:
  - `BooleanProp.$extensions` ↔ `#/definitions/BooleanProp/properties/$extensions`
  - `StringProp.$extensions` ↔ `#/definitions/StringProp/properties/$extensions`
  - `EnumProp.$extensions` ↔ `#/definitions/EnumProp/properties/$extensions`
  - `SlotProp.$extensions` ↔ `#/definitions/SlotProp/properties/$extensions`
  - `TokenReference.$extensions` ↔ `#/definitions/TokenReference/properties/$extensions` (unchanged)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Recompile | No usage changes — `$extensions` on props is optional and informational. Recompile against updated types. |

---

## Semver Decision

**Version bump**: `0.14.0` (`MINOR`)

**Justification**: All changes are additive optional fields. The removal of `x-platform` from the schema is not a breaking change because it had no TypeScript counterpart and was not part of the typed public API. Per Constitution III, additive optional fields are a MINOR bump.

---

## Consequences

- All platform-specific metadata across the schema follows a single pattern: `$extensions["<reverse-domain-key>"]`
- The `x-platform` pattern is eliminated, resolving the current type ↔ schema drift on `BooleanProp`
- Future Figma extensions (e.g., node IDs on elements, layer metadata) can be added under `com.figma` without introducing new top-level properties
- Design tool platforms can be supported via their own reverse-domain key (e.g., `com.figma`, `com.sketch`, `io.penpot`)
- Code implementation platforms can attach platform-specific hints alongside design tool provenance (e.g., `com.reactjs`, `org.webcomponents`, `com.apple.swiftui`, `dev.android.compose`)
- Multiple platform keys can coexist on the same node — no schema restructuring required to add new platforms
- Downstream transformers that currently emit `x-platform` must update to emit `$extensions` instead
