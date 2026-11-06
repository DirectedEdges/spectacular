---
title: "objectProps"
description: "Fold separator-delimited Figma property names into one object prop with named members"
---

Figma cannot author an object-valued property, so a library that wants one writes its members as flat, separator-delimited names — `Margin.compact`, `Margin.expanded` — and declares this convention. With the block present, those names fold into one `margin` prop of `type: object` whose named members are ordinary scalar props. A library fact: the block's presence is the on-switch, and absence means no folding — a property name containing the separator stays a flat prop.

| | |
|---|---|
| **File** | `config/conventions/figma.yaml` |
| **Path** | `objectProps` |
| **Type** | object (`separator`: string) |
| **Default** | absent (no folding); `separator` defaults to `"."` inside a declared block |

## Example

```yaml
objectProps:
  separator: '.'   # The member-name separator in flat property names
```

## Result

A component with Figma variant properties `Margin.compact` and `Margin.expanded`:

**Without** the convention, the names stay two flat props:

```json
{
  "props": {
    "marginCompact": { "type": "string", "enum": ["none", "tight"] },
    "marginExpanded": { "type": "string", "enum": ["none", "loose"] }
  }
}
```

**With** it, they fold into one object prop; each member records its flat Figma name so rendering back to Figma is reversal, not re-derivation:

```json
{
  "props": {
    "margin": {
      "type": "object",
      "members": {
        "compact": { "type": "string", "enum": ["none", "tight"],
          "$extensions": { "com.figma": { "name": "Margin.compact" } } },
        "expanded": { "type": "string", "enum": ["none", "loose"],
          "$extensions": { "com.figma": { "name": "Margin.expanded" } } }
      }
    }
  }
}
```

A variant named `Margin.compact=none` carries the member-keyed configuration `margin: { compact: none }`, and a reference to one member is a JSON Pointer through the members level: `#/props/margin/members/compact`.

## Folding rules

- The parent is the text before the **first** separator; a lone separator-delimited name folds into a single-member object, so a sibling arriving later grows the object without reshaping the API.
- Members are one level deep: boolean, string, enum, or number. Slot and instance-swap properties never fold, and a member name must not itself contain the separator.
- Collisions warn and skip the fold — a parent key that already exists flat (`Margin` beside `Margin.compact`), or two names formatting to the same member key — leaving the colliding names flat. Nothing is dropped, and the output is never ambiguous.

## Downstream

Generated code treats the prop as one object — `margin={{ compact: "none" }}` in React, a JS property with Lit's `Object` converter in Web Components — while Storybook exposes one control per member under its dotted key (`margin.compact`).

## See Also

- [inferNumberProps](/settings/infer-number-props/) — the neighbouring encoding convention for numeric TEXT props.
- [Props](/schema/props/) — the prop definitions the fold produces.
