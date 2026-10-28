---
title: "strokeWeight"
description: "Stroke thickness for a container, vector, or line element"
tableOfContents: false
---

Stroke weight. Scalar when uniform; [`Sides`](/schema/sides/) object when per-side values differ.

#### Type(s)

| Type | Example |
|---|---|
| `number` | `2` |
| [`TokenReference`](/schema/token-reference/) | `$token: DS.Border.Width.200`<br>`$type: dimension` |
| [`Sides`](/schema/sides/) | `top: 2`<br>`end: 1`<br>`bottom: 2`<br>`start: 1` |
| `null` | `null` |

#### Default

`0`

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
