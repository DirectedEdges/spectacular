---
title: "Elements"
description: "Element runtime properties and children"
---

Within a [variant](/schema/variants/), each element is described by the `Element` type. This carries the element's runtime properties — its children, parent, styles, content, and any prop-driven behavior.

```ts
type Elements = Record<string, Element>;
```

## Element

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `children` | `string[] \| SlotBinding` | No | Child element names, or a `SlotBinding` to a slot prop. `SlotBinding` extends `PropBinding` with optional `examples?: SlotContentRef[]` — authored sample fills for the slot (e.g. Figma's authoring default at index 0). Non-contractual; code consumers may ignore. |
| `parent` | `string \| null` | No | Parent element key (`null` for root) |
| `styles` | [`Styles`](/schema/styles/) | No | Visual style properties — the element's own |
| `contentStyles` | [`ContentStyles`](/schema/styles/#contentstyles) | No | Styles applied to primitive content *filling* this element, keyed by primitive, as distinct from its own (since 0.35.0) |
| `propConfigurations` | [`PropConfigurations`](/schema/prop-configurations/) | No | Prop values that must hold for this element to appear |
| `instanceOf` | `string \| PropBinding \| SubcomponentRef` | No | Component name, binding, or subcomponent ref |
| `content` | `string \| PropBinding` | No | Text content or glyph name, or a binding to a prop |
| `$extensions` | `object` | No | Platform extensions. `com.figma` carries capture provenance for a [promoted](/settings/promote-primitives/) element — `promotedPrimitive`, the `styles` the promotion consumed, the `content` a promoted leaf carried, and the hoisted `children` fill a promoted container held (a `SlotContentRef`) |

## Styles vs. content styles

An element has two style blocks, and they describe different subjects. `styles` are the element's own — its padding, alignment, surface, sizing. `contentStyles` are what content *placed inside it* is formatted with.

On a slot element, `contentStyles` is keyed by primitive, using the same [markers](/schema/props/#primitiveslotcontent) the slot's `anyOf` carries. Default slot content may hold more than one primitive — a glyph and a label — so a flat block could not say which styles belonged to which:

```yaml
default:
  elements:
    children:
      styles:
        padding: { $token: "DS Space.200", $type: dimension }
        mainAxisAlignment: CENTER
      contentStyles:
        $text:
          typography: { $token: "DS Type.Label.Medium", $type: typography }
          textColor: { $token: "DS Color.Text.OnPrimary", $type: color }
        $glyph:
          fillColor: { $token: "DS Color.Icon.OnPrimary", $type: color }

variants:
  - configuration: { appearance: subtle, state: default }
    elements:
      children:
        contentStyles:
          $text:
            textColor: { $token: "DS Color.Text.Subtle", $type: color }
          $glyph:
            fillColor: { $token: "DS Color.Icon.Subtle", $type: color }
```

Each entry is captured from the **first top-level primitive of that kind** in the slot's default content, evaluated per variant. Where a default fill holds two primitives of one kind — a label and a trailing counter — the first supplies that kind's formatting.

**`contentStyles` applies to a primitive fill only.** When the slot is filled with a component instead, that component brings its own formatting — apply `styles` and discard `contentStyles` rather than cascading it onto the instance.

`contentStyles` is meaningful only on a slot element, and its keys should agree with that slot's `anyOf` markers. Both are authoring and generator contracts: the schema cannot relate a prop to an element, so neither is validated.

## Further Reading

- [ADR 016 — Element Content Identification](https://github.com/DirectedEdges/specs/blob/main/adr/016-element-content.md) — replaces `Element.text` with unified `Element.content` field
