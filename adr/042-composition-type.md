# ADR: Composition Structural Type

**Branch**: `042-composition-type`
**Created**: 2026-04-29
**Status**: ACCEPTED
**Summary**: A `Composition` type names composed content, carrying `anatomy`, `elements` and `layout` with optional title and description.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: [ADR 025 — Flowing Content into a Nested Instance's Slot](025-nested-slot-api) *(partially — retains its `Composition` shape; defers its `PropConfigurations` widening to ADR-049)*
**Extended by**: ADR-046 (Slots and Slot References), ADR-047 (Component Slot Examples), ADR-048 (Component Instance Examples), ADR-049 (Prop Configurations and Bindings)

---

## Context

The schema represents components individually but has no type for a *composition*: a named, reusable arrangement of component instances that expresses how components are combined in context.

Compositions appear at four scales in Figma-sourced design systems:

- **Slot-filling examples** — content placed inside a component's slot layer in Figma (e.g., what fills `ActionListItem`'s `startVisual` slot by default)
- **Instance examples** — a fully-configured component usage (e.g., `ActionList` in its `danger` variant with three items)
- **Layout compositions** — multi-component arrangements forming a portion of a UI (a filter grid with a data table, a sidebar with checkboxes)
- **Page compositions** — full canonical views with specific components in specific states

Today, the schema cannot represent any of these. There is no structural type for tooling to discover, render, or validate against.

### Composition scoping

The four scales split into two authoring scopes:

- **Component-scoped** (`slot`, `instance`) — authored by the component designer inside the component definition; covered by ADR-047 and ADR-048
- **System-scoped** (`layout`, `page`) — independent of any single component, living in a separate `compositions.yaml` file parallel to `components.yaml`; schema for that file is a follow-on ADR

The `Composition` type established here serves both scopes. How components store and reference compositions — including the `slotContent` field and the `$slotContent` pointer — is addressed in ADR-046.

---

## Decision Drivers

- **Composition is a first-class concept** — components and compositions are peers in the schema's conceptual model; a named type is required
- **Additive-only** — no existing type is changed → MINOR semver
- **Type ↔ schema symmetry** — every type field has a schema counterpart (Constitution §I)
- **No runtime logic** — type declarations and schema only (Constitution §II)
- **Shared shape across scopes** — component-scoped and system-scoped compositions are structurally identical; one type serves both

---

## Options Considered

Four distinct questions shape the design space:

1. **Should `anatomy` and `elements` be converged?** — The split exists in `Component`/`Variant` to support variant-sensitive element data. A composition has no variants. Does the split still earn its weight here?
2. **Are `elements` and `layout` required or optional?** — An anatomy-only composition is structurally just a type map. Does meaningful content require both?
3. **How much metadata belongs on a composition now?** — `title` is the obvious start. What else is warranted, and what should be noted as anticipated extension points?
4. **When a composition's element is an instance with a slot, how is that slot filled?** — This is a constraint on the type's scope that must be stated explicitly; the mechanism itself is ADR-046.

---

### Option A: Separate anatomy and elements; all three fields required *(Selected)*

Keep the `Anatomy`/`Elements` split inherited from `Variant` for consistency. Require all three content fields — `anatomy`, `elements`, and `layout` — so a composition is always a complete structural + content + layout declaration. Add `description?` alongside `title?` for documentation tooling.

```yaml
title: Action List Item – default
description: Default text content for a standard list item with label and secondary description.
anatomy:
  label: { type: text }
  description: { type: text }
elements:
  label:
    content: Browse all issues
  description:
    content: 12 open · 3 closed
layout: [label, description]
```

Note: `elements` is sparse — only elements with content, styles, or configurations need entries. An element carrying no data can be omitted.

**Pros**:
- Completeness guarantee — every composition is a full structural declaration; no anatomy-only fragments that are indistinguishable from plain `Anatomy`
- `layout` required forces authors to express ordering intent, even when trivial (`[icon]` for a single glyph)
- Consistent with `Variant` field names, easing authoring and migration
- `description?` supports documentation tooling now; further metadata is anticipated

**Cons / Trade-offs**:
- When a composition contains only instance elements with no per-instance element data, `elements` must be an empty record `{}`. This is explicit but adds authoring noise.
- `layout` is trivially `[elementName]` for single-element compositions; requiring it adds overhead for that common case.

---

### Option B: Converge `anatomy` and `elements` into a single map *(Rejected)*

Since compositions have no variant tree, the split that motivates keeping `anatomy` and `elements` separate in `Component` does not apply. A single map where each entry holds both type metadata and element data would be a simpler authoring surface:

```yaml
title: Action List Item – default
anatomy:
  label:
    type: text
    content: Browse all issues       # type + data in one entry
  description:
    type: text
    content: 12 open · 3 closed
layout: [label, description]
```

**Rejected because**:
- If a composition is later promoted to a full component (a natural authoring workflow), the converged map must be split back into `anatomy` + `elements` + `variants`. Keeping them separate makes that migration a no-op.
- `AnatomyElement` (`type`, `detectedIn?`, `instanceOf?`) and `Element` (`children`, `styles`, `propConfigurations`, `content`) have non-overlapping fields. Merging them creates a hybrid type that is neither and must be maintained independently.
- Breaks the `Anatomy`/`Elements` pattern used throughout the rest of the schema.

---

### Option C: `anatomy` required; `elements` and `layout` optional *(Rejected)*

Only `anatomy` is required; `elements` and `layout` are optional for cases where a composition is purely structural.

```yaml
title: Action List Item – default
anatomy:
  label: { type: text }
  description: { type: text }
# elements and layout omitted — structurally indistinguishable from Anatomy
```

**Rejected because**:
- An anatomy-only composition — `anatomy` with no `elements` and no `layout` — is structurally identical to an `Anatomy` record. It carries no information beyond element types and names; it does not describe a *composition* in any meaningful sense.
- Downstream consumers cannot distinguish an authored anatomy-only composition (intentional) from one where the author simply forgot to add content data.

---

### Option D: `anatomy` and `elements` required; `layout` optional *(Rejected)*

Require content data but leave layout optional, with anatomy key order as the implied default.

```yaml
title: Action List Item – default
anatomy:
  label: { type: text }
  description: { type: text }
elements:
  label:
    content: Browse all issues
  description:
    content: 12 open · 3 closed
# layout omitted — anatomy key order (label → description) implied
```

**Rejected because**:
- "Implied order" is an invisible convention that tooling must either assume or reject. Making `layout` required eliminates ambiguity, especially for compositions with nested containers where order is load-bearing.
- The only case where `layout` is genuinely noise is a single-element composition — and even there, `layout: [elementName]` is one line and makes intent explicit.

---

## Decision

`Composition` is the named, authored unit of composed content. It carries optional authoring metadata (`title`, `description`) and a required structural triplet: `anatomy`, `elements`, and `layout` — directly at the top level, with no intermediate wrapper or named primary key. How slot fills and slot references are layered onto this shape is addressed in ADR-046.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| New: `Composition.ts` | Add `Composition` type and `Compositions` registry alias | MINOR |
| `index.ts` | Export `Composition`, `Compositions` | MINOR |

**New type** (`types/Composition.ts`):

```ts
import type { Anatomy } from './Anatomy.js';
import type { Elements } from './Elements.js';
import type { Layout } from './Layout.js';

/**
 * A named, authored unit of composed content.
 * Carries optional metadata and a required structural triplet.
 * Slot fill capability (slotContent, $slotContent pointer) is layered on in ADR-046.
 */
export interface Composition {
  title?: string;
  description?: string;
  anatomy: Anatomy;
  elements: Elements;
  layout: Layout;
}

export type Compositions = Record<string, Composition>;
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `#/definitions/Composition` | MINOR |

**New definition**:

```yaml
Composition:
  type: object
  description: "A named, authored unit of composed content. Required fields: anatomy, elements, layout. Optional metadata: title, description. Slot fill capability is added in ADR-046."
  required: [anatomy, elements, layout]
  properties:
    title:        { type: string }
    description:  { type: string }
    anatomy:      { $ref: "#/definitions/Anatomy" }
    elements:     { $ref: "#/definitions/Elements" }
    layout:       { type: array, items: { $ref: "#/definitions/LayoutNode" } }
  additionalProperties: false
```

### Out of scope for this ADR

- **`slotContent` on `Composition`** and the **`$slotContent` pointer** — see ADR-046
- **`Component.slotContentExamples`** and `SlotBinding` — see ADR-047
- **`Component.instanceExamples`** and `InstanceExample` — see ADR-048
- **`PropConfigurations` widening** — see ADR-049
- **`compositions.yaml` file schema** — follow-on ADR after ADR-047

### Notes

- **`elements` is sparse** — not every anatomy element needs a corresponding `elements` entry. Elements with no content, styles, or prop configurations can be omitted. The `elements: {}` case (all anatomy elements are instances with no element-level data) is valid and explicit.
- **No discriminator on `Composition`** — discrimination is the responsibility of extending types and consuming fields. The base `Composition` is shape-only.
- **`Composition` is not placed directly on `Component`** — it is the registry-entry shape; `Component.slotContentExamples` (ADR-047) and external composition files are the consumer-facing entry points.
- **Anticipated metadata extensions** — `title` and `description` are the authoring-time metadata for this ADR. Anticipated follow-on extensions include `tags?: string[]` for cataloguing, `deprecated?: boolean` for lifecycle management, and `guidelines?: string` for usage guidance. Deferred until consuming types are established and usage patterns are known.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `Composition { title?, description?, anatomy, elements, layout }` ↔ `#/definitions/Composition`; `required: [anatomy, elements, layout]`

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | No immediate output change; `Composition` is foundational for ADR-046/047/048 | Recompile when those ADRs land |
| `specs-cli` | Recompile | No change |
| `specs-plugin-2` | Recompile | No change |

---

## Semver Decision

**Version bump**: `0.20.0 → 0.21.0` (`MINOR`)

**Justification**: Adds new type `Composition` — purely additive; no existing type is removed or narrowed → MINOR per Constitution §III.

---

## Consequences

- `Composition` is the structural foundation for all composition-related ADRs that follow: ADR-046 layers on slot fill capability; ADR-047 and ADR-048 establish the component-level entry points; ADR-049 establishes the `propConfigurations` widening
- All three structural fields (`anatomy`, `elements`, `layout`) are required — a composition is always a complete structural declaration, never a degenerate anatomy-only piece
- The top-level triplet is the primary content — no wrapper, no named primary key; the shape reads directly and mirrors what system-scoped composition files will use
- `description?` is the first step toward a richer authoring-time metadata model; `tags`, `deprecated`, and `guidelines` are identified follow-on extension points
