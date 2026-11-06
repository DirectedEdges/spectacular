# ADR: Surface license state in component output

**Branch**: `001-license-check`
**Created**: 2026-02-24
**Status**: ACCEPTED
**Summary**: A `license` field inside `metadata.generator` records the license state that produced a component's output.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`@directededges/anova` currently exports a `Metadata` type with six fields (`author`, `lastUpdated`, `generator`, `schema`, `source`, `config`). There is no field to carry license state in the serialised component output.

Downstream tools need a standard place in the component spec to read whether a valid license was present at generation time and what level of output that license grants. This ADR evaluates where that field belongs and how license data flows into the transformer.

Current `Metadata` shape (abbreviated):

```yaml
Metadata:
  author: string
  lastUpdated: string
  generator: { url, version, name }
  schema: { url, version }
  source: { pageId, nodeId, nodeType }
  config: Config
  # license — ABSENT
```

---

## Decision Drivers

- **Type-schema symmetry**: Constitution I requires every type change have a corresponding schema change before publishing; drift is a bug.
- **Additive only**: The `license` field MUST be optional so existing consumers that do not supply a license receive identical output — no MAJOR bump. When `generator.license` is absent, runtimes assume the most basic entitlement (`status: "NONE"`, `level: "FREE"`).
- **No logic**: Constitution II forbids algorithms or runtime behaviour; this ADR introduces only type declarations and schema properties.
- **Stable, intentional API**: Constitution III requires that every new export represent a genuine shared concept. `license?` on `Metadata` is a standard output field consumed by all downstream packages.
- **Strict TypeScript**: All new declarations must compile under strict mode with zero errors (Constitution V).

---

## Boundary: `Config` does not carry license data

`Config` controls output shape — layout, formatting, depth — and is a caller-supplied input that the transformer consumes deterministically. License state is **not** a formatting preference; it is an entitlement resolved by the runtime environment (CLI credentials, plugin auth context) and should not leak into `Config`.

Instead, the runtime (anova-kit CLI, anova-plugin) resolves license state independently and supplies it to the transformer as a separate input alongside `Config`. The transformer stamps the resolved result into the output's `generator` block. This keeps `Config` purely about *what shape* the output takes and `generator.license` about *what the caller was entitled to*.

There are interdependencies between the two: certain `Config` options (e.g. advanced layout modes, extended detail depth) may only be available at higher license levels. Enforcement of those constraints is a runtime concern — the transformer or the runtime validates that the requested `Config` is compatible with the resolved license level before generation, but `Config` itself remains unaware of licensing.

---

## Options Considered

### Option A — Top-level `metadata.license?`

Add a new optional `license` property directly on `Metadata`, as a sibling of `generator`, `schema`, etc.

```yaml
Metadata:
  ...
  config: Config
  license?:
    status: string
    description: string
```

**Pros**: Clear separation — license is its own concern, distinct from generator identity.

**Cons**: Adds a seventh top-level key to `Metadata`. License state is inherently tied to what the generator produced, yet lives outside `generator`.

---

### Option B — Nested inside `generator.license?`

Extend the existing `generator` object with an optional `license` sub-object. The generator already describes *what produced the output*; license describes *what the output is entitled to*.

```yaml
Metadata:
  ...
  generator:
    url: string
    version: number
    name: string
    license?:
      status: string        # e.g. "VALID", "EXPIRED", "NONE"
      level: string          # e.g. "FREE", "PRO", "EXTENDED"
```

**Pros**:
- Flatter: reuses an existing object rather than adding a new top-level key.
- Semantically grouped: `generator` already answers "who made this and how" — adding "under what license" is a natural extension.
- `level` communicates what richness the output may (or may not) contain, making it immediately useful for downstream gating.
- `level` is a plain `string` for now, keeping it extensible as tiers evolve.

**Cons**: Slightly overloads the `generator` concept (identity + entitlement).

---

## Decision

**Option B** — add `license?` inside `generator`.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Metadata.ts` | Add optional `license?` to the `generator` object | MINOR |

**Updated `Metadata` shape** (`types/Metadata.ts`):

```yaml
# Before
generator: { url, version, name }

# After
generator:
  url: string
  version: number
  name: string
  license?:               # optional — absent when no license was resolved
    status: string        # e.g. "VALID", "EXPIRED", "NONE"
    level: string         # e.g. "FREE", "PRO", "EXTENDED"
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `license` property to `#/definitions/Metadata/properties/generator/properties` (NOT in generator's `required[]`) | MINOR |

**Updated generator properties** (`#/definitions/Metadata/properties/generator`):

```yaml
# New property added to generator/properties
license:
  type: object
  description: "Resolved license state at the time this component spec was generated. Absent when no license was supplied."
  properties:
    status:
      type: string
      description: "License validation status (e.g. VALID, EXPIRED, NONE)."
    level:
      type: string
      description: "Output entitlement level (e.g. FREE, PRO, EXTENDED). Plain string for extensibility."
  required:
    - status
    - level
  additionalProperties: false
  # license is NOT added to generator's required[] — it remains optional
```

### Notes

- `license` is intentionally absent from the generator `required[]` array. Consumers that do not provide a license receive an identical `generator` object to the current version.
- `additionalProperties: false` on `generator` is retained; adding `license` to `properties` is the correct mechanism — no schema constraint is relaxed.
- `level` is typed as `string` rather than a union/enum to allow the tier model to evolve without a type-level breaking change.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `types/Metadata.ts → generator.license?` maps to `schema/component.schema.json → #/definitions/Metadata/properties/generator/properties/license`
  - Both changes are optional/non-required in their respective artifacts

---

## Consequences

- `generator` output may now include `license.status` and `license.level` when a generator resolves a license.
- Downstream tools can read `generator.license.level` to decide whether to gate or enrich output (e.g. omit certain sections for `FREE`).
- Any tool performing runtime validation against `component.schema.json` will accept the new optional field automatically; no validator changes are required for consumers that never produce `license`.
