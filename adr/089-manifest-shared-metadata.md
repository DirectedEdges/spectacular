# ADR: Run Metadata Factored Out of the Component Spec

**Branch**: `089-manifest-shared-metadata`
**Created**: 2026-09-15
**Status**: ACCEPTED
**Summary**: A `RunMetadata` type and `metadata.schema.json` carry the run's facts once, leaving `metadata.source` required per component.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`Component.metadata` is typed `Metadata` and is optional on the component, but the `Metadata` object itself requires all seven of its keys:

```yaml
metadata:
  author: ...
  lastUpdated: ...
  generator: { url, version, name, license? }
  schema: { url, version, latest? }
  source: { pageId, nodeId, nodeType }     # unique per component
  conventions: { ... }                     # identical across the run
  settings: { ... }                        # identical across the run
```

Exactly one of those seven — `source` — carries a fact about the component it sits on. The other six describe the **run** that produced the spec: who authored it, when it was generated, which generator and license produced it, which schema version it validates against, which platform conventions were declared, and which settings were resolved.

When a spec set is produced for a whole catalogue, that run is a single event, so those six keys carry the same values on every component. The contract has no way to say so. Every component repeats them, and where a component's spec is split across separate documents — an api document, an examples document, a variants document — the block repeats once per document as well. `conventions` and `settings` are the largest offenders: `ResolvedSettings` is a fully-resolved settings tree, and `MetadataConventions` is a full platform conventions entry. A catalogue of 60 components emitted across three documents each carries 180 copies of two objects that never vary.

The consequence is a contract that cannot express its own facts honestly. A reader of a single component document cannot tell whether `settings` is a fact about that component or about the run; a reader of two documents from the same run cannot tell whether identical values are a guarantee or a coincidence; and a value that is by construction invariant across a set is stated as if it were per-member.

This ADR gives the run-level facts a place to live once, and narrows what a component spec claims about itself to the one fact that is genuinely its own.

**Out of scope.** Where the aggregate document is written, what file it is named, and which invocations emit it are producer concerns, resolved in `specs-cli`, not here. This ADR defines only the document's shape and the shape of what remains on a component. The producer decision — that a catalogue-wide run emits one aggregate document and reduces the per-component block, and that a single-component run does not — is taken in `specs-cli` and is not resolved by this ADR.

---

## Decision Drivers

- **A field states a fact about the thing that carries it.** A key on a component must describe that component. A key that is invariant across every component in a run describes the run, not any component.
- **Type ↔ schema parity.** Every type change has a schema counterpart and vice versa (constitution I).
- **No logic in this package.** The contract may describe both the full and the reduced shape; it may not decide which one a producer emits (constitution II).
- **The reduced form must be independently valid.** A component document carrying only `metadata.source` must validate against `component.schema.json` with no producer flag, mode, or out-of-band agreement.
- **The aggregate must be mechanically validatable.** A new artifact that carries the run's facts is worth nothing to a consumer unless a schema describes it (constitution IV).
- **Contract coherence, not one consumer's convenience.** The redundancy is what surfaced the problem; the justification is that the contract currently misattributes run facts to components (constitution III).
- **Naming follows code platforms.** Type and property names follow the naming preference order (constitution VI), unabbreviated.

---

## Options Considered — Decision 1: How a component spec expresses reduced metadata

### Option A: `source` stays required, the six run keys become optional on `Metadata` *(Selected)*

One `Metadata` type continues to cover both shapes. `source` remains required, so a `metadata` block that is present always identifies its Figma origin. The six run keys become optional, so the reduced form is a valid subset of the full form.

```yaml
# Full form — unchanged, still valid
metadata:
  author: Design Systems Team
  lastUpdated: "2026-09-15T00:00:00.000Z"
  generator: { url: ..., version: ..., name: ... }
  schema: { url: ..., version: ... }
  source: { pageId: "12:0", nodeId: "12:345", nodeType: COMPONENT_SET }
  conventions: { ... }
  settings: { ... }

# Reduced form — newly valid
metadata:
  source: { pageId: "12:0", nodeId: "12:345", nodeType: COMPONENT_SET }
```

**Pros**:
- The reduced document validates against `component.schema.json` unaided — no mode, no variant schema, no producer flag.
- One type, one schema definition, one mental model; a consumer reads `metadata.settings` and handles absence, exactly as it already handles an absent `metadata`.
- Full-form documents written before this change remain valid: relaxing `required` only widens the accepted set.
- Absence becomes meaningful and directs the reader outward — a missing `settings` says "this document does not carry the run's facts", which is true.

**Cons / Trade-offs**:
- Breaking for readers. Code that reaches `metadata.settings.spec.details` without a guard stops compiling. This is a field-presence change and is MAJOR-class under the constitution's versioning rule.
- The type alone no longer tells a reader which of the two shapes to expect; that is a property of how the document was produced, which this package deliberately does not encode.

---

### Option B: A discriminated union — `Metadata | ReducedMetadata` *(Rejected)*

Keep `Metadata` exactly as it is and add a second type carrying only `source`, with `Component.metadata` typed as the union.

**Rejected because**: it is breaking for readers in precisely the same way as Option A — every access to `metadata.settings` must first narrow — while adding a second exported type and a `oneOf` in the schema for no additional expressive power. It pays the full MAJOR cost of Option A and takes on a larger public API surface (constitution III, minimal API) to buy nothing.

---

### Option C: Omit `metadata` entirely from reduced documents *(Rejected)*

`Component.metadata` is already optional, so a producer could emit reduced documents today with no schema change at all, and put every metadata key including `source` in the aggregate.

**Rejected because**: `source` is the one metadata key that is genuinely per-component, and it is the only link from a spec back to the Figma node it came from. Moving it into an aggregate keyed by component name replaces a fact the document carries with a lookup a consumer must perform, and a document separated from its aggregate loses its provenance entirely. The driver is that a field states a fact about its carrier — `source` passes that test and belongs where it is.

---

## Options Considered — Decision 2: Shape of the aggregate document

### Option A: A new `RunMetadata` type with its own `metadata.schema.json` *(Selected)*

The six run keys become a type in their own right, and a new schema file describes a document whose root is that type. `metadata.schema.json` joins `root.schema.json`'s `oneOf`, so the package's root schema accepts the new artifact alongside a component and a component set.

```yaml
# RunMetadata — the whole document
author: Design Systems Team
lastUpdated: "2026-09-15T00:00:00.000Z"
generator:
  url: https://...
  version: 0.30.0
  name: specs-cli
  license: { status: VALID, level: PRO }
schema:
  url: https://raw.githubusercontent.com/.../v0.33.0/schema/component.schema.json
  version: 0.33.0
  latest: https://raw.githubusercontent.com/.../main/schema/component.schema.json
conventions: { ... }
settings: { ... }
```

`Metadata` is then expressible as `RunMetadata`'s keys, all optional, plus a required `source` — one set of key definitions describing the run, referenced from both places.

**Pros**:
- The run's facts get a name and a validatable shape, so a consumer can read the aggregate without inferring its structure from a component document.
- No key is defined twice: `component.schema.json` references the same definitions the aggregate document's schema uses, which keeps the two from drifting (constitution I).
- Adding the type to `root.schema.json` means an arbitrary `.yaml` in a spec output directory can still be validated by pointing at the root schema, as it can today.

**Cons / Trade-offs**:
- Adds a file to the `schema/` export surface, which constitution III treats as contractual. This change only adds; it neither removes nor restructures an existing schema file, and no existing document changes its validation outcome.
- A second document type in the output means a consumer that walks a directory must recognize it. `root.schema.json`'s `oneOf` makes that mechanical rather than name-based.

---

### Option B: Carry the run facts on `components.schema.json` *(Rejected)*

Add a sibling `metadata` key next to `components` in the existing component-set schema, so a run's facts ride along with a set document.

**Rejected because**: it binds the aggregate to a shape the producer may not emit. The customer case that surfaced this splits a component across separate api, examples, and variants documents — there is no single set document for the run's facts to attach to, so the aggregate would have nowhere to live in exactly the arrangement it is meant to serve. It also conflates two independent things: a set of components, and the facts about the run that produced them.

---

### Option C: Leave the aggregate undefined — a producer-only artifact *(Rejected)*

Emit the aggregate from `specs-cli` with no type and no schema in this package.

**Rejected because**: it fails the mechanical-verifiability driver and constitution IV. The run's facts would move from a validated position inside a component document to an unvalidated document outside the contract, which is a net loss of guarantees rather than a reorganization of them. It would also make every consumer reconstruct the aggregate's shape by reading producer source.

---

## Options Considered — Decision 3: What to call the aggregate type

### Option A: `RunMetadata` *(Selected)*

**Naming rule applied**: constitution VI rule 2 — no code-platform consensus exists for this concept, so the term is chosen for accuracy to what the contract already calls the thing. `Settings` is documented in `CLAUDE.md` as "choices about the run", and `Metadata.settings` carries that description today. "Run" is the word the contract already uses for the generation event, unabbreviated, and it names what the six keys have in common.

---

### Option B: `SharedMetadata` *(Rejected)*

**Rejected because**: "shared" describes how the values are distributed across documents, not what they are. Should a future producer emit the aggregate for a single component, the values would not be shared with anything and the name would be wrong, while the facts it carries would be unchanged.

---

### Option C: `CatalogMetadata` *(Rejected)*

**Rejected because**: a catalogue is a producer-side grouping — it names how a particular invocation was scoped, not a concept in the contract. Naming a schema type after an invocation shape imports a producer concern into the shared language (constitution III).

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Metadata.ts` | Added type `RunMetadata` — `author`, `lastUpdated`, `generator`, `schema`, `conventions`, `settings`, each required on this type | MINOR |
| `Metadata.ts` | Changed `Metadata` — `author`, `lastUpdated`, `generator`, `schema`, `conventions`, `settings` become optional; `source` stays required | MAJOR |
| `index.ts` | Added export `RunMetadata` | MINOR |

**Example — new shape** (`types/Metadata.ts`):

```yaml
# Before
Metadata:
  author: string
  lastUpdated: string
  generator: { url, version, name, license? }
  schema: { url, version, latest? }
  source: { pageId, nodeId, nodeType }
  conventions: MetadataConventions
  settings: ResolvedSettings

# After
RunMetadata:
  author: string
  lastUpdated: string
  generator: { url, version, name, license? }
  schema: { url, version, latest? }
  conventions: MetadataConventions
  settings: ResolvedSettings

Metadata:
  source: { pageId, nodeId, nodeType }   # required — the component's own fact
  author?: string                        # optional — carried only when the
  lastUpdated?: string                   # document states the run's facts
  generator?: { url, version, name, license? }
  schema?: { url, version, latest? }
  conventions?: MetadataConventions
  settings?: ResolvedSettings
```

`Metadata` is defined as `Partial<RunMetadata>` intersected with the required `source`, so the two never drift.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `metadata.schema.json` | Added — new file; root is `RunMetadata`, with `definitions/RunMetadata` holding the six key definitions | MINOR |
| `component.schema.json` | Changed `metadata.required` from all seven keys to `["source"]`; the six run keys reference `metadata.schema.json#/definitions/RunMetadata/properties/*` rather than redefining them | MAJOR |
| `root.schema.json` | Added `metadata.schema.json` to `oneOf` | MINOR |

**Example — new shape** (`schema/metadata.schema.json`):

```yaml
$schema: http://json-schema.org/draft-07/schema#
title: Specs Run Metadata Schema
description: >-
  Facts about the generation run that produced a set of component specs —
  identical for every component in that run. Carries no per-component data.
$ref: "#/definitions/RunMetadata"
definitions:
  RunMetadata:
    type: object
    properties:
      author: { type: string }
      lastUpdated: { type: string }
      generator: { ... }
      schema: { ... }
      conventions: { $ref: "conventions.schema.json#/definitions/MetadataConventions" }
      settings: { $ref: "settings.schema.json#/definitions/Settings" }
    required: [author, lastUpdated, generator, schema, conventions, settings]
    additionalProperties: false
```

**Example — changed shape** (`schema/component.schema.json`, under `metadata`):

```yaml
# Before
required: [author, lastUpdated, generator, schema, source, conventions, settings]

# After
required: [source]
# The six run keys keep their definitions by reference to
# metadata.schema.json#/definitions/RunMetadata, so neither file restates them.
```

### Notes

- `source` is required rather than optional because a `metadata` block with nothing in it states nothing. `Component.metadata` itself stays optional, so a document that carries no metadata at all remains valid — that is the existing contract and this ADR does not change it.
- The six keys are optional on `Metadata` rather than forbidden, because a single-component run has one document and no reason to split its facts in two. Both shapes stay valid; which one is emitted is a producer decision.
- `RunMetadata` requires all six of its keys. The aggregate document exists to state the run's facts; a partial one would leave a consumer unable to tell a missing fact from a fact stated elsewhere.
- `metadata.schema.json` is named for the concept, not the artifact. The emitted filename is a `specs-cli` concern and is not fixed by this ADR.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**:
  - `RunMetadata` ↔ `schema/metadata.schema.json#/definitions/RunMetadata` — same six keys, same required set.
  - `Metadata` ↔ `component.schema.json`'s `metadata` property — `source` required in both; the six run keys optional in both, and defined once in `metadata.schema.json` and referenced from `component.schema.json`, mirroring the type's `Partial<RunMetadata>` derivation.
  - `RunMetadata.conventions` ↔ `conventions.schema.json#/definitions/MetadataConventions` and `RunMetadata.settings` ↔ `settings.schema.json#/definitions/Settings` — unchanged references, relocated.
  - `root.schema.json`'s `oneOf` gains the new document type, matching the fact that `RunMetadata` is now an exported top-level shape.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Breaking read. Emits the aggregate document and the reduced per-component block; decides when each applies. | Guard access to the six run keys on `Metadata`; add the aggregate document to its output surface; decide the emitted filename and which invocations produce it |
| `specs-from-figma` | Breaking read. Produces `Metadata` and must now be able to produce `RunMetadata` separately. | Guard access to the six run keys; expose the run's facts as a `RunMetadata` value distinct from per-component `Metadata` |
| `specs-plugin-2` | Breaking read. Same contract change; single-component output can keep emitting the full form. | Recompile and guard access to the six run keys |
| Any spec validator | Documents carrying only `metadata.source` now validate; the new document type validates via `root.schema.json`. | Upgrade to the published schema version before validating reduced output |

---

## Semver Decision

**Target version**: `0.33.0` — the version of `packages/schema/package.json` on `release/next`.

**Change class**: `MAJOR` — for CHANGELOG placement, not a version bump.

**Justification**: The constitution's versioning rule makes `MAJOR` any breaking change to "a type signature, field name, field presence, or schema structure". Six required fields on `Metadata` become optional, which is a field-presence change and breaks every consumer that reads them without a guard. The additions — `RunMetadata`, `metadata.schema.json`, the `root.schema.json` `oneOf` entry — are MINOR-class on their own and are carried by the MAJOR classification of the change they accompany.

Constitution Check: the change adds only types and schema with no logic (gate 1); every type change has a schema counterpart and every schema change a type counterpart (gates 2 and 3); no runtime dependency is added (gate 5). Constitution III treats the `schema/` export surface as contractual — this change adds a file and neither removes nor restructures an existing one, and no document that validates today stops validating.

---

## Consequences

- A component spec claims only what is true of that component. `metadata.source` is the one per-component fact and stays; the run's facts no longer masquerade as the component's.
- The run's facts become addressable on their own, as a named type with a schema, rather than only as a sub-object of whichever component document a consumer happens to open.
- A consumer reading `metadata.settings` or `metadata.conventions` must handle absence. Existing code that does not will fail to compile on upgrade — the intended signal, since the value's presence is now a real question rather than a guarantee.
- Every full-form document written against an earlier schema version stays valid. The change only widens what `component.schema.json` accepts.
- Two documents from the same run that carry no run keys are, for the first time, saying something: their facts live in the aggregate, and a consumer that wants them must read it. A reduced document separated from its aggregate keeps its provenance but loses the run's facts, and this is visible rather than silent.
- `specs-cli` gains the decisions this ADR deliberately leaves open: the aggregate's filename, where it is written, and which invocations emit it rather than the full per-component form.
