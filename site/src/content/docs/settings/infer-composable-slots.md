---
title: "inferComposableSlots"
description: "Read a slot's primitive default content as the primitives that slot accepts"
---

When enabled, a Figma slot's default content is inspected for primitives. Every primitive kind present as a **top-level child**, in at least one variant, is recorded as a [reserved marker](/schema/props/#primitiveslotcontent) in that slot's `anyOf` — `$text` for a text layer, `$glyph` for a glyph. The primitives themselves are not emitted as anatomy elements; their formatting is captured onto the slot element's [`contentStyles`](/schema/elements/#styles-vs-content-styles), keyed by the same markers.

A library fact, declared in `config/conventions/figma.yaml`. It states that this library expresses composable content the way Figma already lets it: a designer who wants a label that can also hold a Badge authors a **slot with a primitive inside**, while a designer who wants a plain string authors a **`TEXT` property on a text layer**. Nothing names the prop and nothing annotates it — the two shapes already differ, and the difference is the intent.

That is why this works per component rather than per catalogue. An Alert's `description` is composable because *that* slot has a text layer in it; a Tooltip's `message` is a plain string because it is a `TEXT` prop. Neither needs an entry anywhere.

| | |
|---|---|
| **File** | `config/conventions/figma.yaml` |
| **Path** | `inferComposableSlots` |
| **Type** | boolean |
| **Default** | `false` |

## Example

```yaml
inferComposableSlots: true  # Read a slot's primitive default content as what it accepts
```

## The rule

| | |
|---|---|
| **Which primitives count** | Top-level children of the slot only. A text layer nested inside a composed instance belongs to that instance's component, not to this slot. |
| **How many** | Any number, of any kinds. Each kind is evaluated independently, so a glyph-plus-label fill makes the slot accept both. |
| **Across variants** | A kind counts if it appears in at least one variant. |
| **Which one supplies formatting** | The first top-level primitive of that kind, in child order, evaluated per variant. |

## Result

**Without** the reading (`false`), a slot holding a glyph and a label is emitted as it is today — components only, with both primitives as their own anatomy elements:

```json
{
  "props": {
    "children": { "type": "slot" }
  },
  "anatomy": [
    { "key": "children", "type": "slot" },
    { "key": "buttonIcon", "type": "glyph" },
    { "key": "buttonLabel", "type": "text" }
  ]
}
```

**With** the reading (`true`), the slot states what it accepts, the primitives leave anatomy, and their formatting moves onto the slot element — attributed per kind:

```json
{
  "props": {
    "children": { "type": "slot", "anyOf": ["$glyph", "$text", "badge"] }
  },
  "anatomy": [
    { "key": "children", "type": "slot" }
  ]
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

Any prop authored as a Figma `TEXT` property is unaffected, declared or not.

## Independent of the default slot

Whether a slot accepts primitives and whether it is the component's [default slot](/schema/props/) are separate questions, recorded separately:

| Component | Prop | `anyOf` | `defaultSlot` |
|-----------|------|---------|---------------|
| Button | `children` | `[$glyph, $text, badge]` | `true` |
| Alert | `description` | `[$text, link]` | — |
| Layout | `children` | `[card]` | `true` |

## Two things to know before enabling

**Placeholder slots read as composable.** A slot holding a primitive purely as placeholder scaffolding, with no intent that a primitive ever fill it, gets a marker too. The failure mode is a content set wider than intended, not a wrong one — a consumer permits a fill the design never meant to offer. This is why the reading is opt-in rather than on by default. Either author such slots without the placeholder, or leave this off.

**Two primitives of one kind record only the first.** A default fill holding a label and a trailing counter records the label's formatting for `$text`; the counter's is not captured unless it is a component.
