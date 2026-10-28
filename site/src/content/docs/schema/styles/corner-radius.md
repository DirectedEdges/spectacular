---
title: "cornerRadius"
description: "Corner radius for a container element"
tableOfContents: false
---

Corner radius. Scalar when uniform; [`Corners`](/schema/corners/) object when per-corner values differ.

#### Type(s)

| Type | Example |
|---|---|
| `number` | `16` |
| [`TokenReference`](/schema/token-reference/) | `$token: DS.Radius.400`<br>`$type: dimension` |
| [`Corners`](/schema/corners/) | `topStart: 4`<br>`topEnd: 4`<br>`bottomEnd: 0`<br>`bottomStart: 0` |
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
