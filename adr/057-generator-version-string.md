# ADR: Fix `Metadata.generator.version` Type: `number` → `string`

**Branch**: `057-generator-version-string`
**Created**: 2026-06-15
**Status**: ACCEPTED
**Summary**: `Metadata.generator.version` is typed `string`, matching the semver values every producer already emits.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`Metadata.generator.version` is currently typed as `number` in `types/Metadata.ts` and declared as `"type": "number"` in `schema/component.schema.json`. In practice, both the plugin and the CLI have passed semver strings (e.g. `"1.10.0"`) since the `__PLUGIN_VERSION__` build-time define was changed from a hardcoded integer to a semver string. This has been the effective runtime behavior since schema v0.22.0 / specs-from-figma v0.19.0.

The result is a type mismatch: the TypeScript type says `number`, the JSON schema says `number`, but every consumer writes a string. This causes type errors in `specs-from-figma`'s `build:types` step and means schema validation would reject all real output as invalid.

```yaml
# Current (incorrect)
generator:
  version: 1        # typed/validated as number

# Actual runtime output (semver string)
generator:
  version: "1.10.0"
```

---

## Decision Drivers

- **Type ↔ schema symmetry (Constitution I)**: Both artifacts must describe the same structure. Changing only one is not acceptable.
- **Strict TypeScript compliance (Constitution V)**: The type must match actual usage with zero type errors under strict mode.
- **Schema validity (Constitution IV)**: The JSON schema must pass mechanical validation and accurately reflect serialized output.
- **Semver classification (Constitution, Versioning)**: Changing the type of a required field from `number` to `string` is a breaking change in the type contract.

---

## Options Considered

*(Pre-decided — no alternatives evaluated)*

The field has never validly held a numeric value in production; the `number` type was a mistake introduced when the integer placeholder was replaced by a semver build-time define. The correct fix is to align the type and schema with the actual contract. No alternative (e.g., keeping `number`, widening to `number | string`) accurately represents the field's meaning or usage.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Metadata.ts` | Change `generator.version` from `number` to `string` | MAJOR |

**Before / After** (`types/Metadata.ts`):
```yaml
# Before
generator:
  version: number   # incorrect — never held a numeric value in production

# After
generator:
  version: string   # semver string (e.g. "1.10.0")
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Change `#/definitions/Metadata/properties/generator/properties/version` from `"type": "number"` to `"type": "string"` | MAJOR |

**Before / After** (`schema/component.schema.json`):
```yaml
# Before
version:
  type: number

# After
version:
  type: string
```

### Notes

The field is in `required` within the `generator` object — this does not change. Only the value type changes. No field is added, removed, or renamed.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — both `types/Metadata.ts` and `component.schema.json` change `version` from `number`/`"number"` to `string`/`"string"` in lockstep.
- **Parity check**: `Metadata.generator.version: string` maps to `#/definitions/Metadata/properties/generator/properties/version: { "type": "string" }`.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Eliminates existing type error in `build:types` | Recompile — no source changes needed; the semver string was already being passed |
| `specs-cli` | Type error on `generator.version` field resolved | Recompile — no source changes needed; semver string was already being passed |
| `specs-plugin-2` | Type error resolved | Recompile — no source changes needed; `__PLUGIN_VERSION__` semver string was already correct |

---

## Semver Decision

**Version bump**: `0.24.x → 0.25.0` (`MAJOR`)

**Justification**: Changing the declared type of a required field (`generator.version: number → string`) is a breaking change to the published type and schema contract per Constitution III ("Removing or renaming an exported type or a named field within a type is a breaking change"). Any consumer that validated against the schema or compiled against the type for the old `number` shape must update. The bump has already been reserved in the current release branch (`release/schema-0.25.0-cli-0.21.0`).

---

## Consequences

- `Metadata.generator.version` is correctly typed as `string` in both the TypeScript types and JSON schema.
- All three downstream consumers compile cleanly against the updated type without source changes.
- Schema validation now accepts real-world output (semver strings) and rejects numeric values, which were never valid in practice.
- Consumers pinned to schema v0.24.x or earlier that validate `generator.version` as a number will need to upgrade; in practice this is a no-op since no real output ever held a numeric value.
