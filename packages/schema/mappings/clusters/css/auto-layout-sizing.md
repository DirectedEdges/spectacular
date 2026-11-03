# autoLayoutSizing

bound · verified against an implementation

A cluster of the [CSS binding](../css.md). These keys resolve jointly — no
one of them determines any single output, so the rule below *is* the mapping.

**Keys.** `layoutSizingHorizontal`, `layoutSizingVertical`

## Operands

Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `self.layoutSizingHorizontal` | document |
| `self.layoutSizingVertical` | document |
| `self.clipsContent` | document |
| `self.maxLines` | document |
| `self.width` | document |
| `self.height` | document |
| `parent.layoutMode` | document (ancestor) |
| `parent.crossAxisAlignment` | document (ancestor) |
| `context.isInstance` | emitter context |
| `context.isDefaultBlock` | emitter context |

## Derived predicates

| Name | Expression | Source |
|---|---|---|
| `derived.mainHugs` | `context.isInstance` = `false` **and** `self.clipsContent` ≠ `true` **and** `self.maxLines` absent | layoutToCSS.ts:133-134 |
| `derived.crossStretches` | `context.isInstance` = `false` **and** (`parent.crossAxisAlignment` absent **or** `parent.crossAxisAlignment` = `STRETCH`) | layoutToCSS.ts:130-131 |

## Cases

Ordered — first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `self.layoutSizingHorizontal` = `HUG` **and** `parent.layoutMode` = `HORIZONTAL` **and** `derived.mainHugs` = `true` | *nothing* | the parent main axis already hugs |
| 2 | `self.layoutSizingHorizontal` = `HUG` | `width: fit-content` |  |
| 3 | `self.layoutSizingHorizontal` = `FILL` **and** `parent.layoutMode` = `HORIZONTAL` | `flex: 1 0 0` |  |
| 4 | `self.layoutSizingHorizontal` = `FILL` **and** `parent.layoutMode` = `VERTICAL` **and** `derived.crossStretches` = `true` | *nothing* | the parent stretches it across the cross axis already |
| 5 | `self.layoutSizingHorizontal` = `FILL` | `width: 100%` |  |
| 6 | `self.layoutSizingVertical` = `HUG` **and** `parent.layoutMode` = `VERTICAL` **and** `derived.mainHugs` = `true` | *nothing* |  |
| 7 | `self.layoutSizingVertical` = `HUG` | `height: fit-content` |  |
| 8 | `self.layoutSizingVertical` = `FILL` **and** `parent.layoutMode` = `VERTICAL` | `flex: 1 0 0` |  |
| 9 | `self.layoutSizingVertical` = `FILL` **and** `parent.layoutMode` = `HORIZONTAL` **and** `derived.crossStretches` = `true` | *nothing* |  |
| 10 | `self.layoutSizingVertical` = `FILL` | `height: 100%` |  |
| 11 | (`parent.layoutMode` = `HORIZONTAL` **or** `parent.layoutMode` = `VERTICAL`) **and** (`context.isDefaultBlock` = `true` **or** `self.layoutSizingHorizontal` present **or** `self.layoutSizingVertical` present **or** `self.width` present **or** `self.height` present) **and** `self.layoutSizingOnParentAxis` ≠ `FILL` | `flex-shrink: 0` | stated sizing on a flex child that is not FILL must not shrink |

## Otherwise

*Nothing is emitted.* — FIXED or absent contributes nothing from this cluster

*css/style/layoutToCSS.ts:130-179. Cases are ordered and the first match wins. `self.layoutSizingOnParentAxis` is the axis-selected key the source computes from parentLayoutMode.*
