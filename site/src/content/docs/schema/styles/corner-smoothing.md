---
title: "cornerSmoothing"
description: "Squircle-style corner smoothing amount"
tableOfContents: false
---

Corner smoothing amount (Figma's "squircle" effect), 0–1.

#### Type(s)

| Type | Example |
|---|---|
| `number` | `0.6` |
| [`TokenReference`](/schema/token-reference/) | `$token: ...`<br>`$type: number` |

Follows the same rectangle-only restriction as [`cornerRadius`](/schema/styles/corner-radius/).

#### Default

`0`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `container` | Component, Frame, Instance, Slot |
| `vectors` | Rectangle |

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |
