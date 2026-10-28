---
title: "Component API"
description: "The api.yaml file contract for a component — ComponentApiDocument"
---

A run with [`spec.splitConcerns`](/schema/settings/) writes `api.yaml` as its own file rather than folding it into a single component document. `ComponentApiDocument` is that file's type: it requires what the `api` concern carries and permits nothing else — no `default` block, no `layout`, no `styles`.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `metadata` | [`Metadata`](/schema/metadata/) | Yes | Must set `metadata.concern` to `api` |
| `title` | `string` | Yes | Component name |
| `anatomy` | [`Anatomy`](/schema/anatomy/) | Yes | Map of named elements that make up the component |
| `props` | [`Props`](/schema/props/) | Yes | Configurable input properties |
| `invalidPropCombinations` | [`PropConfigurations[]`](/schema/prop-configurations/) | No | Prop combinations that are not valid together |
| `subcomponents` | `ComponentApiSubcomponent` map | No | Embedded child component definitions, sliced to this concern — see [Component](/schema/component/#concern-documents) |

## See Also

- [Component](/schema/component/#concern-documents) — the full `Component` shape and how it splits across concerns
- [Component Variants](/schema/documents/component-variants/) and [Component Examples](/schema/documents/component-examples/) — the other two files
- [Composition API](/schema/documents/composition-api/) — the equivalent `api.yaml` contract for a composition
