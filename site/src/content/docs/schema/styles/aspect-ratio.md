---
title: "aspectRatio"
description: "Locked width-to-height ratio for an element"
tableOfContents: false
---

Locked aspect ratio. Present only when the node has a locked ratio.

#### Type(s)

| Type | Example |
|---|---|
| `AspectRatioValue` | `x: 16`<br>`y: 9` |
| `null` | `null` (unconstrained) |

`TokenReference` is intentionally excluded — aspect ratio is a structural lock of literal numbers in the Figma API, not a token-driven value.

#### Default

`null`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `container` | Component, Frame, Instance, Slot |
| `text` | Text |
| `glyph` | Glyph |
| `vectors` | Rectangle, Vector, Ellipse, Star, Polygon |

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |
