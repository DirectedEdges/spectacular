---
title: "strokeAlign"
description: "Stroke alignment relative to an element's bounds"
tableOfContents: false
---

Stroke alignment relative to the element's bounds.

#### Type(s)

| Type | Example |
|---|---|
| `string` | `"INSIDE"`, `"OUTSIDE"`, `"CENTER"` |
| [`TokenReference`](/schema/token-reference/) | `$token: ...`<br>`$type: string` |

#### Default

`"INSIDE"`

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
