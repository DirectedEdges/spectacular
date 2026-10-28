---
title: "Layout Positioning"
description: "How Figma constraints map to semantic positioning properties in the spec output"
---

Figma stores element position as raw `x`/`y` pixel coordinates plus a `constraints` object that describes how the element is anchored within its parent. Spectacular transforms these into semantic positioning properties that tell consumers *where* the element is anchored — not just the pixel offset.

## The Problem

A raw `x: 24` tells you nothing about intent. Is the element pinned 24 px from the left edge? From the right? Centered with a 24 px offset? Every platform consumer would need to re-derive anchor semantics from Figma constraints — duplicating logic that should be resolved once at the schema level.

## What It Does

Spectacular reads the Figma `constraints` object (one constraint per axis) and emits the appropriate directional property instead of raw `x`/`y`. The `position` property replaces Figma's `layoutPositioning`.

### Constraint → Property Mapping

| Figma Constraint | Horizontal | Vertical |
|-----------------|------------|----------|
| `MIN` | `start` | `top` |
| `MAX` | `end` | `bottom` |
| `CENTER` | `centerHorizontalOffset` | `centerVerticalOffset` |
| `STRETCH` | `start` + `end` | `top` + `bottom` |
| `SCALE` | `start` (as `"25%"`) | `top` (as `"25%"`) |

Only properties relevant to the node's constraints are emitted. A node with horizontal `MIN` and vertical `CENTER` produces `start`, `centerVerticalOffset`, and `position` — no other positioning fields.

## Examples

### MIN — Pinned to an Edge

A layer pinned to the top-left corner, 24 px from the left edge and 16 px from the top:

```yaml
# Figma
x: 24
y: 16
constraints: { horizontal: MIN, vertical: MIN }
layoutPositioning: ABSOLUTE

# Spec output
position: ABSOLUTE
start: 24
top: 16
```

The consumer knows immediately: this element is anchored to the inline-start and block-start edges.

### MAX — Pinned to the Opposite Edge

A close button pinned to the top-right corner, 12 px from the right edge and 12 px from the top:

```yaml
# Figma
x: 356    # computed from parent width
y: 12
constraints: { horizontal: MAX, vertical: MIN }
layoutPositioning: ABSOLUTE

# Spec output
position: ABSOLUTE
end: 12
top: 12
```

Figma stores `x` as the distance from the left, but the constraint says "pin to the right." Spectacular converts this to `end: 12` — the offset from the inline-end edge.

### CENTER — Offset from Center

A tooltip arrow centered horizontally with a slight vertical offset:

```yaml
# Figma
x: 148    # computed from parent center
y: -4
constraints: { horizontal: CENTER, vertical: CENTER }
layoutPositioning: ABSOLUTE

# Spec output
position: ABSOLUTE
centerHorizontalOffset: 0
centerVerticalOffset: -4
```

`centerHorizontalOffset: 0` means perfectly centered horizontally. `centerVerticalOffset: -4` means 4 px above center.

### STRETCH — Pinned to Both Edges

A divider that stretches the full width of its parent with 16 px insets:

```yaml
# Figma
x: 16
y: 200
constraints: { horizontal: STRETCH, vertical: MIN }
layoutPositioning: ABSOLUTE

# Spec output
position: ABSOLUTE
start: 16
end: 16
top: 200
```

Both `start` and `end` are emitted simultaneously — the element is anchored to both horizontal edges. This maps directly to CSS `left` + `right` or `inset-inline`.

### SCALE — Proportional Positioning

A watermark positioned at 25% from the left edge, scaling with the parent:

```yaml
# Figma
x: 100    # 25% of 400px parent
y: 0
constraints: { horizontal: SCALE, vertical: MIN }
layoutPositioning: ABSOLUTE

# Spec output
position: ABSOLUTE
start: "25%"
top: 0
```

SCALE values are emitted as percentage strings (e.g., `"25%"`) instead of pixel numbers, signaling proportional positioning. Consumers can distinguish percentage from pixel by checking the value type: `string` = percentage, `number` = pixels.

## Types

| Type | Values | Description |
|------|--------|-------------|
| `Position` | `'AUTO' \| 'ABSOLUTE'` | Whether the element participates in auto-layout or is absolutely positioned |
| `PositionOffset` | `number \| string \| null` | Pixel value, percentage string, or null. Not token-bindable |

Both types are narrower than `Style` — positional values are computed from Figma's layout engine and cannot be bound to tokens, props, or conditionals.

## Platform Usage

The semantic properties map directly to platform positioning APIs. Below are examples showing how a consumer might translate spec output into web CSS and iOS layout code.

### Web (CSS)

```css
/* MIN — start: 24, top: 16 */
.pinned-top-left {
  position: absolute;
  inset-inline-start: 24px;
  top: 16px;
}

/* MAX — end: 12, top: 12 */
.close-button {
  position: absolute;
  inset-inline-end: 12px;
  top: 12px;
}

/* CENTER — centerHorizontalOffset: 0, centerVerticalOffset: -4 */
.tooltip-arrow {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, calc(-50% - 4px));
}

/* STRETCH — start: 16, end: 16, top: 200 */
.divider {
  position: absolute;
  inset-inline-start: 16px;
  inset-inline-end: 16px;
  top: 200px;
}

/* SCALE — start: "25%", top: 0 */
.watermark {
  position: absolute;
  inset-inline-start: 25%;
  top: 0;
}
```

Key mapping: `start` → `inset-inline-start` (or `left` in LTR), `end` → `inset-inline-end` (or `right` in LTR), `top` → `top`, `bottom` → `bottom`. Center offsets require a `translate` transform from the 50% midpoint. Percentage strings from SCALE map directly to CSS percentage values.

### iOS (SwiftUI)

```swift
// MIN — start: 24, top: 16
ZStack(alignment: .topLeading) {
    parent
    child
        .padding(.leading, 24)
        .padding(.top, 16)
}

// MAX — end: 12, top: 12
ZStack(alignment: .topTrailing) {
    parent
    child
        .padding(.trailing, 12)
        .padding(.top, 12)
}

// CENTER — centerHorizontalOffset: 0, centerVerticalOffset: -4
ZStack {
    parent
    child
        .offset(x: 0, y: -4)
}

// STRETCH — start: 16, end: 16, top: 200
ZStack(alignment: .top) {
    parent
    child
        .padding(.horizontal, 16)
        .padding(.top, 200)
        .frame(maxWidth: .infinity)
}

// SCALE — start: "25%", top: 0
GeometryReader { geo in
    child
        .position(x: geo.size.width * 0.25, y: 0)
}
```

Key mapping: `start` → `.leading` padding, `end` → `.trailing` padding, `top` → `.top` padding, `bottom` → `.bottom` padding. Center offsets use `.offset(x:y:)` within a centered `ZStack`. Percentage strings from SCALE use `GeometryReader` to compute proportional positions.

## AUTO vs ABSOLUTE

The `position` property controls whether the element participates in its parent's auto-layout:

- `AUTO` — the element flows within auto-layout. Offset properties describe where the layout engine placed it
- `ABSOLUTE` — the element is removed from the layout flow and positioned relative to the parent frame's edges

```yaml
# Auto-layout child (flows in parent)
position: AUTO
start: 16
top: 8

# Absolutely positioned overlay
position: ABSOLUTE
end: 0
top: 0
```
