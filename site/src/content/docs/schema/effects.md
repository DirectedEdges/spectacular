---
title: "Effects"
description: "Shadows and blur effects"
---

An `Effects` object holds shadow and blur definitions. It appears on the `effects` style property as an alternative to a [`TokenReference`](/schema/token-reference/).

```ts
interface Effects {
  shadows?: Shadow[];
  layerBlur?: Blur;
  backgroundBlur?: Blur;
}
```

## Properties

| Name | Category | Description | Default |
|------|----------|-------------|---------|
| [`shadows`](/schema/effects/shadows/) | shadow | Array of drop and inner shadow definitions | absent (no shadows) |
| [`layerBlur`](/schema/effects/layer-blur/) | blur | Layer blur (`filter: blur()`) | absent (no blur) |
| [`backgroundBlur`](/schema/effects/background-blur/) | blur | Background blur (`backdrop-filter: blur()`) | absent (no blur) |

## Values

| Name | Description | Example |
|------|-------------|---------|
| `Shadow` | A single shadow definition | `{ visible: true, offsetX: 0, offsetY: 2, blur: 4, spread: 0, color: "#00000040" }` |
| `Blur` | A blur definition | `{ visible: true, radius: 8 }` |

### Shadow

Defaults below are the evaluator's field defaults before a Figma shadow effect is read — see [`Shadow`](https://github.com/DirectedEdges/specs-from-figma/blob/main/packages/specs-from-figma/src/Component/Effects/Shadow.ts) in specs-from-figma.

| Property | Type | Required | Description | Default |
|----------|------|----------|-------------|---------|
| `visible` | `boolean` | Yes | Whether the shadow is active | `true` |
| `inset` | `boolean` | No | `true` for inner shadow; absent or `false` for drop shadow | absent (drop shadow) |
| `offsetX` | `number \| TokenReference` | Yes | Horizontal offset | `0` |
| `offsetY` | `number \| TokenReference` | Yes | Vertical offset | `0` |
| `blur` | `number \| TokenReference` | Yes | Blur radius | `0` |
| `spread` | `number \| TokenReference` | Yes | Spread distance | `0` |
| `color` | `string \| TokenReference` | Yes | Shadow color (`#RRGGBBAA` or [token](/schema/token-reference/)) | transparent black (`#00000000`) |

### Blur

Defaults below are the evaluator's field defaults before a Figma blur effect is read — see [`Blur`](https://github.com/DirectedEdges/specs-from-figma/blob/main/packages/specs-from-figma/src/Component/Effects/Blur.ts) in specs-from-figma.

| Property | Type | Required | Description | Default |
|----------|------|----------|-------------|---------|
| `visible` | `boolean` | Yes | Whether the blur is active | `true` |
| `radius` | `number \| TokenReference` | Yes | Blur radius | `0` |

## Example

```yaml
shadows:
  - visible: true
    offsetX: 0
    offsetY: 4
    blur: 8
    spread: 0
    color:
      $token: DS Color.Shadow.Default
      $type: color
  - visible: true
    inset: true
    offsetX: 0
    offsetY: 1
    blur: 0
    spread: 1
    color: "#0000001A"
backgroundBlur:
  visible: true
  radius: 12
```

## Further Reading

- [ADR 002 — Replace effectStyleId with effects](https://github.com/DirectedEdges/specs/blob/main/adr/002-effects-shadows-blurs.md) — introduces the grouped `Effects`, `Shadow`, and `Blur` types
