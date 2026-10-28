---
title: "opacity"
description: "Element opacity"
tableOfContents: false
---

Opacity, 0–1.

#### Type(s)

| Type | Example |
|---|---|
| `number` | `0.5` |
| [`TokenReference`](/schema/token-reference/) | `$token: ...`<br>`$type: number` |

#### Default

`1`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `container` | Component, Frame, Instance, Slot |
| `text` | Text |
| `glyph` | Glyph |
| `vectors` | Rectangle, Vector, Ellipse, Star, Polygon |
| `line` | Line |

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |
