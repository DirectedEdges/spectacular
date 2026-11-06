# ADR: Subcomponent Figma Source Identity — `Subcomponent.source`

**Branch**: `060-subcomponent-source-metadata`
**Created**: 2026-06-27
**Status**: ACCEPTED
**Summary**: A `Subcomponent.source` carrying `pageId`, `nodeId` and `nodeType` resolves a subcomponent back to its Figma node.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`Subcomponent` is currently defined as `Omit<Component, 'metadata' | 'subcomponents'>`. This deliberately excludes the full `Metadata` block — author, generator, schema URL, config — because those fields describe the top-level generation event and have no meaningful per-subcomponent equivalent.

However, the complete exclusion of `metadata` also strips the `source` block (`pageId`, `nodeId`, `nodeType`), which identifies the specific Figma node each subcomponent was extracted from. Unlike generation provenance, source identity *is* meaningful per-subcomponent: each subcomponent maps to a distinct Figma component node with its own stable `nodeId`.

Without `source` on subcomponents, tools that need to resolve a `SubcomponentRef` (`$ref: "#/subcomponents/1B"`) back to a Figma node have no path — the information is structurally absent from the spec. A reverse-direction writer (spec → Figma) that needs to instantiate subcomponent-referenced elements must either maintain a parallel side-channel or rely on heuristics outside the spec format.

---

## Decision Drivers

- **Additive only**: The change must not break existing consumers — no field removal, no required-field addition, no type narrowing.
- **Minimum surface**: Only the data needed to identify the Figma source node should be added. Full generation provenance (author, generator, schema URL, config) remains excluded from `Subcomponent`.
- **Type ↔ schema symmetry**: Any type change must have a corresponding schema change and vice versa (Constitution I).
- **No new runtime exports**: Only type declarations and schema — no logic (Constitution II).
- **Named types for shared shapes**: If the source shape is factored out as a named type, it must represent a genuine shared concept, not an internal implementation detail (Constitution III).

---

## Options Considered

### Option A: Add `source?` directly to `Subcomponent` *(Selected)*

Introduce a new optional `source` field on `Subcomponent` typed as the same shape as `Metadata.source`. The `Subcomponent` definition changes from a pure `Omit` to an intersection that adds `source?`:

```ts
// Before
export type Subcomponent = Omit<Component, 'metadata' | 'subcomponents'>;

// After
export type SubcomponentSource = {
  pageId: string;
  nodeId: string;
  nodeType: 'COMPONENT' | 'COMPONENT_SET' | 'FRAME';
};

export type Subcomponent = Omit<Component, 'metadata' | 'subcomponents'> & {
  source?: SubcomponentSource;
};
```

The `SubcomponentSource` type is also exported so consumers can reference it directly without depending on `Metadata`.

**Pros**:
- Additive only — `source` is optional; all existing serialized subcomponents remain valid.
- Expresses the intent precisely: subcomponents carry Figma source identity, not generation provenance.
- `SubcomponentSource` is a stable, minimal named type with a clear shared meaning.
- The existing `Metadata.source` inline shape is replicated (not referenced via `Pick`) to keep `Metadata` and `Subcomponent` independently evolvable.

**Cons / Trade-offs**:
- Duplicates the source-block shape rather than sharing it via `Pick<Metadata, 'source'>`. If the source shape ever changes, both `Metadata` and `SubcomponentSource` must be updated together. This is an accepted trade-off — sharing via `Pick` would couple `Subcomponent` to `Metadata`'s internal structure.

---

### Option B: Allow full optional `Metadata` on `Subcomponent` *(Rejected)*

Change `Omit<Component, 'metadata' | 'subcomponents'>` to `Omit<Component, 'subcomponents'>`, making `metadata` optional on `Subcomponent`.

**Rejected because**: This exposes `author`, `lastUpdated`, `generator`, `schema`, and `config` on subcomponents — fields that are meaningless in the inline subcomponent context. It introduces structural noise into the serialized format and widens the schema surface far beyond what any consumer needs. It also implies that subcomponents are independently generated artifacts, which contradicts their role as inline members of a parent component spec.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Subcomponent.ts` | Add exported `SubcomponentSource` type | MINOR |
| `Subcomponent.ts` | Widen `Subcomponent` to intersect `{ source?: SubcomponentSource }` | MINOR |
| `types/index.ts` | Export `SubcomponentSource` | MINOR |

**Example — new shape** (`types/Subcomponent.ts`):

```ts
// Before
export type Subcomponent = Omit<Component, 'metadata' | 'subcomponents'>;

// After
export type SubcomponentSource = {
  pageId: string;
  nodeId: string;
  nodeType: 'COMPONENT' | 'COMPONENT_SET' | 'FRAME';
};

export type Subcomponent = Omit<Component, 'metadata' | 'subcomponents'> & {
  source?: SubcomponentSource;
};
```

**Example — serialized subcomponent with source**:

```yaml
subcomponents:
  1B:
    title: TEST Subcomponents Component / _ / 1B
    source:
      pageId: "790:6766"
      nodeId: "1477:200"
      nodeType: COMPONENT
    anatomy:
      root:
        type: container
    default:
      layout:
        - root
      elements:
        root:
          styles:
            width: 40
            height: 40
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `SubcomponentSource` definition under `#/definitions` | MINOR |
| `component.schema.json` | Widen `Subcomponent` `allOf` to allow `source?` property | MINOR |

**Example — new `SubcomponentSource` definition** (`schema/component.schema.json`):

```yaml
# New entry under #/definitions
SubcomponentSource:
  type: object
  description: Figma source identity for a subcomponent node.
  properties:
    pageId:
      type: string
    nodeId:
      type: string
    nodeType:
      type: string
      enum: [COMPONENT, COMPONENT_SET, FRAME]
  required: [pageId, nodeId, nodeType]
  additionalProperties: false
```

**Example — updated `Subcomponent` definition** (`schema/component.schema.json`):

```yaml
# Before: allOf excludes metadata and subcomponents via 'not'
# After: add source as an allowed optional property alongside the existing allOf

Subcomponent:
  type: object
  description: "A subcomponent's data, derived from Component but excluding metadata and subcomponents."
  allOf:
    - $ref: "#/definitions/Component"
    - not:
        properties:
          metadata: {}
          subcomponents: {}
        required: [metadata, subcomponents]
  properties:
    source:
      $ref: "#/definitions/SubcomponentSource"
```

### Notes

- `source` is optional on `Subcomponent`. Existing specs without it remain valid; writers populate it when the subcomponent's Figma node is known.
- `SubcomponentSource` intentionally duplicates the shape of `Metadata.source` rather than sharing it via `Pick`. This keeps the two types independently evolvable.
- `nodeType` is restricted to the same enum as `Metadata.source.nodeType`: `COMPONENT | COMPONENT_SET | FRAME`.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**: `SubcomponentSource` type in `types/Subcomponent.ts` maps to `#/definitions/SubcomponentSource` in `component.schema.json`. The optional `source` field on `Subcomponent` is reflected in the schema's `Subcomponent` definition.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | New optional field available on `Subcomponent` | Populate `source` when processing subcomponent nodes |
| `specs-cli` | Recompile against updated types | No API change; new field is optional |
| `specs-plugin-2` | Recompile against updated types | No API change; new field is optional |

---

## Semver Decision

**Version bump**: within `0.27.x` — no version change required

**Justification**: This change ships as part of the active `release/schema-0.27.0-cli-0.23.0` release. All changes are additive (optional field, new exported type); no bump beyond the release version is warranted.

---

## Consequences

- Subcomponents may now carry their Figma source identity (`pageId`, `nodeId`, `nodeType`) directly in the spec, enabling reverse-direction tools to resolve `SubcomponentRef` entries to Figma nodes without side-channels.
- `specs-from-figma` can populate `source` when it extracts subcomponent data, making specs self-contained for write-back operations.
- Consumers that do not need `source` are unaffected — the field is optional and absent specs remain schema-valid.
- Any tool validating serialized specs against `component.schema.json` must update to the new schema version to recognize `source` on subcomponents.
