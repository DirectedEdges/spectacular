---
title: "wrap"
description: "Whether auto-layout wrapping is enabled"
tableOfContents: false
---

Whether auto-layout wrapping is enabled (default: `false`).

#### Type(s)

| Type | Example |
|---|---|
| `boolean` | `true` |

#### Default

`false`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `container` | Component, Frame, Instance, Slot |

#### Figma key

Reads from `layoutWrap`. See [ADR 039 — Wrap Alignment](https://github.com/DirectedEdges/specs/blob/main/adr/039-wrap-alignment.md).

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |
