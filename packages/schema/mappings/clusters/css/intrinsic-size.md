# intrinsicSize

bound · verified against an implementation

A cluster of the [CSS binding](../css.md). These keys resolve jointly — no
one of them determines any single output, so the rule below *is* the mapping.

**Keys.** `width`, `height`, `aspectRatio`

## Operands

Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `self.width` | document |
| `self.height` | document |
| `self.aspectRatio` | document |

## Cases

Ordered — first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `self.width` present | `width: <self.width>` |  |
| 2 | `self.height` present **and** `self.aspectRatio` present | *nothing* | a stated ratio derives the height |
| 3 | `self.height` present | `height: <self.height>` |  |
| 4 | `self.aspectRatio` present | `aspect-ratio: <x> / <y>` |  |

## Otherwise

*Nothing is emitted.*

*css/style/size.ts:22-34. minWidth, minHeight, maxWidth and maxHeight are independent and map one-to-one.*
