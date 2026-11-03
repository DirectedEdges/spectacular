# ADR: Make Config Properties with Defaults Optional

**Branch**: `035-optional-config-defaults`
**Created**: 2026-04-10
**Status**: ACCEPTED
**Summary**: Every `Config` property carrying a default becomes optional, so a config states only what it changes.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The `Config` interface in `types/Config.ts` has an inconsistency in how required vs. optional properties are declared. Five properties that have well-defined defaults in `DEFAULT_CONFIG` are marked as required:

- `processing.variantDepth` (default: `9999`)
- `processing.details` (default: `'LAYERED'`)
- `format.output` (default: `'JSON'`)
- `format.keys` (default: `'SAFE'`)
- `format.layout` (default: `'LAYOUT'`)

Meanwhile, other properties with equally well-defined defaults are already optional:

- `format.tokens` (default: `'TOKEN'`)
- `include.invalidVariants` (default: `false`)
- `include.invalidCombinations` (default: `true`)
- `include.emptyVariants` (default: `false`)

This inconsistency means a consumer providing a partial config (e.g., only overriding `format.keys`) must still supply every required field, even when the intent is "use defaults for everything else." The CLI's `ConfigLoader.deepMerge` already handles partial configs at runtime by merging over `DEFAULT_CONFIG`, but the TypeScript type rejects the same partial input at compile time.

The JSON schema mirrors this inconsistency: `processing.required` lists `["variantDepth", "details"]`, `format.required` lists `["output", "keys", "layout"]`, while `include.required` is `[]`.

---

## Decision Drivers

- **Consistency**: Properties with defaults should follow the same optional-with-default pattern already established by `format.tokens` and the `include.*` properties
- **Resilience**: `Config` should be tolerant of missing fields — callers should be able to provide only overrides, trusting `DEFAULT_CONFIG` for the rest
- **Additive-only (MINOR)**: Making required fields optional is a relaxation — existing valid configs remain valid, so this is not a breaking change
- **Type ↔ Schema symmetry**: Changes to `types/Config.ts` must be mirrored in `component.schema.json` (Constitution I)
- **No runtime logic**: This package must not add functions or processing logic (Constitution II) — `DEFAULT_CONFIG` remains the only runtime export
- **Shared contract coherence**: The type must serve all consumers equally (Constitution III) — no single downstream package's merge pattern should dictate the contract

---

## Options Considered

### Option A: Make five properties optional with `default` annotations in schema *(Selected)*

Mark `processing.variantDepth`, `processing.details`, `format.output`, `format.keys`, and `format.layout` as optional (`?`) in the TypeScript interface. Remove them from the `required` arrays in the JSON schema. Add `default` values to each property in the schema (matching `DEFAULT_CONFIG`). Export a `ResolvedConfig` type (pure type alias, no runtime logic) where all properties are required, for use by consumers that need the fully-resolved shape.

**Pros**:
- Aligns all defaulted properties under a single pattern — optional with documented default
- `ResolvedConfig` gives consumers compile-time safety after merging without adding runtime logic to this package
- Schema `default` annotations make defaults machine-discoverable for tooling and documentation
- Non-breaking: every existing valid `Config` still satisfies the relaxed type

**Cons / Trade-offs**:
- Consumers accessing properties directly on `Config` must now handle `undefined` (or use `ResolvedConfig` after merging)
- `DEFAULT_CONFIG` type changes from `Config` to `ResolvedConfig` (since it provides all values)

---

### Option B: Keep `Config` fully required, add a separate `PartialConfig` input type *(Rejected)*

Leave `Config` as-is (all five properties required). Add a `PartialConfig` type using `DeepPartial<Config>` for input, and let consumers cast to `Config` after merging.

**Rejected because**:
- Perpetuates the inconsistency — `format.tokens` and `include.*` are already optional in `Config`, so `Config` is already partially "partial"
- Introduces a third type (`PartialConfig`) when two (`Config` + `ResolvedConfig`) would suffice
- Doesn't fix the schema inconsistency — `required` arrays would still list fields that have defaults

---

### Option C: Make all five optional, no `ResolvedConfig` type *(Rejected)*

Make the five properties optional but don't export a resolved variant. Consumers use `Config` directly and handle `undefined` with nullish coalescing.

**Rejected because**:
- Forces every consumer to independently implement fallback logic for the same five properties
- No compile-time guarantee that merging was performed before accessing values
- Violates the spirit of the shared contract — the "resolved shape" is a genuine shared concept

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Config.ts` | Make `processing.variantDepth` optional | MINOR |
| `Config.ts` | Make `processing.details` optional | MINOR |
| `Config.ts` | Make `format.output` optional | MINOR |
| `Config.ts` | Make `format.keys` optional | MINOR |
| `Config.ts` | Make `format.layout` optional | MINOR |
| `Config.ts` | Add `ResolvedConfig` type (all properties required) | MINOR |
| `Config.ts` | Type `DEFAULT_CONFIG` as `ResolvedConfig` | PATCH |
| `index.ts` | Export `ResolvedConfig` type | MINOR |

**Example — `Config` before/after** (`types/Config.ts`):
```yaml
# Before — processing
processing:
  subcomponents?: { scope?: ...; match: string[]; exclude?: ... }
  glyphNamePattern?: string
  codeOnlyPropsPattern?: string
  slotConstraints?: boolean
  variantDepth: 1 | 2 | 3 | 9999        # required
  details: 'FULL' | 'LAYERED'            # required
  inferNumberProps?: boolean

# After — processing
processing:
  subcomponents?: { scope?: ...; match: string[]; exclude?: ... }
  glyphNamePattern?: string
  codeOnlyPropsPattern?: string
  slotConstraints?: boolean
  variantDepth?: 1 | 2 | 3 | 9999       # optional — default 9999
  details?: 'FULL' | 'LAYERED'           # optional — default LAYERED
  inferNumberProps?: boolean
```

```yaml
# Before — format
format:
  output: 'JSON' | 'YAML'               # required
  keys: 'SAFE' | 'CAMEL' | ...          # required
  layout: 'LAYOUT' | 'PARENT_CHILDREN' | 'BOTH'  # required
  tokens?: 'TOKEN' | ...                 # already optional

# After — format
format:
  output?: 'JSON' | 'YAML'              # optional — default JSON
  keys?: 'SAFE' | 'CAMEL' | ...         # optional — default SAFE
  layout?: 'LAYOUT' | 'PARENT_CHILDREN' | 'BOTH'  # optional — default LAYOUT
  tokens?: 'TOKEN' | ...                 # unchanged
```

**Example — `ResolvedConfig`** (`types/Config.ts`):
```typescript
# ResolvedConfig makes every property with a default required.
# Only true feature-toggle properties (where absence = feature disabled)
# remain optional.
ResolvedConfig:
  processing:
    subcomponents?: {                    # still optional (feature toggle — absence = no detection)
      scope: 'NESTED' | 'PAGE'          # required — default NESTED
      match: string[]
      exclude?: string[]
    }
    glyphNamePattern?: string            # still optional (feature toggle)
    codeOnlyPropsPattern?: string        # still optional (feature toggle)
    slotConstraints: boolean             # required — default false
    variantDepth: 1 | 2 | 3 | 9999      # required — default 9999
    details: 'FULL' | 'LAYERED'         # required — default LAYERED
    inferNumberProps: boolean            # required — default false
  format:
    output: 'JSON' | 'YAML'             # required — default JSON
    keys: 'SAFE' | 'CAMEL' | ...        # required — default SAFE
    layout: 'LAYOUT' | ...              # required — default LAYOUT
    tokens: 'TOKEN' | ...               # required — default TOKEN
  include:
    invalidVariants: boolean             # required — default false
    invalidCombinations: boolean         # required — default true
    emptyVariants: boolean               # required — default false
```

**Rule**: If a property has a default value in `DEFAULT_CONFIG`, it is required in `ResolvedConfig`. If absence means "feature disabled" (no default — the feature simply doesn't exist), it stays optional.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Remove `variantDepth` and `details` from `processing.required` | MINOR |
| `component.schema.json` | Remove `output`, `keys`, `layout` from `format.required` | MINOR |
| `component.schema.json` | Add `default` to `variantDepth` (`9999`), `details` (`"LAYERED"`), `output` (`"JSON"`), `keys` (`"SAFE"`), `layout` (`"LAYOUT"`) | MINOR |

**Example — schema before/after** (`schema/component.schema.json`):
```yaml
# Before — processing
processing:
  required: ["variantDepth", "details"]
  properties:
    variantDepth:
      type: number
      enum: [1, 2, 3, 9999]
    details:
      type: string
      enum: ["FULL", "LAYERED"]

# After — processing
processing:
  required: []
  properties:
    variantDepth:
      type: number
      enum: [1, 2, 3, 9999]
      default: 9999
    details:
      type: string
      enum: ["FULL", "LAYERED"]
      default: "LAYERED"
```

```yaml
# Before — format
format:
  required: ["output", "keys", "layout"]

# After — format
format:
  required: []
  properties:
    output:
      default: "JSON"
    keys:
      default: "SAFE"
    layout:
      default: "LAYOUT"
```

### Notes

- **`ResolvedConfig` rule**: Every property with a default in `DEFAULT_CONFIG` is required. Only true feature toggles (where absence = feature disabled) remain optional: `subcomponents` (the block itself), `glyphNamePattern`, `codeOnlyPropsPattern`
- Properties newly required in `ResolvedConfig` (beyond the original five): `tokens`, `invalidVariants`, `invalidCombinations`, `emptyVariants`, `slotConstraints`, `inferNumberProps`, and `subcomponents.scope` (when subcomponents is present)
- `DEFAULT_CONFIG` must explicitly include all defaulted values: adds `slotConstraints: false`, `inferNumberProps: false`, `subcomponents.scope: 'NESTED'`
- `ResolvedConfig` is a pure type alias — it contains no runtime logic and complies with Constitution II
- `DEFAULT_CONFIG` is typed as `ResolvedConfig` since it provides all required values

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `processing.variantDepth`: optional in TS ↔ removed from `required[]`, `default: 9999` in schema
  - `processing.details`: optional in TS ↔ removed from `required[]`, `default: "LAYERED"` in schema
  - `format.output`: optional in TS ↔ removed from `required[]`, `default: "JSON"` in schema
  - `format.keys`: optional in TS ↔ removed from `required[]`, `default: "SAFE"` in schema
  - `format.layout`: optional in TS ↔ removed from `required[]`, `default: "LAYOUT"` in schema
  - `ResolvedConfig`: TS-only type (no schema representation needed — it describes the same shape with stricter requiredness, not a new data structure)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | None — `ConfigLoader.deepMerge` already produces a fully-resolved config from partial input. Retype internal resolved config as `ResolvedConfig` for clarity. | Optional: update `ConfigLoader.mergeConfig` return type to `ResolvedConfig` |

---

## Semver Decision

**Version bump**: `0.17.0` → `0.17.0` (already on this release; change is MINOR-compatible)

**Justification**: All changes are relaxations — required fields become optional. No existing valid `Config` is invalidated. New `ResolvedConfig` type is additive. Per Constitution: "MINOR for additive types or new optional fields."

---

## Consequences

- All defaulted properties follow a single, consistent pattern: optional in `Config`, required in `ResolvedConfig`
- Only three true feature toggles remain optional in both types: `subcomponents`, `glyphNamePattern`, `codeOnlyPropsPattern`
- Consumers can provide minimal config objects (e.g., `{ processing: {}, format: {}, include: {} }`) and rely on `DEFAULT_CONFIG` for omitted values
- `ResolvedConfig` gives downstream packages compile-time assurance that merging has been performed — no null checks needed for any defaulted property
- `DEFAULT_CONFIG` is typed as `ResolvedConfig` and explicitly includes all defaulted values, making it the canonical "fully specified" config
- Downstream merge utilities (CLI's `ConfigLoader.deepMerge`, plugin's `settingsToModelConfig`) continue to work unchanged — they already produce fully-resolved configs
- Schema validators consuming `component.schema.json` will now accept configs without the previously-required fields
