---
title: "itemSpacing"
description: "Gap between items in an auto-layout container"
tableOfContents: false
---

Item spacing. Scalar when uniform; [`ItemSpacing`](#itemspacing) object when horizontal and vertical gaps differ.

#### Type(s)

| Type | Example |
|---|---|
| `number` | `16` |
| [`TokenReference`](/schema/token-reference/) | `$token: DS.Space.400`<br>`$type: dimension` |
| `ItemSpacing` | `horizontal: 16`<br>`vertical: 8` |
| `null` | `null` |

#### Default

`0`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `container` | Component, Frame, Instance, Slot |

Only meaningful when `layoutMode` is not `NONE`.

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |

### ItemSpacing

| Property | Type | Description |
|---|---|---|
| `horizontal` | `Style` | Horizontal gap between items |
| `vertical` | `Style` | Vertical gap between items |
