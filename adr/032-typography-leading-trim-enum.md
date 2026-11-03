# ADR 032: Typography leadingTrim — Correct to String Enum

**Branch**: `032-leading-trim-enum`
**Created**: 2026-03-25
**Status**: ACCEPTED
**Summary**: `Typography.leadingTrim` is a string enum, matching the values Figma actually reports.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The `leadingTrim` property in the `Typography` schema definition currently allows `number | "mixed" | TokenReference`. However, Figma's API defines `leadingTrim` as a string enum with exactly two values:

```ts
// Figma API — LeadingTrim
type LineHeight = { type: 'CAP_HEIGHT' | 'NONE' }
```

Both the CLI and Plugin pipelines produce `leadingTrim: "NONE"` (or `"CAP_HEIGHT"`). The current schema rejects these because it was incorrectly modeled as a `mixableNumber` primitive (number + "mixed").

The `number` and `TokenReference` branches have never been produced by either pipeline — they were inherited from the mixableNumber pattern but are not applicable to this field.

This causes 16 schema violations (8 CLI + 8 Plugin) plus 16 cascade failures on the parent `typography` object.

---

## Decision Drivers

- **Schema must match Figma's API**: `leadingTrim` is a string enum, not a number
- **Remove impossible branches**: `number` and `TokenReference` were never emitted and cannot be — they should be removed, not retained
- **Type and schema must remain in sync**: The TypeScript type and JSON schema must agree

---

## Options Considered

### Option A: Replace with closed string enum *(Selected)*

Replace the incorrect `number | "mixed" | TokenReference` with `'NONE' | 'CAP_HEIGHT' | 'mixed'`, matching Figma's API definition plus the anova "mixed" sentinel.

**Pros**:
- Exactly matches Figma's documented API shape
- Removes impossible value types (`number`, `TokenReference`) that were never emitted
- Validates correctness — rejects invalid values

**Cons / Trade-offs**:
- If Figma adds new enum values in the future, schema must be updated. Acceptable because Figma API changes already require transformer review.

---

### Option B: Add open `string` and keep `number` / `TokenReference` *(Rejected)*

Add `{ "type": "string" }` to the existing oneOf while retaining the incorrect `number` and `TokenReference` branches.

**Rejected because**: Retaining branches that are impossible misrepresents the field's actual shape. An open `string` also loses validation — typos like `"Non"` would be silently accepted. The schema should reflect reality, not accumulate dead branches.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Replace `leadingTrim` in `Typography` with string enum | MINOR |

**Example — new shape** (`types/Styles.ts`):
```yaml
# Before
leadingTrim: number | 'mixed' | TokenReference

# After
leadingTrim: 'NONE' | 'CAP_HEIGHT' | 'mixed'
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Replace `leadingTrim` oneOf with string enum in Typography | MINOR |

**Example — new shape** (`schema/styles.schema.json`):
```json
"leadingTrim": {
  "oneOf": [
    { "type": "string", "enum": ["NONE", "CAP_HEIGHT"] },
    { "type": "string", "const": "mixed" }
  ],
  "description": "Leading trim mode — 'NONE' or 'CAP_HEIGHT' per Figma API; 'mixed' when varied across selection"
}
```

### Notes

The `"mixed"` const branch is kept separate from the enum for clarity — it is an anova sentinel value, not a Figma API value. This distinction is useful for downstream consumers that may want to handle "mixed" differently from real values.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**: `Typography.leadingTrim` in types ↔ `Typography.properties.leadingTrim` in schema

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-transformer` | None | Already emits `'NONE'` / `'CAP_HEIGHT'` string values |
| `anova-plugin` | None | Already emits `'NONE'` / `'CAP_HEIGHT'` string values |
| `anova-kit` | None | Pass-through |

---

## Semver Decision

**Version bump**: None — `0.15.0` is unreleased; this correction is included in the same release

**Justification**: Replacing incorrect type branches (`number`, `TokenReference`) that were never produced with the correct string enum that both pipelines already emit. No consumer behavior changes — this is a pure correctness fix.

---

## Consequences

- 16 leadingTrim schema violations and 16 cascade typography violations are eliminated
- The schema now accurately reflects Figma's documented API for `leadingTrim`
- `number` and `TokenReference` dead branches are removed, preventing confusion about what values are actually possible
