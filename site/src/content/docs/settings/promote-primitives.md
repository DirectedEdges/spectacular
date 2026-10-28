---
title: "promotePrimitives"
description: "Turn primitive layers in composed example content into instances of the design system's own components"
---

When enabled, a `text`, `glyph` or `container` layer in composed example content becomes an instance of the design system component it stands for, using the [`primitives`](/schema/conventions/#primitives) table. Designers build examples out of raw layers because composing with real instances in a design file is laborious — a text layer wearing the design system's typography token is standing in for that system's text component, and promotion records the component rather than the approximation.

| | |
|---|---|
| **File** | `config/settings.yaml` |
| **Path** | `spec.promotePrimitives` |
| **Type** | boolean |
| **Default** | `false` |

## Example

```yaml
spec:
  promotePrimitives: true
```

## Result

**Without** promotion (`false`), a heading in an alert's slot content is a text layer with styles:

```yaml
anatomy:
  heading: { type: text }
elements:
  heading:
    styles:
      layoutSizingHorizontal: FILL
      textColor:  { $token: Color/Inverse on surface, $type: color }
      typography: { $token: Typography/font__400__medium, $type: typography }
    content: Heading
```

**With** promotion (`true`), it is an instance, in the same shape as a component the designer placed:

```yaml
anatomy:
  heading: { type: instance, instanceOf: dsTypography }
elements:
  heading:
    instanceOf: dsTypography
    propConfigurations:
      color: Inverse on surface
      size: 400
      weight: Medium
      text: Heading
    styles:
      layoutSizingHorizontal: FILL     # unmapped — still styling
    $extensions:
      com.figma:
        promotedPrimitive: true
        content: Heading
        styles:
          textColor:  { $token: Color/Inverse on surface, $type: color }
          typography: { $token: Typography/font__400__medium, $type: typography }
```

The styles are **partitioned**, not copied. What the promotion consumed moves to `$extensions.com.figma.styles`; what nothing claimed stays in `styles` and reaches output as before. No value is stored twice.

## Scope

**Composed content only.** `slotContentExamples` and `instanceExamples` are affected. A component's own `variants.yaml` is never promoted — someone who put a text layer in a component's anatomy chose a text layer, and that is what the component contains.

Off by default. Promotion restructures composed content, so a workspace elects it rather than receiving it on upgrade. A [`primitives`](/schema/conventions/#primitives) table is inert until this is turned on.

## Provenance

`promotedPrimitive` marks the element as a promoted layer rather than an instance the designer placed. It is stated rather than inferred, because a promotion may consume no styles at all — a glyph whose name maps to a prop while no style rule resolves.

`multipleMatches` marks an element where more than one entry resolved and the highest scorer was chosen. Two components claiming one layer may be a true description of the design system, or a conventions file that has drifted — either way the ambiguity is recorded on the element rather than announced once in a run log.

`content` holds the text string or glyph name the promotion consumed. Its value also sits in `propConfigurations`, but only under whichever prop the table named — recording it here is what lets a promoted layer be restored without consulting the table.

`styles` holds what the promotion consumed, verbatim. A prop value cannot be turned back into the style that produced it, since two sources may map to one value: `size: XS` cannot say whether the layer carried a sizing token or a raw `16`. Recording the original is what lets a promoted layer be rendered back to Figma as a layer.

`children` holds the hoisted slot fill of a promoted container — the subtree the frame held, moved into `slotContentExamples` when the frame became an instance. Its pointer also sits in `propConfigurations`, but only under whichever prop the table named — recording it here is what lets a promoted frame be restored with its children back in place, without consulting the table.

## Unmatched sources

A source with no matching row in the table does not resolve. Its value stays in `styles` and reaches output as passed styling, so an incomplete table produces more verbose output rather than missing design intent.

If no entry matches at all, the element is left exactly as it is — the same output as `false`.

## Tokens

A `values` key is matched **literally** against what the style carries. What a style
carries depends on [`spec.tokens`](/settings/tokens/) — so a `primitives.yaml` is written
against one profile, and goes inert under another.

Under `TOKEN`, a colour arrives as `{ $token: "Color/On surface", $type: "color" }` and the
key is that path:

```yaml
- source: textColor
  values:
    "Color/On surface": { color: On surface }
```

Under `FIGMA_SYNTAX_WEB` the same colour arrives as the web code-syntax name a designer
set in Figma — `--ds-color-on-surface` — and the row above matches nothing.

| Profile | What a key must be |
|---------|--------------------|
| `TOKEN` | The token path |
| `TOKEN_FIGMA_EXTENSIONS` | The token path — the extensions block is ignored |
| `TOKEN_NAME` | The token path |
| `FIGMA_NAME` | The Figma-native name |
| `CUSTOM` | Whatever your mapping puts in `$token` |
| `FIGMA_SYNTAX_WEB` / `_IOS` / `_ANDROID` | The platform's code-syntax name — **or** the token path, per token |

:::caution[Switching profiles silently stops promotion]
Nothing declares which profile a table was written against, and nothing checks. Change
`spec.tokens` and every key stops matching, so nothing promotes — the same output as
having no table at all. It fails safe (no wrong promotions) but quietly.
:::

### FIGMA_SYNTAX_WEB / FIGMA_SYNTAX_IOS / FIGMA_SYNTAX_ANDROID

The code-syntax profiles fall back to the token path **per token**, whenever a token has no
code syntax defined for that platform. So a correct table under `FIGMA_SYNTAX_WEB` is part
code-syntax names and part token paths, decided token by token — and the conventions file
gives no clue which is which. Check each token in Figma rather than assuming a rule.

### CUSTOM

`CUSTOM` replaces the reference with your `$custom` object verbatim. Promotion keys on
`$token`, so a mapping that renames the token while keeping the shape works normally:

```json
{ "$token": "color-on-surface", "$type": "color" }
```

A mapping that emits some other shape has no member promotion knows to key on, so nothing
resolves and nothing promotes.

## Comparison

A spec captured with promotion and one captured without differ throughout their composed content. Any comparison between them — a parity check between two producers, a diff against a stored baseline — reports the whole difference unless both sides ran with the same value.

The value is recorded in `metadata.settings.spec`, so a spec states how it was produced.

## Further reading

- [`primitives`](/schema/conventions/#primitives) — the table promotion consults.
- [Collapse Primitive Wrapper](/settings/collapse-primitive-wrapper/) — the other capture-time restructuring, also opt-in.
