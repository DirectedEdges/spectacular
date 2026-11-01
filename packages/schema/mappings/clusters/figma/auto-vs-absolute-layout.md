# autoVsAbsoluteLayout

bound · figma-to-spec · verified against an implementation

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
| 1 | `context.isRoot` present | `position` null<br>`all six offsets null` | a root has no parent bounds to be positioned within, and where a designer dragged it on the canvas is not part of its spec |
| 2 | `parent.layoutMode` ≠ `NONE` **and** `node.layoutPositioning` ≠ `ABSOLUTE` | `position` AUTO<br>`all six offsets null` | a flow-placed child's position comes from the parent's stack, so recording offsets would assert a placement it does not have |
| 3 | (`parent.layoutMode` = `NONE` **or** `node.layoutPositioning` = `ABSOLUTE`) | `layoutSizingHorizontal` and `layoutSizingVertical` null<br>`offsets per the per-axis table below`<br>`position` ABSOLUTE when `node.layoutPositioning` is ABSOLUTE or any offset was set, otherwise null | an element placed by coordinates rather than a parent's stack is absolutely positioned whatever Figma reports, because a regular frame has no stack to opt out of |

## Per-axis cases

Ordered — first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `node.constraints.axis` = `MIN` | the leading edge offset — `start` or `top` — set to the node position |  |
| 2 | `node.constraints.axis` = `MAX` | the trailing edge offset — `end` or `bottom` — set to parent dimension less node position less node dimension |  |
| 3 | `node.constraints.axis` = `CENTER` | `the matching centre offset, set to node position plus half the node dimension less half the parent dimension` |  |
| 4 | `node.constraints.axis` = `STRETCH` | `both edge offsets on the axis`<br>`the axis dimension suppressed` | a stretched node is defined by its edges, not its size |
| 5 | `node.constraints.axis` = `SCALE` | `both edge offsets on the axis, as percentage strings` |  |

## Related keys

Ordered — first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | (`self.layoutSizing` = `HUG` **or** `self.layoutSizing` = `FILL`) | the matching `width` or `height` nulled | a hugged or filled axis has no fixed dimension to record |
| 2 | `self.layoutSizing` = `FIXED` | the matching `width` or `height` present |  |
| 3 | `self.position` = `ABSOLUTE` | `layoutSizingHorizontal` and `layoutSizingVertical` nulled | an absolutely positioned child is not sized by the parent axis |

## Otherwise

*Nothing is emitted.* — a flow-placed child in auto-layout records no positioning offsets

**Stage.** `postEvaluate` — produced by a later pass, not read directly.

*Per axis. These keys are computed from constraints and geometry, never read from a single Figma property — a binding presenting them as direct reads misleads anyone implementing a second time. ADR-041 governs the constraint mapping.*
