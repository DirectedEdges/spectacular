---
title: "crossAxisAlignment"
description: "Cross-axis alignment for an auto-layout container"
tableOfContents: false
---

Alignment along the cross axis (perpendicular to `layoutMode`).

#### Type(s)

| Type | Example |
|---|---|
| `CrossAxisAlignment` | `"START"`, `"END"`, `"CENTER"`, `"STRETCH"`, `"BASELINE"` |
| `null` | `null` |

Not token-bindable — structural property, not a design value.

#### Default

`"START"`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `container` | Component, Frame, Instance, Slot |

#### Figma key

Reads from `counterAxisAlignItems`. See [ADR 040 — Layout Alignment](https://github.com/DirectedEdges/specs/blob/main/adr/040-layout-alignment.md).

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |
