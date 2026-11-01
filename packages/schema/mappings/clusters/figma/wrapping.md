# wrapping

bound · figma-to-spec · **asserted**, not mechanically checked

A cluster of the [Figma binding](../figma.md). These keys resolve jointly — no
one of them determines any single output, so the rule below *is* the mapping.

**Keys.** `wrap`, `wrapAlignment`, `itemSpacing`, `layoutMode`

## Operands

Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `node.layoutMode` | Figma node |
| `node.layoutWrap` | Figma node |
| `node.itemSpacing` | Figma node |
| `node.counterAxisSpacing` | Figma node |

## Cases

Ordered — first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | (`node.layoutMode` absent **or** `node.layoutMode` = `NONE`) | `wrap` false<br>`mainAxisAlignment` null<br>`crossAxisAlignment` null<br>`wrapAlignment` null | none of them mean anything without auto-layout |
| 2 | `node.layoutWrap` ≠ `WRAP` | `wrapAlignment` removed entirely | a dead property otherwise — removed, not nulled |
| 3 | (`node.layoutMode` = `HORIZONTAL` **or** `node.layoutMode` = `VERTICAL`) **and** `node.layoutWrap` = `WRAP` | `itemSpacing` as a biaxial composite, mapping the Figma primary and counter axes onto absolute horizontal and vertical |  |
| 4 | `node.itemSpacing` present | `itemSpacing` as a scalar |  |

## Otherwise

*Nothing is emitted.*

**Stage.** `postEvaluate` — produced by a later pass, not read directly.

*A property that cannot apply is removed rather than recorded as null, so a reader never sees a dead key.*
