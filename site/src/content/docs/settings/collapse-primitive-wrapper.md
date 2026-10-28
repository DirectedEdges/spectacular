---
title: "collapsePrimitiveWrapper"
description: "Strip a root container that only wraps one child — a text or glyph leaf, or a slot — and promote the child to spec root"
---

When enabled, a component whose root is a container holding exactly one child is collapsed: the wrapper is stripped and the child becomes the spec root. When disabled, the container is emitted as root regardless of structure.

| | |
|---|---|
| **File** | `config/settings.yaml` |
| **Path** | `spec.collapsePrimitiveWrapper` |
| **Type** | boolean |
| **Default** | `true` |

The eligibility rules below are what make this safe as a default: a wrapper that carries a style the leaf cannot hold is not collapsed, so the setting never silently discards design intent. Turn it off when you want the Figma layer structure preserved exactly — most often to keep a role annotated on a collapsing component's child, as the last section explains.

## Example

```yaml
spec:
  collapsePrimitiveWrapper: false
```

## Result

**Without** collapse (`false`) a Heading component emits a two-node anatomy with a `container` root:

```yaml
anatomy:
  root:
    type: container
  label:
    type: text
    parent: root
```

**With** collapse (`true`) the wrapper is stripped and the leaf becomes root:

```yaml
anatomy:
  root:
    type: text
    $extensions:
      com.figma.name: Label
```

The `$extensions.com.figma.name` field on the anatomy root carries the Figma layer name so the source layer remains traceable.

## Qualifying shapes

Two shapes qualify, and they are tested differently because they lose different things:

- **A `text` or `glyph` leaf.** A container merges into a leaf, where container styles have nowhere to go, so the wrapper must carry none that matter. This eliminates structural noise for typographic and icon primitives — Heading, Paragraph, Body, Label, Icon — where the container adds no design-system meaning.
- **A slot.** Both nodes are containers with the same style signature, so the merge discards nothing and no style is tested. This applies to layout primitives — a frame whose only content is the slot its children fill.

## Eligibility

A component qualifies for collapse when **all** of the following are true:

- The root element type is `container`.
- The root has exactly one anatomy-visible child.
And **either** of the following.

For a **leaf** child:

- That child's type is `text` or `glyph`.
- The child has no children of its own.
- The root carries no slot binding on its children.
- The root carries none of the following styles after default/zero values are stripped: `clipsContent`, `cornerRadius`, `strokes`, `strokeAlign`, `strokeWeight`, `itemSpacing`, `padding`, `effects`, `backgroundColor`, `cornerSmoothing`.

For a **slot** child:

- That child is a container whose `children` is bound to a slot property, and that property is the component's only slot.
- No variant overrides the binding.
- No style test applies — both nodes are containers, so nothing is discarded. Where both carry a style key, the slot's value is kept.

Collapse is **all-or-nothing**: if any variant in the component set fails the eligibility check, no collapse occurs for any variant.

## Collapsing a slot

**Without** collapse (`false`) a Layout component emits two boxes:

```yaml
anatomy:
  root:
    type: container
  children:
    type: slot
    parent: root
```

**With** collapse (`true`) the wrapper is stripped and the slot binding moves onto the root:

```yaml
anatomy:
  root:
    type: container
    $extensions:
      com.figma.name: Children
elements:
  root:
    children:
      $binding: "#/props/children"
```

As with a leaf, `$extensions.com.figma.name` carries the surviving layer's Figma name so the source layer remains traceable.

## Roles on a collapsed root

A collapse turns two Figma layers into one anatomy element, and either layer may carry a `role:` annotation. The element records which one did, because render has to put each annotation back on the layer it came from:

- `role` — the **component node** was annotated.
- `$extensions.com.figma.childRole` — the **collapsed child** was annotated.

Four cases, and the pair distinguishes all four:

| `role` | `childRole` | Annotated in Figma | Render writes back to |
|---|---|---|---|
| present | absent | the component node | the component node |
| absent | present | the collapsed child | the recreated child |
| present | present | both layers | both layers |
| absent | absent | neither | neither |

`childRole` is recorded whenever the child was annotated, **even when both layers name the same concept**. Omitting it in that case would make "both were annotated" indistinguishable from "only the root was", and render would drop the child's annotation.

The child's role is deliberately **not** merged into `role`, for the same reason: merging makes the child-only case look like the two-role case. The cost is that **a role annotated on a collapsing component's child emits no code** — only `role` reaches React and Web Components. To make a role affect generated output on a component that collapses, annotate the component node, or set `collapsePrimitiveWrapper: false` for that library.
