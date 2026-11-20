<!--
  Reference shipped beside specs-cli.authoring.primer — not an invokable skill.
  Canonical; `specs skills install` overwrites it on every refresh.
-->

# Reference: layout trees, nesting, and arrangement

Load with the **variants pack**, when `variants.yaml` begins. Assumes `specs-cli.authoring.primer` is read; style property details are in `references/styles.md` beside this file.

This reference covers how elements are arranged — the tree that holds them, how flow and pinning are decided, and how arrangement works once the tree runs through instances and slot fills. Judgment about which to reach for is in `rules/layoutStyling.yaml` and `rules/anatomy.yaml`; where this file and those seem to overlap, the rules files govern.

**A note on the word.** In Specs, *composition* names a kind of spec — a folder under `specs/compositions/`. The act of arranging and nesting elements is layout, and it is this file. Nothing below is specific to composition specs; it applies the same inside a single component.

## The layout tree

A layout is an array of `LayoutNode` starting at the root. A leaf is an element name as a plain string; a parent is an object whose one key is the element name and whose value is the array of its children.

```yaml
layout:
  - root:
      - label
      - notch
```

What the validator enforces:

- Every name in the tree is declared in the anatomy that tree belongs to — the component's for `default` and `variants`, the triplet's own for a slot content entry.
- There is one tree per variant block. A variant carrying `layout` replaces the structure wholesale for that configuration; a variant without one inherits the default's.

## Flow and pinning are two decisions on two elements

**The container decides flow.** `layoutMode: HORIZONTAL | VERTICAL` makes a container auto-layout: children flow along the main axis, spaced by `itemSpacing`, aligned by `mainAxisAlignment` / `crossAxisAlignment`, padded by `padding`. `layoutMode: NONE` makes a plain container whose children sit where their coordinates put them.

**The child decides participation.** Inside an auto-layout container, a child with `position: ABSOLUTE` leaves the flow and pins itself with offsets — `top`, `start`, `end`, `bottom`, `centerHorizontalOffset`, `centerVerticalOffset`. `position: AUTO`, the default, stays in flow.

Which properties each intent touches, and on which element:

| Intent | Container carries | Child carries |
|---|---|---|
| Items in a row or column with consistent gaps | `layoutMode`, `itemSpacing`, `padding`, the alignments | nothing positional |
| One child pinned over or outside the flow | `layoutMode` unchanged | `position: ABSOLUTE` plus offsets |
| Freeform placement | `layoutMode: NONE` | explicit coordinates on every child |

`rules/layoutStyling.yaml` carries the judgment: which offsets pair, what a placement variant swaps, when a negative offset and `clipsContent: false` are the answer.

## Sizing vocabulary

| Property | Takes | Opens |
|---|---|---|
| `layoutSizingHorizontal` / `layoutSizingVertical` | `FILL`, `HUG`, `FIXED` | `width`/`height` under `FIXED`; `min`/`max` bounds under any mode |
| `width` / `height` | a number | — |
| `minWidth` / `maxWidth` / `minHeight` / `maxHeight` | a number | — |

Bounds are legal under **any** sizing mode — hug-with-a-floor and fill-with-a-ceiling included. Which to prefer, what `FILL` means at a rendered root, and how `width` interacts with a declared sizing mode are all in `rules/styles.yaml` and `rules/layoutStyling.yaml`.

## Arrangement through a hierarchy

A tree gets deeper three ways, and they are not interchangeable:

| Depth arrives as | Written as | Whose layout governs the inside |
|---|---|---|
| This spec's own nesting | a parent key in the layout tree | this spec's layout tree |
| An instance of another component | an `instance` element with `instanceOf` | **that component's own spec** |
| A slot's fill | a `slotContentExamples` triplet, or a nested child in the default slot | **the triplet's own layout tree** |

**Layout authority stops at an instance boundary.** A parent cannot arrange the inside of an instance. It has exactly two levers:

- `propConfigurations` on the instance element — set the instance's own props, including its slot props.
- Filling the instance's slots — a `$slotContent` pointer for a named slot, or nested children for its default slot.

This is what makes deep arrangement work without any spec reaching into another. A card holds a header instance; the header's internal gaps belong to the header's spec; the card decides only what the header is configured with and what goes in its slots. A fill can itself hold instances that have slots, and the same rule applies at each level.

Two consequences worth knowing before authoring a deep tree:

- A slot-bearing element's height belongs to whatever fills it, which is why its vertical sizing is not a free choice — `rules/slots.yaml · layout`.
- A component fill discards the slot's `contentStyles`, so formatting a slot declares cannot survive promotion to a component. The schema states it at `Element.contentStyles`; the judgment is `rules/anatomy.yaml · type`.

## Where to go deeper

| Question | Goes to |
|---|---|
| What does this property accept, and what do its options mean? | `styles.schema.json` and the schema's property descriptions |
| Which element type should carry this, and when is a container the answer? | `rules/anatomy.yaml` |
| Auto against absolute, offsets, placement variants | `rules/layoutStyling.yaml` |
| The style property map and token placement | `references/styles.md` |
| How a slot is declared, bound, and filled | `references/slots.md` |
