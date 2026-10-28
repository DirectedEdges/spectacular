---
title: "rotation"
description: "Rotation angle of an element"
tableOfContents: false
---

Rotation in degrees.

#### Type(s)

| Type | Example |
|---|---|
| `number` | `45` |
| [`TokenReference`](/schema/token-reference/) | `$token: ...`<br>`$type: number` |

#### Default

`0`

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
