---
title: "Instance Examples"
description: "Pre-configured whole-component usages for documentation"
---

An `InstanceExample` is a pre-configured usage of a *whole* component — a documented configuration for human readers and tooling, not a live data flow. Scalar props are set directly; slot props are filled with a [`SlotContentRef`](/schema/slot-content-ref/). They live on [`Component.instanceExamples`](/schema/component/) and are emitted only with a Pro license.

```ts
type InstanceExample = {
  title?: string;
  propConfigurations?: Record<string, string | number | boolean | null | SlotContentRef | ObjectPropValue>;
};

type InstanceExamples = Record<string, InstanceExample>;
```

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | `string` | No | Human-readable label for this example |
| `propConfigurations` | `Record<string, string \| number \| boolean \| null \| `[`SlotContentRef`](/schema/slot-content-ref/)` \| ObjectPropValue>` | No | Prop values — scalars for scalar props, a `SlotContentRef` for slot props, a member-keyed [`ObjectPropValue`](/schema/prop-configurations/) for object props (since 0.39.0), `null` for a prop this example leaves unset |

A [`PropBinding`](/schema/prop-binding/) is **not** permitted in `propConfigurations` — an instance example is a static configuration, not a binding.

`null` under a prop key means the example leaves that prop unset (since 0.31.0). An example that shows no header says so with the header prop itself, rather than with a separate flag beside it:

```yaml
instanceExamples:
  cardWithHeader:
    title: Card with a header
    propConfigurations:
      header:
        $slotContent: "#/components/card/slotContentExamples/cardHeader"
  cardWithoutHeader:
    title: Card without a header
    propConfigurations:
      header: null
```

Slot fills encountered inside an example instance are contributed to the shared [`slotContentExamples`](/schema/slot-content/) registry (de-duplicated against existing entries), so an `InstanceExample` holds no slot content of its own — only a `SlotContentRef` into that registry.

### The example's own slots, and everything below them

That last point is why a [default slot](/schema/props/#slotprop) behaves differently here than anywhere else, and the asymmetry is worth stating because it cannot be inferred.

An `InstanceExample` carries `propConfigurations` and nothing else — no anatomy, no elements, no layout. So **the example's own default slot still resolves to a `SlotContentRef`**: there is nowhere in this shape to nest a child, and a reference is the only thing a `propConfigurations` value can be.

Below that first hop the ordinary rule applies. Inside the registry entry the reference points at, a nested instance filling *its* default slot nests as a plain child of that entry, rather than contributing an entry of its own. One reference gets you into the example's content; from there it is a tree.

```yaml
instanceExamples:
  cardInAList:
    propConfigurations:
      # the example's own default slot — a reference, because there is nowhere to nest
      children:
        $slotContent: "#/components/card/slotContentExamples/cardInAList__children"

slotContentExamples:
  cardInAList__children:
    anatomy:
      row: { type: instance, instanceOf: dsRow }
      label: { type: text }
    layout:
      # `row`'s default slot is filled by nesting, inside this one entry
      - row:
          - label
```

## Registry shape

`InstanceExamples` (`Record<string, InstanceExample>`) is the shape of `Component.instanceExamples`. Keys are plain identifier strings matching `^[a-zA-Z0-9_-]+$`.

## Detection

How example instances are harvested from a Figma file is controlled by [`conventions.platforms.figma.instanceExamples`](/schema/conventions/#instanceexamples).

## Further Reading

- [Component Examples as Data](https://nathanacurtis.substack.com/p/component-examples-as-data) — the thinking behind examples in the spec
- [ADR 048 — Component Instance Examples](https://github.com/DirectedEdges/specs/blob/main/adr/048-component-instance-examples.md)
- [Instance Examples (config)](/settings/instance-examples/) — detection setup
- [Instance Examples (guide)](/guides/instance-examples/)
