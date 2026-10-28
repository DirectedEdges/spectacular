---
title: "backgroundImage"
description: "Image fill painted on a container or vector layer"
tableOfContents: false
---

Image fill. Fallback representation used when no image component is configured.

#### Type(s)

| Type | Example |
|---|---|
| `ImageValue` | `$image: "#/images/hero"`<br>`objectFit: COVER` |
| [`TokenReference`](/schema/token-reference/) | `$token: DS.Image.Hero`<br>`$type: image` |
| `null` | `null` (no image fill) |

#### Default

`null`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `container` | Component, Frame, Instance, Slot |
| `vectors` | Rectangle, Vector, Ellipse, Star, Polygon |

#### Figma key

Reads from `fills` (IMAGE paint). See [ADR 063 — Image Content](https://github.com/DirectedEdges/specs/blob/main/adr/063-image-content.md).

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |
