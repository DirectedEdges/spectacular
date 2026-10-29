---
title: "Composition"
description: "A named, authored unit of composed content"
---

A `Composition` is a named, authored unit of composed content. The top-level [`anatomy`](/schema/anatomy/) + [`elements`](/schema/elements/) + [`layout`](/schema/layout/) triplet **is** the primary content — there is no wrapper and no reserved `main` key. An optional `slotContent` map bundles named slot fills alongside that primary content for authoring convenience.

```ts
interface Composition {
  title?: string;
  description?: string;
  anatomy: Anatomy;
  elements: Elements;
  layout: Layout;
  slotContent?: Record<string, SlotContent>;
}

type Compositions = Record<string, Composition>;
```

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | `string` | No | Human-readable label for the composition |
| `description` | `string` | No | Purpose and usage notes for documentation tooling |
| `anatomy` | [`Anatomy`](/schema/anatomy/) | Yes | Element type map for the primary content |
| `elements` | [`Elements`](/schema/elements/) | Yes | Element-level content, styles, and prop configurations |
| `layout` | [`Layout`](/schema/layout/) | Yes | Tree ordering of the primary content |
| `slotContent` | `Record<string, `[`SlotContent`](/schema/slot-content/)`>` | No | Named slot fills bundled with this composition |

`slotContent` is an authoring convenience, not a scope boundary — fills there may reference entries in other compositions via [`SlotContentRef`](/schema/slot-content-ref/).

## Concern documents

A run with [`spec.splitConcerns`](/schema/settings/) writes one file per concern rather than a single composition file. Each file has its own type, requiring what its concern carries and permitting nothing else — a `variants.yaml` cannot hold an anatomy, and an `api.yaml` cannot hold elements or layout.

| Document | File |
|---|---|
| [`CompositionApiDocument`](/schema/documents/composition-api/) | `api.yaml` |
| [`CompositionVariantsDocument`](/schema/documents/composition-variants/) | `variants.yaml` |
| [`CompositionExamplesDocument`](/schema/documents/composition-examples/) | `examples.yaml` |

These are not a loosened form of [`ComponentApiDocument`](/schema/documents/component-api/)/[`ComponentVariantsDocument`](/schema/documents/component-variants/)/[`ComponentExamplesDocument`](/schema/documents/component-examples/) — a composition has no `props`, so it has nothing for a `default`/`variants` layering to be a delta of. Each document is its own exact shape (ADR-109).

## Nested instance hierarchies

A composition is usually a hierarchy of layout components nested in one another, each filling the next one's slot. When those slots are marked [`defaultSlot: true`](/schema/props/#slotprop), the hierarchy lives in the composition's **own** triplet as nested [children](/schema/children/) — the instances are anatomy elements of the composition, and the layout is the tree:

```yaml
title: Search results / Small
anatomy:
  root: { type: container }
  pageRow: { type: instance, instanceOf: dsPageRow }
  section: { type: instance, instanceOf: dsSection }
  container: { type: instance, instanceOf: dsContainer }
  card1: { type: instance, instanceOf: dsCard }
  card2: { type: instance, instanceOf: dsCard }
elements:
  card1:
    propConfigurations:
      header: { $slotContent: "#/compositions/searchResultsSmall/slotContent/cardHeader" }
layout:
  - root:
      - pageRow:
          - section:
              - container:
                  - card1
                  - card2
```

Both shapes are visible there, and the difference is which slot each fills. The layout nesting *is* the fill for every `defaultSlot` in the chain, so nothing points from one level to the next. `card1`'s `header` is a second slot on the same component, so it binds explicitly and its fill is a `slotContent` entry — which is what `slotContent` holds once default-slot chains stop contributing an entry per level.

## Registry and references

`Compositions` (`Record<string, Composition>`) is the registry shape used by external composition files, keyed `compositions:` (system-scoped).

A [`SlotContentRef`](/schema/slot-content-ref/) pointing at a composition resolves as follows:

| Pointer | Resolves to |
|---------|-------------|
| `#/compositions/pageGrid` | the composition's top-level `anatomy + elements + layout` |
| `#/compositions/filterResultsPage/slotContent/pageHeader` | that bundled [`SlotContent`](/schema/slot-content/) |

## Further Reading

- [ADR 042 — Composition Type](https://github.com/DirectedEdges/specs/blob/main/adr/042-composition-type.md)
- [ADR 046 — Slots and Slot References](https://github.com/DirectedEdges/specs/blob/main/adr/046-slots-and-slot-references.md)
