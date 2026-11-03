# ADR: Subcomponent Search Scope Config

**Branch**: `031-subcomponent-search-scope`
**Created**: 2026-03-24
**Status**: ACCEPTED
**Summary**: A `processing.subcomponents` object with `scope`, `match` and `exclude` replaces `subcomponentNamePattern` for finding subcomponents.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

Today, the transformer discovers subcomponents exclusively from elements nested within a component's own `COMPONENT`/`COMPONENT_SET` anatomy tree. This means any subcomponent that matches the `subcomponentNamePattern` but lives **outside** the parent component's layer hierarchy — for example, a composable subcomponent that only appears via a `SLOT` layer or exists as a standalone asset on the same Figma page — is never detected.

[anova-transformer#12](https://github.com/DirectedEdges/anova-transformer/issues/12) proposes that the transformer also search the surrounding Figma page for matching assets. This requires two new `Config` options in the shared contract:

1. **Whether** to search beyond the component's nested anatomy (opt-in toggle)
2. **Which matches to include or exclude** — on a typical Figma page, a component `X` may have many sibling assets that share its prefix but serve different purposes:

```
X / Y                  ← subcomponent, include as Y subcomponent
X / _ / Y              ← subcomponent, include as Y subcomponent
X / Examples / Y       ← example asset, ignore
X / Text cases / Y     ← test case asset, ignore
```

The config must give maintainers a robust, readable way to scope which page-level assets are genuine subcomponents and which are not.

These belong in `Config.processing` because they control how the transformer discovers subcomponents. The existing `include.subcomponents` boolean becomes redundant — the presence of `match` patterns implies subcomponent inclusion.

The current `processing.subcomponentNamePattern` is a single string that serves both anatomy detection and naming convention. As subcomponent discovery grows in complexity, a dedicated `processing.subcomponents` object replaces the flat field with a structured config that groups scope, matching, and exclusion together.

---

## Decision Drivers

- **Cohesive grouping**: Subcomponent discovery config should live together, not scattered across `processing` and `include`
- **Type ↔ Schema symmetry**: Every type addition must have a corresponding schema property (Constitution I)
- **No runtime logic**: `Config` defines shape only; search behavior lives in `anova-transformer` (Constitution II)
- **Minimal public API**: Only add fields that represent genuine shared concepts needed by all consumers (Constitution III)
- **Maintainer ergonomics**: Include/exclude patterns should be readable, generalizable across components, and easy to author without special syntax knowledge

---

## Options Considered

All three decisions are resolved.

**Reference examples** — given component `X` on a Figma page with these sibling assets:

| Asset name | Desired result |
|------------|---------------|
| `X / Y` | **Include** — direct subcomponent |
| `X / _ / Y` | **Include** — standard nested subcomponent |
| `X / Examples / Y` | **Exclude** — example asset |
| `X / Text cases / Y` | **Exclude** — test case asset |

---

### Decision 1: Search scope toggle — DECIDED

Add a `scope` enum to control where the transformer searches for subcomponents.

| Value | Behavior |
|-------|----------|
| `NESTED` | Only detect subcomponents found within the component's anatomy (current behavior, default) |
| `PAGE` | Also search the surrounding Figma page for `COMPONENT`/`COMPONENT_SET` assets matching the component's prefix |

The enum is extensible — future values (e.g., `FILE`, `LIBRARY`) can be added as MINOR bumps without breaking existing configs.

---

### Decision 2: Config location — DECIDED

The question is where the subcomponent discovery config lives. Additionally, `include.subcomponents` is removed — the presence of `match` patterns implies subcomponent inclusion in output. If `processing.subcomponents` is defined, subcomponents are included; if absent or empty, they are not.

#### 2a: Nested object within `processing` — `processing.subcomponents` *(Selected)*

Group subcomponent settings into a nested object inside `processing`. Remove `include.subcomponents` (implied by `match`).

```yaml
processing:
  subcomponents?:                               # optional; absence = no subcomponent detection
    scope?: "NESTED" | "PAGE"                   # new — defaults to NESTED
    match:                                      # required when subcomponents defined, minItems: 1
      - "{C} / {S}"
      - "{C} / _ / {S}"
    exclude?:                                   # optional
      - "{C} / Examples / {S}"
      - "{C} / Text cases / {S}"
  variantDepth: 9999
  details: "LAYERED"
include:
  variantNames: false                           # include.subcomponents removed — implied by match
  invalidVariants: false
  invalidCombinations: true
```

**Pros**:
- Groups subcomponent discovery settings without adding a new top-level key
- Short, clean field names within the nested object (`scope`, `match`, `exclude`)
- `processing` already owns `subcomponentNamePattern`, so the nesting is a natural evolution
- Eliminates the redundant `include.subcomponents` toggle — `match` patterns are the source of truth
- No ambiguity: if you define `match`, you get subcomponents

**Cons**:
- **MAJOR breaking change** to `processing` — removes `subcomponentNamePattern`, replaces with `subcomponents` object
- **MAJOR breaking change** to `include` — removes `subcomponents` boolean
- Nesting adds a level of depth to an already-nested config structure

#### 2b: Additional properties on `processing` *(Rejected)*

Keep `subcomponentNamePattern` where it is; add new flat fields with the `subcomponent` prefix alongside it.

```yaml
processing:
  subcomponentNamePattern: "{C} / _ / {S}"     # existing — unchanged
  subcomponentSearchScope: "PAGE"               # new
  subcomponentMatch:                            # new
    - "{C} / {S}"
    - "{C} / _ / {S}"
  subcomponentExclude:                          # new
    - "{C} / Examples / {S}"
    - "{C} / Text cases / {S}"
  variantDepth: 9999
  details: "LAYERED"
include:
  subcomponents: true                           # stays here
```

**Rejected because**: `processing` accumulates verbose `subcomponent*` prefixed fields. The relationship between `subcomponentNamePattern` and `subcomponentMatch` is ambiguous. Subcomponent config stays split across `processing` and `include`.

#### 2c: Peer object of `processing` — new top-level `Config.subcomponents` *(Rejected)*

Move all subcomponent-related config into a dedicated top-level section alongside `processing`, `format`, and `include`.

```yaml
processing:
  variantDepth: 9999
  details: "LAYERED"
  glyphNamePattern: "..."
  codeOnlyPropsPattern: "..."
format: { ... }
include:
  variantNames: false
  invalidVariants: false
  invalidCombinations: true
subcomponents:                                  # new top-level section
  scope: "PAGE"                                 # new
  match:                                        # replaces processing.subcomponentNamePattern
    - "{C} / {S}"
    - "{C} / _ / {S}"
  exclude:                                      # new
    - "{C} / Examples / {S}"
    - "{C} / Text cases / {S}"
```

**Rejected because**: Adds a fourth top-level key to `Config`. Subcomponent discovery is a processing concern — elevating it to a peer of `processing` overstates its independence from other processing settings like `glyphNamePattern` and `codeOnlyPropsPattern`.

---

### Decision 3: What syntax do `match[]` and `exclude[]` use? — DECIDED

`match` is required (`string[]`, `minItems: 1`) and defines which assets are genuine subcomponents. `exclude` is optional (`string[]`) and filters out false positives. The question is what the strings represent.

#### 3a: Template patterns using `{C}` / `{S}` syntax *(Selected)*

Both `match` and `exclude` use the same template syntax as the former `subcomponentNamePattern`. `{C}` is replaced with the component name; `{S}` matches any subcomponent name.

```yaml
subcomponents:
  scope: "PAGE"
  match:
    - "{C} / {S}"
    - "{C} / _ / {S}"
  exclude:
    - "{C} / Examples / {S}"
    - "{C} / Text cases / {S}"
```

| Asset | Evaluation | Result |
|-------|-----------|--------|
| `X / Y` | matches `{C} / {S}` in `match` | **included** |
| `X / _ / Y` | matches `{C} / _ / {S}` in `match` | **included** |
| `X / Examples / Y` | matches `{C} / Examples / {S}` in `exclude` | **excluded** |
| `X / Text cases / Y` | matches `{C} / Text cases / {S}` in `exclude` | **excluded** |
| `X / Docs / Intro` | no `match` hit | **ignored** (not a subcomponent) |

**Resolution rules** (apply identically to both anatomy-based and page-level detection):
- An asset must match at least one `match` pattern to be considered
- If it also matches an `exclude` pattern, the exclusion wins (explicit deny) — regardless of whether the asset was discovered via anatomy or page search
- Assets that match neither are ignored

**Pros**:
- Full control over both include and exclude at the pattern level
- Reuses the familiar `{C}` / `{S}` template syntax already established by the former `subcomponentNamePattern`
- `match` is strict — only explicitly matched patterns are considered, preventing over-inclusion
- Handles arbitrary segment structures (e.g., `{C} / Internal / _ / {S}`)
- Template patterns generalize across all components — no per-component entries needed

**Cons**:
- Maintainers must understand `{C}` / `{S}` placeholder syntax
- Two arrays to manage; slightly higher cognitive load than segment-only approaches

#### 3b: Segment-name syntax (plain strings) *(Rejected)*

`match` entries are segment patterns (the parts between `{C}` and `{S}`, expressed as literal middle-segment paths). `exclude` entries are the same. The `{C} / ` prefix and trailing `/ {S}` are implicit.

```yaml
subcomponents:
  scope: "PAGE"
  match:
    - ""          # direct child: {C} / {S}
    - "_ /"       # nested: {C} / _ / {S}
  exclude:
    - "Examples /"
    - "Text cases /"
```

| Asset | Evaluation | Result |
|-------|-----------|--------|
| `X / Y` | middle segment is empty → matches `""` in `match` | **included** |
| `X / _ / Y` | middle segment is `_ /` → matches `"_ /"` in `match` | **included** |
| `X / Examples / Y` | middle segment is `Examples /` → matches `"Examples /"` in `exclude` | **excluded** |
| `X / Text cases / Y` | middle segment is `Text cases /` → matches `"Text cases /"` in `exclude` | **excluded** |

**Rejected because**: Asset names can include terms outside the middle segment — e.g., a component named `DS Examples Button` or a subcomponent `Icon Examples`. Stripping `{C}` and `{S}` from the syntax prevents matching on the full name structure, making it impossible to distinguish these cases. The implicit framing is also novel syntax not established elsewhere in the config.

#### 3c: Exclude-segments only (plain strings for `exclude`, templates for `match`) *(Rejected)*

`match` uses `{C}` / `{S}` template syntax (same as 3a). `exclude` is simplified to a flat list of segment names to block — any asset whose name contains a ` / {segment} / ` is excluded.

```yaml
subcomponents:
  scope: "PAGE"
  match:
    - "{C} / {S}"
    - "{C} / _ / {S}"
  exclude:
    - "Examples"
    - "Text cases"
```

| Asset | Evaluation | Result |
|-------|-----------|--------|
| `X / Y` | matches `{C} / {S}` in `match`, no excluded segment | **included** |
| `X / _ / Y` | matches `{C} / _ / {S}` in `match`, no excluded segment | **included** |
| `X / Examples / Y` | matches `{C} / {S}` in `match`, but contains segment `Examples` | **excluded** |
| `X / Text cases / Y` | matches `{C} / {S}` in `match`, but contains segment `Text cases` | **excluded** |

**Rejected because**: Plain-string segment matching prevents forming broader exclude patterns. For example, you cannot distinguish `{C} / _ / Examples / {S}` from `{C} / Examples / {S}` — both contain the segment `Examples`. The asymmetry between `match` (template syntax) and `exclude` (plain strings) also creates inconsistent authoring expectations.

#### 3d: Keep `subcomponentNamePattern` alongside `match` and `exclude` *(Rejected)*

Retain the existing `subcomponentNamePattern` as a separate field within `processing.subcomponents`, alongside the new `match` and `exclude` arrays.

```yaml
subcomponents:
  scope: "PAGE"
  namePattern: "{C} / _ / {S}"               # retained from subcomponentNamePattern
  match:
    - "{C} / {S}"
    - "{C} / _ / {S}"
  exclude:
    - "{C} / Examples / {S}"
    - "{C} / Text cases / {S}"
```

**Rejected because**: `namePattern` overlaps with `match`. Both define "what patterns constitute a subcomponent" — `namePattern` was the single-pattern version, `match` is the multi-pattern version. Keeping both creates ambiguity about which takes precedence and whether `namePattern` is implicitly added to `match`. A single `match` array is cleaner and eliminates the overlap.

#### 3e: Retain `subcomponentNamePattern` only, omit `match` *(Rejected)*

Keep `subcomponentNamePattern` as the sole pattern field. Add only `scope` and `exclude` to the nested object, without a `match` array.

```yaml
subcomponents:
  scope: "PAGE"
  namePattern: "{C} / _ / {S}"               # single pattern, as before
  exclude:
    - "{C} / Examples / {S}"
    - "{C} / Text cases / {S}"
```

**Rejected because**: A single pattern cannot express multiple valid subcomponent structures. In the reference example, both `{C} / {S}` (direct child) and `{C} / _ / {S}` (nested) are valid — a single `namePattern` can only capture one. The `match` array is essential for supporting multiple include patterns.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Config.ts` | Remove `processing.subcomponentNamePattern` | MAJOR |
| `Config.ts` | Add optional `processing.subcomponents?` object with `scope?`, `match`, `exclude?` | MAJOR |
| `Config.ts` | Remove `include.subcomponents` (implied by presence of `subcomponents`) | MAJOR |

**Example — new shape** (`types/Config.ts`):
```yaml
# Before
processing:
  subcomponentNamePattern: string         # removed
  glyphNamePattern?: string
  codeOnlyPropsPattern?: string
  slotConstraints?: boolean
  variantDepth: 1 | 2 | 3 | 9999
  details: "FULL" | "LAYERED"
  inferNumberProps?: boolean
include:
  subcomponents: boolean                  # removed — implied by match
  variantNames: boolean
  invalidVariants: boolean
  invalidCombinations: boolean

# After
processing:
  subcomponents?:                          # optional; absence = no subcomponent detection
    scope?: "NESTED" | "PAGE"              # optional, defaults to NESTED
    match: string[]                        # required when present, minItems: 1 — uses {C}/{S} template syntax
    exclude?: string[]                     # optional — uses {C}/{S} template syntax
  glyphNamePattern?: string
  codeOnlyPropsPattern?: string
  slotConstraints?: boolean
  variantDepth: 1 | 2 | 3 | 9999
  details: "FULL" | "LAYERED"
  inferNumberProps?: boolean
include:
  variantNames: boolean
  invalidVariants: boolean
  invalidCombinations: boolean
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Remove `subcomponentNamePattern` from `Config.processing.properties` | MAJOR |
| `component.schema.json` | Add optional `subcomponents` object to `Config.processing.properties` with `scope`, `match`, `exclude` (not in `required`) | MAJOR |
| `component.schema.json` | Remove `subcomponents` from `Config.include.properties` and `Config.include.required` | MAJOR |

**Example — new schema shape** (`schema/component.schema.json`):
```yaml
# Under #/definitions/Config/properties/processing/properties
subcomponents:
  type: object
  properties:
    scope:
      type: string
      enum: [NESTED, PAGE]
      default: NESTED
      description: "Where to search for subcomponents. NESTED = anatomy only; PAGE = also search the Figma page."
    match:
      type: array
      items:
        type: string
      minItems: 1
      description: "Template patterns defining which assets are subcomponents. Uses {C} (component name) and {S} (subcomponent name) placeholders."
    exclude:
      type: array
      items:
        type: string
      description: "Template patterns defining which matched assets to exclude. Same {C}/{S} syntax as match."
  required: [match]
  additionalProperties: false
```

### Notes

- `processing.subcomponentNamePattern` is removed from `required`; `processing.subcomponents` is added as an optional property (not in `required`)
- `include.subcomponents` is removed from `include.required` and `include.properties` — subcomponent detection is now conditional on the presence of `processing.subcomponents`; absence means no detection
- Both `match` and `exclude` entries use `{C}` / `{S}` template syntax (Decision 3a)
- `match` and `exclude` apply universally to both anatomy-based and page-level subcomponent detection. An asset matching both a `match` and an `exclude` pattern is excluded regardless of discovery source
- `DEFAULT_CONFIG` must be updated:
  ```typescript
  processing: {
    subcomponents: {
      match: ['{C} / _ / {S}'],  // was subcomponentNamePattern
    },
    variantDepth: 9999,
    details: 'LAYERED',
  }
  // include.subcomponents removed
  ```
- The semver bump is MAJOR because required fields are removed and replaced

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — every field in the `processing.subcomponents` type has a direct schema counterpart
- **Parity check**:
  - `Config.processing.subcomponents.scope` ↔ `#/.../processing/properties/subcomponents/properties/scope`
  - `Config.processing.subcomponents.match` ↔ `#/.../processing/properties/subcomponents/properties/match`
  - `Config.processing.subcomponents.exclude` ↔ `#/.../processing/properties/subcomponents/properties/exclude`
- **Removed**:
  - `Config.processing.subcomponentNamePattern` ↔ `#/.../processing/properties/subcomponentNamePattern` — replaced by the `subcomponents` object
  - `Config.include.subcomponents` ↔ `#/.../include/properties/subcomponents` — removed, implied by `match`

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Breaking — config construction must reference `processing.subcomponents.match` instead of `processing.subcomponentNamePattern`; `include.subcomponents` is removed | Update config building, CLI option mapping, and remove any `include.subcomponents` toggle |

---

## Semver Decision

**Version bump**: MAJOR (absorbed into `0.15.0` release cycle, which is already unreleased)

**Justification**: Removing required fields (`processing.subcomponentNamePattern`, `include.subcomponents`) and replacing them with the `processing.subcomponents` object is a breaking change to `Config` per Constitution III. Since `0.15.0` is not yet released, this breaking change is absorbed into the current release.

---

## Consequences

- Consumers can configure the transformer to discover subcomponents that live outside a component's nested anatomy, addressing the gap described in [anova-transformer#12](https://github.com/DirectedEdges/anova-transformer/issues/12)
- `match` arrays give maintainers explicit control over which naming patterns constitute valid subcomponents
- `exclude` arrays let maintainers filter false positives (e.g., example or test-case assets) without modifying Figma layer names
- Subcomponent discovery config is grouped cohesively in `processing.subcomponents` instead of scattered as flat `subcomponent*`-prefixed fields
- **Breaking**: `processing.subcomponentNamePattern` is removed — all consumers must migrate to `processing.subcomponents.match`
- **Breaking**: `include.subcomponents` is removed — subcomponent inclusion is now implied by the presence of `match` patterns; consumers must remove any `include.subcomponents` toggle
- Any tool validating against `component.schema.json` must update to the new schema version
- `anova-transformer` must implement the actual search, matching, and exclusion logic; the types/schema only define the configuration contract
- `DEFAULT_CONFIG` must be updated to reflect the new structure
