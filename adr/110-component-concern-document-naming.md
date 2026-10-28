# ADR: Rename `Spec*Document` to `Component*Document`

**Branch**: `110-component-concern-document-naming` *(drafted on `docs/schema-property-defaults`)*
**Created**: 2026-10-21
**Status**: ACCEPTED
**Summary**: `ComponentApiDocument`, `ComponentVariantsDocument`, and `ComponentExamplesDocument` name a component's `splitConcerns` files, matching `CompositionApiDocument`'s naming across both spec kinds.
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none; renames types added by ADR-091, extended by ADR-109)*

---

## Context

ADR-091 named a component's split-file output `SpecApiDocument`, `SpecVariantsDocument`, `SpecExamplesDocument`, `SpecConcernDocument` — reasonable when a "concern document" meant exactly one thing. ADR-109 adds `CompositionApiDocument`, `CompositionVariantsDocument`, `CompositionExamplesDocument`, `CompositionConcernDocument` for the second spec kind, which makes the `Spec` prefix on the first set read as a leftover rather than a deliberate name: both kinds are specs, so `Spec` no longer distinguishes one from the other the way `Component`/`Composition` would.

`@directededges/specs-schema` is pre-1.0. A `MAJOR`-class rename here is a `0.x` bump, not a stability break, and these names are young — ADR-091 is a recent addition, not a long-settled part of the public surface. The cost of fixing the asymmetry now is a mechanical rename across a small, fully-enumerated set of files; the cost of leaving it grows every ADR that adds a third or fourth spec kind under the `Spec` name.

---

## Decision Drivers

- **Minimal, stable, intentional public API** (Constitution III): a rename of an exported type is breaking and must be versioned accordingly — this ADR does not get to treat it as free, only as affordable.
- **Naming clarity**: a type name should say what it's exact to. `Spec*Document` no longer does that once `Composition*Document` exists alongside it; `Component*Document` does.
- **Pre-1.0 cost window**: breaking changes before `1.0.0` are ordinary `0.x` bumps, not ecosystem-stability events — the constitution's versioning rule still applies, but the cost it's weighed against is lower now than it will be later.
- **Fully enumerated blast radius**: every file touching `SpecApiDocument`/`SpecVariantsDocument`/`SpecExamplesDocument`/`SpecConcernDocument` within this package is known (`types/ConcernDocument.ts`, `types/index.ts`, `tests/ConcernDocument.test-d.ts`, `schema/root.schema.json`, `package.json`'s `exports` map) — the rename is mechanical, not exploratory.

---

## Options Considered

### Option A: Rename to `Component*Document` *(Selected)*

`SpecApiDocument` → `ComponentApiDocument`, `SpecVariantsDocument` → `ComponentVariantsDocument`, `SpecExamplesDocument` → `ComponentExamplesDocument`, `SpecConcernDocument` → `ComponentConcernDocument`. File and schema renames follow: `types/ConcernDocument.ts` → `types/ComponentConcernDocument.ts`, `tests/ConcernDocument.test-d.ts` → `tests/ComponentConcernDocument.test-d.ts`, `schema/concern.schema.json` → `schema/component-concern.schema.json`, package export `./schema/concern` → `./schema/component-concern`.

**Pros**:
- `Component*Document` / `Composition*Document` reads as one deliberate naming scheme instead of one named-by-kind and one named-by-leftover.
- Pre-1.0, so the breaking-change cost is a version bump, not a migration crisis.
- The rename is purely mechanical — no shape, field, or behavior changes ride along with it.

**Cons / Trade-offs**:
- `MAJOR`-class change: every downstream consumer importing these four type names by name must update the import.
- Git history on the renamed files gets a rename commit to read through.

---

### Option B: Keep `Spec*Document` *(Rejected)*

Leave the component documents named as ADR-091 shipped them; accept the asymmetry against `Composition*Document`.

**Rejected because**: the asymmetry only gets more visible as more spec kinds are added, and the fix is cheapest while `specs-schema` is still pre-1.0 and these names are recently introduced. Deferring doesn't reduce the eventual rename's scope — it only moves it past the point where it's a `0.x` bump instead of a `1.x`+ one.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `ConcernDocument.ts` → `ComponentConcernDocument.ts` (renamed) | `SpecApiDocument` → `ComponentApiDocument`, `SpecVariantsDocument` → `ComponentVariantsDocument`, `SpecExamplesDocument` → `ComponentExamplesDocument`, `SpecConcernDocument` → `ComponentConcernDocument`; `SpecApiSubcomponent`/`SpecVariantsSubcomponent`/`SpecExamplesSubcomponent` → `ComponentApiSubcomponent`/`ComponentVariantsSubcomponent`/`ComponentExamplesSubcomponent` | MAJOR |
| `index.ts` | Update the re-export to the renamed types and file path | MAJOR |
| `tests/ConcernDocument.test-d.ts` → `tests/ComponentConcernDocument.test-d.ts` (renamed) | Update all type references to the renamed names | — *(test-only, no bump)* |

**Example — renamed shape** (`types/ComponentConcernDocument.ts`):
```yaml
# Before (types/ConcernDocument.ts)
SpecApiDocument:
  metadata: Metadata & { concern: 'api' }
  title: string
  anatomy: Anatomy
  props: Props
  invalidPropCombinations?: PropConfigurations[]
  subcomponents?: Record<string, SpecApiSubcomponent>

# After (types/ComponentConcernDocument.ts) — same shape, new name
ComponentApiDocument:
  metadata: Metadata & { concern: 'api' }
  title: string
  anatomy: Anatomy
  props: Props
  invalidPropCombinations?: PropConfigurations[]
  subcomponents?: Record<string, ComponentApiSubcomponent>
```

No field, requirement, or structural change — every property keeps its type, its optionality, and its position.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `concern.schema.json` → `component-concern.schema.json` (renamed) | `SpecApiDocument`/`SpecVariantsDocument`/`SpecExamplesDocument` definitions and their subcomponent definitions renamed to `ComponentApiDocument`/`ComponentVariantsDocument`/`ComponentExamplesDocument`/`Component*Subcomponent` | MAJOR |
| `root.schema.json` | Update `$ref` from `concern.schema.json` to `component-concern.schema.json` | MAJOR |
| `package.json` | `exports["./schema/concern"]` → `exports["./schema/component-concern"]` | MAJOR |

**Example — renamed shape** (`schema/component-concern.schema.json`):
```yaml
# Before: #/definitions/SpecApiDocument
# After:  #/definitions/ComponentApiDocument
# Same required[], same properties{}, same additionalProperties: false
```

### Notes

This rename touches only names — type names, a type-name's definition key in JSON Schema, a file name, and a package export subpath. No property is added, removed, or retyped on any of the three documents.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `ComponentApiDocument` ↔ `component-concern.schema.json#/definitions/ComponentApiDocument`, and likewise for `ComponentVariantsDocument`/`ComponentExamplesDocument` and their subcomponent definitions. The rename is applied identically on both sides — no definition is renamed in one artifact and left stale in the other.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Any import of `SpecApiDocument`/`SpecVariantsDocument`/`SpecExamplesDocument`/`SpecConcernDocument` (or the subcomponent variants) breaks at compile time | Update imports to the `Component*Document` names; update any `./schema/concern` export-path reference to `./schema/component-concern` |
| `specs-cli` | Same as above for any direct import or schema-path reference | Update imports and schema-path references |
| `specs-plugin-2` | Same as above, if it references these types directly | Update imports and schema-path references |

---

## Semver Decision

**Target version**: `0.38.0` — `@directededges/specs-schema` on `release/next`.

**Change class**: `MAJOR` — renaming an exported type, a schema definition key, a schema file, and a package export subpath are each breaking changes per constitution III ("Removing or renaming an exported type... is a breaking change" and "Schema exports... are equally contractual — adding, removing, or restructuring a schema file is a breaking change"). Pre-1.0, this is a `0.x` bump, not a `1.x`+ one.

---

## Consequences

- `Component*Document` and `Composition*Document` (ADR-109) read as one naming scheme going forward — the next spec kind, if one is ever added, has an obvious name to follow.
- Every consumer importing the old `Spec*Document` names by name must update on upgrade — there is no deprecated alias; the old names simply stop existing.
- `schema/concern.schema.json` and the `./schema/concern` export subpath no longer exist; anything resolving them by path (not just by `$ref` within the package) must update to `component-concern.schema.json` / `./schema/component-concern`.
