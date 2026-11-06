---
title: "color"
description: "Control how color values are formatted in the spec output"
---

Controls how color values are serialized wherever a `Color` appears in spec output — including solid fill and stroke styles, text color, shadow color, and gradient stops. By default, colors are emitted as compact hex strings, but you can switch to any CSS functional notation, Figma's native HSB model, or a fully structured object that preserves the original color space without lossy conversion.

| | |
|---|---|
| **File** | `config/settings.yaml` |
| **Path** | `spec.color` |
| **Type** | enum |
| **Default** | `HEXA` |

## Options

| Value | Description |
|---|---|
| `HEX` | 6-digit hex string, like `#FF6600`. Discards alpha, so a translucent color reads as opaque |
| `HEXA` | 8-digit hex string with alpha, like `#FF6600FF`. Default — the most compact form that survives a round trip |
| `RGB` | CSS `rgb()` functional notation, like `rgb(255, 102, 0)` |
| `RGBA` | CSS `rgba()` functional notation with alpha, like `rgba(255, 102, 0, 1)`. This is what Figma labels "CSS" in its colour picker |
| `HSLA` | CSS `hsla()` functional notation, like `hsla(24, 100%, 50%, 1)` |
| `HSB` | Figma's native colour model, also known as HSV, like `hsb(24, 100%, 100%)`. Not a CSS function |
| `OKLCH` | CSS Color Level 4 perceptually uniform cylindrical model, like `oklch(0.7 0.15 50 / 1)` |
| `OKLAB` | CSS Color Level 4 perceptually uniform rectangular model, like `oklab(0.7 0.1 0.1 / 1)` |
| `OBJECT` | Full `ColorObject` with `colorSpace`, `components`, `alpha`, and optional `hex`. Preserves colour space fidelity with no lossy conversion |

## Example

```yaml
spec:
  color: HEXA  # Default — 8-digit hex strings carrying alpha
```

## Scope

This is a formatting concern only — it doesn't affect which colors are extracted or how they're resolved from Figma. Token-bound colors are unaffected; `spec.color` applies to literal, unbound color values.

## Further reading

- [Settings schema reference](/schema/settings/) for full settings documentation.
