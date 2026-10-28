# ADR: Composition Concern Documents

**Branch**: `109-composition-concern-documents` *(drafted on `docs/schema-property-defaults`)*
**Created**: 2026-10-21
**Status**: ACCEPTED
**Summary**: `CompositionApiDocument`, `CompositionVariantsDocument`, and `CompositionExamplesDocument` type a composition's `splitConcerns` files, exact to each concern alongside the existing component documents.
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none; extends ADR-091 to a second spec kind)*

---

## Context

ADR-091 gave a component's split-file output (`Settings.spec.splitConcerns`) its own exact types — `SpecApiDocument`, `SpecVariantsDocument`, `SpecExamplesDocument` in `types/ConcernDocument.ts`, mirrored in `schema/concern.schema.json`. Each requires exactly what its concern carries and permits nothing else (`additionalProperties: false`), discriminated by `metadata.concern`.

`Composition` (`types/Composition.ts`) has no equivalent. It is a different shape entirely — `title?`, `description?`, `anatomy`, `elements`, `layout`, `slotContent?` — with no `props`, no `default`/`variants` layering, and no `subcomponents`. A composition does not vary by prop configuration the way a component does, so there is nothing for a "variant" to be a delta *of*.

Despite that, `root.schema.json`'s `oneOf` only references `component.schema.json`, `components.schema.json`, `metadata.schema.json`, and `concern.schema.json` — there is no schema that validates a composition document at all today, split or whole. And the generator does not currently distinguish composition output when `splitConcerns` is on: a composition's `api.yaml` is produced through the same code path as a component's, which unconditionally writes `props: data.props || {}` — a stub field with no type that ever sanctioned it, since `props` is not a concept `Composition` has.

This ADR gives composition concern documents their own exact types and schema, closing that gap.

---

## Decision Drivers

- **Type–schema parity** (Constitution I): any new type needs a matching schema definition; neither may drift ahead of the other.
- **Exactness, not permissiveness** (precedent: ADR-091): a concern document requires what it carries and permits nothing else. Loosening an existing type with optional fields to also fit a second kind would weaken that guarantee for the kind it was written for.
- **Minimal, stable, intentional public API** (Constitution III): new types must represent a genuine, shared concept — not paper over an implementation detail of one downstream package.
- **No runtime logic** (Constitution II): this package states shapes only; nothing here prescribes how a composition's concern data is produced or split.
- **Additive, no breaking change**: `SpecApiDocument`, `SpecVariantsDocument`, `SpecExamplesDocument`, and `Concern` are unchanged. This ADR only adds new types and a new schema file. *(A naming-symmetry question this ADR surfaced — whether `Spec*Document` should become `Component*Document` now that a second kind exists — is handled separately in ADR-110, so it doesn't force this ADR's change class to `MAJOR`.)*

---

## Options Considered

### Option A: Distinct per-kind concern document types *(Selected)*

New types in `types/CompositionConcernDocument.ts`, parallel in structure to `ConcernDocument.ts` but exact to what `Composition` actually carries — no field borrowed from the component shape unless `Composition` already has it.

```yaml
# CompositionApiDocument — api.yaml for a composition
metadata: { concern: api, ... }
title: Filter Results Page      # optional — Composition.title is optional
description: "..."              # optional — Composition has this; Component does not
anatomy: { ... }                # required, same Anatomy type component uses

# CompositionVariantsDocument — variants.yaml for a composition
metadata: { concern: variants, ... }
elements: { ... }               # required — no default/variants layering to hold it
layout: [ ... ]                 # required

# CompositionExamplesDocument — examples.yaml for a composition
metadata: { concern: examples, ... }
slotContent:                    # optional — Composition's own key name, not slotContentExamples
  pageHeader: { ... }
```

**Pros**:
- Each type stays exact — satisfies the Exactness driver without touching `SpecApiDocument`/`SpecVariantsDocument`/`SpecExamplesDocument`.
- `title`/`description`/`anatomy` reuse the same underlying types (`string`, `Anatomy`) components already use — no new primitive types invented.
- Fully additive: zero changes to existing exported types.

**Cons / Trade-offs**:
- Six concern-document types in the package instead of three. More surface, but each one is small.
- `SpecConcernDocument` and a new `CompositionConcernDocument` are separate unions rather than one — a consumer narrows on kind first (already known from which directory/file it read), then on `metadata.concern`.

---

### Option B: Loosen the existing `Spec*Document` types with optional fields *(Rejected)*

Make `props` optional on `SpecApiDocument`, add an optional `description`, and similarly loosen `SpecVariantsDocument` to accept either `default`/`variants` *or* flat `elements`/`layout`.

**Rejected because**: `additionalProperties: false` plus "permits nothing else" is the exact guarantee ADR-091 established. A `SpecApiDocument` with `props?` would silently accept a real component's `api.yaml` that is missing `props` — a file a working transform should reject. The `variants` concern can't be loosened at all: layered-by-configuration (`default` + `variants[]`) and flat-always (`elements` + `layout`) are two different shapes, not one shape with an optional field. Optionality can model an absent value; it cannot model a structural choice between two incompatible layouts.

---

### Option C: No typed contract — validate only the whole `Composition` *(Rejected)*

Leave concern-document types component-only. A composition's split files, if produced, remain untyped and unvalidated.

**Rejected because**: this is the status quo, and the status quo already has an observable gap — `--split-concerns` produces composition files today (same code path as components), and nothing in `schema/` validates them. The stub `props: {}` written into a composition's current `api.yaml` output is a symptom of there being no type that says what should be there instead.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `CompositionConcernDocument.ts` (new) | Adds `CompositionApiDocument`, `CompositionVariantsDocument`, `CompositionExamplesDocument`, `CompositionConcernDocument` | MINOR |
| `index.ts` | Export the four new types from `CompositionConcernDocument.ts` | MINOR |

**New shape** (`types/CompositionConcernDocument.ts`):
```yaml
CompositionApiDocument:
  metadata: Metadata & { concern: 'api' }   # required
  title: string                             # optional — matches Composition.title
  description: string                       # optional — matches Composition.description
  anatomy: Anatomy                          # required

CompositionVariantsDocument:
  metadata: Metadata & { concern: 'variants' }   # required
  elements: Elements                             # required
  layout: Layout                                 # required

CompositionExamplesDocument:
  metadata: Metadata & { concern: 'examples' }   # required
  slotContent: Record<string, SlotContent>       # optional
  images: Images                                 # optional — amendment, 2026-10-21

CompositionConcernDocument: CompositionApiDocument | CompositionVariantsDocument | CompositionExamplesDocument
```

No subcomponent slicing is needed — `Composition` has no `subcomponents` concept, so none of the three carry one.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `composition-concern.schema.json` (new) | Adds `CompositionApiDocument`, `CompositionVariantsDocument`, `CompositionExamplesDocument` definitions, `additionalProperties: false` on each | MINOR |
| `root.schema.json` | Add `{ "$ref": "composition-concern.schema.json" }` to the top-level `oneOf` | MINOR |

**New shape** (`schema/composition-concern.schema.json`), mirroring `concern.schema.json`'s structure:
```yaml
# New property under #/definitions/CompositionApiDocument/properties
title:
  type: string
  description: "The composition's human-readable label"
  # not in required[] — optional, matches Composition.title
anatomy:
  $ref: "component.schema.json#/definitions/Anatomy"
  # in required[] — every composition document needs its structure
```

### Notes

`title`, `description`, `anatomy`, `elements`, `layout`, and `slotContent` all resolve to the exact same definitions `component.schema.json` and `Composition.ts` already declare — no new leaf types, only new documents that regroup existing fields by concern.

`metadata.concern` keeps using the existing `Concern` union (`'api' | 'variants' | 'examples'`) unchanged — the concern names are kind-agnostic; only the shape attached to each differs by kind.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `CompositionApiDocument` ↔ `composition-concern.schema.json#/definitions/CompositionApiDocument`; `CompositionVariantsDocument` ↔ `.../CompositionVariantsDocument`; `CompositionExamplesDocument` ↔ `.../CompositionExamplesDocument`. All three reference `Anatomy`, `Elements`, `Layout`, and `SlotContent` from `component.schema.json` rather than restating them, matching how `concern.schema.json` already references the same definitions.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | The split-concern file writer (`FileManifest`/`splitComponentByConcern`) is the sole producer of `api.yaml`/`variants.yaml`/`examples.yaml` and currently writes a composition's `api.yaml` through the same path as a component's, stubbing a meaningless `props: {}` | Shape the `api`/`variants`/`examples` payload per kind to match `ComponentApiDocument`/`CompositionApiDocument` etc.; stop writing `props` into a composition's `api.yaml` |
| `specs-from-figma` | None — the resolved `Component`/`Composition` object it produces is not split into concern files; that happens entirely in `specs-cli` | None |
| `specs-plugin-2` | None directly — the plugin does not write split-concern files | None |

---

## Semver Decision

**Target version**: `0.38.0` — `@directededges/specs-schema` on `release/next`.

**Change class**: `MINOR` — all changes are new, additive types and a new schema file referenced from `root.schema.json`'s `oneOf`. No existing type, field, or schema definition is changed or removed. Per constitution III/Additional Constraints: "MINOR for additive types or new optional fields."

---

## Consequences

- Compositions get the same exactness guarantee components already have under `splitConcerns`: a composition's `api.yaml`, `variants.yaml`, and `examples.yaml` each have a type that requires what they carry and rejects what they don't.
- `specs-from-figma` and `specs-cli` can stop producing a composition `api.yaml` with a meaningless stub `props: {}` — there is now a correct shape to target instead.
- `SpecConcernDocument` (component) and `CompositionConcernDocument` (composition) remain two separate unions. A consumer narrows on kind (already known before the file is read) rather than attempting to discriminate `title`-bearing documents of either kind by shape alone.
- `root.schema.json` validates composition concern documents for the first time; it still does not validate a *whole*, unsplit composition document — that gap is pre-existing and out of scope for this ADR.
- The component documents stay named `Spec*Document` for now. See ADR-110 for the `Component*Document` rename this ADR's naming makes visible.

---

## Amendment (2026-10-21)

Generating a real composition fixture end-to-end surfaced a gap this ADR missed: `Composition` (and so `CompositionExamplesDocument`) had no `images` field, but a real composition can carry a `backgroundImage` fill same as any component element — and the data was observably present in `specs-from-figma`'s current (pre-fix) output. Omitting it would have silently dropped real data the moment the engine fix in `specs-transforms` lands.

Adds `images?: Images` to `types/Composition.ts` and `CompositionExamplesDocument`, mirroring `Component.images`/`ComponentExamplesDocument` — same shape, same de-duplication. Schema definitions updated to match (`component.schema.json`'s `Composition`, `composition-concern.schema.json`'s `CompositionExamplesDocument`). Additive, `MINOR`, no change to any other field.
