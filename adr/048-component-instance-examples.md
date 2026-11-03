# ADR: Component Instance Examples

**Branch**: `048-component-instance-examples`
**Created**: 2026-04-29
**Status**: ACCEPTED
**Summary**: An `instanceExamples` registry carries real instances of a component, stored once and referenced by variants.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Depends on**: [ADR-042 — Composition Structural Type](042-composition-type), [ADR-046 — Slots and Slot References](046-slots-and-slot-references), [ADR-047 — Component Slot Examples](047-component-slot-examples)
**Extended by**: ADR-049 (Prop Configurations and Bindings)

---

## Context

ADR-042 established `Composition`. ADR-046 established `SlotContent` and `SlotContentRef`. ADR-047 established `Component.slotContentExamples` and `SlotBinding`.

Components need a named catalogue of pre-configured examples: a documented set of specific prop values that expresses canonical usages. Tooling can discover and render these without inspecting the raw variant tree. Authors can reference them by key instead of repeating configuration inline.

`InstanceExample` is the type for this case. It captures:
- An optional human-readable label (`title`)
- Prop values (`propConfigurations`) — scalar values for scalar props, `SlotContentRef` for slot props

`Component.instanceExamples` is the named record that holds `InstanceExample` entries.

### Scalar props vs slot props

Scalar props (`string`, `number`, `boolean`) are set directly as values. Slot props require a structural fill — a `SlotContentRef` pointing at a `SlotContent` in `slotContentExamples` or a `Composition` in an external registry. `PropBinding` (live data binding) is not accepted here: `InstanceExample` represents a documented configuration for human readers and tooling, not a runtime data flow.

---

## Decision Drivers

- **Named record, not array** — examples must be referenceable by key; a unified `examples` record with a `kind` discriminator was considered and rejected (Option B) — the two shapes are fully non-overlapping and every consumer would need to filter by `kind`
- **Scalar + slot props, no PropBinding** — `InstanceExample.propConfigurations` accepts scalar values for scalar props and `SlotContentRef` for slot props. `PropBinding` belongs in `Element.propConfigurations` (ADR-049), not here
- **Slot props need fills, not scalars** — a slot prop cannot be meaningfully configured with a `string` or `boolean`; restricting `InstanceExample.propConfigurations` to scalars-only would leave any component with slot props incompletely documented
- **Separation from slot content examples** — `slotContentExamples` (ADR-047) holds anonymous fills for named slots; `instanceExamples` holds whole-component prop configurations. Different purposes, different audiences, different reference patterns — flat siblings on `Component` make the split explicit
- **Additive-only** — new optional field `Component.instanceExamples`; no existing type changed → MINOR
- **Type ↔ schema symmetry** — Constitution §I
- **No runtime logic** — Constitution §II

---

## Options Considered

### Option A: `InstanceExample` with scalar + `SlotContentRef` propConfigurations *(Selected)*

`InstanceExample { title?, propConfigurations? }` where `propConfigurations` accepts `string | number | boolean | SlotContentRef`. Named record `InstanceExamples` on `Component`.

```yaml
# ActionListItem — instance examples with scalar and slot props
components:
  actionListItem:
    props:
      state:       { type: string }
      title:       { type: string }
      description: { type: string }
      startVisual: { type: slot }

    slotContentExamples:
      searchIcon:
        anatomy:
          icon: { type: glyph }
        elements:
          icon: { content: search }
        layout: [icon]

    instanceExamples:
      default:
        title: Action List Item – default
        propConfigurations:
          state: default
          title: Browse all issues
          description: 12 open · 3 closed

      withSearchIcon:
        title: Action List Item – with search icon
        propConfigurations:
          state: default
          title: Browse all issues
          startVisual:
            $slotContent: "#/components/actionListItem/slotContentExamples/searchIcon"

      danger:
        title: Action List Item – danger
        propConfigurations:
          state: danger
          title: Delete branch
          description: This action cannot be undone
```

**Pros**:
- Named keys enable reference-by-string from any future cross-example mechanism
- Scalar props and slot props are expressed in one `propConfigurations` map — authors don't manage two separate fields
- `SlotContentRef` reuses the vocabulary and resolution rules from ADR-046 with no new syntax
- No discriminator field — minimum surface; no other shape competes for the `instanceExamples` record
- `InstanceExample` remains simple and human-readable

**Cons / Trade-offs**:
- `propConfigurations` accepts a union of three scalar types plus `SlotContentRef`; schema must discriminate by presence of `$slotContent` key

---

### Option B: Single `Component.examples` record with `kind` discriminator *(Rejected)*

Introduce a unified `ComponentExample = SlotExample | InstanceExample` discriminated by `kind: 'slot' | 'instance'`. Both example types live in one `Component.examples` record.

```yaml
# ActionListItem — unified examples record (not selected)
components:
  actionListItem:
    props:
      state:       { type: string }
      title:       { type: string }
      description: { type: string }
      startVisual: { type: slot }

    examples:
      searchIcon:
        kind: slot
        anatomy:
          icon: { type: glyph }
        elements:
          icon: { content: search }
        layout: [icon]

      default:
        kind: instance
        title: Action List Item – default
        propConfigurations:
          state: default
          title: Browse all issues
          description: 12 open · 3 closed

      withSearchIcon:
        kind: instance
        title: Action List Item – with search icon
        propConfigurations:
          state: default
          title: Browse all issues
          startVisual:
            $slotContent: "#/components/actionListItem/examples/searchIcon"
```

**Rejected because**:
- Every consumer that needs only slot fills (Figma default-fill tooling, slot-rendering) must filter the entire record by `kind: 'slot'`; every consumer that needs only instance examples (docs renderers, cataloguing tooling) must filter by `kind: 'instance'`. The `kind` field is schema bookkeeping with no authoring value — it signals that the two shapes don't belong in the same collection.
- JSON Pointer paths into a unified record are ambiguous by shape: `#/components/actionListItem/examples/searchIcon` alone does not reveal whether the target is a slot fill or an instance example. Both `SlotBinding.examples[i].$slotContent` and `Element.propConfigurations.<slot>.$slotContent` resolve pointer strings into slot-content space; a unified record forces every resolver to dereference and inspect `kind` before knowing what it has. Separate fields (`slotContentExamples`, `instanceExamples`) make pointer semantics self-describing.
- The two shapes are fully non-overlapping: slot content carries `anatomy`, `elements`, and `layout`; instance examples carry `propConfigurations` and `title`. A `ComponentExample` union type with both shapes' fields as optionals (or a `oneOf` in schema) is harder to read, harder to author, and harder to validate than two narrow types.
- ADR-047 Option B explored the narrower form of this idea — bundling slot examples into the existing `instanceExamples` field — and was rejected on the same grounds. A top-level unified field does not resolve those objections.

---

### Option C: Scalar-only `propConfigurations` *(Rejected)*

Restrict `InstanceExample.propConfigurations` to `string | number | boolean`. Slot props are left unconfigured in instance examples.

**Rejected because**: Slot props cannot be meaningfully set to a scalar value. A component with slot props documented only by scalar examples is always incomplete — the slot dimension of its canonical usages is invisible to tooling and readers. ADR-046's `SlotContentRef` exists precisely to fill this gap.

---

### Option D: Flat scalar map *(Rejected)*

Store examples as `Record<string, Record<string, string | number | boolean>>` — a named map of prop value maps with no wrapping object.

**Rejected because**: There is no place for per-example metadata. `title` (and anticipated future fields like `description`, `tags`, `deprecated`) would have to be smuggled into the prop-name space with reserved-key conventions, colliding with real prop names and adding parser complexity. The `InstanceExample` wrapper gives metadata a clean home.

---

### Option E: Extend `Variant` for examples *(Rejected)*

Reuse the existing `Variant` type — a `Variant` already has `configuration?`, `elements?`, `layout?`.

**Rejected because**: `Variant` represents a display state driven by prop combination. `InstanceExample` is a documented usage configuration with human intent. Merging them forces `Variant` to carry optional fields that apply to only one of its two roles.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| New: `InstanceExample.ts` | Add `InstanceExample`, `InstanceExamples` | MINOR |
| `Component.ts` | Add optional `instanceExamples?: InstanceExamples` | MINOR |
| `index.ts` | Export `InstanceExample`, `InstanceExamples` | MINOR |

**New types** (`types/InstanceExample.ts`):

```ts
import type { SlotContentRef } from './SlotContentRef.js';

/**
 * A pre-configured usage of the whole component.
 * Scalar props are set directly; slot props are filled via SlotContentRef.
 * PropBinding is not accepted — this is a documented configuration, not a live binding.
 */
export interface InstanceExample {
  title?: string;
  propConfigurations?: Record<string, string | number | boolean | SlotContentRef>;
}

export type InstanceExamples = Record<string, InstanceExample>;
```

**`Component` extension** (`types/Component.ts`):

```yaml
# Before (after ADR-047)
Component:
  title: string
  anatomy: Anatomy
  props?: Props
  subcomponents?: Subcomponents
  default: Variant
  variants?: Variants
  invalidVariantCombinations?: PropConfigurations[]
  metadata?: Metadata
  slotContentExamples?: Record<string, SlotContent>   # ADR-047

# After
Component:
  ...                                                  # all fields above unchanged
  instanceExamples?: InstanceExamples                 # new
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `#/definitions/InstanceExample`, `#/definitions/InstanceExamples` | MINOR |
| `component.schema.json` | Add `instanceExamples` property to `#/definitions/Component` | MINOR |

**`#/definitions/InstanceExample`**:

```yaml
InstanceExample:
  type: object
  description: "A pre-configured usage of the whole component. Scalar props are set directly; slot props are filled via SlotContentRef. PropBinding is not accepted."
  properties:
    title:
      type: string
    propConfigurations:
      type: object
      description: "Prop values for this example. Scalar types for scalar props; SlotContentRef for slot props."
      additionalProperties:
        oneOf:
          - type: string
          - type: number
          - type: boolean
          - $ref: "#/definitions/SlotContentRef"
  additionalProperties: false
```

**`#/definitions/InstanceExamples`**:

```yaml
InstanceExamples:
  type: object
  description: "Named instance examples for this component."
  patternProperties:
    "^[a-zA-Z0-9_-]+$":
      $ref: "#/definitions/InstanceExample"
  additionalProperties: false
```

**`instanceExamples`** in `#/definitions/Component/properties`:

```yaml
instanceExamples:
  $ref: "#/definitions/InstanceExamples"
```

### Out of scope for this ADR

- **`Component.slotContentExamples`** and `SlotBinding` — see ADR-047
- **`Element.propConfigurations` PropBinding widening** — see ADR-049
- **Nested slot fills within an instance example** — when a `SlotContentRef` in `propConfigurations` points at a `Composition` that itself has slot fills, those fills are expressed inside that `Composition`'s `slotContent` (ADR-046); they are not expressed on `InstanceExample` itself

### Notes

- **Record key vs `title`.** The record key (e.g. `withSearchIcon`) is the machine identifier — slugified from `InstanceNode.name`, valid as a JSON Pointer segment, used for references and tooling lookups. `title` (e.g. `"ActionListItem / With Search Icon"`) is the original human-readable label preserved verbatim for display — docs renderers, plugin UI, cataloguing tooling. Both derive from `InstanceNode.name` in Figma but serve different consumers: the key for machines, the title for humans. They diverge when the original name contains characters not valid in identifiers.
- **`propConfigurations` is documented configuration, not live binding.** `PropBinding` (`{ $binding: string }`) is not accepted in `InstanceExample.propConfigurations`. Live data bindings belong in `Element.propConfigurations` (ADR-049). An `InstanceExample` is for human readers and documentation tooling, not for expressing runtime prop flow.
- **Schema discrimination for `SlotContentRef`.** The `$slotContent` key on `SlotContentRef` objects discriminates them from scalar values in `additionalProperties`. No additional `kind` field or wrapper is needed.
- **`InstanceExamples` uses `patternProperties`** rather than `additionalProperties` on an object schema to satisfy JSON Schema Draft 7's handling of `$ref` alongside `additionalProperties: false`.
- **Slot-agnostic fills.** A `SlotContentRef` in `propConfigurations` is slot-agnostic in the same sense as `slotContentExamples` entries — the same `SlotContent` can be referenced from `startVisual` in one example and from `endVisual` in another.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `InstanceExample { title?, propConfigurations?: Record<string, string | number | boolean | SlotContentRef> }` ↔ `#/definitions/InstanceExample`
  - `InstanceExamples = Record<string, InstanceExample>` ↔ `#/definitions/InstanceExamples` (`patternProperties`)
  - `Component.instanceExamples?: InstanceExamples` ↔ `#/definitions/Component/properties/instanceExamples`

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Must detect and emit `Component.instanceExamples` with `InstanceExample` entries from example frames; must emit `SlotContentRef` values for slot props | Read new types; implement instance example detection including slot prop fills |
| `specs-cli` | Recompile; output includes `instanceExamples` when present | Recompile; no breaking change |
| `specs-plugin-2` | Recompile; example rendering is a follow-on capability | Recompile; pass through data initially |

---

## Semver Decision

**Version bump**: `0.20.0 → 0.21.0` (`MINOR`)

**Justification**: New optional field `Component.instanceExamples`; new types `InstanceExample` and `InstanceExamples`. All additive — no existing type is removed or narrowed → MINOR per Constitution §III.

---

## Consequences

- `Component.instanceExamples` and `Component.slotContentExamples` (ADR-047) are siblings: each holds one type with one purpose. `instanceExamples` documents whole-component prop-configured usages; `slotContentExamples` holds named slot fill examples.
- `InstanceExample.propConfigurations` accepts scalar values for scalar props and `SlotContentRef` for slot props — a component with slot props can be fully documented in a single example entry without a separate slot-fill field.
- `PropBinding` is not accepted in `InstanceExample.propConfigurations` — examples are documented configurations, not live bindings. Live bindings belong in `Element.propConfigurations` (ADR-049).
- All example keys are plain strings — discoverable, referenceable, no inline nesting.
