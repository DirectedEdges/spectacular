# ADR 054: Workspace Schema File

**Branch**: `053-transform-emit-config`
**Created**: 2026-06-05
**Status**: ACCEPTED
**Summary**: A `workspace.schema.json` file describes `specs.config.yaml`, covering sources, output and the `config` block.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*
**Follows**: [ADR 053](053-transform-emit-config.md)

---

## Context

`component.schema.json` validates the component YAML output format — anatomy, props, variants, and styles. It has historically been the only schema file in the package, so all definitions landed there by default.

This includes `Config` (`processing`, `format`, `include`) and, from ADR 053, `TransformEntry` and `TransformConfig`. All of these describe CLI and workspace behavior — none of them are component output concepts. Their presence in `component.schema.json` is incorrect.

`Config` does appear as a `config:` field embedded in component YAML, but that is provenance metadata recording what settings produced the component — the definition's authority belongs in workspace config, and `component.schema.json` should reference it from there.

This ADR creates `workspace.schema.json` as the canonical home for all CLI and workspace-level configuration shapes, and moves `Config`, `TransformEntry`, and `TransformConfig` there. `component.schema.json` references `Config` via cross-file `$ref`.

---

## Options Considered

*(Pre-decided — no alternatives evaluated)*

---

## Decision

### New file: `schema/workspace.schema.json`

Owns all CLI and workspace-level configuration definitions.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://specs.directededges.com/workspace.schema.json",
  "title": "Specs Workspace Configuration",
  "description": "Schema for workspace-level CLI configuration (specs.config.yaml and related settings).",
  "definitions": {
    "Config": { ... },        // moved from component.schema.json
    "TransformEntry": { ... },
    "TransformConfig": { ... }
  }
}
```

### Changes to `schema/component.schema.json`

- Remove `Config` definition
- Remove `TransformEntry` definition
- Remove `TransformConfig` definition
- Update `#/definitions/Metadata/properties/config/$ref` from `#/definitions/Config` to `workspace.schema.json#/definitions/Config`

### Changes to `types/` — none

TypeScript types are unchanged. The constitution's "or its siblings" clause covers schema definitions split across sibling files in the same package.

### Package exports

`workspace.schema.json` is already exported via `./schema/workspace` (added in the ADR 053 implementation commit).

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — definitions move to a sibling file, not removed
- **Parity check**:
  - `Config` → `workspace.schema.json#/definitions/Config`
  - `TransformEntry` → `workspace.schema.json#/definitions/TransformEntry`
  - `TransformConfig` → `workspace.schema.json#/definitions/TransformConfig`
  - `component.schema.json` root `config` property → `$ref: workspace.schema.json#/definitions/Config`

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Reads config via TypeScript types — unaffected by schema file reorganization | Recompile |
| `specs-from-figma` | No change | Recompile |
| `specs-plugin-2` | No change | Recompile |

---

## Semver Decision

**Version bump**: none beyond ADR 053's `0.23.0 → 0.24.0`

**Justification**: Schema reorganization only. No types added or removed; `Config`'s JSON schema shape is identical — only its file location changes. The cross-file `$ref` is transparent to validators.

---

## Consequences

- `component.schema.json` validates only component output content — anatomy, props, variants, styles, and the provenance `config` field (referenced, not owned)
- `workspace.schema.json` is the authoritative home for all CLI/workspace configuration shapes
- The boundary is enforced structurally: component output shapes in `component.schema.json`; CLI/workspace config shapes in `workspace.schema.json`
- Future workspace-level additions (sources config, output config, etc.) have a clear home without polluting the component schema
