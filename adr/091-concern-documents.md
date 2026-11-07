# ADR: Each concern document is its own type

**Branch**: `091-concern-documents`
**Created**: 2026-09-18
**Status**: ACCEPTED
**Summary**: `SpecApiDocument`, `SpecVariantsDocument` and `SpecExamplesDocument` type each file a `splitConcerns` run writes.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — extends ADR-089)*

---

## Context

`Settings.spec.splitConcerns` writes one file per concern rather than a single component file. It defaults to `true`, so concern-split output is the ordinary shape of a generated workspace, not an opt-in edge case. `types/Image.ts` already reasons about "concern-split output" when resolving an image pointer.

The contract has never described the resulting document. `schema/root.schema.json` offers exactly three branches:

```yaml
oneOf:
  - component.schema.json    # requires title, anatomy, default
  - components.schema.json
  - metadata.schema.json
```

A concern document matches none of them. It is a slice of a component, and each slice is missing something `Component` declares required:

| Document | Carries | Required by `Component`, absent |
|---|---|---|
| `api.yaml` | `title`, `anatomy`, `props` | `default` |
| `variants.yaml` | `default`, `variants`, `invalidVariantCombinations` | `title`, `anatomy` |
| `examples.yaml` | `instanceExamples`, `slotContentExamples`, `subcomponents` | `title`, `anatomy`, `default` |

A validator picks the nearest `oneOf` branch and reports its failures, so an editor tells the author of a `variants.yaml` that their file needs a title. The file is correct; the contract has no way to say so.

Separately, every concern document carries two keys under `metadata` that appear in neither `types/Metadata.ts` nor `component.schema.json`:

```yaml
metadata:
  # …author, generator, schema, conventions, settings…
  generatedAt: 2026-09-17T23:55:28.273Z
  concern: api
```

`Metadata` sets `additionalProperties: false`, so both are reported as disallowed on every concern document in every workspace. These are real facts the generator writes deliberately — `concern` states which slice the file is, which is exactly the discriminator the missing root type needs.

The result is that a correctly generated workspace cannot be validated against its own published schema. Authors editing specs in an editor see errors on every file and learn to ignore the validator, which then cannot catch the mistakes it exists to catch.

**Out of scope**: whether `splitConcerns` should remain the default, and the set of concerns themselves (`api`, `variants`, `examples`). This ADR types the documents that setting already produces.

---

## Decision Drivers

- **Types and schema describe the same structure** (constitution I): a new document shape needs both a type and a schema definition, added together.
- **No runtime logic** (constitution II): the discrimination between concern documents must be expressible in JSON Schema and TypeScript alone — no helper that inspects a document and tells a consumer what it is.
- **Mechanically verifiable** (constitution IV): `root.schema.json` must stay internally consistent with `component.schema.json`, and a valid generated file must validate.
- **A single-file component stays exactly as it is**: `splitConcerns: false` output is the `Component` shape today and must not change, so this cannot be paid for by loosening `Component`.
- **Naming follows code platforms** (constitution VI): the vocabulary for "when was this produced" should not invent a second term for a fact the contract already names.
- **Additive where possible**: downstream packages compile against these types; a change that forces every consumer to re-handle `Component` is disproportionate to the gap being closed.

---

## Options Considered

### Decision 1 — How a concern document is validated

#### Option A: One type per concern, discriminated by `metadata.concern` *(Selected)*

`SpecApiDocument`, `SpecVariantsDocument` and `SpecExamplesDocument`. Each states what its concern carries, requires it, and permits nothing else. `root.schema.json` gains a branch holding the three.

```yaml
SpecApiDocument:
  required: [metadata, title, anatomy, props]
  additionalProperties: false
  properties:
    metadata:      # concern must be the literal 'api'
    title:
    anatomy:
    props:
    subcomponents: # each one sliced to its api concern too

SpecVariantsDocument:
  required: [metadata, default, variants]
  additionalProperties: false
  properties:
    metadata:      # concern must be the literal 'variants'
    default:
    variants:
    invalidVariantCombinations:
    subcomponents:
```

**Pros**:
- A key in the wrong file is an error. A `variants.yaml` carrying an `anatomy`, or an `api.yaml` carrying a `default` block, is rejected — by the schema and by the compiler.
- Each document requires what it genuinely carries, so an `api.yaml` missing its anatomy is caught. A single all-optional shape catches neither.
- `Component` is untouched, so single-file output keeps the contract it has today.
- The shapes already exist. `ComponentApiData`, `ComponentVariantsData` and `ComponentExamplesData` live in the CLI as `any`-typed interfaces; this moves them into the contract that ought to own them.

**Cons / Trade-offs**:
- The key-to-file allocation becomes contractual. Moving a key between concerns is now a schema change — though it was already a breaking change for anything reading the files.
- Three shapes plus three subcomponent shapes must track `Component`. A property added to `Component` must be placed in whichever concern carries it, rather than inherited automatically.
- TypeScript cannot discriminate the union on `metadata.concern`, because the discriminant sits one level down. A consumer narrows on a key (`'title' in doc`) instead. The schema has no such limit.

---

#### Option B: One `SpecConcernDocument` with every property optional *(Rejected)*

A single shape: every `Component` property optional, `metadata.concern` required as the discriminator.

**Rejected because**: it accepts any key in any file. A `variants.yaml` with an `anatomy` block validates, and so does an `api.yaml` with no anatomy at all — the type says nothing about what belongs where. It closes the reported errors without adding validation, which is the weaker half of the goal.

---

#### Option C: Relax `Component.required` to `title` only *(Rejected)*

Drop `anatomy` and `default` from the required list so that every concern document validates as a `Component`.

**Rejected because**: it violates the fourth driver directly. A single-file component genuinely does require an anatomy and a default block, and removing that requirement means the contract no longer states the one thing it most needs to state about a component. It also does not work — `variants.yaml` has no `title` either, so the requirement would have to fall to zero, at which point `Component` validates any object at all.

---

#### Option D: Conditional `if`/`then` on `metadata.concern` inside `Component` *(Rejected)*

Keep one type and make its required list depend on the value of `metadata.concern`.

**Rejected because**: `Component` in TypeScript cannot express the conditional at all, so the type and the schema would describe different structures — a direct violation of constitution I.

---

### Decision 2 — How a document states when it was produced

#### Option A: `concern` on `Metadata`, and reuse `lastUpdated` for the timestamp *(Selected)*

Add `concern` to `Metadata` as an optional discriminator. Do **not** add `generatedAt` — `RunMetadata.lastUpdated` already names this fact, and the generator should write that key.

```yaml
# After
metadata:
  lastUpdated: 2026-09-17T23:55:28.273Z   # existing key, already declared
  concern: api                             # new, optional
```

**Pros**:
- Satisfies the naming driver: the contract names each fact once. `generatedAt` and `lastUpdated` are two spellings of one thing, and publishing both makes every consumer decide which is authoritative.
- `concern` earns its place because it does work no existing key does — it is the discriminator Decision 1 relies on.
- Optional on `Metadata`, so a single-file component omits it and is unaffected.

**Cons / Trade-offs**:
- The generator currently writes `generatedAt` and must change to write `lastUpdated`. Until it does, concern documents still fail validation — the fix is not complete in this package alone.
- `lastUpdated` is a slightly awkward name for a file that was just created. The alternative is worse: two timestamp keys with no stated relationship.

---

#### Option B: Add both `generatedAt` and `concern` to `Metadata` *(Rejected)*

Declare the two keys exactly as the generator writes them today.

**Rejected because**: it publishes two names for one fact. A consumer reading a spec would have to know that `lastUpdated` on a run metadata document and `generatedAt` on a concern document mean the same thing, and nothing in the contract would say so. Constitution VI's naming governance exists to prevent exactly this, and the cheaper fix is a one-key change in the generator rather than a permanent redundancy in the published type.

---

#### Option C: A separate `document` block beside `metadata` *(Rejected)*

Put per-file facts in their own block: `document: { concern: api }`.

**Rejected because**: it adds a second top-level metadata concept without a principle separating it from the first. `metadata.source` is already a per-document fact living under `metadata`, so the block does not cleanly divide run facts from document facts — it just moves one key and leaves the boundary less clear than before.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Metadata.ts` | Added optional field `concern` to `Metadata` | MINOR |
| `Metadata.ts` | Added exported type `Concern` | MINOR |
| `ConcernDocument.ts` | Added — `SpecApiDocument`, `SpecVariantsDocument`, `SpecExamplesDocument`, their three subcomponent shapes, and the `SpecConcernDocument` union | MINOR |
| `index.ts` | Export all seven, plus `Concern` | MINOR |

**Example — new shape** (`types/Metadata.ts`):
```yaml
# Before
Metadata:
  source: { pageId, nodeId, nodeType }
  # …optional RunMetadata fields

# After
Metadata:
  source: { pageId, nodeId, nodeType }
  concern?: Concern    # optional — which concern this document carries
  # …optional RunMetadata fields

Concern: 'api' | 'variants' | 'examples'
```

**Example — new shape** (`types/ConcernDocument.ts`):
```yaml
SpecApiDocument:
  metadata: Metadata & { concern: 'api' }
  title: string
  anatomy: Anatomy
  props: Props
  subcomponents?: Record<string, SpecApiSubcomponent>

SpecVariantsDocument:
  metadata: Metadata & { concern: 'variants' }
  default: Variant
  variants: Variants
  invalidVariantCombinations?: PropConfigurations[]
  subcomponents?: Record<string, SpecVariantsSubcomponent>

SpecExamplesDocument:
  metadata: Metadata & { concern: 'examples' }
  slotContentExamples?: Record<string, SlotContent>
  instanceExamples?: InstanceExamples
  images?: Images
  subcomponents?: Record<string, SpecExamplesSubcomponent>

SpecConcernDocument: SpecApiDocument | SpecVariantsDocument | SpecExamplesDocument
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Added optional property `concern` to `#/definitions/Metadata` | MINOR |
| `component.schema.json` | `Component.metadata` now forbids `concern` | MINOR |
| `concern.schema.json` | Added — the three document definitions, their three subcomponent definitions, and a `oneOf` over the documents | MINOR |
| `root.schema.json` | Added `concern.schema.json` to `oneOf` | MINOR |

**Example — new shape** (`schema/component.schema.json`):
```yaml
# New property under #/definitions/Metadata/properties
concern:
  type: string
  enum: [api, variants, examples]
  description: "Which concern this document carries. Absent on a single-file component."
```

### Notes

`concern` is optional on `Metadata`, which is shared with single-file components, but each document definition pins it to a literal — `const: api` on `SpecApiDocument`, and so on. That is what keeps the three branches apart from each other.

`Component.metadata` forbids `concern` outright. Without that the branches overlap in one direction: a concern document carrying enough keys to satisfy `Component` matches `Component` too, concern and all. An `api.yaml` with a stray `default` block was accepted until this was added.

The six definitions live in `concern.schema.json` and reference `component.schema.json` for the component-level definitions they reuse — `Anatomy`, `Props`, `Variant` and the rest — rather than restating them. That is the same cross-file reference `conventions.schema.json` already makes.

A subcomponent inside a concern document is sliced by the same concern, so each document's `subcomponents` points at its own subcomponent shape. Holding a nested subcomponent to the whole-subcomponent requirements fails for exactly the reason the document itself would.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `Concern` ↔ the `enum` on `#/definitions/Metadata/properties/concern`
  - `Metadata.concern` ↔ `#/definitions/Metadata/properties/concern`, absent from `required`
  - `SpecApiDocument` / `SpecVariantsDocument` / `SpecExamplesDocument` ↔ the same three definitions in `concern.schema.json`, each with the same property set and the same required list
  - `SpecApiSubcomponent` / `SpecVariantsSubcomponent` / `SpecExamplesSubcomponent` ↔ likewise
  - `SpecConcernDocument` (the union) ↔ the `oneOf` in `concern.schema.json`

One asymmetry, and it is TypeScript's rather than a modelling choice: the schema discriminates the three branches on `metadata.concern`, while TypeScript cannot narrow a union on a nested property. A consumer narrows on a key instead — `'title' in doc`. Both reach the same branch; only the route differs.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Writes `metadata.generatedAt` on every concern document, which the contract does not declare | Write `lastUpdated` instead — one writer, `Writers/FileManifest.ts`. `metadata.concern` is already set correctly |
| `specs-from-figma` | None — it writes no concern document and names neither key | None |
| `specs-plugin-2` | None, for the same reason | None |

The CLI's `Writers/DataTransformers.ts` holds `any`-typed interfaces for these three shapes. They can be replaced by the published types once this ships; that is a cleanup, not a requirement.

---

## Semver Decision

**Target version**: `0.33.0` — the version of `@directededges/specs-schema` on the active `release/next` branch.

**Change class**: `MINOR` — for CHANGELOG placement, not a version bump.

**Justification**: Every change is additive — one optional field on an existing type, two new exported types, one new schema file, one new `oneOf` branch. No existing type or schema property is removed, renamed, or made stricter, so no consumer's current code or output stops validating (constitution III).

---

## Consequences

- A generated workspace using the default `splitConcerns: true` validates against the published schema, so editor diagnostics on spec files become trustworthy rather than noise to be ignored.
- A key in the wrong concern file is now an error rather than silently accepted — in the schema and in the compiler.
- Each document requires what its concern carries, so a truncated or half-written concern file is caught rather than passing as "all fields optional".
- The key-to-file allocation is contractual. Moving a key between concerns is a schema change, and a property added to `Component` must be placed in whichever concern carries it rather than inherited.
- Six new shapes track `Component`. This is a parity obligation on every future component-shape ADR, and the cost paid for the validation above.
- Validating a component *across* its concern files — catching an `api.yaml` with no matching `variants.yaml` — remains outside the contract. Each file validates alone.
- The published contract states one name for the generation timestamp. Generators writing `generatedAt` are wrong against the schema until they change.
