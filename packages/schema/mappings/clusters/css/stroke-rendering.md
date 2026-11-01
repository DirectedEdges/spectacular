# strokeRendering

bound · verified against an implementation

A cluster of the [CSS binding](../css.md). These keys resolve jointly — no
one of them determines any single output, so the rule below *is* the mapping.

**Keys.** `strokes`, `strokeAlign`, `strokeWeight`

## Operands

Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `self.strokes` | document |
| `self.strokeWeight` | document |
| `self.strokeAlign` | document |
| `context.isDefaultBlock` | emitter context |

## Derived predicates

| Name | Expression | Source |
|---|---|---|
| `derived.asOutline` | **not** `self.strokeWeight.form` = `perSideObject` **and** `self.strokeWeight.form` ≠ `tokenReference` | border.ts:51-53 — a per-side object becomes border-*, a scalar or token becomes outline-* |
| `derived.gradientStroke` | `self.strokes.form` = `gradient` | border.ts:73-113 |

## Cases

Ordered — first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `derived.gradientStroke` = `true` | *nothing* | a gradient stroke is painted by a separate pseudo-element rule, not a border or outline |
| 2 | `self.strokes` present **and** `derived.asOutline` = `false` | `border-color: <self.strokes>`<br>`border-style: solid` |  |
| 3 | `self.strokes` present **and** `derived.asOutline` = `true` | `outline-color: <self.strokes>`<br>`outline-style: solid` |  |
| 4 | `self.strokeWeight` present **and** `derived.asOutline` = `false` | `border-width: <per side>` |  |
| 5 | `self.strokeWeight` present **and** `derived.asOutline` = `true` **and** (`self.strokeAlign` = `OUTSIDE` **or** `self.strokeAlign` = `CENTER`) | `outline-width: <self.strokeWeight>` |  |
| 6 | `self.strokeWeight` present **and** `derived.asOutline` = `true` | `outline-width: <self.strokeWeight>`<br>`outline-offset: <negated self.strokeWeight>` |  |
| 7 | `context.isDefaultBlock` = `true` **and** `self.strokeWeight` absent | `border-width: 0 or outline-width: 0, matching whichever style was emitted` | a default block must reset a width it did not state |

## Otherwise

*Nothing is emitted.*

*css/style/border.ts:51-53, 73-167. strokeAlign contributes no declaration of its own — it only flips the outline-offset sign. `strokeDashPattern` is NOT consulted: see its own row.*
