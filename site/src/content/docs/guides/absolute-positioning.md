---
title: "Absolute Positioning"
description: "How Figma constraints convert to semantic offset properties, and how constraint changes surface across component variants"
---

## The Problem

### Figma as `constraints`

Figma stores every absolutely positioned element as a pair of raw coordinates — `x` and `y`, both measured from the parent frame's top-left corner — alongside a `constraints` object that records one constraint type per axis:

- `MIN` — pinned to the near edge (left or top)
- `MAX` — pinned to the far edge (right or bottom)
- `CENTER` — anchored to the midpoint, with an optional offset
- `STRETCH` — spans both edges simultaneously
- `SCALE` — positioned proportionally to the parent's size

The constraint describes the designer's intent, but `x` and `y` are always measured from the top-left regardless of which edge the element is anchored to.

### Code as sides and centers

Code platforms [position absolutely-placed elements](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Positioning) by naming the anchor edge and providing the distance from it — not by measuring from a fixed origin. Whether it's CSS logical properties (`inset-inline-start`, `inset-inline-end`), SwiftUI padding with alignment, or Compose modifiers, the model is consistent: name the edge, give the offset.

When a designer pins an element 12 px from the right edge, every platform wants `right: 12` (or its equivalent). Receiving `x: 356` from the left forces each consumer to independently re-derive the right-edge distance from the parent width — duplicating logic that should be resolved once.

---

## The Solution

Spectacular reads both the raw geometry and the `constraints` object, computes the correct edge-relative value, and emits a named property that matches what platforms expect. The constraint types map to `start`, `end`, `centerHorizontalOffset`, `width`, and their vertical equivalents. The vertical axis works identically to horizontal — `top` and `bottom` follow the same formulas as `start` and `end`. The five sections below cover the horizontal axis.

For the full design rationale, see [ADR-041](https://github.com/DirectedEdges/specs/blob/main/adr/041-layout-positioning.md).

### MIN to `start`

**Formula**

```
start = node.x
```

**Figma constraints property values**

```
x: 24
parent width: 400
constraints.horizontal: MIN
```

**Spec data**

```yaml
position: ABSOLUTE
start: 24
```

---

### MAX to `end`

Figma stores `x` as the distance from the left edge. For MAX constraints, Spectacular inverts this to produce the distance from the right edge.

**Formula**

```
end = parent.width - node.x - node.width
```

**Figma constraints property values**

```
x: 356
width: 32
parent width: 400
constraints.horizontal: MAX
```

**Spec data**

```yaml
position: ABSOLUTE
end: 12    # 400 − 356 − 32 = 12
```

---

### STRETCH to `start`, `end`

STRETCH anchors both edges simultaneously, so both `start` and `end` are emitted. With two edges defining the element's span, an explicit `width` would conflict — `width` is set to `null`.

**Formula**

```
start = node.x
end   = parent.width - node.x - node.width
```

**Figma constraints property values**

```
x: 16
width: 368
parent width: 400
constraints.horizontal: STRETCH
```

**Spec data**

```yaml
position: ABSOLUTE
start: 16
end: 16      # 400 − 16 − 368 = 16
width: null
```

---

### CENTER to offsets

CENTER anchors to the midpoint. A value of `0` means perfectly centered; positive values shift toward the end edge, negative toward the start edge.

**Formula**

```
centerHorizontalOffset = node.x + (node.width / 2) − (parent.width / 2)
```

**Figma constraints property values**

```
x: 200
width: 24
parent width: 400
constraints.horizontal: CENTER
```

**Spec data**

```yaml
position: ABSOLUTE
centerHorizontalOffset: 12    # 200 + 12 − 200 = 12 (shifted 12px right of center)
```

---

### SCALE to `start`, `end` as percentages

SCALE positions the element proportionally to its parent. Both `start` and `end` are emitted as percentage strings. Like STRETCH, `width` is set to `null` — a fixed pixel width would contradict the proportional intent. A `string` value always signals a percentage; a `number` always signals pixels.

**Formula**

```
start% = (node.x / parent.width) × 100
end%   = ((parent.width − node.x − node.width) / parent.width) × 100
```

Percentages are formatted with up to two decimal places, trailing zeros removed: `"16.67%"`, `"8.5%"`, `"25%"`.

**Figma constraints property values**

```
x: 100
width: 200
parent width: 400
constraints.horizontal: SCALE
```

**Spec data**

```yaml
position: ABSOLUTE
start: "25%"    # 100 / 400 × 100
end: "25%"      # (400 − 100 − 200) / 400 × 100
width: null
```

---

## Variant-by-variant differences

Spectacular emits all positioning properties on every variant — active keys carry their computed value, inactive keys carry `null`. This ensures [variant layering](/guides/variant-layering) can detect any constraint change between variants: a key that's absent can't be compared.

### Constraint type change: MIN → STRETCH

When a horizontal constraint changes from `MIN` to `STRETCH`, `end` moves from `null` to a value and `width` becomes `null`:

```yaml
# Default variant — MIN
position: ABSOLUTE
start: 16
end: null
width: 80

# Variant "size: fullWidth" — STRETCH (layered diff only)
start: 16
end: 16
width: null
```

Both transitions — `end` gaining a value, `width` becoming `null` — are explicit in the diff. A consumer merging these layers arrives at a correct final state with no ambiguity.

### Position mode change: ABSOLUTE → AUTO

When a variant switches an element from absolutely positioned to participating in auto-layout, `position` changes and all offset keys are nulled:

```yaml
# Default variant — ABSOLUTE
position: ABSOLUTE
start: 16
end: null
layoutSizingHorizontal: null

# Variant "layout: auto" — AUTO (layered diff only)
position: AUTO
start: null
layoutSizingHorizontal: FILL
```

`start` drops to `null` because an AUTO child's placement is controlled by the layout engine. `layoutSizingHorizontal` appears to describe how the engine should size the element. A reverse transition from AUTO back to ABSOLUTE produces the mirror diff — offsets restored, `layoutSizingHorizontal` nulled.
