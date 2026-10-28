---
title: "textAlignHorizontal"
description: "Horizontal text alignment using logical inline-axis directions"
tableOfContents: false
---

Horizontal text alignment using logical inline-axis directions. `START` resolves to left in LTR and right in RTL; `END` is the inverse.

#### Type(s)

| Type | Example |
|---|---|
| `TextAlignHorizontal` | `"START"`, `"CENTER"`, `"END"`, `"JUSTIFY"` |
| `null` | `null` |

Not token-bindable — structural property, not a design value.

#### Default

`"START"`

#### Supported on

| Element | Figma Layer(s) |
|---|---|
| `text` | Text |

#### Figma key

Reads from `textAlignHorizontal`, remapped to logical directions (`LEFT`→`START`, `RIGHT`→`END`, `JUSTIFIED`→`JUSTIFY`). See [ADR 064 — Text Align Horizontal](https://github.com/DirectedEdges/specs/blob/main/adr/064-text-align-horizontal.md).

#### Source

| Format | File |
|---|---|
| TypeScript | [`packages/schema/types/Styles.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Styles.ts) |
| JSON Schema | [`packages/schema/schema/styles.schema.json`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/styles.schema.json) |

