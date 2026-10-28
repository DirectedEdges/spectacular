---
title: "wrapAlignment"
description: "Space distribution between wrapped auto-layout lines"
tableOfContents: false
---

Space distribution between wrapped lines. Only meaningful when `wrap` is `true`.

#### Type(s)

| Type | Example |
|---|---|
| `WrapAlignment` | `"START"`, `"SPACE_BETWEEN"` |
| `null` | `null` |

Not token-bindable — structural property, not a design value.

#### Default

`null`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `container` | Component, Frame, Instance, Slot |

#### Figma key

Reads from `counterAxisAlignContent`. See [ADR 039 — Wrap Alignment](https://github.com/DirectedEdges/specs/blob/main/adr/039-wrap-alignment.md).

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |
