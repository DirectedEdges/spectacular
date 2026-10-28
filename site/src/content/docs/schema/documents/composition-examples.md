---
title: "Composition Examples"
description: "The examples.yaml file contract for a composition — CompositionExamplesDocument"
---

A run with [`spec.splitConcerns`](/schema/settings/) writes `examples.yaml` as its own file, and only when the composition has any named slot fills bundled alongside its primary content. `CompositionExamplesDocument` is that file's type: it requires only `metadata` — `slotContent` is optional, since not every composition has one.

A composition has no `instanceExamples` and no `images` registry of its own — those are api/examples-concern fields on [`ComponentExamplesDocument`](/schema/documents/component-examples/) that a composition has nothing to hold.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `metadata` | [`Metadata`](/schema/metadata/) | Yes | Must set `metadata.concern` to `examples` |
| `slotContent` | `Record<string, `[`SlotContent`](/schema/slot-content/)`>` | No | Named slot fills bundled alongside this composition's primary content |

## See Also

- [Composition](/schema/composition/#concern-documents) — the full `Composition` shape and how it splits across concerns
- [Slot Content](/schema/slot-content/) — the content type this file holds
- [Composition API](/schema/documents/composition-api/) and [Composition Variants](/schema/documents/composition-variants/) — the other two files
- [Component Examples](/schema/documents/component-examples/) — the equivalent `examples.yaml` contract for a component
