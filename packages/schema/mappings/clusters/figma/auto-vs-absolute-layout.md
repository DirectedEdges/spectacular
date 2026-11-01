# autoVsAbsoluteLayout

bound · figma-to-spec · **asserted**, not mechanically checked

A cluster of the [Figma binding](../figma.md). These keys resolve jointly — no
one of them determines any single output, so the rule below *is* the mapping.

**Keys.** `position`, `top`, `bottom`, `start`, `end`, `centerHorizontalOffset`, `centerVerticalOffset`, `layoutSizingHorizontal`, `layoutSizingVertical`, `width`, `height`

## Operands

Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `node.constraints.horizontal` | Figma node |
| `node.constraints.vertical` | Figma node |
| `node.position` | Figma node geometry |
| `node.dimension` | Figma node geometry |
| `parent.dimension` | Figma parent geometry |
| `parent.layoutMode` | Figma parent |
| `self.layoutSizing` | the axis-matching sizing key |
| `context.isRoot` | capture context |

## Cases

Ordered — first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `node.constraints` = `MIN` | the leading edge offset — `start` or `top` — set to the node position |  |
| 2 | `node.constraints` = `MAX` | the trailing edge offset — `end` or `bottom` — set to parent dimension less node position less node dimension |  |
| 3 | `node.constraints` = `CENTER` | `the matching centre offset, set to node position plus half the node dimension less half the parent dimension` |  |
| 4 | `node.constraints` = `STRETCH` | `both edge offsets on the axis`<br>`the axis dimension suppressed` | a stretched node is defined by its edges, not its size |
| 5 | `node.constraints` = `SCALE` | `both edge offsets on the axis, as percentage strings` |  |

## Otherwise

*Nothing is emitted.* — a flow-placed child in auto-layout records no positioning offsets

**Stage.** `postEvaluate` — produced by a later pass, not read directly.

*Per axis. These keys are computed from constraints and geometry, never read from a single Figma property — a binding presenting them as direct reads misleads anyone implementing a second time. ADR-041 governs the constraint mapping.*
