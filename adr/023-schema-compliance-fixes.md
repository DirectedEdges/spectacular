# ADR: Fix schema compliance gaps and improve schema URL metadata

**Branch**: `023-schema-compliance-fixes`
**Created**: 2026-03-13
**Status**: ACCEPTED
**Summary**: `SlotProp.default` becomes optional and pattern properties admit `$`-prefixed keys, bringing types and schema back into compliance.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — extends ADR 022 for `SlotProp.default` optionality)*

---

## Context

Schema compliance testing (`anova-dev-testing` test 0008) validated the `library` spec output from both CLI and Plugin against `component.schema.json` and `styles.schema.json`. The test found **58 violations across 26 components**, all appearing in **both** sources — indicating schema gaps rather than output bugs. The violations collapse to three distinct root causes:

1. **`SlotProp.default` is required but not always emitted** — The transformer outputs slot props as `{ type: "slot" }` when there is no meaningful default. The schema requires `default` (`required: ["type", "default"]`), causing validation failure. The TypeScript type also declares `default` as required (`default: string | null`). Both need to make it optional.

2. **Props with `$extensions` fail `additionalProperties: false`** — The transformer emits `$extensions` metadata on some props (e.g., `{ "com.figma": { "visibilityProp": "labelVisible" } }` on visibility-toggled string props). All four prop definitions use `additionalProperties: false` and don't permit `$extensions` or any `$`-prefixed metadata fields.

3. **`ColorStyleValue` rejects bare hex strings** — The schema's `ColorStyleValue` oneOf accepts `ColorValue` (structured DTCG object), `TokenReference`, `GradientValue`, or `null`. The TypeScript `ColorStyle` type already includes `string` in its union (`string | TokenReference | GradientValue | null`), but the schema does not. This is an existing type–schema drift (Constitution I). The transformer correctly emits bare hex strings (e.g., `"#666E74"`) and hex-with-opacity (e.g., `"#0E1114, 50%"`) for untokenized colors. The schema must be widened to match the type.

4. **`Metadata.schema` lacks a versioned URL and discovery link** — A user report (test 0009) revealed that the `schema.url` field in generated output points to a 404 (`https://github.com/DirectedEdges/anova/blob/main/anova.schema.json`). The actual schemas live in `schema/*.schema.json`. Furthermore, the URL is unversioned (`main` branch) while the output carries a `schema.version` field — users validating old output against the latest `main` schema get false failures because the schema has evolved. The `Metadata` type and schema need a `latest` field for schema discovery alongside the existing versioned `url`.

---

## Decision Drivers

- **Type–schema symmetry (Constitution I)**: Types and schema must describe the same structure. `ColorStyle` already includes `string`; the schema must match.
- **Schema validity (Constitution IV)**: The schema must be mechanically verifiable. `oneOf` discrimination between prop types must be preserved.
- **Additive-only when possible (Constitution III)**: All three fixes widen existing definitions — no fields are removed or renamed.
- **No runtime logic (Constitution II)**: All changes are purely declarative.
- **DTCG extensibility convention**: The `$`-prefix pattern for metadata extensions is established by `TokenReference.$extensions` and aligns with DTCG §5.2.3.
- **Discoverability**: Users and LLMs should be able to find the correct schema from the output metadata alone. A broken URL and version-agnostic link undermine troubleshooting.

---

## Options Considered

### Option A: Four targeted fixes — schema compliance + metadata URL improvement *(Selected)*

1. Make `SlotProp.default` optional (remove from `required` array)
2. Add `patternProperties: { "^\\$": {} }` to all four prop definitions to allow `$`-prefixed metadata fields while preserving `additionalProperties: false`
3. Add `{ "type": "string" }` branch to `ColorStyleValue` oneOf
4. Add `latest` field to `Metadata.schema` for stable discovery URL; clarify `url` as the versioned schema URL

**Pros**:
- Preserves `oneOf` discrimination between `StringProp` and `EnumProp` — `additionalProperties: false` still rejects non-`$`-prefixed unknown fields
- `patternProperties` is implicit rather than explicit — allows any `$`-prefixed metadata, not just `$extensions`, which is consistent with how `TokenReference` uses the `$` prefix convention
- Resolves all 58 violations
- `ColorStyleValue` string branch restores type–schema symmetry that was already drifted
- `Metadata.schema.latest` gives users and LLMs a working discovery URL; versioned `url` enables exact-version validation and troubleshooting

**Cons / Trade-offs**:
- `patternProperties` is a less common JSON Schema pattern — consumers validating with custom tooling may need to account for it
- Bare `string` in `ColorStyleValue` is a weaker contract than requiring structured `ColorValue` objects — but the TypeScript type already permits this
- Adding `latest` introduces a field that will always point to `main` — consumers must understand that `url` is the pinned version and `latest` may be ahead

---

### Option B: Remove `additionalProperties: false` from prop definitions *(Rejected)*

Remove `additionalProperties: false` entirely from `BooleanProp`, `StringProp`, `EnumProp`, and `SlotProp`.

**Rejected because**: This re-breaks `oneOf` discrimination between `StringProp` and `EnumProp` — the exact issue resolved by ADR 015. Without `additionalProperties: false`, a value like `{ type: "string", default: "foo", enum: ["foo", "bar"] }` would match **both** `StringProp` and `EnumProp`, causing `oneOf` to reject it.

---

### Option C: Explicitly add `$extensions` property to each prop definition *(Rejected)*

Add a named `$extensions` property with full type definition to each of `BooleanProp`, `StringProp`, `EnumProp`, and `SlotProp`.

**Rejected because**: Overly specific — ties the schema to one particular extension key rather than supporting the general `$`-prefix convention. Also requires maintaining parallel `$extensions` definitions across four prop types plus `TokenReference`. The `patternProperties` approach is more extensible with less maintenance burden.

---

## Decision

### Fix 1: Make `SlotProp.default` optional

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Props.ts` | Make `SlotProp.default` optional: `default: string \| null` → `default?: string \| null` | MINOR |

**Example — new shape** (`types/Props.ts`):
```yaml
# Before
SlotProp:
  type: 'slot'
  default: string | null       # required
  nullable?: boolean

# After
SlotProp:
  type: 'slot'
  default?: string | null      # optional
  nullable?: boolean
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Remove `"default"` from `SlotProp.required` array: `["type", "default"]` → `["type"]` | MINOR |

**Example — new shape** (`schema/component.schema.json`):
```yaml
# Before — SlotProp
required: ["type", "default"]

# After — SlotProp
required: ["type"]
```

---

### Fix 2: Allow `$`-prefixed metadata on all prop types

### Type changes (`types/`)

No TypeScript changes needed. TypeScript interfaces with specific fields already allow extra properties at runtime — there is no `additionalProperties: false` equivalent in TypeScript. The existing interfaces are compatible.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `patternProperties: { "^\\$": {} }` to `BooleanProp` | MINOR |
| `component.schema.json` | Add `patternProperties: { "^\\$": {} }` to `StringProp` | MINOR |
| `component.schema.json` | Add `patternProperties: { "^\\$": {} }` to `EnumProp` | MINOR |
| `component.schema.json` | Add `patternProperties: { "^\\$": {} }` to `SlotProp` | MINOR |

**Example — new shape** (`schema/component.schema.json`, shown for `StringProp`):
```yaml
# Before — StringProp
properties:
  type: { type: string, const: "string" }
  default: { type: ["string", "null"] }
  nullable: { type: boolean }
  examples: { type: array, items: { type: string } }
additionalProperties: false

# After — StringProp
properties:
  type: { type: string, const: "string" }
  default: { type: ["string", "null"] }
  nullable: { type: boolean }
  examples: { type: array, items: { type: string } }
patternProperties:
  "^\\$": {}            # allows $extensions and any $-prefixed metadata
additionalProperties: false    # still rejects non-$-prefixed unknown fields
```

---

### Fix 3: Add `string` branch to `ColorStyleValue`

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| *(none)* | `ColorStyle` in `Styles.ts` already includes `string` in its union — no change needed | — |

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Add `{ "type": "string" }` branch to `ColorStyleValue` oneOf | MINOR |

**Example — new shape** (`schema/styles.schema.json`):
```yaml
# Before — ColorStyleValue oneOf
- $ref: "#/definitions/ColorValue"
- $ref: "#/definitions/TokenReference"
- $ref: "#/definitions/GradientValue"
- type: "null"

# After — ColorStyleValue oneOf
- $ref: "#/definitions/ColorValue"
- $ref: "#/definitions/TokenReference"
- $ref: "#/definitions/GradientValue"
- type: string
- type: "null"
```

### Notes

- The `string` branch covers both bare hex (`"#666E74"`) and hex-with-opacity (`"#0E1114, 50%"`) formats. No `pattern` constraint is applied — the schema defers format validation to consumers, consistent with how `Style` (the general style value type) already accepts `string` without pattern constraints.
- This change resolves an existing type–schema drift: `ColorStyle` in `Styles.ts` has included `string` since its introduction, but the schema never had a matching branch.
- ADR 022 (`nullable-slot-props`) proposed widening `SlotProp.default` to accept `null` and adding `nullable`. That ADR noted `default` remains required. This ADR extends that decision by making `default` optional — addressing the case where slot props have no meaningful default value at all.

---

### Fix 4: Add `latest` field to `Metadata.schema` and clarify `url` semantics

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Metadata.ts` | Add optional `latest?: string` to `Metadata.schema` | MINOR |
| `Metadata.ts` | Add JSDoc to `url` clarifying it is the versioned schema URL | PATCH |

**Example — new shape** (`types/Metadata.ts`):
```yaml
# Before
schema:
  url: string
  version: string

# After
schema:
  url: string          # versioned URL pinned to this output's schema (e.g. raw.githubusercontent.com/.../v0.13.0/schema/component.schema.json)
  version: string
  latest?: string      # stable URL to latest schema on main (e.g. raw.githubusercontent.com/.../main/schema/component.schema.json)
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `latest` string property to `Metadata.schema` (not in `required`) | MINOR |
| `component.schema.json` | Add `description` to `url` and `latest` properties | PATCH |

**Example — new shape** (`schema/component.schema.json`, Metadata.schema):
```yaml
# Before — Metadata/properties/schema
properties:
  url: { type: string }
  version: { type: string }
required: ["url", "version"]
additionalProperties: false

# After — Metadata/properties/schema
properties:
  url:
    type: string
    description: "Versioned schema URL pinned to a git tag (e.g. https://raw.githubusercontent.com/.../v0.13.0/schema/component.schema.json)"
  version:
    type: string
  latest:
    type: string
    description: "Stable URL pointing to the latest schema on the main branch for discovery"
required: ["url", "version"]
additionalProperties: false
```

### Notes

- `url` semantics change from "arbitrary link" to "versioned raw URL that resolves to the exact schema this output was generated against." This is a documentation/convention change — the type stays `string`, so it is non-breaking. The downstream transformer (`METADATA.SCHEMA_URL`) must update its value to use a versioned git tag URL (e.g., `https://raw.githubusercontent.com/DirectedEdges/anova/v0.13.0/schema/component.schema.json`).
- `latest` is optional — older output without it remains valid. Producers should emit it for discoverability.
- `raw.githubusercontent.com` URLs are directly fetchable (returns JSON), unlike `github.com/blob/` URLs (returns HTML). This matters for programmatic validation and LLM tool use.
- The transformer must also derive `SCHEMA_VERSION` from the `@directededges/anova` package version rather than hardcoding it — but that is a transformer-side implementation detail, not a type/schema change.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes for Fixes 1, 3, and 4. Fix 2 is schema-only but compatible — TypeScript interfaces don't enforce `additionalProperties: false`, so they already permit extra fields.
- **Parity check**:
  - `SlotProp.default?: string | null` ↔ `SlotProp.required: ["type"]` + `default.type: ["null", "string"]`
  - `ColorStyle` includes `string` ↔ `ColorStyleValue.oneOf` includes `{ "type": "string" }`
  - `patternProperties` has no TypeScript counterpart — no drift; TypeScript is inherently open to extra properties on interfaces
  - `Metadata.schema.latest?: string` ↔ `Metadata/properties/schema/properties/latest: { type: string }` (not in `required`)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Recompile — `SlotProp.default` is now optional; `Metadata.schema.latest` is available | Add optional-chain when accessing `SlotProp.default`; no action needed for `latest` (optional field) |

---

## Semver Decision

**Version bump**: MINOR (part of `0.13.0` pre-release)

**Justification**: All changes are additive — making a required field optional, allowing additional properties via `patternProperties`, and adding a new branch to a `oneOf`. No existing valid values are rejected. Per Constitution III: "MINOR for additive types or new optional fields."

---

## Consequences

- All 58 schema compliance violations from test 0008 are resolved
- Schema validation of CLI and Plugin output will pass cleanly for the `library` spec
- `SlotProp` instances without a `default` field are now valid — producers are no longer forced to emit a synthetic default for slot props
- Props can carry `$`-prefixed metadata (e.g., `$extensions`) without violating `additionalProperties` — consistent with the DTCG extension convention used by `TokenReference`
- `ColorStyleValue` accepts bare hex strings, matching the existing `ColorStyle` TypeScript type — type–schema drift is resolved
- `oneOf` discrimination between `StringProp` and `EnumProp` is preserved — `additionalProperties: false` still rejects non-pattern-matched unknown fields
- Generated output metadata includes a working versioned schema URL (`url`) and a stable discovery URL (`latest`), enabling users and LLMs to find and validate against the correct schema version
- The version-mismatch class of validation failures (test 0009) becomes self-diagnosable — users can compare `metadata.schema.version` against the schema they're validating with
