---
title: "Children"
description: "An element's children — a name list or a slot binding"
---

The `children` data output of an element is either a plain array of child element names or — when the element is bound to a slot prop — a `SlotBinding`.

```ts
type Children = string[] | SlotBinding;

interface SlotBinding extends PropBinding {
  examples?: SlotContentRef[];
}
```

Because `SlotBinding extends` [`PropBinding`](/schema/prop-binding/), existing `{ $binding }` values still validate — the slot variant simply adds an optional `examples` array.

## `string[]`

The ordinary case: an ordered list of the element's child element names.

```yaml
children:
  - icon
  - label
```

Nothing ties membership of that list to being the *same* component's anatomy. An entry may name an element whose [`instanceOf`](/schema/elements/) is a different component, placed as an ordinary child — which is how an instance is composed through a [default slot](/schema/props/slot/):

```yaml
anatomy:
  pageRow: { type: instance, instanceOf: dsPageRow }
  section: { type: instance, instanceOf: dsSection }
  card: { type: instance, instanceOf: dsCard }
elements:
  pageRow:
    children: [section]
  section:
    children: [card]
```

`pageRow` and `section` each expose a slot prop marked `defaultSlot: true`, so the nesting *is* the fill: no `$binding`, no `SlotContentRef`, no registry entry between the levels. A hierarchy several layout components deep reads as one tree rather than a chain of one-level-deep references.

This needs no separate type. `Elements` is a flat record and `children` is an ordered list of keys into it, so an element can carry `instanceOf` and be a plain member of its parent's `children` at the same time — the distinction the shape already draws.

## `SlotBinding`

When an element's children are driven by a slot prop, `children` is a [`PropBinding`](/schema/prop-binding/) (a `$binding` JSON Pointer to the slot prop) optionally carrying authored example fills.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `$binding` | `string` | Yes | JSON Pointer to the slot prop (e.g. `#/props/children`) |
| `examples` | [`SlotContentRef[]`](/schema/slot-content-ref/) | No | Authored example fills for the slot |

Each `examples[i]` is a [`SlotContentRef`](/schema/slot-content-ref/) pointing into a [`slotContentExamples`](/schema/slot-content/) registry or a [`Composition`](/schema/composition/). Emitters currently write at most one entry — `examples[0]` is Figma's authoring default for the slot layer — but the array shape leaves room for more.

```yaml
children:
  $binding: "#/props/children"
  examples:
    - $slotContent: "#/components/dsAlert/slotContentExamples/dsAlert__children__default"
```

`examples` is **non-contractual reference material** — parallel to `StringProp.examples` and `NumberProp.examples`. Code consumers handle missing slots through component logic and need not honor it.

A `SlotBinding` remains required for every slot that is **not** the designated default one: a component exposing more than one slot needs a binding to say which slot a fill belongs to, and nesting cannot carry that. The two shapes appear side by side in one spec — a card whose `children` nest as a tree still binds its `header`.

## Further Reading

- [ADR 046 — Slots and Slot References](https://github.com/DirectedEdges/specs/blob/main/adr/046-slots-and-slot-references.md)
- [defaultSlotContent (config)](/settings/default-slot-content/) — emit captured default fills into `examples`
- [slots.default (config)](/settings/default-slot/) — name the library's default slot, enabling the nested shape above
