---
title: "visible"
description: "Whether an element is rendered"
tableOfContents: false
---

Whether the element is visible.

#### Type(s)

| Type | Example |
|---|---|
| `boolean` | `true` |
| [`TokenReference`](/schema/token-reference/) | `$token: ...`<br>`$type: boolean` |
| [`PropBinding`](/schema/prop-binding/) | `$binding: "#/props/label"` |
| [`Conditional`](/schema/conditional/) | `if: { condition: {op: isNotNull, args: [...]}, then: true, else: false }` |

`Conditional` covers the common case of deriving visibility from a nullable prop (e.g. hide when a text or glyph prop is unset). See [ADR 018 — Conditional Visible Binding](https://github.com/DirectedEdges/specs/blob/main/adr/018-conditional-visible-binding.md).

#### Default

`true`

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
