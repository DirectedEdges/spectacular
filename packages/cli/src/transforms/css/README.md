# `css/` — the stylesheet transformer

Four directories, each a stage of one pipeline. Nothing reads back up it.

| | What it answers | Depends on |
|---|---|---|
| `values/` | What is this spec *value* in CSS? A token reference, a length, a colour, a gradient, a per-side set. | nothing in `css/` |
| `style/` | What declarations does this spec *style key* produce? One module per property family, plus the layout mapping. | `values/` |
| `analysis/` | What does the spec say about its elements? Read once, before anything is emitted. | `style/` (for one predicate), `values/` |
| `sheet/` | How do declarations become a stylesheet? Selectors, the default block, the variants, the cursors. | all of the above |
| `rules/` | A workspace-specific rewrite of the structured data, applied before any mapping runs. | `CssRule.ts` |

`types.ts` holds the two shapes every stage needs — which element is the root,
and where images resolve from.

## Adding a file

Place it by what it answers, not what it is about. A helper that turns
`{ $token }` into `var(--x)` is a *value*; one that decides which selector a
state needs is a *sheet* concern, even though both mention tokens.

One rule: a module may import from a stage above it and never from one below.
`values/` knows nothing about selectors; `sheet/` may use anything.

## Outside css/

`states.ts` and `naming.ts` stay in `transforms/` — commands and the other
transformer use them, so they are not the stylesheet's to own. `Css.ts` itself
is the transformer and the order its parts run in; it is the file to open first.
