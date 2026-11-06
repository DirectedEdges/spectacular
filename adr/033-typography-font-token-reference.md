# ADR 033: Typography fontFamily/fontStyle — Remove Number, Add TokenReference

**Branch**: `033-font-token-reference`
**Created**: 2026-03-25
**Status**: ACCEPTED
**Summary**: `Typography.fontFamily` and `fontStyle` accept a `TokenReference` and drop `number`, matching how fonts are tokenized.
**Decides**: styles.typography, styles.typography.fontFamily, styles.typography.fontStyle
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The `fontFamily` and `fontStyle` properties in the `Typography` schema definition use the `font` primitive: `string | number | "mixed"`. This has two problems:

1. **Missing TokenReference**: When a text node's font family or style is bound to a Figma variable, the output contains a `TokenReference` object (e.g., `{ $token: "DS Typography.font-family.sans", $type: "string" }`). Both pipelines produce these, but the schema rejects them.

2. **Impossible `number` branch**: The `number` branch was inherited from a generic primitive pattern, but `fontFamily` and `fontStyle` are always strings — font names like `"Inter"` or style names like `"Bold"`. The transformer types these as `string` internally, and no test fixture has ever produced a numeric value for either field.

This was discovered in `testStyleVariablesVTokenStudio` where font properties are bound to Token Studio / Figma variables.

---

## Decision Drivers

- **Schema must accept valid output**: Both pipelines produce TokenReference for variable-bound font properties
- **Remove impossible branches**: `number` was never emitted and cannot be — font names and style names are strings
- **Consistency**: Other typography fields already allow TokenReference
- **Type and schema must remain in sync**: The TypeScript type and JSON schema must agree

---

## Options Considered

### Option A: Remove `number`, add `TokenReference` *(Selected)*

Replace `string | number | 'mixed'` with `string | 'mixed' | TokenReference` for both fields.

**Pros**:
- Correctly models the actual value space: font name string, "mixed" sentinel, or variable reference
- Removes impossible `number` branch that was never produced
- Consistent with other typography properties that accept TokenReference

**Cons / Trade-offs**:
- None — this corrects two errors simultaneously

---

### Option B: Only add `TokenReference`, keep `number` *(Rejected)*

Add `TokenReference` to the existing `string | number | 'mixed'` oneOf.

**Rejected because**: Retaining the `number` branch misrepresents the field — font names and style names are never numeric. Dead branches create confusion about what values are actually possible.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Remove `number`, add `TokenReference` to `fontFamily` and `fontStyle` in `Typography` | MINOR |

**Example — new shape** (`types/Styles.ts`):
```yaml
# Before
fontFamily: string | number | 'mixed'
fontStyle: string | number | 'mixed'

# After
fontFamily: string | 'mixed' | TokenReference
fontStyle: string | 'mixed' | TokenReference
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Remove `number`, add `TokenReference` to `fontFamily` and `fontStyle` oneOf in Typography | MINOR |

**Example — new shape** (`schema/styles.schema.json`):
```json
"fontFamily": {
  "oneOf": [
    { "type": "string" },
    { "type": "string", "const": "mixed" },
    { "$ref": "#/definitions/TokenReference" }
  ],
  "description": "Font family name, 'mixed' when varied, or token reference for variable-bound fonts"
},
"fontStyle": {
  "oneOf": [
    { "type": "string" },
    { "type": "string", "const": "mixed" },
    { "$ref": "#/definitions/TokenReference" }
  ],
  "description": "Style name (e.g., 'Bold'), 'mixed' when varied, or token reference for variable-bound fonts"
}
```

### Notes

With this change, all Typography properties consistently support TokenReference, and the impossible `number` branch is removed from both font fields.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**: `Typography.fontFamily` and `Typography.fontStyle` in types ↔ `Typography.properties.fontFamily` and `Typography.properties.fontStyle` in schema

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-transformer` | None | Already emits string or TokenReference for fonts |
| `anova-plugin` | None | Already emits string or TokenReference for fonts |
| `anova-kit` | None | Pass-through |

---

## Semver Decision

**Version bump**: None — `0.15.0` is unreleased; this correction is included in the same release

**Justification**: Removing an impossible `number` branch and adding `TokenReference` for values both pipelines already produce. No consumer behavior changes — this is a pure correctness fix.

---

## Consequences

- 4 fontFamily/fontStyle violations and associated typography cascade failures are eliminated
- All Typography properties now consistently support TokenReference for variable bindings
- Impossible `number` branches removed, preventing confusion about actual value space
