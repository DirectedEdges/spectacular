---
title: "slotPrimitives"
description: "Read a slot's primitive default content as the primitives that slot accepts"
---

A Figma slot's default content is inspected for primitives. Every primitive kind present as a **top-level child**, in at least one variant, is recorded as a [reserved marker](/schema/props/#primitiveslotcontent) in that slot's `anyOf` — `$text` for a text layer, `$glyph` for a glyph. The primitives themselves are not emitted as anatomy elements; their formatting is captured onto the slot element's [`contentStyles`](/schema/elements/#styles-vs-content-styles), keyed by the same markers.

| | |
|---|---|
| **File** | `config/conventions/figma.yaml` |
| **Path** | `slotPrimitives` |
| **Type** | boolean |
| **Default** | `true` |

A library fact, declared in `config/conventions/figma.yaml`. It states that this library expresses composable content the way Figma already lets it: a designer who wants a label that can also hold a Badge authors a **slot with a primitive inside**, while a designer who wants a plain string authors a **`TEXT` property on a text layer**. Nothing names the prop and nothing annotates it — the two shapes already differ, and the difference is the intent.

That is why this works per component rather than per catalogue. An Alert's `description` is composable because *that* slot has a text layer in it; a Tooltip's `message` is a plain string because it is a `TEXT` prop. Neither needs an entry anywhere.

It sits beside [`slotConstraints`](/settings/slot-constraints/) — same subject, same boolean shape.

## Example

The reading is on without any declaration. Turn it off by declaring `false`:

```yaml
slotPrimitives: false  # Stop reading a slot's primitive default content as what it accepts
```

## The rule

| | |
|---|---|
| **Which primitives count** | Top-level children of the slot only. A text layer nested inside a composed instance belongs to that instance's component, not to this slot. |
| **How many** | Any number, of any kinds. Each kind is evaluated independently, so a glyph-plus-label fill makes the slot accept both. |
| **Across variants** | A kind counts if it appears in at least one variant. |
| **Which one supplies formatting** | The first top-level primitive of that kind, in child order, evaluated per variant. |
| **When a marker is written** | Only into an `anyOf` that already names at least one component. `anyOf` is a constraint, so a slot whose detected content is primitives alone gets no `anyOf` at all — `[$text]` would say *only* a text primitive may fill it, which is narrower than the design said. |
| **What is captured regardless** | `contentStyles`. A primitive-only slot records its primitives' formatting and keeps them out of anatomy even though no marker is written. |

## Result

**With** the reading off (`false`), a slot holding a glyph and a label is emitted as it was before ADR-102 — components only, with both primitives as their own anatomy elements:

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

**With** the reading on — the default — the slot states what it accepts, the primitives leave anatomy, and their formatting moves onto the slot element, attributed per kind:

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

## Two things to know

**Placeholder slots read as composable.** A slot holding a primitive purely as placeholder scaffolding, with no intent that a primitive ever fill it, gets a marker too. The failure mode is a content set wider than intended, not a wrong one — a consumer permits a fill the design never meant to offer, and the marker is sitting in the spec where you can see it. That is why the reading is on by default: the opposite default under-describes every genuinely composable slot silently, with nothing in the output to point at. Either author such slots without the placeholder, or turn the reading off.

**Two primitives of one kind record only the first.** A default fill holding a label and a trailing counter records the label's formatting for `$text`; the counter's is not captured unless it is a component.
