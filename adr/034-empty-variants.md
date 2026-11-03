# ADR: Remove variantNames, add emptyVariants, make Config.include fields optional

**Branch**: `034-empty-variants`
**Created**: 2026-03-30
**Status**: ACCEPTED
**Summary**: An `emptyVariants` include option replaces `variantNames`, and the remaining `Config.include` fields become optional.
**Decides**: none
**Deciders**: nathanacurtis (author)
**Supersedes**: *(none)*

---

## Context

The `anova-plugin` UI exposes an "Include layered variants without elements" checkbox setting (`DATA_EMPTY_VARIANTS` in `src/UI/App/Settings/VariantsChildren.ts`), but toggling it has no effect on the transformer output. The setting is purely cosmetic — it persists in localStorage but is never passed through to the transformer pipeline.

Currently, the `Config.include` type in `types/Config.ts` defines three required boolean fields:

```typescript
include: {
  variantNames: boolean;
  invalidVariants: boolean;
  invalidCombinations: boolean;
}
```

There is no `emptyVariants` field (or equivalent) for the transformer to read. Additionally:

1. **Missing field**: The `emptyVariants` setting cannot be mapped to the config
2. **Dead feature**: `variantNames` is no longer used by any consumer and serves no purpose in current output
3. **Inconsistent pattern**: All three fields are required, which deviates from the broader Config pattern where most fields are optional with defaults specified in `DEFAULT_CONFIG`

This ADR addresses all three issues by:
- Removing the unused `variantNames` field (breaking change)
- Adding the missing `emptyVariants` field (additive)
- Making remaining `include` fields optional for consistency (non-breaking)

---

## Decision Drivers

- **Remove dead code**: `variantNames` serves no purpose and should be removed to reduce API surface
- **Accept breaking change**: Removing a field requires MAJOR version bump per Constitution III
- **Add missing functionality**: `emptyVariants` needed to support plugin UI and variant filtering
- **Type ↔ schema symmetry**: Both `types/Config.ts` and `schema/component.schema.json` must be updated in lockstep per Constitution I
- **No runtime logic**: This package defines the contract only; filtering logic belongs in `anova-transformer` per Constitution II
- **Explicit defaults**: `DEFAULT_CONFIG` must specify default values to ensure consistent behavior
- **Consistency with Config pattern**: Optional fields with defaults are the established norm (e.g., `tokens?`, `inferNumberProps?`, `slotConstraints?`)
- **Internal consistency**: The `include` section should follow a uniform pattern — all fields optional with defaults

---

## Options Considered

### Option A: Remove `variantNames`, add `emptyVariants`, make remaining fields optional *(Selected)*

Remove the unused `variantNames` field entirely, add new field `emptyVariants?: boolean`, and make remaining fields (`invalidVariants`, `invalidCombinations`) optional. All fields default to their current `DEFAULT_CONFIG` values when absent.

**Pros**:
- Removes dead code — `variantNames` is not used by any consumer
- Reduces API surface and cognitive load
- Adds needed `emptyVariants` functionality
- Creates consistency within the `include` section — all remaining fields follow the same optional pattern
- Follows established Config pattern of optional fields with sensible defaults
- Serialized configs can omit fields when using default behavior, reducing output size
- Forces consumers to explicitly handle the breaking change, ensuring they're aware of the removal

**Cons / Trade-offs**:
- Breaking change — consumers using `variantNames` must update (but since it's unused, impact should be minimal)
- Requires MAJOR version bump
- Consumers must remove `variantNames` from their config construction code

---

### Option B: Keep `variantNames` but make it optional *(Rejected)*

Make `variantNames` optional instead of removing it, treating it as deprecated.

**Rejected because**: Keeping unused fields creates technical debt and API clutter. If the field serves no purpose, it should be removed rather than deprecated. A MAJOR bump is acceptable since we're already in v0.x where breaking changes are expected.

---

### Option C: Add `Config.processing.filterEmptyVariants: boolean` *(Rejected)*

Place the field under `processing` rather than `include`, since it affects the processing pipeline.

**Rejected because**: The field controls *what to include in output*, not *how to process input*. It parallels `invalidVariants` and `invalidCombinations`, both of which live in `include`. Separating conceptually related fields undermines discoverability and consistency.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Config.ts` | Remove `variantNames` field from `Config.include` interface | MAJOR |
| `Config.ts` | Make `invalidVariants`, `invalidCombinations` optional in `Config.include` interface | MINOR |
| `Config.ts` | Add new optional field `emptyVariants?: boolean` to `Config.include` interface | MINOR |
| `Config.ts` | Remove `variantNames: false` from `DEFAULT_CONFIG.include` | MAJOR |
| `Config.ts` | Add `emptyVariants: false` to `DEFAULT_CONFIG.include` | MINOR |

**Example — new shape** (`types/Config.ts`):

```typescript
// Before
include: {
  variantNames: boolean;
  invalidVariants: boolean;
  invalidCombinations: boolean;
}

// After
include: {
  // variantNames removed — breaking change
  invalidVariants?: boolean;
  invalidCombinations?: boolean;
  emptyVariants?: boolean;  // NEW
}
```

**Default values** (`DEFAULT_CONFIG`):

```typescript
// Before
include: {
  variantNames: false,
  invalidVariants: false,
  invalidCombinations: true,
}

// After
include: {
  // variantNames removed
  invalidVariants: false,
  invalidCombinations: true,
  emptyVariants: false,  // NEW
}
```

**Rationale for `emptyVariants` default**: Setting `emptyVariants: false` (exclude empty variants) aligns with the principle of minimal output — consumers typically want only semantically meaningful variants. Users can opt in to including empty variants when debugging or analyzing variant coverage. This matches the plugin's current default behavior.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Remove `variantNames` property from `#/definitions/Config/properties/include/properties` | MAJOR |
| `component.schema.json` | Remove all fields from `#/definitions/Config/properties/include/required` array (make remaining fields optional) | MINOR |
| `component.schema.json` | Add optional `emptyVariants` property to `#/definitions/Config/properties/include/properties` | MINOR |

**Example — new shape** (`schema/component.schema.json`):

```json
// Before
"include": {
  "type": "object",
  "properties": {
    "variantNames": {
      "type": "boolean"
    },
    "invalidVariants": {
      "type": "boolean"
    },
    "invalidCombinations": {
      "type": "boolean"
    }
  },
  "required": [
    "variantNames",
    "invalidVariants",
    "invalidCombinations"
  ],
  "additionalProperties": false
}

// After
"include": {
  "type": "object",
  "properties": {
    // "variantNames" removed — breaking change
    "invalidVariants": {
      "type": "boolean",
      "description": "Include invalid variants. Defaults to false when absent."
    },
    "invalidCombinations": {
      "type": "boolean",
      "description": "Include invalid combinations. Defaults to true when absent."
    },
    "emptyVariants": {
      "type": "boolean",
      "description": "When false, exclude layered variants that contain no elements from output. When true, include all variants regardless of element presence. Defaults to false when absent."
    }
  },
  "required": [],  // All fields now optional
  "additionalProperties": false
}
```

### Notes

- **Scope expansion**: This ADR initially focused on adding `emptyVariants`, but was expanded to:
  1. Remove the unused `variantNames` field (breaking change)
  2. Make remaining `include` fields optional for consistency with the broader Config pattern
- `variantNames` removal rationale: The field is not used by any consumer and serves no purpose in current output. Removing it reduces API surface and eliminates dead code.
- All remaining `include` fields follow the same pattern: optional in the type/schema, explicit defaults in `DEFAULT_CONFIG`
- The field name `emptyVariants` follows the "include" semantics: `false` = exclude empty variants from output, `true` = include them
- "Empty variant" is defined as: a layered variant (when `processing.details = 'LAYERED'`) that contains no elements in its diff from the default variant
- The filtering logic implementation is deferred to `anova-transformer` (separate issue)
- The plugin UI mapping is deferred to `anova-plugin` (separate issue)

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `variantNames` removed from both TypeScript type and JSON schema
  - `emptyVariants` added to both: TypeScript as optional field, JSON schema as optional property (not in `required` array)
  - `invalidVariants` and `invalidCombinations` changed to optional in both TypeScript type and JSON schema
  - Both maintain `additionalProperties: false` to prevent drift
  - Field count: 3 → 3 (removed 1, added 1, kept 2)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | **Breaking**: Must remove `variantNames` from CLI; must add `emptyVariants` support | Remove `variantNames` references; add `emptyVariants` flag to CLI options |
| `anova-transformer` | **Breaking**: Must remove `variantNames` handling; must implement `emptyVariants` filtering | Remove dead `variantNames` code; implement empty variant filtering logic |
| `anova-plugin` | **Breaking**: Must remove `variantNames` from config mapping; must wire `emptyVariants` to UI | Remove `variantNames` from `settingsToModelConfig()`; map `DATA_EMPTY_VARIANTS` to `config.include.emptyVariants` |

---

## Semver Decision

**Version bump**: `[CURRENT] → [NEXT MAJOR]` (`MAJOR`)

**Justification**: Per Constitution III, removing a field from an exported type is a breaking change and requires a MAJOR version bump.

Breaking changes:
- Removing `variantNames` from the TypeScript type breaks any consumer code that references it
- Removing `variantNames` from the schema breaks validation for any serialized specs that include it

Non-breaking changes (would be MINOR on their own):
- Adding `emptyVariants` as optional field is additive
- Making `invalidVariants` and `invalidCombinations` optional maintains backward compatibility

Impact analysis:
- Consumers that reference `config.include.variantNames` will get TypeScript compilation errors (caught at build time)
- Consumers that construct `Config` objects with `variantNames` will get TypeScript errors
- Existing serialized specs with `variantNames` will fail schema validation until regenerated
- Since `variantNames` was not used in practice, real-world impact should be minimal

---

## Consequences

### Positive

- **Dead code removed**: `variantNames` eliminated from the API, reducing surface area and cognitive load
- **Consistent pattern**: All remaining `Config.include` fields follow the optional-with-defaults pattern
- **New functionality**: `emptyVariants` enables filtering of layered variants without elements
- **Smaller output**: Serialized configs can omit `include` fields when using default values
- **Clear example**: `Config.include` demonstrates the optional-with-defaults pattern for future Config additions

### Breaking changes

- **Compilation errors**: Consumers referencing `config.include.variantNames` will get TypeScript errors (caught at build time)
- **Schema validation**: Existing serialized specs containing `variantNames` will fail validation until regenerated
- **Code updates required**: Consumers must remove `variantNames` from config construction code

### Downstream work

- `anova-transformer`: Must remove any `variantNames` handling logic and implement `emptyVariants` filtering
- `anova-plugin`: Must remove `variantNames` from config mapping and wire `emptyVariants` to UI
- `anova-kit`: Must remove `variantNames` from CLI options and handle `emptyVariants`

### Migration path

- Consumers should search codebase for `variantNames` references and remove them
- Regenerate any cached/serialized specs to remove `variantNames` and conform to new schema
- No runtime fallback needed since field was unused
