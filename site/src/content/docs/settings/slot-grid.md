---
title: "slotGrid"
description: "Layer name declaring that a slot lays its content out as a grid"
---

Layer name declaring that a slot lays its content out as a grid. A library fact: every consumer reading the same library must declare the same layer name — a wrong one leaves the frame as ordinary slot content, and absence means the library has no such convention and no collapse is performed.

| | |
|---|---|
| **File** | `config/conventions/figma.yaml` |
| **Path** | `slotGrid.match` |
| **Type** | block with a single `match` string — a literal layer name |
| **Default** | absent (no such convention) |

## Why it exists

Figma will not apply grid layout to a slot frame. Under **Layout → Flow**, Grid is greyed out for a slot, so a designer who wants a slot whose items arrange as a grid has only one move available: put a grid frame inside the slot.

The spec has no such restriction. A slot can carry `layoutMode: GRID` directly. This convention is what lets the two forms meet — it names the frame that exists only because Figma required it, so the capture can read the grid onto the slot and the render can put the frame back.

## Example

```yaml
slotGrid:
  match: 'Slot grid'
```

## Result

The named frame is a **declaration, not content**. The slot takes its grid layout, and the frame's children are a preview of that layout rather than a fill of the slot — so the slot reads empty.

Given this in Figma:

```
TEST SLOT 1          (component)
└─ Slot              (slot frame, no grid allowed here)
   └─ Slot grid      (frame, grid layout, 5 columns, 20px gaps)
      └─ ten cards   (a preview of the layout)
```

The spec records one container carrying the grid, with an empty default slot:

```yaml
elements:
  root:
    children:
      $binding: '#/props/slot'
    styles:
      layoutMode: GRID
      gridColumns: 5
      itemSpacing:
        horizontal: 20
        vertical: 20
```

A consumer composing items into that slot gets grid cells, with nothing from the preview to override.

## Two collapses, in order

A grid slot passes through two collapse rules, and the first is what enables the second.

| Order | Rule | Effect |
|---|---|---|
| 1 | This convention | `Slot grid` collapses onto `Slot`; the slot becomes a grid and reads empty |
| 2 | [collapsePrimitiveWrapper](/settings/collapse-primitive-wrapper/) | What remains is a root wrapping one slot — the exact shape that rule removes, so it collapses again |

The order matters. Reversed, the wrapper collapse runs first and meets a root wrapping a slot that still holds a frame, which is not the shape it removes — so the wrapper survives into the spec.

## What is not carried

Three things on the declaration frame are dropped.

- **Its children.** They are the preview. Keeping them would make the component's contract depend on whatever was illustrated in it.
- **Per-track sizing.** A declaration frame with individually sized rows or columns records only its column count, as [every grid does](/schema/styles/grid-columns/).
- **Its own box and surface styles.** A frame that exists to hold a layout normally has none. A designer who puts padding or a background on it loses them.

## Rendering back to Figma

The render direction reverses the collapse: a slot carrying `layoutMode: GRID` is written as a slot frame containing one frame named by this convention, with the grid properties on that frame. Nothing extra is recorded to make this work — a grid on a slot host is impossible in Figma, so the split is implied by the spec rather than stored in it.
