# ADR: Remove `name` and `baseline` from `Variant`

**Branch**: `036-remove-variant-name-baseline`
**Created**: 2026-04-13
**Status**: ACCEPTED
**Summary**: `Variant.name` and `Variant.baseline` are removed, leaving a variant identified by its prop configuration alone.
**Decides**: none
**Deciders**: nathanacurtis (author)
**Supersedes**: *(none)*

---

## Context

The `Variant` type in `types/Variant.ts` defines two optional string fields — `name` and `baseline` — that are no longer produced or consumed by any package in the ecosystem:

- `specs-from-figma` removed `name` from `Variant.data()` output (commit `dc8c217`). `baseline` was never assigned in variant output.
- `specs-cli` does not read or display either field.
- No serialized spec output includes these fields.

Both fields are vestigial: they exist in the type and schema contract but carry no data. Retaining them inflates the API surface and misleads consumers into thinking they convey meaningful information.

GitHub issue: [#5 — Variant name, baseline should be retired](https://github.com/DirectedEdges/specs/issues/5)

---

## Decision Drivers

- **Remove dead API surface**: Unused fields violate Constitution III's "minimal, stable, intentional public API" principle
- **Type ↔ schema symmetry**: Both `types/Variant.ts` and `schema/component.schema.json` must be updated in lockstep (Constitution I)
- **No runtime logic**: This change is purely a type/schema deletion — no logic involved (Constitution II)
- **Accept breaking change**: Removing fields from an exported type is a breaking change requiring a MAJOR bump (Constitution III)
- **Schema validity**: The JSON schema must remain valid after removal (Constitution IV)

---

## Options Considered

### Option A: Remove both fields entirely *(Selected)*

Delete `name` and `baseline` from `Variant` in both `types/Variant.ts` and `schema/component.schema.json`.

**Pros**:
- Eliminates dead API surface — no consumer uses these fields
- Clean removal rather than lingering deprecation
- Aligns the contract with actual output reality
- Simple, minimal change

**Cons / Trade-offs**:
- Breaking change — any consumer that references `Variant.name` or `Variant.baseline` will get TypeScript compilation errors
- Requires MAJOR version bump
- Existing serialized specs containing these fields will fail strict schema validation

---

### Option B: Deprecate with `@deprecated` JSDoc but retain *(Rejected)*

Mark both fields as deprecated in the TypeScript type and add `deprecated: true` in the schema, but keep them present.

**Rejected because**: Both fields are already unused in all output. Deprecating fields that carry no data adds process overhead (a future removal ADR) with no consumer benefit. Since no serialized output includes these fields, there is nothing to migrate. Clean removal is simpler and more honest.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Variant.ts` | Remove optional field `name?: string` | MAJOR |
| `Variant.ts` | Remove optional field `baseline?: string` | MAJOR |

**Example — new shape** (`types/Variant.ts`):
```yaml
# Before
Variant:
  name?: string
  baseline?: string
  configuration?: PropConfigurations
  invalid?: boolean
  elements?: Elements
  layout?: Layout

# After
Variant:
  configuration?: PropConfigurations
  invalid?: boolean
  elements?: Elements
  layout?: Layout
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Remove `name` property from `#/definitions/Variant/properties` | MAJOR |
| `component.schema.json` | Remove `baseline` property from `#/definitions/Variant/properties` | MAJOR |

**Example — new shape** (`schema/component.schema.json`):
```yaml
# Before — #/definitions/Variant/properties
name:
  type: string
baseline:
  type: string
configuration:
  $ref: "#/definitions/PropConfigurations"
invalid:
  type: boolean
# ...

# After — #/definitions/Variant/properties
configuration:
  $ref: "#/definitions/PropConfigurations"
invalid:
  type: boolean
# ...
```

### Notes

- Neither field appears in the `required` array of the `Variant` schema definition, so removal does not affect required-field validation logic.
- `name` was historically used to hold a human-readable variant label. This responsibility now belongs to the `configuration` object, which fully describes the variant's prop state.
- `baseline` was intended to identify the baseline variant for diffing but was never populated in output. Baseline determination is an internal processing concern of `specs-from-figma`, not a contract-level concept.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `name` removed from both `types/Variant.ts` (optional field) and `schema/component.schema.json` (`#/definitions/Variant/properties/name`)
  - `baseline` removed from both `types/Variant.ts` (optional field) and `schema/component.schema.json` (`#/definitions/Variant/properties/baseline`)
  - Remaining fields (`configuration`, `invalid`, `elements`, `layout`) unchanged in both artifacts
  - Field count: 6 → 4

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | None — does not reference `Variant.name` or `Variant.baseline` | Recompile against updated types |

---

## Semver Decision

**Version bump**: included in `0.17.0` (already unreleased `MAJOR`)

**Justification**: Per Constitution III, removing a field from an exported type is a breaking change. However, `0.17.0` is already an unreleased MAJOR bump that includes other breaking changes (ADR 034, ADR 035). This removal is folded into the same release rather than requiring a separate version bump.

Impact analysis:
- Consumers that reference `variant.name` or `variant.baseline` will get TypeScript compilation errors (caught at build time)
- Since neither field is populated in any output, real-world impact is minimal
- Existing serialized specs do not contain these fields, so schema validation is unaffected in practice

---

## Consequences

### Positive

- `Variant` type accurately reflects its actual output shape — four meaningful fields with no dead weight
- API surface reduced — consumers are not misled by fields that carry no data
- Closes [#5](https://github.com/DirectedEdges/specs/issues/5)

### Breaking changes

- TypeScript compilation errors for any code referencing `Variant.name` or `Variant.baseline`
- Strict schema validation will reject specs containing these fields (though none exist in practice)

### Migration path

- Search codebase for `Variant` references to `name` or `baseline` and remove them
- No runtime migration needed since fields were never populated
