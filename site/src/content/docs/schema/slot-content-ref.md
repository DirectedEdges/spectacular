---
title: "Slot Content Reference"
description: "A $slotContent JSON Pointer to a SlotContent or Composition entry"
---

A `SlotContentRef` names the act of filling a slot. It is a single-key object whose `$slotContent` value is a JSON Pointer to the fill, so the same content can be authored once and referenced from many places.

```ts
interface SlotContentRef {
  $slotContent: string;
}
```

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `$slotContent` | `string` | Yes | JSON Pointer to the fill's structural triplet |

## Resolution

The pointer resolves to one of three targets — all yielding an `anatomy + elements + layout` triplet:

| Target | Example pointer | Resolves to |
|--------|-----------------|-------------|
| [`Component.slotContentExamples`](/schema/slot-content/) entry | `#/components/pill/slotContentExamples/composedLabel` | that [`SlotContent`](/schema/slot-content/) |
| [`Composition`](/schema/composition/) entry | `#/compositions/pageGrid` | the composition's top-level triplet |
| [`Composition.slotContent`](/schema/composition/) entry | `#/compositions/filterResultsPage/slotContent/pageHeader` | that [`SlotContent`](/schema/slot-content/) |

The `$slotContent` key discriminates the reference — it names the *act of filling a slot*, not the target type.

## Where it appears

- **[`SlotBinding.examples`](/schema/children/)** — Figma's authoring default for a slot layer.
- **`Element.propConfigurations`** slot-prop entries — see [Prop Configurations](/schema/prop-configurations/).
- **[`InstanceExample.propConfigurations`](/schema/instance-examples/)** — the slot-prop value in a documented whole-component usage.

## Further Reading

- [ADR 046 — Slots and Slot References](https://github.com/DirectedEdges/specs/blob/main/adr/046-slots-and-slot-references.md)
- [ADR 049 — Prop Configurations Bindings](https://github.com/DirectedEdges/specs/blob/main/adr/049-prop-configurations-bindings.md)
