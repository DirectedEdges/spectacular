---
title: "slotGrid"
description: "Layer name declaring that a slot lays its content out as a grid"
---

Figma will not apply grid layout to a slot frame. Under **Layout → Flow**, Grid is greyed out for a slot, so a designer who wants a slot whose items arrange as a grid has one move available: nest a grid frame inside the slot. The spec has no such restriction — a slot can carry `layoutMode: GRID` directly. This convention names that nested frame, so the grid it holds is recorded as the slot's own layout rather than as something sitting in the slot.

A library fact: every consumer reading the same library must declare the same layer name — a wrong one leaves the frame as ordinary slot content, and absence means the library has no such convention and no collapse is performed.

| | |
|---|---|
| **File** | `config/conventions/figma.yaml` |
| **Path** | `slotGrid.match` |
| **Type** | block with a single `match` string — a literal layer name |
| **Default** | absent (no such convention) |

## Example

```yaml
slotGrid:
  match: 'Slot grid'
```

## Result

The named frame carries the layout, not the content. The slot takes its grid, and the frame's own children become the slot's default content — read through the frame rather than treated as sitting inside it.

Given this in Figma:

```
TEST SLOT 1          (component)
└─ Slot              (slot frame, no grid allowed here)
   └─ Slot grid      (frame, grid layout, 5 columns, 20px gaps)
      └─ ten cards   (the slot's default content)
```

The spec records the slot carrying the grid, and the cards as its content:

```yaml
elements:
  root:
    children:
      $binding: '#/props/slot'
      examples:
        - $slotContent: '#/components/testSlot1/slotContentExamples/testSlot1__slot__default'
    styles:
      layoutMode: GRID
      gridColumns: 5
      itemSpacing:
        horizontal: 20
        vertical: 20
```

The declaration frame itself is gone — its layout moved to the slot — so the content entry holds the ten cards directly, and a consumer composing items into that slot gets grid cells.

## Only-child rule

The frame must be the slot's **only** child. A slot holding it alongside anything else is holding content, not declaring a layout, so nothing is folded and the frame stays an ordinary element inside the slot.

That is what makes the fold safe to key on a name: the name says which frame is a declaration, and the only-child condition says the designer meant the slot itself to be the grid rather than to put a grid in it.

## Collapse order

This collapse runs first, and what it leaves behind decides whether a second one follows.

Above, it leaves a root wrapping one slot — the shape [collapsePrimitiveWrapper](/settings/collapse-primitive-wrapper/) removes — so the two run in sequence and the component lands as one container.

That second collapse depends on the rest of the chain being empty. A hierarchy of `root > anotherFrame > slot > Slot grid` still records the grid on the slot, but `anotherFrame` disqualifies the wrapper collapse, so the spec keeps its root, its intermediate container, and the slot that carries the grid.

## Omissions

Two things on the declaration frame are dropped. Its children are not among them — they become the slot's content.

- **Per-track sizing.** A declaration frame with individually sized rows or columns records only its column count, as [every grid does](/schema/styles/grid-columns/).
- **Its own box and surface styles.** A frame that exists to hold a layout normally has none. A designer who puts padding or a background on it loses them.
