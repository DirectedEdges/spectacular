---
title: "slotPrimitives"
description: "Read the primitives a slot holds in its default content as the primitives that slot accepts"
---

A slot's default content is inspected for primitives, and what it holds is recorded two ways: the formatting a primitive fill should take is captured onto the slot element's [`contentStyles`](/schema/elements/#styles-vs-content-styles), and — where the slot already names components it accepts — `$text` and `$glyph` [markers](/schema/props/#primitiveslotcontent) join that list. A library fact: it states that this library expresses composable content the way Figma already allows, with a designer who wants a label that can also hold a Badge authoring a slot with a primitive inside, and a designer who wants a plain string authoring a `TEXT` property instead.

| | |
|---|---|
| **File** | `config/conventions/figma.yaml` |
| **Path** | `slotPrimitives` |
| **Type** | boolean |
| **Default** | `true` |

## Example

```yaml
slotPrimitives: false  # Stop reading a slot's default content as the primitives it accepts
```

## Result

The example is a Button whose `children` slot holds a glyph and a label in its default content, and which already declares `badge` among the components that slot accepts.

**Without** the reading (`false`) the slot says nothing about primitives:

```json
{
  "props": {
    "children": { "type": "slot", "anyOf": ["badge"] }
  }
}
```

**With** the reading — the default — the slot states the primitives too, and the formatting for each is recorded on the slot element:

```json
{
  "props": {
    "children": { "type": "slot", "anyOf": ["$glyph", "$text", "badge"] }
  }
}
```

```yaml
# variants.yaml
default:
  elements:
    children:
      styles:
        padding: { $token: "DS Space.200", $type: dimension }
      contentStyles:
        $text:
          typography: { $token: "DS Type.Label.Medium", $type: typography }
          textColor: { $token: "DS Color.Text.OnPrimary", $type: color }
        $glyph:
          fillColor: { $token: "DS Color.Icon.OnPrimary", $type: color }
```

Anatomy is untouched either way: a primitive inside a slot's default content stays the element it always was. Any prop authored as a Figma `TEXT` property is unaffected, declared or not.

## Detection rules

- Only **top-level** children of the slot count. A text layer nested inside a composed instance, or inside a container within the slot, belongs to that structure rather than to this slot and is not read.
- Each kind is evaluated independently and across variants: a kind counts when it appears in at least one variant, so a glyph-plus-label fill makes the slot accept both.
- The **first** top-level primitive of a kind supplies that kind's formatting, in child order, evaluated per variant. A fill holding a label and a trailing counter records the label's formatting for `$text`; the counter's is not captured unless it is a component.
- A marker joins `anyOf` only when the slot **already names at least one component**. `anyOf` is a constraint, so a slot whose only identified content is primitives emits no `anyOf` at all rather than declaring that nothing but a primitive may fill it. Component names come from [`slotConstraints`](/settings/slot-constraints/) — a library that declares none gets `contentStyles` on its slots and no markers anywhere.
- `contentStyles` is captured whenever primitives are detected, independently of whether any marker is emitted.
- A slot holding a primitive purely as placeholder scaffolding is read as accepting one. The failure mode is a content set wider than intended rather than a wrong one, and the marker sits in the spec where it can be seen; author such slots without the placeholder, or turn the reading off.

## Default slot

What a slot accepts and whether it is the component's [default slot](/schema/props/) are separate questions, recorded separately:

| Component | Prop | `anyOf` | `defaultSlot` |
|-----------|------|---------|---------------|
| Button | `children` | `["$glyph", "$text", "badge"]` | `true` |
| Alert | `description` | `["$text", "link"]` | — |
| Layout | `children` | `["card"]` | `true` |

## Downstream

Generated code treats a slot's content as content, never narrowing it to match the markers: a slot is `React.ReactNode` in React and a projected `<slot>` in Web Components whatever `anyOf` says, because no platform can stop a consumer passing a string. The markers and `contentStyles` describe what the design intends and how primitive content should be formatted — that formatting reaches output through the generated stylesheet, so a consumer's own styles override it by ordinary cascade.

A slot's recorded default content is example content. It reaches stories, scaffolds and examples; it is never emitted as a component's own fallback.

## See Also

- [slotConstraints](/settings/slot-constraints/) — the neighbouring convention that names the components a slot accepts.
- [Props](/schema/props/) — `SlotProp`, `anyOf`, and the marker vocabulary.
- [Elements](/schema/elements/#styles-vs-content-styles) — `contentStyles` and how it differs from an element's own `styles`.
