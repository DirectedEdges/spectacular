---
title: "padding"
description: "Inner spacing between a container's edge and its children"
tableOfContents: false
---

Padding. Scalar when uniform; [`Sides`](/schema/sides/) object when per-side values differ.

#### Type(s)

| Type | Example |
|---|---|
| `number` | `16` |
| [`TokenReference`](/schema/token-reference/) | `$token: DS.Space.400`<br>`$type: dimension` |
| [`Sides`](/schema/sides/) | `top: 8`<br>`end: 16`<br>`bottom: 8`<br>`start: 16` |
| `null` | `null` |

#### Default

`0`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `container` | Component, Frame, Instance, Slot |

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |
