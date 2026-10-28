---
title: "backgroundColor"
description: "Background fill color for a container or vector element"
tableOfContents: false
---

Background fill color, read from Figma's `fills` ([ADR 009](https://github.com/DirectedEdges/specs/blob/main/adr/009-color-values.md) explains why the name diverges).

#### Type(s)

| Type | Example | Settings |
|---|---|---|
| `string` | `"#FF6600"` (`HEX`)<br>`"#FF6600FF"` (`HEXA`)<br>`"rgb(255, 102, 0)"` (`RGB`)<br>`"rgba(255, 102, 0, 1)"` (`RGBA`)<br>`"hsla(24, 100%, 50%, 1)"` (`HSLA`)<br>`"hsb(24, 100%, 100%)"` (`HSB`)<br>`"oklch(0.7 0.15 50 / 1)"` (`OKLCH`)<br>`"oklab(0.7 0.1 0.1 / 1)"` (`OKLAB`) | [`settings.spec.color`](/schema/settings/#spec) |
| [`ColorObject`](/schema/color-object/) | `colorSpace: srgb`<br>`components: [1, 0.4, 0]` | [`settings.spec.color`](/schema/settings/#spec) |
| [`TokenReference`](/schema/token-reference/) | `$token: DS.Color.Surface.Muted`<br>`$type: color` | [`config.format.token`](/settings/tokens/) |
| [`GradientValue`](/schema/gradient-value/) | `type: LINEAR`<br>`angle: 180`<br>`stops: [...]` | — |
| `null` | `null` | — |

#### Default

`null`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `container` | Component, Frame, Instance, Slot |
| `vectors` | Rectangle |

Other vectors (`VECTOR`/`ELLIPSE`/`STAR`/`POLYGON`) use [`fillColor`](/schema/styles/fill-color/) instead.

Text elements use [`textColor`](/schema/styles/text-color/) instead.

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |
