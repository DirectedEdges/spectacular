# ADR: Spec Provenance Beyond Figma Capture

**Branch**: `106-authored-provenance` *(drafted on `feat/writing-specs`)*
**Created**: 2026-10-16
**Status**: DRAFT
**Summary**: *(written at implementation — see `/specs.adr.implement`)*
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`Metadata` (in `types/Metadata.ts`, compiled into `component.schema.json#/definitions/Metadata`) requires `source` — an object of Figma capture facts: `pageId`, `nodeId`, `nodeType`. Every concern document requires `metadata`, so every valid spec asserts it was captured from a Figma node.

The authored-hub direction makes that assertion false for a growing class of specs: a spec authored by an agent from a request, a prototype sketched before any Figma node exists, a spec migrated from another tool. Such a spec has no honest `pageId`/`nodeId`, and fabricating them is worse than omitting them. Today's stopgap is `specs validate --authored`, which downgrades exactly the missing-`source` error to a warning — a validator concession, not a modeled state.

The schema needs a first-class way to say *where a spec came from* when the answer is not "a Figma node".

---

## Decision Drivers

- **Never fabricate a fact**: an authored spec must be able to validate without inventing capture data.
- **Existing data stays valid**: thousands of generated specs carry `source: {pageId, nodeId, nodeType}` with no origin marker; they must not need migration.
- **Origin is a vocabulary, not a boolean**: agentic authoring, human prototyping, migration, and capture are distinct origins tools may want to distinguish.
- **Render still needs the node identity**: `metadata.source`'s Figma facts serve overwrite protection on render; a provenance model must keep them addressable.
- **Type–schema parity** per the constitution.

---

## Options Considered

### Decision 1 — How a non-Figma origin is expressed

#### Option A: Origin-discriminated union with a legacy default *(Selected)*

`source` becomes a union discriminated by an `origin` member. `origin` is optional, and **absent `origin` means `figma`** — the legacy reading, which keeps every existing spec valid without migration. The `figma` variant carries the capture facts (required, as today); other variants carry what their origin can honestly state.

```yaml
# Captured (today's data — unchanged, origin implied):
metadata:
  source:
    pageId: "12622:9"
    nodeId: "12642:26892"
    nodeType: COMPONENT_SET

# Captured, stated explicitly:
metadata:
  source:
    origin: figma
    pageId: "12622:9"
    nodeId: "12642:26892"
    nodeType: COMPONENT_SET

# Agent-authored:
metadata:
  source:
    origin: authored
    tool: claude-code        # optional free string
```

**Pros**:
- Existing data valid as-is; the change class stays additive.
- Origins are an open, extensible vocabulary (`figma`, `authored`, `prototype`, …).
- An authored spec validates with zero warnings; `--authored` retires.

**Cons / Trade-offs**:
- The implied-default discriminator is a reading rule consumers must learn (absent origin = figma).

#### Option B: Make `source` optional *(Rejected)*

**Rejected because**: absence says only "not captured" — it cannot distinguish agentic authoring from prototyping from migration, and it leaves no place to hang origin-specific facts (authoring tool, migration source). It also reads as missing data rather than a stated fact, which invites tooling to "fix" it.

#### Option C: Keep `source` required and add a sibling `origin` field *(Rejected)*

**Rejected because**: `source` required with Figma-shaped members forces the fabrication this ADR exists to end; an `origin: authored` beside a fabricated `nodeId` is self-contradictory data.

### Decision 2 — Where the Figma capture facts live

#### Option A: Flat on the `figma` variant, as today *(Selected)*

`pageId`/`nodeId`/`nodeType` remain direct members of `source` when the origin is figma.

**Pros**:
- Every existing spec stays byte-valid; no migration, no dual-read window.

**Cons / Trade-offs**:
- Figma-specific keys sit at `source`'s top level rather than corralled under a `figma` key.

#### Option B: Corral capture facts under `source.figma.*` *(Rejected for this release)*

`source: {origin: figma, figma: {pageId, nodeId, nodeType}}` is the cleaner long-term shape — origin-specific facts namespaced per origin. **Rejected because** it invalidates every existing spec and every reader of `source.nodeId`, a MAJOR-class migration this additive ADR should not carry. Recorded as the preferred shape to adopt at the next MAJOR, when the union's variants can each take a namespaced payload.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Metadata.ts` | `source` becomes a union: the existing capture shape (optionally stating `origin: 'figma'`) or an authored-origin shape with optional descriptive members | MINOR |
| `Metadata.ts` | New `SpecOrigin` string-union type (`'figma' \| 'authored' \| 'prototype'`, open to extension) | MINOR |

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | `#/definitions/Metadata/properties/source` becomes the origin-discriminated union; absent `origin` validates as the figma variant | MINOR |

### Notes

Exact member sets of the non-figma variants (e.g. `tool`, `author` reference, timestamps) are settled at implementation against the constitution's minimal-API gate — the ADR fixes the discrimination model, not the full vocabulary. `specs validate --authored` is deprecated by this change and retired once the schema lands.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — the union is declared in `Metadata.ts` and compiled to the same discrimination in `component.schema.json`. Per ADR-105's principle, variants that overlap (the legacy no-`origin` shape vs the explicit `figma` shape) compile to `anyOf`, with `required` arrays carrying the discrimination.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | `validate` drops the `--authored` concession; authored specs validate clean | Remove the downgrade path; recompile |
| `specs-from-figma` | Generated output may begin stating `origin: figma` explicitly | Optional; existing output stays valid |
| `specs-plugin-2` | Render's overwrite protection reads node identity only from figma-origin specs; other origins render as new nodes | Guard the `source` read by origin |

---

## Semver Decision

**Target version**: `0.36.0` — the version of `release/next`, the branch this ADR merges into.

**Change class**: `MINOR` — a widened union where every existing document remains valid; new optional vocabulary.

**Justification**: Additive union variants and an optional discriminator with a legacy default; no existing field changes meaning or requiredness for existing data.

---

## Consequences

- A spec can state honestly that it was authored, prototyped, or captured — and validate with zero warnings in every case.
- Fabricated node ids lose their only remaining excuse.
- The `source.figma.*` corral is on record as the next-MAJOR shape.
- Tools gain a provenance signal to branch on (e.g. render treating authored specs as always-new).
