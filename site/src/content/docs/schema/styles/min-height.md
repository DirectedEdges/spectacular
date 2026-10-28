---
title: "minHeight"
description: "Minimum height constraint for an element"
tableOfContents: false
---

Minimum height constraint.

#### Type(s)

| Type | Example |
|---|---|
| `number` | `24` |
| [`TokenReference`](/schema/token-reference/) | `$token: DS.Size.400`<br>`$type: dimension` |

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
