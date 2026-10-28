---
title: "Component"
description: "Top-level shape of a component spec"
---

The `Component` type is the root object of every spec. It contains the component's structure, properties, default appearance, and variant overrides.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | `string` | Yes | Component name |
| `anatomy` | [`Anatomy`](/schema/anatomy/) | Yes | Map of named elements that make up the component |
| `props` | [`Props`](/schema/props/) | No | Configurable input properties |
| `default` | [`Variant`](/schema/variants.md/#variant) | Yes | Default variant — the baseline appearance |
| `variants` | [`Variant[]`](variants.md) | No | Layered variant overrides |
| `invalidPropCombinations` | [`PropConfigurations[]`](prop-configurations.md) | No | Prop combinations that are not valid together |
| `subcomponents` | [`Subcomponents`](/schema/subcomponents/) | No | Embedded child component definitions |
| `metadata` | [`Metadata`](/schema/metadata/) | No | Generation metadata (author, schema version, config) |
| `instanceExamples` | [`InstanceExamples`](/schema/instance-examples/) | No | **Pro.** Documented whole-component usage examples (emitted only with a Pro license) |
| `slotContentExamples` | `Record<string, `[`SlotContent`](/schema/slot-content/)`>` | No | **Pro.** Named slot-content fills, referenced by [`SlotContentRef`](/schema/slot-content-ref/) from slot bindings and from `Element.propConfigurations` slot-prop entries |
| `images` | `Record<string, ImageData>` | No | Registry of image data keyed by id, referenced by `Styles.backgroundImage`, and by `examples` and `default` on `ImageBinding` and `ImageProp`. Each entry carries the Figma identity in `$extensions['com.figma'].imageHash`; resolution adds `src` (asset path, `data:` URI, or URL) without replacing it. Emitted when [`figma.images`](/schema/conventions/#images) is configured |

## Examples and composed content

Several optional fields document configured and composed usages of a component. Each has its own page:

- [`InstanceExamples`](/schema/instance-examples/) — pre-configured whole-component usages.
- [`SlotContent`](/schema/slot-content/) — the `anatomy + elements + layout` triplet used as a named slot fill, stored in `slotContentExamples`.
- [`SlotContentRef`](/schema/slot-content-ref/) — the `$slotContent` pointer that references a fill.
- [`Composition`](/schema/composition/) — a named, authored unit of composed content (system-scoped, external composition files).
- [`Children`](/schema/children/) — an element's children, including slot bindings that carry example fills.

## Concern documents

A run with [`spec.splitConcerns`](/schema/settings/) writes one file per concern rather than a single component file. Each file has its own type, requiring what its concern carries and permitting nothing else — a `variants.yaml` cannot hold an anatomy, and an `api.yaml` cannot hold a default block.

| Document | File |
|---|---|
| [`ComponentApiDocument`](/schema/documents/component-api/) | `api.yaml` |
| [`ComponentVariantsDocument`](/schema/documents/component-variants/) | `variants.yaml` |
| [`ComponentExamplesDocument`](/schema/documents/component-examples/) | `examples.yaml` |

Each document's `metadata` must state its [`concern`](/schema/metadata/) — `api`, `variants` or `examples`. That is what identifies the file, and what tells the three apart. A whole `Component` carries no `concern` at all.

A nested subcomponent is sliced by the same concern as the document holding it, so each document's `subcomponents` uses its own subcomponent shape — `ComponentApiSubcomponent`, `ComponentVariantsSubcomponent`, `ComponentExamplesSubcomponent`.

`ComponentConcernDocument` is the union of the three. TypeScript cannot narrow it on `metadata.concern`, since the discriminant sits one level down; narrow on a key instead (`'title' in doc`).
