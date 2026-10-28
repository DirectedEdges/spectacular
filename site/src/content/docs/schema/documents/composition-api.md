---
title: "Composition API"
description: "The api.yaml file contract for a composition — CompositionApiDocument"
---

A run with [`spec.splitConcerns`](/schema/settings/) writes `api.yaml` as its own file. `CompositionApiDocument` is that file's type: it requires what the `api` concern carries and permits nothing else — no `elements`, no `layout`, no `slotContent`.

A composition has no `props`, so this document carries no `invalidPropCombinations` and no `subcomponents` either — both are api-concern fields on [`ComponentApiDocument`](/schema/documents/component-api/) that a composition has nothing to hold.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `metadata` | [`Metadata`](/schema/metadata/) | Yes | Must set `metadata.concern` to `api` |
| `title` | `string` | No | Human-readable label for the composition |
| `description` | `string` | No | Purpose and usage notes for documentation tooling |
| `anatomy` | [`Anatomy`](/schema/anatomy/) | Yes | Map of named elements that make up the composition |

## See Also

- [Composition](/schema/composition/#concern-documents) — the full `Composition` shape and how it splits across concerns
- [Composition Variants](/schema/documents/composition-variants/) and [Composition Examples](/schema/documents/composition-examples/) — the other two files
- [Component API](/schema/documents/component-api/) — the equivalent `api.yaml` contract for a component
