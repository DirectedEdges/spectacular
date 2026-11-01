# absolutePositioning

bound · verified against an implementation

A cluster of the [CSS binding](../css.md). These keys resolve jointly — no
one of them determines any single output, so the rule below *is* the mapping.

**Keys.** `position`, `top`, `bottom`, `start`, `end`, `centerHorizontalOffset`, `centerVerticalOffset`

## Operands

Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `self.position` | document |
| `self.top` | document |
| `self.bottom` | document |
| `self.start` | document |
| `self.end` | document |
| `self.centerHorizontalOffset` | document |
| `self.centerVerticalOffset` | document |
| `parent.layoutMode` | document (ancestor) |
| `context.isRoot` | emitter context |

## Derived predicates

| Name | Expression | Source |
|---|---|---|
| `derived.hasInsets` | (`self.top` present **or** `self.bottom` present **or** `self.start` present **or** `self.end` present) | position.ts:4-9 |
| `derived.parentAutoLayout` | (`parent.layoutMode` = `HORIZONTAL` **or** `parent.layoutMode` = `VERTICAL`) | position.ts:18-27 (parentAutoLayout argument) |
| `derived.nonZeroInset` | (`self.top` present **and** `self.top` ≠ `0` **or** `self.bottom` present **and** `self.bottom` ≠ `0` **or** `self.start` present **and** `self.start` ≠ `0` **or** `self.end` present **and** `self.end` ≠ `0`) | position.ts:24 |
| `derived.opposingAnchors` | (`self.top` present **and** `self.bottom` present **or** `self.start` present **and** `self.end` present) | position.ts:25 |

## Cases

Ordered — first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `self.position` = `ABSOLUTE` | `position: absolute` | an explicit position wins outright |
| 2 | `self.position` = `AUTO` | `position: static` |  |
| 3 | `self.position` absent **and** `context.isRoot` = `true` | *nothing* | a root never infers absolute |
| 4 | `self.position` absent **and** `derived.hasInsets` = `false` | *nothing* | no coordinates, nothing to infer from |
| 5 | `self.position` absent **and** `derived.parentAutoLayout` = `false` | `position: absolute` | outside auto-layout, any coordinate is meaningful |
| 6 | `self.position` absent **and** (`derived.nonZeroInset` = `true` **or** `derived.opposingAnchors` = `true`) | `position: absolute` | inside auto-layout only a meaningful coordinate implies absolute |
| 7 | `self.position` absent | *nothing* | a zero-only single anchor inside auto-layout is canvas noise |

## Offset cases

Ordered — first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `self.top` present | `inset-block-start: <self.top>` |  |
| 2 | `self.bottom` present | `inset-block-end: <self.bottom>` |  |
| 3 | `self.start` present | `inset-inline-start: <self.start>` |  |
| 4 | `self.end` present | `inset-inline-end: <self.end>` |  |
| 5 | `self.centerVerticalOffset` present **and** `derived.verticalAnchored` = `false` | `inset-block-start: <self.centerVerticalOffset>` | an edge anchor on the same axis wins; both would put two values on one property |
| 6 | `self.centerHorizontalOffset` present **and** `derived.horizontalAnchored` = `false` | `inset-inline-start: <self.centerHorizontalOffset>` |  |
| 7 | (`derived.verticalCentred` = `true` **or** `derived.horizontalCentred` = `true`) | `translate: <-50% on each centred axis, 0 on the other>` |  |

*css/style/position.ts:4-27 (hasInsets, impliesAbsolute), 42-59, 84-107 (centerDecls). `cases` decides the position property; `insetCases` decides the offsets. verticalAnchored/horizontalAnchored are presence of top|bottom and start|end respectively.*
