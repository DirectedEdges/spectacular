# ADR: Component Slot Examples

**Branch**: `047-component-slot-examples`
**Created**: 2026-04-29
**Status**: ACCEPTED
**Summary**: A `slotContentExamples` registry and `SlotBinding` carry example slot fills, referenced rather than duplicated across variants.
**Decides**: styles.visible
**Deciders**: Nathan Curtis (author)
**Depends on**: [ADR-042 — Composition Structural Type](042-composition-type), [ADR-046 — Slots and Slot References](046-slots-and-slot-references)
**Extended by**: ADR-048 (Component Instance Examples), ADR-049 (Prop Configurations and Bindings)

---

## Context

ADR-042 established `Composition` as the named structural unit. ADR-046 established `SlotContent` as the anonymous structural triplet, `slotContent` on `Composition` for bundled fills, and `SlotContentRef` as the universal `$slotContent` pointer.

This ADR addresses the component side of slot content: two authoring needs arise from Figma's slot model.

1. **Where do named slot fill examples live on `Component`?** A component designer authors named, reusable fills for a component's slot props — for example, an icon that fills `ActionListItem`'s `startVisual` slot by default. These fills are examples and test cases; they carry no implementation obligation for code consumers. They need a named home on `Component`, sibling to whatever field holds instance examples (ADR-048).

2. **How does Figma's default slot fill get expressed in the spec?** A slot-bound container in `default.elements` or `variants[n].elements` binds `children` to a slot prop via `PropBinding`. In the Figma file, that slot layer has content placed inside it — the design-tool default. That default is Figma authoring provenance: code components resolve missing slots through logic, not data, so code consumers must be able to correctly ignore it. The reference must be colocated with the slot binding it documents and carried under a field whose name marks it as non-contractual sample content.

The existing `Element.children` type (`string[] | PropBinding` — plain-frame children vs. slot-bound binding) is extended here; no new element type is introduced.

---

## Decision Drivers

- **Examples, not contracts** — `slotContentExamples` entries carry no implementation obligation for code consumers; they are authored examples and test cases, parallel in intent to `instanceExamples` (ADR-048). The `-Examples` suffix signals this correctly.
- **Slot-agnostic entries** — the same fill (e.g., a glyph icon) may fill `startVisual` or `endVisual`; binding content to a specific slot at the entry site forces duplication. Binding happens at the reference site.
- **Separation from instance examples** — `InstanceExample` documents a whole-component usage configured via scalar props; slot content documents fill for a named slot. Different purposes, different audiences, different reference patterns. A flat sibling field on `Component` makes the split explicit.
- **Figma default is design-tool provenance** — Figma stores what's placed inside a slot layer as part of the design file. Code consumers have no "default slot data" concept; defaults in code are logic. The reference must live under a field that code consumers correctly treat as non-contractual — the `examples` convention (already used on `StringProp.examples`, `NumberProp.examples`, and at the component level on `slotContentExamples`/`instanceExamples`) is that mechanism.
- **Reuse the `examples` convention** — `StringProp.examples: string[]` and `NumberProp.examples: number[]` already hold authored sample values for typed props, and `StringProp.default` is deprecated in favor of `examples`. `SlotBinding.examples: SlotContentRef[]` is the structural-fill analogue: one consistent name for "authored, non-contractual sample content" across `Props`, `SlotBinding`, and `Component`.
- **Default colocated with binding** — the slot binding and its Figma default describe the same object; they live on the same `SlotBinding`, not separated across fields.
- **`PropBinding` stays narrow** — `PropBinding` is used by `content`, `instanceOf`, and `visible` as well as `children`. Slot example fills are meaningful only for slot-bound `children`; `examples` lives on a `children`-specific subtype (`SlotBinding`), not on `PropBinding` itself.
- **Variant-sensitive defaults for free** — `Element.children` lives in `default.elements` and `variants[n].elements`; per-variant Figma defaults fall out without any new mechanism.
- **Additive-only** — all new fields are optional; no existing type narrows → MINOR
- **Type ↔ schema symmetry** — Constitution §I
- **No runtime logic** — Constitution §II

---

## Options Considered

### Option A: `Component.slotContentExamples: Record<string, SlotContent>` + `SlotBinding.examples: SlotContentRef[]` *(Selected)*

A new top-level field `Component.slotContentExamples` holds named `SlotContent` entries — sibling to `Component.instanceExamples` (ADR-048). `SlotContent` is defined in ADR-046.

A new interface `SlotBinding` extends `PropBinding` with an optional `examples` field: an array of `SlotContentRef` (ADR-046's universal `{ $slotContent: <pointer> }` discriminated reference). `Children` widens from `string[] | PropBinding` to `string[] | SlotBinding`. For now, `examples` always carries a single entry at index 0 — Figma's default fill for the slot layer — but the array shape leaves room for additional authored example fills in the future without further schema change.

This generalizes the existing `examples` convention already established for typed props in `Props.ts`: `StringProp.examples: string[]` and `NumberProp.examples: number[]` hold sample values demonstrating typical content for the prop, and `StringProp.default` is already deprecated (`@deprecated Use examples for demo content`) in favor of `examples`. The same convention here scales from scalar prop values to structural slot fills: `SlotBinding.examples: SlotContentRef[]` is the slot-binding analogue.

```yaml
# ActionListItem — slotContentExamples and SlotBinding together
components:
  actionListItem:
    props:
      startVisual: { type: slot }

    slotContentExamples:
      searchIcon:
        anatomy:
          icon: { type: glyph }
        elements:
          icon:
            content: search
            styles: { width: 16, height: 16 }
        layout: [icon]

    default:
      elements:
        startVisualSlot:
          children:
            $binding: "#/components/actionListItem/props/startVisual"
            examples:
              - $slotContent: "#/components/actionListItem/slotContentExamples/searchIcon"
```

Each `examples[i]` resolves using the same rules as any `SlotContentRef` (ADR-046): the `$slotContent` value is a JSON Pointer to a `SlotContent` in `slotContentExamples` or to a `Composition` in an external compositions file.

#### Naming `slotContentExamples`

- **`slotContentExamples`** *(Selected)* — mirrors `instanceExamples` in suffix and semantics. Entries are examples and test cases; code consumers are not obligated by them. Figma references them as authoring defaults, but the binding lives on `SlotBinding` — the entries themselves are examples Figma happens to reference. "Content" qualifies the kind of example (slot fill, not whole-component usage).
- **`slotContent`** — drops the `-Examples` suffix, implying a stronger contract than these entries carry.
- **`slotExamples`** — reads as "examples of slots" rather than "examples of content for slots."
- **`slotCompositions`** — accurate to the structural shape but not everyday authoring vocabulary.
- **`slots`** — collides with `SlotProp` usage on `Component.props`.
- **`fills`** / **`slotFills`** — jargony; no precedent in target platform vocabularies.

#### Naming `examples`

- **`examples`** — mirrors the existing `-Examples` convention already established by `slotContentExamples` and `instanceExamples` (ADR-048): a field that holds authored, non-contractual reference material. Code consumers that understand the `examples` convention skip it the same way they skip `slotContentExamples` and `instanceExamples` at the component level.
- **`exampleContent`** / **`exampleFills`** — more descriptive but introduce a one-off term where `examples` already carries the right meaning in context.
- **`$extensions['com.figma'].default`** — see Option B; trades the consistent `examples` convention for explicit design-tool-provenance framing.

**Pros**:
- Reuses the existing `examples` convention already in use on `StringProp` and `NumberProp` (where `default` is deprecated in its favor) — single mental model for "authored, non-contractual sample content" across `Props` (scalar `examples`), `SlotBinding` (structural `examples`), and `Component` (`slotContentExamples`, `instanceExamples`).
- Uses the universal `SlotContentRef` (`$slotContent`) from ADR-046 — same reference shape that `propConfigurations.<slotName>` (ADR-049) uses; one resolver covers all slot-content reference sites.
- Array shape is future-proof — additional authored example fills can be added without widening the schema again (current emitter writes only index 0).
- No DTCG `$extensions` namespacing required for what is, conceptually, an example rather than platform metadata.
- `SlotBinding extends PropBinding` — existing `children: { $binding }` values still validate; `examples` is optional. Per-variant Figma defaults still fall out for free.

**Cons / Trade-offs**:
- Loses the explicit "design-tool provenance" signal that `$extensions['com.figma']` carries. `examples` is a neutral name; the fact that Figma populates index 0 with the slot layer's authored content is a producer convention, not a schema-level guarantee.
- Two sibling fields on `Component` (`slotContentExamples`, `instanceExamples`) — unchanged from Option B.
- Schema cannot enforce that `$slotContent` pointers in `examples` resolve — consumer validation concern (same as Option B).
- Array-with-always-one-item carries minor structural overhead today for capacity that only matters later.

---

### Option B: `Component.slotContentExamples: Record<string, SlotContent>` + `SlotBinding.$extensions['com.figma'].default` *(Rejected)*

Same `Component.slotContentExamples` shape, but `SlotBinding` carries the Figma authoring default at `$extensions['com.figma'].default` (a plain JSON Pointer string) instead of in an `examples` array.

**Rejected because**: the `examples` convention is already established in the schema — `StringProp.examples: string[]` and `NumberProp.examples: number[]` hold sample/demo content, and `StringProp.default` is marked `@deprecated Use examples for demo content`. Reusing `examples` at the slot-binding site keeps "authored, non-contractual sample content" under one consistent name across `Props`, `SlotBinding`, and `Component`. The `$extensions['com.figma']` framing carried stronger design-tool-provenance signaling, but at the cost of introducing DTCG namespacing machinery for what the schema already has a convention for.

---

### Option C: `SlotExample` type; entries bundled in `Component.instanceExamples` *(Rejected)*

Introduce `SlotExample extends SlotContent` with an added `slot: string`; widen `Component.instanceExamples` to `ComponentExample = InstanceExample | SlotExample` discriminated by a `kind` field.

**Rejected because**:
- `slot` hard-codes a content entry to one slot; the same icon used in `startVisual` and `endVisual` requires duplication.
- `SlotExample` adds no structure over `SlotContent` once `slot` is removed — it's an alias.
- The `kind` discriminator is schema bookkeeping with no authoring value. `InstanceExample` is consumed by docs/rendering tooling; slot content is consumed by slot-rendering and Figma default references. Bundling forces every consumer to filter by `kind`.

---

### Option D: Slot default on `SlotProp.default` *(Rejected)*

Store the default-content reference on `SlotProp.default`.

**Rejected because**: `SlotProp` is the public prop API surface. Default content is per-variant element data — variant-sensitive and tied to a specific element in the tree (the slot-bound container), not to the prop definition.

---

### Option E: Separate slot-content file *(Rejected)*

Store slot content in a separate file alongside the component definition.

**Rejected because**: Slot-content entries are component-specific. They belong in the component definition so that `propConfigurations.<slotName>` references and the Figma default reference can resolve via JSON Pointer paths inside the same spec file.

---

### Option F: New top-level field on `Element` *(Rejected)*

Place the Figma default-fill reference as a new sibling field on `Element` (`defaultContent`, `defaultChildren`, or similar) alongside `content` and `children`.

**Rejected because**:
- Any name collides conceptually with existing `Element` fields (`content` is text body; `children` is layout structure).
- The reference is separated from the binding it documents: `children` holds the slot binding; the new field holds the default. Two objects, one fact.
- It pollutes `Element`'s public surface with a field whose meaning depends on a sibling field's shape and whose audience is a single platform (Figma). `SlotBinding.$extensions['com.figma'].default` colocates with the binding and lives in the namespace that signals "design-tool provenance."

---

### Option G: Widen `Element.content` to accept slot-content keys *(Rejected)*

When `Element.children` is a slot binding, interpret a string in `Element.content` as a key into `slotContentExamples` instead of as literal text.

**Rejected because**: `content` is typed `string | PropBinding`. Making the same `string` mean "literal text" in one element shape and "slot-content key" in another is a conditional JSON Schema cannot express. A field's meaning must not depend on a sibling field's shape.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Component.ts` | Add optional `slotContentExamples?: Record<string, SlotContent>` | MINOR |
| `Children.ts` | Add `SlotBinding` with optional `examples?: SlotContentRef[]`; widen `Children` to `string[] \| SlotBinding` | MINOR |
| `index.ts` | Export `SlotBinding` | MINOR |

`SlotContent` and `SlotContentRef` are defined in ADR-046 (`types/SlotContent.ts`, `types/SlotContentRef.ts`) and imported here.

**`Children` widening** (`types/Children.ts`):

```ts
import type { PropBinding } from './PropBinding.js';
import type { SlotContentRef } from './SlotContentRef.js';

/**
 * A slot binding: a `PropBinding` to a slot prop, optionally carrying authored
 * example fills for the slot. Each entry in `examples` is a `SlotContentRef`
 * (ADR-046) pointing into `Component.slotContentExamples` or into a
 * `Composition`. For now, emitters write at most one entry — Figma's authoring
 * default for the slot layer at index 0 — but the array shape leaves room for
 * additional examples without further schema change. `examples` is non-
 * contractual reference material; code consumers handle missing slots through
 * component logic and need not honor it.
 */
export interface SlotBinding extends PropBinding {
  examples?: SlotContentRef[];
}

export type Children = string[] | SlotBinding;
```

**`Component` extension** (`types/Component.ts`):

```yaml
# Before (after ADR-046)
Component:
  title: string
  anatomy: Anatomy
  props?: Props
  subcomponents?: Subcomponents
  default: Variant
  variants?: Variants
  invalidVariantCombinations?: PropConfigurations[]
  metadata?: Metadata

# After
Component:
  ...                                                  # all fields above unchanged
  slotContentExamples?: Record<string, SlotContent>   # new
```

`instanceExamples` is added in ADR-048.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `slotContentExamples` to `#/definitions/Component` | MINOR |
| `component.schema.json` | Add `#/definitions/SlotBinding`; update `#/definitions/Children` | MINOR |

**`slotContentExamples`** in `#/definitions/Component/properties`:

```yaml
slotContentExamples:
  type: object
  description: "Named slot fill examples for this component. Each entry is a SlotContent (ADR-046). Referenced via SlotContentRef from SlotBinding.examples (Figma authoring defaults) and from Element.propConfigurations slot-prop entries (ADR-049)."
  patternProperties:
    "^[a-zA-Z0-9_-]+$":
      $ref: "#/definitions/SlotContent"
  additionalProperties: false
```

**New definitions** in `#/definitions`:

```yaml
SlotBinding:
  type: object
  description: "Slot binding: a PropBinding to a slot prop, optionally carrying authored example fills in `examples`. `examples[i]` is a SlotContentRef (ADR-046). Non-contractual reference material; code consumers ignore it."
  required: [$binding]
  properties:
    $binding:
      type: string
      description: "JSON Pointer to the bound slot prop."
    examples:
      type: array
      description: "Authored example fills for this slot. Emitters currently write at most one entry — Figma's authoring default at index 0."
      items:
        $ref: "#/definitions/SlotContentRef"
  additionalProperties: false

Children:
  oneOf:
    - type: array
      items: { type: string }
    - $ref: "#/definitions/SlotBinding"
```

### Out of scope for this ADR

- **`Component.instanceExamples`** and `InstanceExample` — see ADR-048
- **`PropConfigurations` widening to accept `SlotContentRef`** — see ADR-049
- **External `compositions.yaml` file schema** — follow-on ADR

### Notes

- **`slotContentExamples` entries are slot-agnostic.** The same `SlotContent` (e.g., a glyph icon) can be referenced from multiple `propConfigurations.<slotName>` sites and from multiple `SlotBinding.examples` values. Authors are not forced to duplicate identical content per slot.
- **`SlotBinding.examples` is structurally available only in the slot-binding arm of `Children`.** A container with `children: string[]` (plain frame children) cannot carry slot examples — the schema enforces this through the `Children` discriminant.
- **Per-variant Figma defaults are free.** `children` lives in `default.elements` and `variants[n].elements`; different variants may declare different example fills for the same slot-bound container without any special-case mechanism.
- **`PropBinding` is unchanged.** `SlotBinding extends PropBinding` adds `examples` only for the `children`-binding case. `PropBinding`'s other use sites (`content`, `instanceOf`, `visible`) are unaffected.
- **`examples` carries `SlotContentRef` objects, not plain strings.** This is the same discriminated reference shape used by `Element.propConfigurations` slot-prop entries (ADR-049) — one resolver covers all slot-content reference sites.
- **Emitters currently write at most one entry.** `examples[0]` is Figma's authoring default for the slot layer. The array shape is forward-compatible with additional authored examples without further schema change.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `Component.slotContentExamples?: Record<string, SlotContent>` ↔ `#/definitions/Component/properties/slotContentExamples` (`patternProperties` → `SlotContent`)
  - `SlotBinding extends PropBinding { examples?: SlotContentRef[] }` ↔ `#/definitions/SlotBinding`
  - `Children = string[] | SlotBinding` ↔ `#/definitions/Children` (`oneOf`)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Must detect and emit `slotContentExamples` from slot layers; de-duplicate entries by structural equality across variants and slots — when two fills are identical, emit one entry and reference it from both call sites; must emit `SlotBinding.examples` (a single-element `SlotContentRef` array at index 0) on slot bindings in `default.elements` / `variants[n].elements` | Read new fields; implement slot-content detection with de-duplication; update output emitters |
| `specs-cli` | Recompile; output includes `slotContentExamples` and `SlotBinding.examples` when present | Recompile; no breaking change |
| `specs-plugin-2` | Recompile; slot-content rendering is a follow-on capability | Recompile; pass through data initially |

---

## Semver Decision

**Version bump**: `0.20.0 → 0.21.0` (`MINOR`)

**Justification**: Optional `slotContentExamples` field added to `Component`; new `SlotBinding` interface (extends `PropBinding` with optional `examples?: SlotContentRef[]`); `Children` widened from `string[] | PropBinding` to `string[] | SlotBinding` where `SlotBinding` is a structural superset of `PropBinding` (existing `{ $binding }` values still validate). All additive → MINOR per Constitution §III.

---

## Consequences

- `Component.slotContentExamples` and `Component.instanceExamples` (ADR-048) are siblings: each holds one type with one purpose. `instanceExamples` documents whole-component prop-configured usages; `slotContentExamples` holds named slot fill examples.
- Slot-content entries are slot-agnostic; binding to a specific slot happens at the reference site — `propConfigurations.<slotName>` via `SlotContentRef` (ADR-049) for authored usage, `SlotBinding.examples[0]` for Figma authoring provenance.
- `SlotBinding.examples` colocates authored example fills with the slot binding inside `Element.children`. Both `SlotBinding.examples[i]` and `propConfigurations.<slotName>` use the same `SlotContentRef` shape — one resolver covers all slot-content reference sites. Per-variant Figma defaults fall out because `children` already lives on `Element`.
- The `examples` convention now spans `Props` (`StringProp.examples`, `NumberProp.examples`) and `SlotBinding` (`examples`), under one consistent name for authored sample content.
