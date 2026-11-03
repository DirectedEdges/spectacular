# namedStyleVersusInline

bound · figma-to-spec · verified against an implementation

A cluster of the [Figma binding](../figma.md). These keys resolve jointly — no
one of them determines any single output, so the rule below *is* the mapping.

**Keys.** `typography`

## Operands

Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `self.textStyleEntry` | whether a text-style entry was captured at all, which is not the same as its value |
| `node.textStyleId` | Figma node — an empty string counts as no style, the same as null |
| `baseline.typography` | the unvaried baseline for this element |

## Cases

Ordered — first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `self.textStyleEntry` absent | *nothing* | no text-style entry was captured for this node at all, so the pass has nothing to choose between and leaves `typography` as it found it. Distinct from an entry captured with an empty value, below |
| 2 | `node.textStyleId` present | `a style reference`<br>`typography` removed | the named style is the source; resolved values beside it would be a second copy |
| 3 | `node.textStyleId` absent **and** `self.typography` absent **and** `baseline.typography` present | `typography` re-injected from the baseline | a variant diff dropped it, but with no named style the values are the only record |
| 4 | `node.textStyleId` absent | `typography` as resolved values |  |

## Otherwise

*Nothing is emitted.*

**Stage.** `postProcess` — produced by a later pass, not read directly.

*A named text style and inline typography are mutually exclusive in a document: one is a reference, the other is the resolved values. Typography sub-fields are additionally compared against their own defaults, a second and distinct default source from the style keys.*
