---
title: "Component Variants"
description: "The variants.yaml file contract for a component — ComponentVariantsDocument"
---

A run with [`spec.splitConcerns`](/schema/settings/) writes `variants.yaml` as its own file. `ComponentVariantsDocument` is that file's type: it requires what the `variants` concern carries and permits nothing else — no `anatomy`, no `props`.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `metadata` | [`Metadata`](/schema/metadata/) | Yes | Must set `metadata.concern` to `variants` |
| `default` | [`Variant`](/schema/variants/#variant) | Yes | Default variant — the baseline appearance |
| `variants` | [`Variant[]`](/schema/variants/) | No | Layered variant overrides |
| `subcomponents` | `ComponentVariantsSubcomponent` map | No | Embedded child component definitions, sliced to this concern — see [Component](/schema/component/#concern-documents) |

## See Also

- [Component](/schema/component/#concern-documents) — the full `Component` shape and how it splits across concerns
- [Variants](/schema/variants/) — the `Variant` layering model this file's `default` and `variants` use
- [Component API](/schema/documents/component-api/) and [Component Examples](/schema/documents/component-examples/) — the other two files
- [Composition Variants](/schema/documents/composition-variants/) — the equivalent `variants.yaml` contract for a composition, which has no layering to hold
