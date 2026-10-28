---
title: "strokeDashPattern"
description: "Dash geometry for a dashed stroke"
tableOfContents: false
---

Dash geometry for a dashed stroke. Presence signals a dashed stroke; null or absent signals solid.

#### Type(s)

| Type | Example |
|---|---|
| `StrokeDashPattern` | `dash: 8`<br>`gap: 4` |
| `null` | `null` (solid) |

Not token-bindable — structural property, not a design value.

#### Default

`null`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `container` | Component, Frame, Instance, Slot |
| `vectors` | Rectangle, Vector, Ellipse, Star, Polygon |
| `line` | Line |

#### Figma key

Reads from `strokeDashes`. See [ADR 059 — Border Style](https://github.com/DirectedEdges/specs/blob/main/adr/059-border-style.md).

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |
