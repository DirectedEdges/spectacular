# ADR: Schema File Identity and Packaging

**Branch**: `107-schema-file-identity` *(drafted on `feat/writing-specs`)*
**Created**: 2026-10-16
**Status**: DRAFT
**Summary**: *(written at implementation — see `/specs.adr.implement`)*
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The schema files reference each other by relative URI (`component.schema.json#/definitions/Styles`), but only `settings.schema.json` and `conventions.schema.json` declare an `$id`. The other six files have no identity of their own, so every consumer that compiles the set (ajv or any JSON Schema tooling) must register each file under an invented key that happens to match the relative reference strings — an undeclared coupling that each consumer rediscovers.

Two packaging defects compounded this and are fixed alongside (already implemented on `feat/writing-specs`):

- The package's exports map omitted `./schema/styles`, `./schema/components`, and `./schema/root`, so a consumer following the exports alone could not resolve references the exported files themselves make.
- `component.schema.json` was titled "Specs Plugin Output Schema" — a plugin-era name surfacing in validator output and tooling.

**Out of scope, recorded as an open question**: whether `component.schema.json` (46KB) and `styles.schema.json` (39KB) should split into smaller files for performance. Compilation happens once per process and parse cost is milliseconds at these sizes, so no evidence of a performance problem exists yet; splitting would multiply the cross-file reference surface this ADR is tidying. A future ADR takes that decision if load-time or authoring-ergonomics evidence appears.

---

## Decision Drivers

- **The file set must be self-describing**: a consumer should compile it without inventing registration keys.
- **Existing references keep resolving**: `settings`/`conventions` already use absolute `https://specs.directededges.com/*.schema.json` ids; the relative refs between the other files must keep working.
- **No reference rewrites**: the fix is identity declaration, not a refactor of every `$ref`.
- **Exports parity**: everything the exported schemas reference must itself be exported.

---

## Options Considered

### Decision — What `$id` each schema file declares

#### Option A: Absolute ids on the established base, one per file *(Selected)*

Every schema file declares `"$id": "https://specs.directededges.com/<name>.schema.json"`, matching the convention `settings` and `conventions` already use. Relative references (`component.schema.json#/…`) resolve against the declaring file's base URI per JSON Schema resolution, landing on the sibling's `$id` — no `$ref` changes anywhere.

**Pros**:
- One convention across all eight files; the two existing ids become the rule instead of the exception.
- Consumers can `addSchema(doc)` with no key argument; relative refs resolve by the standard.

**Cons / Trade-offs**:
- The ids are URLs that do not (and need not) dereference; a reader may try to fetch them.

#### Option B: Relative ids (`"$id": "component.schema.json"`) *(Rejected)*

**Rejected because**: a relative `$id` still needs a base URI from somewhere, which reintroduces the consumer-supplied-key problem it was meant to remove, and diverges from the absolute convention two files already establish.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| *(none)* | — | — |

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json`, `components.schema.json`, `concern.schema.json`, `metadata.schema.json`, `styles.schema.json`, `root.schema.json` | Declare `$id: https://specs.directededges.com/<name>.schema.json` | PATCH |
| `component.schema.json` | Title corrected: "Specs Plugin Output Schema" → "Specs Component Schema" *(implemented)* | PATCH |

### Packaging changes (`package.json`)

| Change | Bump |
|---|---|
| Exports map gains `./schema/styles`, `./schema/components`, `./schema/root` *(implemented)* | PATCH |

---

## Type ↔ Schema Impact

- **Symmetric**: Yes, trivially — no type changes; identity and packaging only.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | `specs validate` can register schemas by their declared `$id` instead of invented basenames | Simplify registration when convenient; current code keeps working |
| `specs-from-figma` | None | Recompile |
| `specs-plugin-2` | None | Recompile |

---

## Semver Decision

**Target version**: `0.36.0` — the version of `release/next`, the branch this ADR merges into.

**Change class**: `PATCH` — identity declarations, a title string, and additive export entries; no document that validated before changes status.

**Justification**: No vocabulary, shape, or requiredness changes; consumers' existing registration code remains correct.

---

## Consequences

- The schema set compiles anywhere without consumer-invented registration keys.
- The exports map satisfies every reference the exported files make.
- Validator and tooling output names the component schema for what it is.
- The file-splitting question is explicitly parked with its current evidence (no measured cost), awaiting a future ADR if evidence changes.
