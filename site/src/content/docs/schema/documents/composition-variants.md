---
title: "Composition Variants"
description: "The variants.yaml file contract for a composition — CompositionVariantsDocument"
---

A run with [`spec.splitConcerns`](/schema/settings/) writes `variants.yaml` as its own file. `CompositionVariantsDocument` is that file's type: it requires what the `variants` concern carries and permits nothing else — no `title`, no `description`, no `anatomy`.

A composition does not vary by prop configuration the way a component does — it has no props — so there is no `default`/`variants` layering here. `elements` and `layout` are the whole of its one, unvarying appearance.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `metadata` | [`Metadata`](/schema/metadata/) | Yes | Must set `metadata.concern` to `variants` |
| `elements` | [`Elements`](/schema/elements/) | Yes | Per-element content, styles, and children |
| `layout` | [`Layout`](/schema/layout/) | Yes | The composition's layout tree |

## See Also

- [Composition](/schema/composition/#concern-documents) — the full `Composition` shape and how it splits across concerns
- [Composition API](/schema/documents/composition-api/) and [Composition Examples](/schema/documents/composition-examples/) — the other two files
- [Component Variants](/schema/documents/component-variants/) — the equivalent `variants.yaml` contract for a component, which layers a `default` with overrides this document has no use for
