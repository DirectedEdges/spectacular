# ADR: A Spec Records the Asset Its Render Produced

**Branch**: `120-rendered-asset-identity`
**Created**: 2026-11-11
**Status**: DRAFT
**Summary**: *(written at implementation — see `/specs.adr.implement`)*
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`Metadata.source` is the one metadata fact belonging to the component that carries it, and its documented meaning is a single direction: *the Figma node this spec was captured from*. It is required on every `metadata` block, and its members are the capture facts `pageId`, `nodeId`, and `nodeType`.

Rendering runs the other way. A spec is written, rendered onto a Figma canvas, and a node comes into being that the spec produced. That node has an identity, and the schema has nowhere to put it — so the fact is lost at the moment it is created.

The cost falls on composition. A spec that instances another component names it by spec key, and resolving that key to something placeable requires the target's node identity. Two specs authored in the same workspace, each rendered to the same file, cannot reference one another: the first spec's node exists, and nothing in the second spec's world can say where. The only way to make the first placeable is to capture the file back and read it as library data — which turns authored work into generated input, the round trip the authored-hub direction exists to avoid.

`source` cannot carry it. Its members describe where the spec came from, and a node the spec *produced* is not that. Writing render output into `source` would also make an authored spec indistinguishable from a captured one, and "was this captured?" is a question other behavior already answers from this field.

ADR-106 is the adjacent decision and the reason this one is narrow. That ADR turns `source` into a union discriminated by `origin`, so an authored spec can state `origin: authored` without fabricating capture facts. It settles *where a spec came from*. It does not address where a spec was rendered **to**, and the two are independent: a spec may be authored and rendered, captured and re-rendered, or authored and never rendered.

**Out of scope**: reconciling a recorded asset against the node as it stands later. A node can be edited, moved, or deleted after the render that made it, and deciding what a stale record means — and who repairs it — is a sync and reconciliation question this ADR deliberately does not open. What is decided here is a record of what a render produced, not a claim that the node still matches.

---

## Decision Drivers

- **Never fabricate a fact**: a spec must be able to state what its render produced without borrowing a field that means something else.
- **One field, one direction**: `source` means captured-from. A produced-by fact needs its own home, or both readings become ambiguous and every consumer has to guess which it is holding.
- **Existing data stays valid**: every generated spec carries `source` and no render record; none may require migration.
- **Additive only**: the change must be MINOR-class — a new optional member, nothing removed or renamed.
- **A shared concept, not one package's need**: the record must be meaningful to every consumer that reads a spec, not a convenience for the tool that writes it (constitution III).
- **Code-platform naming** per constitution VI: the vocabulary should read as a record of output, not as Figma's own terms.
- **Type–schema parity** per constitution I.

---

## Options Considered

### Decision 1 — Where a rendered asset's identity is recorded

#### Option A: A sibling `rendered` member on `Metadata` *(Selected)*

`metadata.rendered` joins `metadata.source` as an optional member. `source` keeps its single meaning; `rendered` states what the last render produced.

```yaml
# Authored, never rendered — no record
metadata:
  concern: api
  source:
    origin: authored        # per ADR-106

# Authored, then rendered
metadata:
  concern: api
  source:
    origin: authored
  rendered:
    nodeId: "84021:19488"
    nodeType: COMPONENT_SET
    pageId: "12622:9"
    fileKey: "unsaved-lhe0t90miac"
    at: "2026-11-11T22:13:24.748Z"

# Captured, then re-rendered elsewhere — both facts, independently true
metadata:
  source:
    pageId: "12622:9"
    nodeId: "12642:26892"
    nodeType: COMPONENT_SET
  rendered:
    nodeId: "84024:20280"
    nodeType: COMPONENT_SET
    pageId: "12622:9"
    fileKey: "unsaved-lhe0t90miac"
    at: "2026-11-11T22:40:02.000Z"
```

**Pros**:
- Each field keeps one direction, so no consumer has to infer which kind of identity it is reading.
- Additive and optional — existing specs are valid untouched, and the change class stays MINOR.
- Independent of ADR-106: this member is meaningful whatever `source` resolves to, and the two compose without either constraining the other.
- Addresses a shared concept — "where this spec was last rendered" is a fact every consumer of a spec can use, not a private note for the renderer.

**Cons / Trade-offs**:
- Two members now carry a node identity, and a careless reader could take either. The field names are the only thing distinguishing them, which places real weight on the documentation of each.

#### Option B: Extend `source` with the rendered node *(Rejected)*

Add the render's node identity to `source`, either flat or on ADR-106's `authored` variant.

**Rejected because**: it collapses two directions into one field. `source` answers "where did this spec come from"; a rendered node answers "what did this spec produce". A spec carrying a rendered node in `source` asserts it was captured from a node it actually created, which is false, and it defeats the discrimination ADR-106 introduces — `origin: authored` beside capture-shaped members is the self-contradiction that ADR rejected in its own Option C.

#### Option C: A workspace-level registry outside the spec *(Rejected)*

Record rendered identities in a workspace file keyed by spec, leaving specs untouched.

**Rejected because**: the identity is a fact about one component, and the schema's own rule is that such a fact lives on the component carrying it — that is what distinguishes `source` from run metadata. A sidecar also detaches the record from the thing it describes: copying a spec folder to another workspace would silently carry a stale identity or none, and nothing in the spec would say which.

---

### Decision 2 — What the record states

#### Option A: Node, type, page, file, and time *(Selected)*

`nodeId` and `nodeType` identify the asset; `pageId` and `fileKey` locate it, since a node id is only meaningful within a file; `at` records when the render happened.

**Pros**:
- `fileKey` is what makes the record honest across files — without it, a node id read in the wrong file is a silent mismatch rather than a miss.
- `at` is the only member that lets a reader see the record is old without resolving it, which keeps the out-of-scope staleness question answerable later rather than foreclosed.
- `nodeType` mirrors what `source` already states, so the two read the same way.

**Cons / Trade-offs**:
- Five members for a fact a node id alone nearly expresses. Each is justified above, but the surface is wider than the minimum.

#### Option B: `nodeId` alone *(Rejected)*

**Rejected because**: a node id has no meaning without the file it belongs to, so a record without `fileKey` cannot be checked — only trusted. It would also force the next question (which page, when) into a second additive change rather than settling it once.

---

### Decision 3 — One current record, or a history

#### Option A: One record, replaced on each render *(Selected)*

`rendered` holds the most recent render. A re-render overwrites it.

**Pros**:
- Matches what the fact is for: locating the asset now. A list would make every reader choose, and nothing in the spec would say which entry is current.
- A spec is a contract, not a log. Render history is run information, and the schema already separates per-run facts from per-component ones.

**Cons / Trade-offs**:
- A spec rendered into two different files can only name one of them, so the second render displaces the first. That is a real limit, and the file-key member at least makes it visible rather than silent.

#### Option B: A list of rendered assets *(Rejected)*

**Rejected because**: it answers a question nobody has asked yet — rendering one spec into several files at once — and it forces every reader to implement a selection rule the schema would have to define. If multi-target rendering becomes real, a list is an additive change from one record; the reverse is not.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Metadata.ts` | New optional `rendered` member on `Metadata` | MINOR |
| `Metadata.ts` | New exported `RenderedAsset` type describing that member | MINOR |

**Example — new shape** (`types/Metadata.ts`):
```yaml
# Before
Metadata:
  source: { pageId: string, nodeId: string, nodeType: COMPONENT | COMPONENT_SET | FRAME }
  concern?: Concern

# After
Metadata:
  source: { pageId: string, nodeId: string, nodeType: COMPONENT | COMPONENT_SET | FRAME }
  concern?: Concern
  rendered?: RenderedAsset        # optional — MINOR

RenderedAsset:
  nodeId: string                  # the node the render produced
  nodeType: COMPONENT | COMPONENT_SET | FRAME
  pageId: string                  # the page it was placed on
  fileKey: string                 # the file it lives in — a node id means nothing without it
  at: string                      # ISO 8601, when the render ran
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | New optional property `rendered` under `#/definitions/Metadata/properties` | MINOR |
| `component.schema.json` | New `#/definitions/RenderedAsset`, a closed object | MINOR |

**Example — new shape** (`schema/component.schema.json`):
```yaml
# New property under #/definitions/Metadata/properties
rendered:
  $ref: "#/definitions/RenderedAsset"
  description: "The Figma asset this spec's last render produced. Absent on a spec that has never been rendered. Not a claim that the node still matches the spec — see ADR-120."
  # not in required[] — optional field

# New definition
RenderedAsset:
  type: object
  additionalProperties: false
  required: [nodeId, nodeType, pageId, fileKey, at]
  properties:
    nodeId:   { type: string, pattern: "^[0-9]+:[0-9]+$" }
    nodeType: { enum: [COMPONENT, COMPONENT_SET, FRAME] }
    pageId:   { type: string, pattern: "^[0-9]+:[0-9]+$" }
    fileKey:  { type: string }
    at:       { type: string, format: date-time }
```

### Notes

- `rendered` is optional because most specs have never been rendered, and a spec that has not been is not defective.
- Its members are all required **once present**: a partial record is worse than none, since a reader cannot tell a missing member from an unknown one. This is the same reason `source` requires all three of its members today.
- The name states what the member records — an asset this spec rendered — rather than borrowing Figma's vocabulary. Constitution VI rule 2 applies: no code-platform consensus exists for this concept, and the term is chosen from the schema's own output language rather than from Figma's.
- `nodeId` and `pageId` take the same pattern `source` uses, so the two members validate identically and a reader moving between them meets no surprise.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `Metadata.rendered` ↔ `#/definitions/Metadata/properties/rendered`; the `RenderedAsset` type ↔ `#/definitions/RenderedAsset`, member for member, with the enum on `nodeType` matching the type's union.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-cli` | Update usage | Writes the record after a render reports success, and reads it when resolving a spec key to something placeable. Both the write and the read are new behavior, not a recompile. |
| `figma-from-specs` | None | It receives a resolved identity rather than reading the spec's metadata to find one. |
| `specs-from-figma` | None | Capture produces `source`; it has no reason to write a render record. |
| `react-from-specs` | None | Emitted code does not read spec metadata. |
| `webcomponents-from-specs` | None | As above. |
| `from-specs` | None | The shared core carries no metadata reading. |
| `specs-plugin-2` | Recompile | It compiles against these types; nothing in its own surface changes. |

---

## Semver Decision

**Target version**: `0.40.0` — the version of `packages/schema` on `release/next`, the active release branch this ADR merges into.

**Change class**: `MINOR` — for CHANGELOG placement, not a version bump.

**Justification**: Every change is a new optional member plus the definition it references. Nothing is removed, renamed, or made stricter, so no existing spec becomes invalid and no consumer's compile breaks — MINOR-class per constitution III.

---

## Consequences

- A spec can state the asset its render produced, so a workspace knows which of its components are placeable without capturing the file back.
- Two specs authored in the same workspace can reference one another after each has been rendered once, which is what makes composition possible in an authored workspace.
- `source` keeps exactly one meaning. A consumer asking "was this captured?" still reads one field, and the answer is unaffected by whether the spec was ever rendered.
- A spec carrying `rendered` asserts only what a render produced, and the node may since have changed. Nothing in this ADR detects or repairs that, and a consumer must not read the record as a guarantee of current structure.
- A spec rendered into more than one file can name only the most recent. Should multi-target rendering become real, widening this member to a list is an additive change.
- ADR-106 and this ADR compose: a spec may state an authored origin and a rendered asset at once, and neither constrains the other.
