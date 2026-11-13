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
| `themes` | [`Themes`](/schema/themes/) | No | The theme this element selects per token group, keyed by group name and inherited by its descendants (since 0.41.0) |
| `instanceOf` | `string \| PropBinding \| SubcomponentRef` | No | Component name, binding, or subcomponent ref |
| `content` | `string \| PropBinding` | No | Text content or glyph name, or a binding to a prop |
| `$extensions` | `object` | No | Platform extensions. `com.figma` carries capture provenance for a [promoted](/settings/promote-primitives/) element — `promotedPrimitive`, the `styles` the promotion consumed, the `content` a promoted leaf carried, and the hoisted `children` fill a promoted container held (a `SlotContentRef`) |

## Styles vs. content styles

An element has two style blocks, and they describe different subjects. `styles` are the element's own — its padding, alignment, surface, sizing. `contentStyles` are what content *placed inside it* is formatted with.

On a slot element, `contentStyles` is keyed by primitive, using the same [markers](/schema/props/slot/#primitive-content-markers) the slot's `anyOf` carries. Default slot content may hold more than one primitive — a glyph and a label — so a flat block could not say which styles belonged to which:

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

**`contentStyles` applies to a primitive fill only.** When the slot is filled with a component instead, that component brings its own formatting — apply `styles` and discard `contentStyles` rather than applying it to the instance.

`contentStyles` is meaningful only on a slot element, and its keys should agree with that slot's `anyOf` markers. Both are authoring and generator contracts: the schema cannot relate a prop to an element, so neither is validated.

## Themes

`themes` states the theme in force for this element and everything beneath it. Keys name a token group, values name one of that group's themes, and a key is written only on the element that selects it — descendants inherit it.

```yaml
default:
  elements:
    root:
      themes:
        DE Color: Dark
      styles:
        backgroundColor: { $token: "DE Color/Surface/Primary", $type: color }
    decorativeIcon:
      styles:
        fillColor: { $token: "DE Color/Alert/Info/Element", $type: color }
```

`decorativeIcon` carries no `themes` key, so its fill resolves under `root`'s `Dark` selection.

See [Themes](/schema/themes/) for the spelling rules, how selections layer across variants, and what each platform turns one into.

## Further Reading

- [ADR 016 — Element Content Identification](https://github.com/DirectedEdges/specs/blob/main/adr/016-element-content.md) — replaces `Element.text` with unified `Element.content` field
