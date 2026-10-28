---
title: "textOverflow"
description: "How overflowing text is handled"
tableOfContents: false
---

How overflowing text is handled — cut off or trailing ellipsis.

#### Type(s)

| Type | Example |
|---|---|
| `TextOverflow` | `"CLIP"`, `"ELLIPSIS"` |
| `null` | `null` |

Not token-bindable — structural property, not a design value.

#### Default

`"CLIP"`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `text` | Text |

#### Figma key

Reads from `textTruncation` (`DISABLED`→`CLIP`, `ENDING`→`ELLIPSIS`). See [ADR 062 — Text Truncation](https://github.com/DirectedEdges/specs/blob/main/adr/062-text-truncation.md).

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |
