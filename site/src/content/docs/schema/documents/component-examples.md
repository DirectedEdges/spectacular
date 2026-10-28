---
title: "Component Examples"
description: "The examples.yaml file contract for a component — ComponentExamplesDocument"
---

A run with [`spec.splitConcerns`](/schema/settings/) writes `examples.yaml` as its own file. `ComponentExamplesDocument` is that file's type: it requires only `metadata` — everything else in this file is optional, ready-made content rather than the structural contract `api.yaml` and `variants.yaml` carry.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `metadata` | [`Metadata`](/schema/metadata/) | Yes | Must set `metadata.concern` to `examples` |
| `slotContentExamples` | `Record<string, `[`SlotContent`](/schema/slot-content/)`>` | No | **Pro.** Named slot-content fills, referenced by [`SlotContentRef`](/schema/slot-content-ref/) |
| `instanceExamples` | [`InstanceExamples`](/schema/instance-examples/) | No | **Pro.** Documented whole-component usage examples |
| `images` | `Record<string, ImageData>` | No | Registry of image data referenced by `backgroundImage` and image props |
| `subcomponents` | `ComponentExamplesSubcomponent` map | No | Embedded child component definitions, sliced to this concern — see [Component](/schema/component/#concern-documents) |

## See Also

- [Component](/schema/component/#concern-documents) — the full `Component` shape and how it splits across concerns
- [Instance Examples](/schema/instance-examples/) and [Slot Content](/schema/slot-content/) — the two content types this file holds
- [Component API](/schema/documents/component-api/) and [Component Variants](/schema/documents/component-variants/) — the other two files
- [Composition Examples](/schema/documents/composition-examples/) — the equivalent `examples.yaml` contract for a composition
