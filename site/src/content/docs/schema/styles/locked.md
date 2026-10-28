---
title: "locked"
description: "Whether an element is locked from editing in Figma"
tableOfContents: false
---

Whether the element is locked from editing in Figma.

#### Type(s)

| Type | Example |
|---|---|
| `boolean` | `true` |
| [`TokenReference`](/schema/token-reference/) | `$token: ...`<br>`$type: boolean` |

#### Default

`false`

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
