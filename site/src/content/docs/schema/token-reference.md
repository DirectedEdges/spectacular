---
title: "TokenReference"
description: "Design token reference following the DTCG format"
---

A reference to a design token, following the [Design Tokens Community Group](https://design-tokens.github.io/community-group/format/) (DTCG) format. Token references appear wherever a style value can be a token instead of a literal.

```ts
interface TokenReference {
  $token: string;
  $type: string;
  $extensions?: object;
}
```

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `$token` | `string` | Yes | Dot-separated token path |
| `$type` | `string` | Yes | Token type |
| `$extensions` | `object` | No | Vendor extensions |

### `$token`

The dot-separated path to the token, e.g. `"DS Color.Text.Primary"` or `"DS.Space.400"`.

### `$type`

One of: `color`, `dimension`, `string`, `number`, `boolean`, `shadow`, `gradient`, `typography`, `effects`.

### `$extensions`

Optional vendor-specific metadata. The `com.figma` extension includes:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Figma variable ID |
| `name` | `string` | Figma variable name |
| `collectionName` | `string` | Variable collection name |
| `rawValue` | `string \| number \| boolean` | Resolved raw value |

## Examples

### Color

Color variables bound to fills, strokes, or text color:

```yaml
backgroundColor:
  $token: DS Color.Surface.Primary
  $type: color
  $extensions:
    com.figma:
      id: VariableID:123:456
      name: Surface/Primary
      collectionName: DS Color
      rawValue: "#FFFFFF"
```

### Dimension

Numeric variables bound to spacing, sizing, padding, corner radius, or stroke weight:

```yaml
paddingStart:
  $token: DS Spacing.Space.400
  $type: dimension
  $extensions:
    com.figma:
      id: VariableID:200:10
      name: Space/400
      collectionName: DS Spacing
      rawValue: 16
```

### Typography (text style)

Named text styles produce a typography token. These reference the style as a whole rather than individual properties:

```yaml
typography:
  $token: Heading.H1
  $type: typography
  $extensions:
    com.figma:
      id: S:abc123
      name: Heading/H1
```

### Effects (effect style)

Named effect styles (shadows, blurs) produce an effects token:

```yaml
effects:
  $token: Elevation.Card
  $type: effects
  $extensions:
    com.figma:
      id: S:def456
      name: Elevation/Card
```

### Boolean

Boolean-typed variables:

```yaml
visible:
  $token: Feature.ShowBadge
  $type: boolean
  $extensions:
    com.figma:
      id: VariableID:300:1
      name: Feature/ShowBadge
      rawValue: true
```

## Further Reading

- [ADR 006 — Unified Token Reference Type](https://github.com/DirectedEdges/specs/blob/main/adr/006-token-references.md) — introduces the DTCG-aligned `TokenReference` type
- [ADR 007 — Consolidate Token Format Configuration](https://github.com/DirectedEdges/specs/blob/main/adr/007-token-reference-config.md) — introduces the token output option now carried as `settings.spec.tokens`
