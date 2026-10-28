---
title: "top"
description: "Offset from the block-start edge of a positioned child"
tableOfContents: false
---

Offset from the block-start (top) edge. Present when the vertical constraint is `MIN`, `STRETCH`, or `SCALE`.

#### Type(s)

| Type | Example |
|---|---|
| `number` | `24` (pixels) |
| `string` | `"25%"` (`SCALE` constraint) |
| `null` | `null` |

Not token-bindable — structural property computed from Figma layout constraints, not a design value.

#### Default

`null`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `container` | Component, Frame, Instance, Slot |
| `text` | Text |
| `glyph` | Glyph |
| `vectors` | Rectangle, Vector, Ellipse, Star, Polygon |
| `line` | Line |

#### Figma key

Reads from `y` when the vertical constraint is `MIN`, `STRETCH`, or `SCALE`. See [ADR 041 — Layout Positioning](https://github.com/DirectedEdges/specs/blob/main/adr/041-layout-positioning.md).

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |
