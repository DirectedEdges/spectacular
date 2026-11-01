# autoLayout

bound · verified against an implementation

A cluster of the [CSS binding](../css.md). These keys resolve jointly — no
one of them determines any single output, so the rule below *is* the mapping.

**Keys.** `layoutMode`, `mainAxisAlignment`, `crossAxisAlignment`, `wrap`, `wrapAlignment`, `itemSpacing`

## Operands

Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `self.layoutMode` | document |
| `self.mainAxisAlignment` | document |
| `self.crossAxisAlignment` | document |
| `self.wrap` | document |
| `self.wrapAlignment` | document |
| `self.itemSpacing` | document |

## Cases

Ordered — first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | (`self.layoutMode` absent **or** `self.layoutMode` = `NONE`) | *nothing* | without a layout mode the whole cluster is inert; the element stays in flow |
| 2 | `self.layoutMode` = `HORIZONTAL` | `display: flex`<br>`flex-direction: row` |  |
| 3 | `self.layoutMode` = `VERTICAL` | `display: flex`<br>`flex-direction: column` |  |

## Member cases

Ordered — first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `self.mainAxisAlignment` present | `justify-content: <mapped>` |  |
| 2 | `self.crossAxisAlignment` present | `align-items: <mapped>` |  |
| 3 | `self.wrap` = `true` | `flex-wrap: wrap` |  |
| 4 | `self.wrap` = `false` | `flex-wrap: nowrap` |  |
| 5 | `self.wrapAlignment` present | `align-content: <mapped>` |  |
| 6 | `self.itemSpacing` present **and** `self.itemSpacing.sign` = `nonNegative` | `gap: <self.itemSpacing>` |  |
| 7 | `self.itemSpacing` present **and** `self.itemSpacing.sign` = `negative` | NOT on this element — a negative margin on `<selector> > * + *`, emitted by elementRules | gap does not accept negative values; overlap is a sibling margin |

*css/style/layoutToCSS.ts:39-96; css/sheet/elementRules.ts:254-268. `cases` decides display and direction; `memberCases` apply only when a case above emitted a display.*
