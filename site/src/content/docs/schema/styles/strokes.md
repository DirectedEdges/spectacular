---
title: "strokes"
description: "Stroke color for a container, vector, or line element"
tableOfContents: false
---

Stroke color.

#### Type(s)

| Type | Example |
|---|---|
| `string` | `"#FF6600"` (`HEX`)<br>`"#FF6600FF"` (`HEXA`)<br>`"rgb(255, 102, 0)"` (`RGB`)<br>`"rgba(255, 102, 0, 1)"` (`RGBA`)<br>`"hsla(24, 100%, 50%, 1)"` (`HSLA`)<br>`"hsb(24, 100%, 100%)"` (`HSB`)<br>`"oklch(0.7 0.15 50 / 1)"` (`OKLCH`)<br>`"oklab(0.7 0.1 0.1 / 1)"` (`OKLAB`) |
| [`ColorObject`](/schema/color-object/) | `colorSpace: srgb`<br>`components: [1, 0.4, 0]` |
| [`TokenReference`](/schema/token-reference/) | `$token: DS.Color.Border.Default`<br>`$type: color` |
| [`GradientValue`](/schema/gradient-value/) | `type: LINEAR`<br>`angle: 180`<br>`stops: [...]` |
| `null` | `null` |

#### Default

`null`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `container` | Component, Frame, Instance, Slot |
| `vectors` | Rectangle, Vector, Ellipse, Star, Polygon |
| `line` | Line |

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |
