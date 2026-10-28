---
title: "maxLines"
description: "Line limit before text truncates with ellipsis"
tableOfContents: false
---

Maximum number of lines before `textOverflow: "ELLIPSIS"` applies.

#### Type(s)

| Type | Example |
|---|---|
| `number` | `3` |
| [`TokenReference`](/schema/token-reference/) | `$token: ...`<br>`$type: number` |
| `null` | `null` (no limit) |

#### Default

`null`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `text` | Text |

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |
