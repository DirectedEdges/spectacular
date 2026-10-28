---
title: "position"
description: "Layout positioning mode for a child element"
tableOfContents: false
---

Layout positioning mode — whether the element participates in its parent's auto-layout flow or is positioned absolutely.

#### Type(s)

| Type | Example |
|---|---|
| `Position` | `"AUTO"`, `"ABSOLUTE"` |
| `null` | `null` |

Not token-bindable — structural property, not a design value.

`ABSOLUTE` elements use [`top`](/schema/styles/top/) / [`bottom`](/schema/styles/bottom/) / [`start`](/schema/styles/start/) / [`end`](/schema/styles/end/) / [`centerHorizontalOffset`](/schema/styles/center-horizontal-offset/) / [`centerVerticalOffset`](/schema/styles/center-vertical-offset/) to place themselves relative to the parent.

#### Default

`"AUTO"`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `container` | Component, Frame, Instance, Slot |
| `text` | Text |
| `glyph` | Glyph |
| `vectors` | Rectangle, Vector, Ellipse, Star, Polygon |
| `line` | Line |

#### Figma key

Reads from `layoutPositioning`. See [ADR 041 — Layout Positioning](https://github.com/DirectedEdges/specs/blob/main/adr/041-layout-positioning.md) for why `position` diverges from Figma's naming.

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |
