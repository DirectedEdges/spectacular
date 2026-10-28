---
title: "layoutSizingVertical"
description: "Vertical sizing mode within an auto-layout parent"
tableOfContents: false
---

Vertical sizing mode.

#### Type(s)

| Type | Example |
|---|---|
| `string` | `"FIXED"`, `"HUG"`, `"FILL"` |
| [`TokenReference`](/schema/token-reference/) | `$token: ...`<br>`$type: string` |

#### Default

`"FIXED"`

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
