---
title: "end"
description: "Offset from the inline-end edge of a positioned child"
tableOfContents: false
---

Offset from the inline-end edge (right in LTR, left in RTL). Present when the horizontal constraint is `MAX` or `STRETCH`.

#### Type(s)

| Type | Example |
|---|---|
| `number` | `24` (pixels) |
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

Reads from `x` when the horizontal constraint is `MAX` or `STRETCH`. See [ADR 041 — Layout Positioning](https://github.com/DirectedEdges/specs/blob/main/adr/041-layout-positioning.md).

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |
