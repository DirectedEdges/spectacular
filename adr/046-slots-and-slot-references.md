# ADR: Slots and Slot References

**Branch**: `046-slots-and-slot-references`
**Created**: 2026-05-18
**Status**: ACCEPTED
**Summary**: A `SlotContent` triplet and `SlotContentRef` pointer let compositions fill slots by reference.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Depends on**: [ADR-042 — Composition Structural Type](042-composition-type)
**Extended by**: ADR-047 (Component Slot Examples), ADR-049 (Prop Configurations and Bindings)

---

## Context

ADR-042 established `Composition` as the named, authored unit of composed content: `title?`, `description?`, `anatomy`, `elements`, `layout`. What it deferred is the slot dimension — how a composition's elements express their slot fills, and how those fills are defined and referenced.

Two needs arise together:

1. **A type for anonymous slot fills.** A slot fill is a structural triplet (`anatomy`, `elements`, `layout`) without independent identity — it has no `title` or `description` and cannot be referenced on its own unless it is named somewhere. This is the same shape as a `Composition` minus metadata. A distinct type is needed so that a `Composition`'s bundled fills are differentiated from the composition itself.

2. **A reference mechanism.** Whether a fill is bundled inside the same composition or lives in a separate registry entry, the call site (`propConfigurations.<slotName>`) needs a single pointer form that resolves to slot content regardless of where that content lives. That pointer must handle both levels of the two-scope registry: component-scoped fills in `Component.slotContentExamples` (ADR-047), and system-scoped `Composition` entries in an external compositions file.

These two needs are co-dependent: the pointer form follows from the type structure, and the type structure determines what the pointer resolves to.

### Constraints

- **No cycles.** A slot content reference chain `A → B → … → A` is forbidden. Consumer validators MUST detect and reject cycles. The schema cannot enforce this.
- **Unbounded depth.** The schema does not cap recursion depth. Operational concerns (legibility, performance) are project-level.
- **No scope boundary on pointers.** A `$slotContent` pointer inside a bundled fill can reference content outside its parent composition. The `slotContent` record on a `Composition` is an authoring convenience — it bundles related fills together — not a scope that restricts outbound references.

---

## Decision Drivers

- **`SlotContent` as the anonymous form** — same structural shape as `Composition`, without metadata; differentiates bundled fills from the composition entry itself
- **`Composition` as the named form** — `SlotContent` promoted with `title?`, `description?`, and the ability to bundle its own fills via `slotContent`
- **One pointer, any target** — `$slotContent` resolves to anything that has `anatomy + elements + layout`, whether that is a plain `SlotContent` or a full `Composition`; the pointer names the act (filling a slot), not the target type
- **Consistency with ADR-042** — the selected option must not require reworking `Composition`'s top-level shape
- **`slotContent` vocabulary** — the property name `slotContent` and type name `SlotContent` introduced here carry forward into ADR-047 (component slot examples), keeping the authoring vocabulary consistent across component and composition contexts
- **Additive-only** — all changes are MINOR; `Composition` gains an optional field
- **Type ↔ schema symmetry** — Constitution §I
- **No runtime logic** — Constitution §II

---

## Options Considered

All four options below use the same two-level scenario: a composition whose primary content contains a `highLevelInstance` with a slot; that slot's fill itself contains a `lowLevelInstance` with its own slot. The examples are drawn directly from [`adr/research/049/example.composition.architectures.yaml`](research/049/example.composition.architectures.yaml).

---

### Option A: Inline nested — slot fills written directly in `propConfigurations` *(Rejected)*

No named fills, no pointer. `propConfigurations.<slotName>` accepts an inline `SlotContent` object at the call site. Every fill is anonymous and embedded where it is used.

```yaml
## A
compositions:
  {composition name}:
    title:
    description:
    main:
      anatomy:
      elements:
        highLevelInstance:
          propConfigurations:
            highlevelSlot:
              anatomy:
              elements:
                lowLevelInstance:
                  propConfigurations:
                    lowLevelSlot:
                      anatomy:
                      elements:
                      layout:
              layout:
      layout:
```

**Pros**:
- Entire tree is visible top-to-bottom; no cross-references to follow
- No registry, no naming overhead
- Smallest schema delta — one union arm on `propConfigurations`

**Cons**:
- Indentation grows linearly with recursion depth; two levels already pushes leaves off-screen
- No aliasing — identical fills must be duplicated verbatim at every call site
- Fills are anonymous and unaddressable; tooling, docs, and audits have no named target to reference
- The inline `SlotContent` shape at the call site is structurally indistinguishable from a `Composition`; Option A introduces a type but no named identity

---

### Option B: Flat siblings — explicit `main` key; slot fills as named peers *(Rejected)*

`Composition` gains an explicit required `main` key holding the primary structural triplet. Additional slot fills live as named siblings of `main` at the same level. A `$slotContent` pointer references any sibling by key.

```yaml
## B
compositions:
  {composition name}:
    title:
    description:
    main:
      anatomy:
      elements:
        highLevelInstance:
          propConfigurations:
            highlevelSlot:
              $slotContent: "#/compositions/highLevelSlotContent"
      layout:
    highLevelSlotContent:
      anatomy:
      elements:
        lowLevelInstance:
          propConfigurations:
            lowLevelSlot:
              $slotContent: "#/compositions/lowLevelSlotContent"
      layout:
    lowLevelSlotContent:
      anatomy:
      elements:
      layout:
```

**Pros**:
- Aliasing is first-class — one definition, many `$slotContent` call sites
- All named fills are discoverable as siblings of `main`; the composition is self-contained
- Pointer paths are short — no intermediate property to include (`/groups/` or `/slotContent/`)

**Cons**:
- Requires reworking ADR-042's `Composition` shape — `anatomy`, `elements`, `layout` move inside `main`, not at the top level
- `title`, `description`, `main`, and slot fill keys are all siblings; JSON Schema must distinguish metadata fields from structural fill keys using `properties` + `patternProperties` — fragile and non-obvious
- `main` is a reserved key within what otherwise looks like a free-form record; that convention must be taught and enforced by tooling
- A `Composition` entry in an external file is no longer directly usable as a `SlotContent` target — the primary content is one level deeper

---

### Option C: `anatomy + elements + layout` at top level; slot fills in `slotContent` *(Selected)*

`Composition` from ADR-042 is unchanged. A new optional `slotContent?: Record<string, SlotContent>` field is added to hold named bundled fills. A new `SlotContent` type is the anonymous structural triplet. A `$slotContent` pointer resolves to either a `Composition` entry (top-level triplet) or a `SlotContent` within any `slotContent` record.

```yaml
## C
compositions:
  {composition name}:
    title:
    description:
    anatomy:
    elements:
      highLevelInstance:
        propConfigurations:
          highlevelSlot:
            $slotContent: "#/compositions/highLevelSlotContent"
    layout:
    slotContent:
      highLevelSlotContent:
        anatomy:
        elements:
          lowLevelInstance:
            propConfigurations:
              lowLevelSlot:
                $slotContent: "#/compositions/lowLevelSlotContent"
        layout:
      lowLevelSlotContent:
        anatomy:
        elements:
        layout:
```

**Pros**:
- No change to ADR-042's `Composition` shape — `anatomy`, `elements`, `layout` stay at the top level; `slotContent` is additive
- `SlotContent` is the anonymous form; `Composition` is the named form — clean distinction, no reserved keys, no mixed-level sibling records
- `slotContent` on a `Composition` mirrors `slotContentExamples` on a `Component` (ADR-047): same type name, same property semantics, consistent vocabulary across both contexts
- A pointer to a `Composition` entry and a pointer into its `slotContent` both resolve to an `anatomy + elements + layout` triplet — uniform resolution at any depth
- Intra-composition bundling (fills authored alongside the primary content) and cross-composition references (fills that live elsewhere) use identical pointer form; the path makes the scope explicit

**Cons**:
- A `SlotContent` nested inside `slotContent` cannot directly bundle its own fills — fills that go deeper must reference back to the same or another composition's `slotContent`. This is intentional (see Notes), but it means deeply cooperative fills require either multiple entries in one `slotContent` or a cross-composition reference.

---

### Option D: `parts` wrapper — all fragments under a named container *(Rejected)*

All fragments — the primary content and all slot fills — live under a `parts` record. `main` is a reserved key inside `parts` for the primary fragment.

```yaml
## D
compositions:
  {composition name}:
    title:
    description:
    parts:
      main:                       # reserved primary key
        anatomy:
        elements:
          highLevelInstance:
            propConfigurations:
              highlevelSlot:
                $slotContent: "#/compositions/highLevelSlotContent"
        layout:
      highLevelSlotContent:
        anatomy:
        elements:
          lowLevelInstance:
            propConfigurations:
              lowLevelSlot:
                $slotContent: "#/compositions/lowLevelSlotContent"
        layout:
      lowLevelSlotContent:
        anatomy:
        elements:
        layout:
```

**Pros**:
- `parts` cleanly separates metadata (`title`, `description`) from structural fragments — no mixed-level sibling problem from Option B
- All fragments, including `main`, are peers inside `parts`; pointer paths are uniform (`/parts/main`, `/parts/highLevelSlotContent`)

**Cons**:
- Requires reworking ADR-042's `Composition` shape — `anatomy`, `elements`, `layout` move inside `parts.main`
- A `Composition` entry cannot be directly targeted by a `$slotContent` pointer at the composition level — every pointer must include `/parts/main` to reach the primary content
- `main` is still a reserved key inside what looks like a free-form record; same convention burden as Option B
- `parts` is a new vocabulary term with no precedent elsewhere in the schema

---

## Decision

**Option C selected.** `SlotContent` is introduced as the anonymous structural triplet. `Composition` gains an optional `slotContent` field. `SlotContentRef` is introduced as the universal slot-fill pointer.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| New: `SlotContent.ts` | Add `SlotContent` interface — anonymous structural triplet | MINOR |
| New: `SlotContentRef.ts` | Add `SlotContentRef` — discriminated slot-fill pointer | MINOR |
| `Composition.ts` | Add optional `slotContent?: Record<string, SlotContent>` (extends ADR-042) | MINOR |
| `index.ts` | Export `SlotContent`, `SlotContentRef` | MINOR |

**`SlotContent`** (`types/SlotContent.ts`):

```ts
import type { Anatomy } from './Anatomy.js';
import type { Elements } from './Elements.js';
import type { Layout } from './Layout.js';

/**
 * Anonymous structural triplet for slot fill content.
 * The same shape as a Composition minus metadata and slotContent.
 * Used in slotContent records on Composition and Component (ADR-047).
 */
export interface SlotContent {
  anatomy: Anatomy;
  elements: Elements;
  layout: Layout;
}
```

**`SlotContentRef`** (`types/SlotContentRef.ts`):

```ts
/**
 * A reference to slot fill content — resolves via JSON Pointer to either a
 * Composition entry (top-level anatomy + elements + layout) or a SlotContent
 * within any slotContent record. The pointer names the act (filling a slot),
 * not the target type; both target types yield anatomy + elements + layout.
 *
 * Example paths:
 *   "#/compositions/pageHeader"                          → Composition entry
 *   "#/compositions/pageHeader/slotContent/navItems"    → SlotContent in Composition
 *   "#/components/pill/slotContentExamples/composedLabel" → SlotContent on Component
 */
export interface SlotContentRef {
  $slotContent: string;
}
```

**`Composition` extension** (modifies `types/Composition.ts` from ADR-042):

```ts
// Added field — all other fields unchanged from ADR-042
slotContent?: Record<string, SlotContent>;
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `#/definitions/SlotContent` | MINOR |
| `component.schema.json` | Add `#/definitions/SlotContentRef` | MINOR |
| `component.schema.json` | Add `slotContent` property to `#/definitions/Composition` | MINOR |

**`#/definitions/SlotContent`**:

```yaml
SlotContent:
  type: object
  description: "Anonymous structural triplet for slot fill content. Same shape as a Composition minus metadata and slotContent."
  required: [anatomy, elements, layout]
  properties:
    anatomy:   { $ref: "#/definitions/Anatomy" }
    elements:  { $ref: "#/definitions/Elements" }
    layout:    { type: array, items: { $ref: "#/definitions/LayoutNode" } }
  additionalProperties: false
```

**`#/definitions/SlotContentRef`**:

```yaml
SlotContentRef:
  type: object
  description: "Reference to slot fill content via JSON Pointer. Resolves to a Composition entry or a SlotContent within any slotContent record."
  required: [$slotContent]
  properties:
    $slotContent:
      type: string
      description: "JSON Pointer resolving to a Composition or SlotContent."
  additionalProperties: false
```

**Updated `#/definitions/Composition`** (adds `slotContent`):

```yaml
slotContent:
  type: object
  description: "Named slot fill entries bundled with this composition. Each entry is a SlotContent triplet referenced via $slotContent pointer."
  patternProperties:
    "^[a-zA-Z0-9_-]+$":
      $ref: "#/definitions/SlotContent"
  additionalProperties: false
```

### Pointer resolution rules

| Pointer target | Resolves to | Consumer extracts |
|---------------|-------------|-------------------|
| `#/compositions/<key>` | `Composition` entry | top-level `anatomy + elements + layout` |
| `#/compositions/<key>/slotContent/<fill>` | `SlotContent` | `anatomy + elements + layout` |
| `#/components/<name>/slotContentExamples/<fill>` | `SlotContent` | `anatomy + elements + layout` |

In all cases the consumer receives an `anatomy + elements + layout` triplet. If the target is a `Composition`, any `slotContent` on that entry is available to resolve further `$slotContent` references within it. If the target is a `SlotContent`, it carries no `slotContent` of its own; any further fills within it reference outward to other named entries.

### Out of scope for this ADR

- **`Component.slotContentExamples`** and `SlotBinding` — see ADR-047
- **`Component.instanceExamples`** — see ADR-048
- **`PropConfigurations` widening to accept `SlotContentRef`** — see ADR-049
- **Cycle detection** — normative requirement for consumer validators; schema cannot enforce it
- **External `compositions.yaml` file schema** — follow-on ADR

### Notes

- **`SlotContent` does not have `slotContent` on it.** A `SlotContent` entry's elements can reference other fills via `$slotContent` pointers, but it does not carry its own bundled fills. Bundling happens at the `Composition` level. This keeps `SlotContent` as a pure structural triplet and ensures there is always one clear place — the `Composition` — where related fills are grouped.
- **`slotContent` on `Composition` is an authoring convenience, not a scope boundary.** Pointers inside a `slotContent` entry can reference content outside the parent composition (other compositions, component-scoped fills). The grouping is for the author's benefit, not a namespace.
- **`$slotContent` names the act, not the target type.** The pointer key communicates "this is slot fill content" at the call site, regardless of whether the target is a `Composition` (with metadata) or a `SlotContent` (anonymous). Both yield `anatomy + elements + layout` to the consumer.
- **Where `SlotContentRef` is consumed.** This ADR introduces the type; the fields that accept it are established in ADR-047 (`SlotBinding.examples: SlotContentRef[]` — Figma authoring default at index 0) and ADR-049 (`Element.propConfigurations.<slotName>` — as a `SlotContentRef` object).

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `SlotContent { anatomy, elements, layout }` ↔ `#/definitions/SlotContent`; `required: [anatomy, elements, layout]`
  - `SlotContentRef { $slotContent: string }` ↔ `#/definitions/SlotContentRef`; `required: [$slotContent]`
  - `Composition.slotContent?: Record<string, SlotContent>` ↔ `#/definitions/Composition/properties/slotContent`; `patternProperties` → `SlotContent`

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Must detect and emit `slotContent` on compositions; must emit `$slotContent` references | Read new fields; implement slot-fill detection and reference emission |
| `specs-cli` | Recompile; output includes `slotContent` and `SlotContentRef` when present | Recompile; no breaking change |
| `specs-plugin-2` | Recompile; slot-fill rendering is a follow-on capability | Recompile; pass through data initially |

---

## Semver Decision

**Version bump**: `0.20.0 → 0.21.0` (`MINOR`)

**Justification**: New types `SlotContent` and `SlotContentRef`; optional `slotContent` field added to `Composition`. All additive — no existing type narrows → MINOR per Constitution §III.

---

## Consequences

- `SlotContent` and `Composition` are the two structural forms of slot fill content. `SlotContent` is anonymous (`anatomy + elements + layout`); `Composition` is named (`SlotContent` shape plus `title?`, `description?`, and its own `slotContent?`). A `$slotContent` pointer resolves to either.
- `slotContent` on `Composition` and `slotContentExamples` on `Component` (ADR-047) use the same type (`SlotContent`) and the same property semantics — a flat record of named triplets, subordinate to and authored alongside their parent definition.
- Slot fill references are expressed as `{ $slotContent: <JSON Pointer> }` at the call site in `propConfigurations.<slotName>` (ADR-049). The same pointer form applies whether the fill is bundled in the same composition, in another composition, or in a component's `slotContentExamples`.
- Cycle detection is a normative requirement for consumer validators. The schema describes the static reference graph; consumers own the cycle check.
- Recursion depth is unbounded. A `Composition` that references a `SlotContent` that references another `Composition` — and so on — is valid at any depth.
