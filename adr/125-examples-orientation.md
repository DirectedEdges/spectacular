# ADR: Instance-example orientation

**Branch**: `feat/render-instance-examples`
**Created**: 2026-11-14
**Status**: DRAFT
**Summary**: *(written at implementation — see `/specs.adr.implement`)*
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`Component.instanceExamples` (ADR-048/050) records a component's documented usages, and ADR-124 gave each example its own `styles` box so a captured example renders at its captured size. What the spec still cannot say is how the examples sit **relative to each other** on the canvas: a designer arranges Card usages in a row and Alert usages in a column, and a render of that spec stacks both vertically. The arrangement is itself authored documentation — a row of cards reads as a gallery, a column of alerts reads as a severity ladder — and it is lost on every round trip.

The capture side can detect the arrangement cheaply from the example instances' canvas positions, and the render side can lay the written `Examples` section out to match. What is missing is a place in the contract to carry it.

---

## Decision Drivers

- **Additive only** — the field must be optional with a safe absent meaning, so existing specs and consumers are untouched (MINOR-class per constitution III).
- **Type ↔ schema parity** — the field lands in `types/` and in every schema document that validates the examples concern (constitution I).
- **No logic in this package** — detection and layout live in the transform packages; this package carries only the value (constitution II).
- **Naming governance** — the term and its values follow code-platform vocabulary (constitution VI).
- **Enum casing** — closed string sets use `SCREAMING_CASE` (constitution, additional constraints).

---

## Options Considered

*(Pre-decided — no alternatives evaluated.)* The decision was reached in a working session on 2026-11-14 and verified end to end as a spike on this branch before drafting: capture detects the orientation from the first two examples' positions, writes `orientation` into the examples concern, and render lays the `Examples` section out to match. The author specified the key name, the value set, and the default.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Component.ts` | Added optional field `orientation` | MINOR |

**Example — new shape** (`types/Component.ts`):
```yaml
# Before
Component:
  instanceExamples?: InstanceExamples

# After
Component:
  instanceExamples?: InstanceExamples
  orientation?: 'HORIZONTAL' | 'VERTICAL'   # optional — MINOR; absent means VERTICAL
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Added optional property `orientation` to the `Component` definition | MINOR |
| `component-concern.schema.json` | Added optional property `orientation` to the examples-concern document (component level) | MINOR |

**Example — new property**:
```yaml
# Under the Component definition's properties
orientation:
  type: string
  enum: [HORIZONTAL, VERTICAL]
  description: "How the component's instance examples sit relative to each other."
  # not in required[] — optional; absent means VERTICAL
```

**Example — what a spec carries** (examples concern):
```yaml
instanceExamples:
  cardOffer1:
    propConfigurations: { appearance: Secondary }
orientation: HORIZONTAL
```

### Notes

- **Default by absence.** `VERTICAL` is the absent meaning, not a schema `default` keyword — a spec written before this ADR renders exactly as it does today.
- **Naming (constitution VI, rule 1).** `orientation` with `horizontal`/`vertical` values is the shared code-platform term: ARIA's `aria-orientation` and Android's linear-layout `orientation` both use exactly this word and value pair.
- **Scope: the whole example set, component level only.** One value describes the arrangement of the set — per-example orientation is meaningless, and a subcomponent-level `orientation` is out of scope for this ADR; no subcomponent capture emits one.
- **Inline union, no named definition.** The value set is two members used by one field; a named type and schema definition would grow the public API (constitution III) for no consumer need. The `SCREAMING_CASE` members match `LayoutMode`'s existing `HORIZONTAL`/`VERTICAL`.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `Component.orientation` (types) ↔ `component.schema.json#/definitions/Component/properties/orientation` ↔ the same property on the examples-concern document in `component-concern.schema.json`, which is the file that validates the split `examples.yaml`.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-cli` | Update usage | The concern splitter routes `orientation` into the examples concern; the concern merge already carries unknown keys back |
| `specs-from-figma` | Update usage | Capture detects the value from the first two example instances' canvas positions and emits it |
| `figma-from-specs` | Update usage | Render lays the `Examples` section out along the declared axis |
| `react-from-specs` | None | Instance examples are not emitted as code |
| `webcomponents-from-specs` | None | Instance examples are not emitted as code |
| `from-specs` (shared core) | Recompile | Type passthrough only |
| `specs-plugin-2` | Recompile | Receives the merged spec; behavior lives in `figma-from-specs` |

---

## Semver Decision

**Target version**: `0.41.0` — the version of the active `release/next` branch this ADR merges into.

**Change class**: `MINOR` — all changes are additive optional fields with a safe absent meaning (constitution III).

---

## Consequences

- A spec can now record how its instance examples are arranged, and a render reproduces the arrangement instead of always stacking vertically.
- Specs captured before this ADR carry no `orientation` and keep today's vertical layout unchanged.
- Any tool validating `examples.yaml` against `component-concern.schema.json` must take the new schema version to accept the key; until then the key fails validation (the known state of the spike).
