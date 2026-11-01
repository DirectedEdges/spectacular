# namedStyleVersusInline

bound · figma-to-spec · **asserted**, not mechanically checked

A cluster of the [Figma binding](../figma.md). These keys resolve jointly — no
one of them determines any single output, so the rule below *is* the mapping.

**Keys.** `typography`

## Operands

Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `node.textStyleId` | Figma node |
| `baseline.typography` | the unvaried baseline for this element |

## Cases

Ordered — first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `node.textStyleId` present | `a style reference`<br>`typography` removed | the named style is the source; resolved values beside it would be a second copy |
| 2 | `node.textStyleId` absent **and** `self.typography` absent **and** `baseline.typography` present | `typography` re-injected from the baseline | a variant diff dropped it, but with no named style the values are the only record |
| 3 | `node.textStyleId` absent | `typography` as resolved values |  |

## Otherwise

*Nothing is emitted.*

**Stage.** `postProcess` — produced by a later pass, not read directly.

*A named text style and inline typography are mutually exclusive in a document: one is a reference, the other is the resolved values. Typography sub-fields are additionally compared against their own defaults, a second and distinct default source from the style keys.*
