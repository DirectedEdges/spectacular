# ADR: Rename `invalidVariantCombinations` to `invalidPropConfigurations`

**Branch**: `021-invalid-prop-configurations`
**Created**: 2026-03-11
**Status**: DRAFT
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The `Component` type currently includes an optional field `invalidVariantCombinations` that describes prop-value combinations resulting in an invalid component state (e.g., `disabled` + `hover`). This field sits as a peer of `variants` on the `Component` type.

The name `invalidVariantCombinations` has two problems:
- **Verbose** (28 characters) — the longest field name on `Component` by a wide margin
- **Misleading** — the field doesn't describe variant combinations; it describes `PropConfigurations` (its item type) that are invalid. The word "Variant" in the name conflates two distinct concepts

Current shape:

```yaml
Component:
  props: ...
  variants: ...
  invalidVariantCombinations:   # verbose, misleading naming
    - { state: "disabled", interaction: "hover" }
```

---

## Decision Drivers

- **Naming precision**: The field name should describe what it contains. The item type is `PropConfigurations`, not variant combinations.
- **Naming consistency**: Every other field on `Component` uses full, unabbreviated words (`title`, `anatomy`, `props`, `subcomponents`, `default`, `variants`, `metadata`). The new name must follow the same convention — no abbreviations in a schema contract.
- **Type ↔ schema symmetry**: The rename must occur in both `types/Component.ts` and `schema/component.schema.json` simultaneously (Constitution I).
- **Semver compliance**: Renaming a published field is a breaking change and requires a MAJOR bump (Constitution III, Versioning).
- **No logic changes**: This is a pure rename — no runtime behavior or logic is introduced (Constitution II).

---

## Options Considered

### Naming candidates

The field represents prop-value combinations that produce an invalid component state (e.g., `disabled` + `hover` simultaneously). Several candidate names were evaluated against three concerns:

1. **Semantic accuracy** — does the name correctly describe what the field contains?
2. **Specificity** — can the name be misread as referring to something else on `Component`?
3. **Convention fit** — does it match the unabbreviated, descriptive style of sibling fields?

| Name | Len | Accuracy | Specificity | Concern |
|------|-----|----------|-------------|---------|
| `invalidPropConfigurations` | 26 | Precise — mirrors item type `PropConfigurations` with `invalid` qualifier | Unambiguous — "prop configurations" can only mean one thing | Modestly shorter than the original (26 vs 28), but the value is precision, not brevity |
| `invariants` | 10 | Inverted — an invariant is a condition that _holds_, but this field lists conditions that _must not_ occur | Ambiguous without context | Aesthetically appealing as a counterpart to `variants`, but semantically misleading |
| `exclusions` | 10 | Reasonable — these combinations are excluded | Ambiguous — excluded _what_? Props? Elements? Styles? | Missing the "of what?" qualifier that other candidates provide |
| `conflicts` | 9 | Partial — implies pairwise disagreement | Reasonable in isolation | The actual constraint can span more than two props; "conflict" suggests a pair |
| `constraints` | 11 | Too broad — could mean min/max, required, type constraints | Ambiguous | Doesn't signal "these are invalid" specifically |
| `invalidCombinations` | 19 | Explicit about invalidity | Moderate — combinations of what? | Drops "Variant" but doesn't replace it with anything more precise |
| `invalidConfigurations` | 21 | Close — but "configurations" alone is generic | Moderate — could be any kind of configuration | Missing the `Prop` qualifier that ties it to `PropConfigurations` |
| `disallowed` | 10 | Direct — these are not allowed | Ambiguous — reads more like a boolean flag than a list | Doesn't suggest an array of combination sets |

### Option A: Rename to `invalidPropConfigurations` *(Selected)*

Replace `invalidVariantCombinations` with `invalidPropConfigurations` in both the type and schema. The field type (`PropConfigurations[]`), optionality, and semantics remain identical — only the name changes.

```yaml
# Before
Component:
  invalidVariantCombinations:
    - { state: "disabled", interaction: "hover" }

# After
Component:
  invalidPropConfigurations:
    - { state: "disabled", interaction: "hover" }
```

**Pros**:
- Name directly mirrors the item type (`PropConfigurations`) — self-documenting through the type system
- `invalid` prefix signals these are forbidden states, not valid ones
- `Prop` qualifier eliminates ambiguity about what's being configured
- No semantic stretch — the name says exactly what the field contains
- Follows the unabbreviated naming convention of all sibling fields

**Cons / Trade-offs**:
- Breaking change requiring MAJOR version bump
- All downstream consumers must update field references
- Only modestly shorter than the original (26 vs 28 characters) — the win is precision, not brevity

---

### Option B: Keep `invalidVariantCombinations` *(Rejected)*

Leave the field name unchanged.

**Rejected because**: The name is misleading — the field contains `PropConfigurations`, not variant combinations. "VariantCombinations" conflates two distinct concepts and requires explanation for new consumers.

---

### Option C: Use a shorter abstract name (`invariants`, `exclusions`, `conflicts`) *(Rejected)*

Adopt a concise, single-word name that captures the concept without describing the data structure.

**Rejected because**: Each short candidate has a specificity problem — without a qualifier, the name is ambiguous about _what_ is being excluded, constrained, or conflicted. On a type with fields like `props`, `variants`, `subcomponents`, and `anatomy`, a bare noun like `exclusions` raises the question "exclusions of what?" Additionally, `invariants` inverts the classical meaning of the term (conditions that hold vs. conditions that are forbidden), and `conflicts` implies a pairwise relationship that doesn't match the multi-prop nature of the constraint.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Component.ts` | Renamed field `invalidVariantCombinations` → `invalidPropConfigurations` | MAJOR |

**Example — new shape** (`types/Component.ts`):
```yaml
# Before
Component:
  variants?: Variants
  invalidVariantCombinations?: PropConfigurations[]

# After
Component:
  variants?: Variants
  invalidPropConfigurations?: PropConfigurations[]
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Renamed property `invalidVariantCombinations` → `invalidPropConfigurations` | MAJOR |

**Example — new shape** (`schema/component.schema.json`):
```yaml
# Before
properties:
  invalidVariantCombinations:
    type: array
    description: "Non-default prop values that when used in combination result in an invalid component state"
    items:
      $ref: "#/definitions/PropConfigurations"

# After
properties:
  invalidPropConfigurations:
    type: array
    description: "Prop value combinations that represent invalid component states, such as a component being set to disabled and hover simultaneously"
    items:
      $ref: "#/definitions/PropConfigurations"
```

### Notes

- The field type (`PropConfigurations[]`), optionality (optional), and position among `Component` properties are unchanged.
- Only the field name and description wording change.
- The new name aligns the field name with its item type, making the relationship self-documenting.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**: `Component.invalidPropConfigurations` (type) ↔ `#/properties/invalidPropConfigurations` (schema) — 1:1 rename in both artifacts.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Recompile; update any references to `invalidVariantCombinations` | Find and replace field name in code that reads or writes this property |

---

## Semver Decision

**Version bump**: `0.13.0` → `0.13.0` (no bump — bundled into current release)

**Justification**: Renaming an exported field on a public type is a breaking change per Constitution III. However, `0.13.0` is already an unreleased breaking-change release (field renames, removals, and type restructuring). This rename is bundled into the same release rather than triggering a separate version bump.

---

## Consequences

- The field name now mirrors its item type (`PropConfigurations`), making the API self-documenting
- All downstream packages (`anova-kit`, `anova-transformer`, `anova-plugin`) must update references from `invalidVariantCombinations` to `invalidPropConfigurations` when upgrading to this version
- Any tool validating against `schema/component.schema.json` must update to the new version
- The misleading "VariantCombinations" terminology is eliminated from the public API
