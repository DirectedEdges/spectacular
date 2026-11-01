# textTruncation

bound · verified against an implementation

A cluster of the [CSS binding](../css.md). These keys resolve jointly — no
one of them determines any single output, so the rule below *is* the mapping.

**Keys.** `textOverflow`, `maxLines`

## Operands

Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `self.textOverflow` | document |
| `self.maxLines` | document |

## Cases

Ordered — first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `self.maxLines` present **and** `self.maxLines` ≠ `1` | `display: -webkit-box`<br>`-webkit-box-orient: vertical`<br>`-webkit-line-clamp: <self.maxLines>`<br>`line-clamp: <self.maxLines>`<br>`overflow: hidden` | multi-line clamp changes the display type |
| 2 | `self.maxLines` = `1` **and** `self.textOverflow` = `ELLIPSIS` | `white-space: nowrap`<br>`overflow: hidden`<br>`text-overflow: ellipsis` |  |
| 3 | `self.maxLines` = `1` | `white-space: nowrap`<br>`overflow: hidden` |  |
| 4 | `self.textOverflow` = `ELLIPSIS` | `overflow: hidden`<br>`text-overflow: ellipsis` |  |

## Otherwise

*Nothing is emitted.*

*css/style/truncation.ts:12-37. The multi-line case sets display, so it interacts with the autoLayout cluster on the same element.*
