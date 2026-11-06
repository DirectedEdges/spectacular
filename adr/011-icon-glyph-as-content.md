# ADR: Icon Element Type Support and Detection Config

**Branch**: `011-icon-glyph-as-content`
**Created**: 2026-03-05
**Status**: ACCEPTED
**Summary**: An `ElementType` union and `iconNamePattern` option constrain element types and detect icons by Figma naming.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

Figma's component model requires teams to publish icon glyphs as component assets. These are typically vector layers named with a conventional pattern like `DS Icon Glyph/{name}` (e.g., `DS Icon Glyph/caret-down`, `DS Icon Glyph/close`). Teams also publish wrapper components like `DS Icon` that expose configurable properties (`size`, `color`, `name`) where `name` is an instance swap property to select the glyph asset inside it.

The `ElementType` union already includes `icon` as a known element type:

```yaml
# types/Element.ts — ElementType
ElementType:
  - text
  - icon         # exists but has no detection config
  - vector
  - container
  - slot
  - instance
  - line
  - ellipse
  - rectangle
  - polygon
  - star
```

However, `icon` is not handled in the transformer's element factory — it exists as a type value but has no detection mechanism and no way for users to tell the transformer which component assets are icons. Two gaps exist:

- **No config for icon detection**: Users have no way to specify a naming pattern (e.g., `DS Icon Glyph /`) that tells the transformer how to identify icon content assets and assign the `icon` element type.
- **`AnatomyElement.type` is untyped**: The `AnatomyElement` type declares `type: string` despite `ElementType` already defining the valid values. The schema similarly uses `{ "type": "string" }` with no enum constraint.

Icon elements in Figma are vector layers that support a constrained style subset: fill color (via `backgroundColor`), dimensions (`width`, `height` and their min/max variants), `opacity`, `visible`, `x`, `y`, `rotation`, `layoutPositioning`, `layoutSizingHorizontal`, and `layoutSizingVertical`. The element type → applicable style mapping is a downstream concern owned by the transformer and its reference data (`reference/styles.yaml`), not by this package's type contract.

---

## Decision Drivers

- **Type–schema symmetry**: Every type change must have a corresponding schema change (Constitution I)
- **No runtime logic**: New types must remain pure data shapes — detection and filtering logic belongs in `anova-transformer` (Constitution II)
- **Stable, intentional API**: New types must represent genuine shared concepts, not internal implementation details of any one package (Constitution III)
- **Additive-only for MINOR**: All changes should be additive optional fields to avoid a MAJOR bump (Constitution — Versioning)
- **Extensibility**: The schema should work correctly out of the box while allowing implementers to provide alternative reference data and extend element types downstream

---

## Options Considered

### Option A: Add `iconNamePattern` config and constrain `AnatomyElement.type` *(Selected)*

Add an optional `iconNamePattern` config field so users can specify the naming pattern for icon content assets. Narrow `AnatomyElement.type` from `string` to `ElementType`. Leave element type → style property mappings to the transformer's reference data.

```yaml
# Config addition
Config.processing:
  iconNamePattern?: string   # e.g. "DS Icon Glyph /"

# AnatomyElement narrowing
AnatomyElement:
  type: ElementType      # was: string
```

**Pros**:
- Activates the existing `icon` element type with a detection mechanism
- `iconNamePattern` config field enables user-specific naming conventions without hardcoding
- All changes are additive (new optional config field, narrowing to existing values)
- Keeps element type → style mapping in the transformer where implementers can override or extend it

**Cons / Trade-offs**:
- Style property constraints per element type remain informal in `reference/styles.yaml` rather than typed — acceptable because this is a downstream concern and future extensibility work may formalize it

---

### Option B: Also add `ElementTypeStyleMap` type to this package *(Rejected)*

In addition to the config and type narrowing, add a `Record<ElementType, StyleKey[]>` type that formally maps each element type to its applicable style properties.

**Rejected because**: The element type → style mapping is a downstream concern. Hardcoding it as a type in the schema package prevents implementers from providing alternative reference sets or extending with new element types. The transformer should own this mapping via its reference data, allowing it to work correctly out of the box while remaining extensible.

---

### Option C: Add a new `glyph` element type instead of reusing `icon` *(Rejected)*

Add `glyph` as a separate value in the `ElementType` union to distinguish glyph content from the existing `icon` type.

**Rejected because**: `icon` already exists in `ElementType` for exactly this purpose — it represents vector-based icon content assets. Adding `glyph` would create two overlapping concepts and force consumers to handle both. The right approach is to activate `icon` with proper detection config.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Anatomy.ts` | Constrain `AnatomyElement.type` from `string` to `ElementType` | MINOR |
| `Config.ts` | Add optional `iconNamePattern?: string` to `Config.processing` | MINOR |

**Example — `AnatomyElement.type` after change** (`types/Anatomy.ts`):
```yaml
# Before
AnatomyElement:
  type: string
  detectedIn?: string
  instanceOf?: string

# After
AnatomyElement:
  type: ElementType      # constrained from string
  detectedIn?: string
  instanceOf?: string
```

**Example — `Config.processing` after change** (`types/Config.ts`):
```yaml
# Before
Config.processing:
  subcomponentNamePattern: string
  variantDepth: 1 | 2 | 3 | 9999
  details: 'FULL' | 'LAYERED'

# After
Config.processing:
  subcomponentNamePattern: string
  iconNamePattern?: string             # optional — MINOR
  variantDepth: 1 | 2 | 3 | 9999
  details: 'FULL' | 'LAYERED'
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `ElementType` definition with enum of all known element types | MINOR |
| `component.schema.json` | Constrain `AnatomyElement.type` to `ElementType` enum via `$ref` | MINOR |
| `component.schema.json` | Add `iconNamePattern` to Config processing properties | MINOR |

**Example — `AnatomyElement` schema after change** (`schema/component.schema.json`):
```yaml
# Before
AnatomyElement:
  properties:
    type:
      type: string

# After
AnatomyElement:
  properties:
    type:
      $ref: "#/definitions/ElementType"

ElementType:
  type: string
  enum:
    - text
    - icon
    - vector
    - container
    - slot
    - instance
    - line
    - ellipse
    - rectangle
    - polygon
    - star
```

**Example — Config schema addition** (`schema/component.schema.json`):
```yaml
# Under Config.processing.properties
iconNamePattern:
  type: string
  description: "Naming pattern used to detect icon content assets (e.g. 'DS Icon Glyph /')"
  # not in required[] — optional field
```

### Notes

- Changing `AnatomyElement.type` from `string` to `ElementType` is technically a narrowing of the type. However, the `ElementType` union already documents all values the transformer produces. This change makes the implicit constraint explicit. Existing valid output already conforms, so this is treated as MINOR (documentation of existing behavior, not a breaking restriction).
- The `DEFAULT_CONFIG` constant does **not** need a default for `iconNamePattern` because it is optional and absence means "no icon detection."
- Element type → style property mappings are intentionally omitted from this package. The transformer's `reference/styles.yaml` (updated to include an `ICON` entry) serves as the default reference, and implementers can override or extend it downstream.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `ElementType` union in `types/Element.ts` ↔ `ElementType` enum definition in `schema/component.schema.json`
  - `AnatomyElement.type: ElementType` in `types/Anatomy.ts` ↔ `AnatomyElement.properties.type.$ref: ElementType` in `schema/component.schema.json`
  - `Config.processing.iconNamePattern` in `types/Config.ts` ↔ `Config.processing.properties.iconNamePattern` in `schema/component.schema.json`

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | `icon` element type may now appear in output when `iconNamePattern` is configured; new optional `iconNamePattern` config field available | Recompile against updated types. Optionally expose `iconNamePattern` in CLI config. No breaking changes — existing output without icon detection remains unchanged. |

---

## Semver Decision

**Version bump**: `0.12.0` → `0.12.0` (changes included in current unreleased minor)

**Justification**: All changes are additive — new optional config field, type narrowing to existing values. No existing fields are removed or renamed. This is MINOR per Constitution III and versioning rules. Since `0.12.0` is the current unreleased version, these changes are included in the existing minor bump.

---

## Consequences

- The existing `icon` element type gains practical support via `iconNamePattern` detection config
- Users can configure `iconNamePattern` to match their team's naming convention for icon content assets (e.g., `DS Icon Glyph /`)
- `AnatomyElement.type` is now constrained to known element types, improving type safety for all consumers
- Element type → style property mappings remain in the transformer's reference data, allowing implementers to override defaults or extend with custom element types
- `reference/styles.yaml` in the transformer should be updated to include an `ICON` entry with its applicable styles
- Downstream transformer logic for icon detection and style filtering is implemented in `anova-transformer`, not in this package
