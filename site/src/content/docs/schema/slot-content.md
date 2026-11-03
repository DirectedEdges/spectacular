---
title: "Slot Content"
description: "The anatomy + elements + layout triplet used as a named slot fill"
---

A `SlotContent` is the anonymous structural triplet — [`anatomy`](/schema/anatomy/), [`elements`](/schema/elements/), and [`layout`](/schema/layout/) — used as a named fill for a slot. It carries no metadata of its own; its identity lives at the key under which it is stored.

```ts
interface SlotContent {
  anatomy: Anatomy;
  elements: Elements;
  layout: Layout;
}
```

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `anatomy` | [`Anatomy`](/schema/anatomy/) | Yes | Element type map for this fill |
| `elements` | [`Elements`](/schema/elements/) | Yes | Element-level content, styles, and prop configurations |
| `layout` | [`Layout`](/schema/layout/) | Yes | Tree ordering of the elements |

## Where it lives

`SlotContent` entries are stored in named registries and referenced — never inlined — by a [`SlotContentRef`](/schema/slot-content-ref/) (`$slotContent` pointer):

- **`Component.slotContentExamples`** — component-scoped fills, e.g. `"#/components/pill/slotContentExamples/composedLabel"`. Emitted when [`settings.spec.defaultSlotContent`](/schema/settings/#spec) is on.
- **`Composition.slotContent`** — fills bundled alongside a [`Composition`](/schema/composition/)'s primary content, e.g. `"#/compositions/filterResultsPage/slotContent/pageHeader"`.

specs-from-figma de-duplicates entries by structural equality across variants and slots — identical fills share a single registry entry.

## When no entry exists

A registry entry is how a **non**-default slot is filled. A fill into a slot marked [`defaultSlot: true`](/schema/props/#slotprop) produces no entry at all: the filling instance is nested as a plain [child](/schema/children/) of the element it fills, in whatever anatomy, elements and layout that element already lives in.

So the registry holds what the structure cannot say on its own, and nothing more. A screen built from four nested layout components used to contribute an entry per level, each pointed at once from the level above; it now contributes none, and the entries that remain are its genuinely multi-slot fills.

The same collapse applies *inside* an entry. A non-default slot's fill is still an entry, but a default-slot chain beneath it nests within that one entry rather than spawning another per level.

## Further Reading

- [Component Examples as Data](https://nathanacurtis.substack.com/p/component-examples-as-data) — the thinking behind examples in the spec
- [ADR 046 — Slots and Slot References](https://github.com/DirectedEdges/specs/blob/main/adr/046-slots-and-slot-references.md)
- [ADR 047 — Component Slot Examples](https://github.com/DirectedEdges/specs/blob/main/adr/047-component-slot-examples.md)
