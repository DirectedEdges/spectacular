# ADR: `invalidPropCombinations` — Renamed and Relocated to the Api Concern

**Branch**: `092-invalid-combinations-api-concern`
**Created**: 2026-09-20
**Status**: ACCEPTED
**Summary**: `invalidPropCombinations` renames `invalidVariantCombinations` and joins `title`, `anatomy` and `props` in the api concern document.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: ADR-021 (draft) — proposed the rename as `invalidPropConfigurations`; this ADR resolves it as `invalidPropCombinations` and adds the concern relocation

---

## Context

`Component.invalidVariantCombinations` (`PropConfigurations[]`, optional) declares
prop-value combinations that produce an invalid component state — e.g. `disabled`
and `hover` set simultaneously. In the split-concern output (ADR-091), the field is
carried by the **variants** concern document:

```yaml
# variants.yaml (current)
default: { ... }
variants: [ ... ]
invalidVariantCombinations:
  - disabled: true
    state: Hover
```

The concern split partitions a component by contract role: `SpecApiDocument` holds
what a component *is and takes* (`title`, `anatomy`, `props`), `SpecVariantsDocument`
holds how it *manifests* (`default`, `variants`). That boundary has consequence:
consumers treat the api document as the contract surface and the variants document as
implementation detail.

`invalidVariantCombinations` is on the wrong side of that boundary. It does not
describe a manifestation — it restricts which prop combinations are *legal*, in api
vocabulary (prop names and values, typed `PropConfigurations`). Adding an entry
narrows a consumer's legal usage; removing one widens it. That is contract
semantics, and the field belongs with the contract.

The name has the same defect as the location: the field constrains **prop**
combinations (its items are `PropConfigurations`), but is named after **variants** —
Figma's vocabulary for prop-combination instances, not the code-platform term for
what is being constrained.

---

## Decision Drivers

- **Concern documents partition by contract role**: a field whose presence changes
  the legal usage surface belongs in the api document, not the manifestation
  document (coherence of the ADR-091 split).
- **Naming governance — code platforms first** (constitution VI): code platforms
  express usage constraints in terms of props; "variant" is Figma vocabulary.
- **Name should match the declared type**: the items are `PropConfigurations`; the
  field name should say so.
- **Type ↔ schema parity** (constitution I): every type move mirrors in
  `component.schema.json` / `concern.schema.json`.
- **Semver honesty** (constitution III): renaming an exported field and
  restructuring concern documents is breaking and must be classed MAJOR.

---

## Options Considered

*(Pre-decided — no alternatives evaluated.)* Both decisions were taken by the schema
owner during the spec-versioning re-assessment (workspace project 026), which
established that api-document changes classify MAJOR/MINOR while variants-document
changes classify PATCH. Two independent decisions are recorded:

1. **Relocation** — the field moves from the variants concern (`SpecVariantsDocument`,
   `SpecVariantsSubcomponent`) to the api concern (`SpecApiDocument`,
   `SpecApiSubcomponent`), because its changes carry MAJOR/MINOR contract semantics
   that a manifestation document must not hold.
2. **Rename** — `invalidVariantCombinations` → `invalidPropCombinations`, per
   constitution VI (code-platform vocabulary: the constrained things are props) and
   to match the `PropConfigurations` item type.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Component.ts` | Renamed field `invalidVariantCombinations` → `invalidPropCombinations` | MAJOR |
| `ConcernDocument.ts` | Removed `invalidVariantCombinations` from `SpecVariantsDocument` | MAJOR |
| `ConcernDocument.ts` | Removed `invalidVariantCombinations` from `SpecVariantsSubcomponent` | MAJOR |
| `ConcernDocument.ts` | Added `invalidPropCombinations?: PropConfigurations[]` to `SpecApiDocument` | (part of move) |
| `ConcernDocument.ts` | Added `invalidPropCombinations?: PropConfigurations[]` to `SpecApiSubcomponent` | (part of move) |

**Example — new shape**:

```yaml
# Before — variants.yaml carries the constraint
SpecVariantsDocument:
  default: Variant
  variants: Variants
  invalidVariantCombinations?: PropConfigurations[]

# After — api.yaml carries the constraint, renamed
SpecApiDocument:
  title: string
  anatomy: Anatomy
  props: Props
  invalidPropCombinations?: PropConfigurations[]

SpecVariantsDocument:
  default: Variant
  variants: Variants
```

`Component` (the unsplit shape) keeps the field — renamed only:

```yaml
# Before
Component:
  invalidVariantCombinations?: PropConfigurations[]

# After
Component:
  invalidPropCombinations?: PropConfigurations[]
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Renamed property `invalidVariantCombinations` → `invalidPropCombinations` under `#/definitions/Component/properties` | MAJOR |
| `concern.schema.json` | Removed property from `SpecVariantsDocument` and `SpecVariantsSubcomponent`; added `invalidPropCombinations` to `SpecApiDocument` and `SpecApiSubcomponent` (same `PropConfigurations[]` shape and description) | MAJOR |

### Notes

- The field stays **optional** everywhere — a component with no invalid combinations
  omits it, unchanged.
- Item shape (`PropConfigurations`), description, and semantics are unchanged; only
  the name and the concern-document home move.
- `Variant.invalid` (a variant flagged invalid in place) is a separate mechanism and
  is out of scope here.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `Component.invalidPropCombinations` ↔
  `component.schema.json#/definitions/Component/properties/invalidPropCombinations`;
  `SpecApiDocument.invalidPropCombinations` / `SpecApiSubcomponent.invalidPropCombinations`
  ↔ the same properties under `concern.schema.json`'s `SpecApiDocument` /
  `SpecApiSubcomponent` definitions; the `SpecVariants*` definitions carry the
  property in neither artifact.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Emits the field | Write the renamed key, and into the api concern document when `splitConcerns` is on |
| `specs-cli` | Validates and passes through spec output | Recompile against new types/schema |
| `specs-plugin-2` | Reads the field for canvas output | Recompile; read the renamed key |

Existing serialized specs using the old key fail validation against the new schema —
regeneration is the migration path (specs are generated artifacts).

---

## Semver Decision

**Target version**: `0.34.0` — the version of the active `release/next` branch this
ADR merges into.

**Change class**: `MAJOR` — renaming an exported field and restructuring concern
document shapes are breaking changes per constitution III (minimal, stable API:
"removing or renaming an exported type or a named field within a type is a breaking
change") and the versioning policy ("MAJOR for any breaking change to a type
signature, field name, field presence, or schema structure").

---

## Consequences

- The api concern document carries every field whose changes alter the component's
  contract; the variants document is purely manifestation. Downstream semver
  tooling can classify by concern file alone.
- `invalidPropCombinations` names what it constrains (props) in code-platform
  vocabulary and matches its item type (`PropConfigurations`).
- All producers and consumers of the old key must update on their next schema
  upgrade; previously generated `variants.yaml` files carrying the old key no longer
  validate.
