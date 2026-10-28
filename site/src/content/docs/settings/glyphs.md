---
title: "glyphs"
description: "Conventions used to detect glyph content assets"
---

Conventions used to detect glyph content assets (e.g. icon glyphs). A library fact: every consumer reading the same library must declare the same conventions — a wrong or missing declaration leaves icon assets undetected, and absence means the library has no glyph convention and no detection is performed.

| | |
|---|---|
| **File** | `config/conventions/figma.yaml` |
| **Path** | `glyphs.match` and `glyphs.structure` |
| **Type** | block with `match` (string) and/or `structure` (object) — at least one |
| **Default** | absent (no glyph convention) |

## Options

A declared block carries at least one of two forms; a component matching either is a glyph:

| Form | Membership | Glyph name |
|------|------------|------------|
| `match` | component name matches the pattern | the `{i}` capture |
| `structure` | component's children match the declared structure | the component name (through `structure.name`) |

## Example

```yaml
# Name form — the library names its glyph components by a pattern
glyphs:
  match: 'DS Icon Glyph / {i}'
```

```yaml
# Structural form — glyph components are plainly named ("Cross", "Chevron down")
# but share a consistent child structure
glyphs:
  structure:
    fill: ['#161616']
    children:
      - type: VECTOR
        name: 'Vector'
```

## Result

When the pattern matches, the layer is typed as a `glyph` in the anatomy and its matched name is captured as the element's `content`. From the `DS Alert` output, the `decorativeIcon` glyph carries the resolved icon name:

```json
{
  "anatomy": {
    "decorativeIcon": { "type": "glyph" }
  },
  "default": {
    "elements": {
      "decorativeIcon": {
        "styles": {
          "width": 20,
          "height": 20,
          "fillColor": { "$token": "DS Color/Alert/Info/Element", "$type": "color" }
        },
        "content": "info"
      }
    }
  }
}
```

Without a `glyphs` block, the layer is treated as an ordinary element and no `content` glyph name is extracted.

## `match`

The pattern must include the `{i}` placeholder, which marks where the glyph name appears in the component name. Internally `{i}` becomes a `(.+)` capture group and the matched text is used as the glyph's `content` value. See [Icon Glyphs](/guides/glyph-name-pattern/) for the full pattern syntax.

## `structure`

Declares the child structure a glyph component has in this library, for libraries whose glyph components are plainly named (`Cross`, `Chevron down`) and carry no name pattern.

A glyph cannot have properties: a component declaring component properties — variants, text, swaps — is a configurable component, and the structural form never claims it. A component set and its variants are property-bearing by construction and are never structural glyphs.

| Member | Type | Meaning |
|--------|------|---------|
| `children` | list of node matchers | Required. A component is a glyph when every one of its children matches some entry — exhaustive: a component containing anything besides the declared shapes is not a glyph |
| `name` | string | Naming rule applied to the component name, using `{i}` (e.g. `'{i}Icon'`). Defaults to `'{i}'` — the whole component name is the glyph name |
| `fill` | list of strings | Accepted leaf fills: a raw color (`'#161616'`) or a token/variable/style name. When declared, every matched leaf of the component's **stored** structure must carry one of them; a placed instance is recolored by context, so the fill test is skipped on instance mirrors. Absent, fills are not tested |

Each node matcher carries a required `type` (Figma node type, e.g. `VECTOR`, `BOOLEAN_OPERATION`), an optional `name` (literal with `*` wildcard), and optional nested `children` with the same exhaustive semantics:

```yaml
# One level deeper: component → BOOLEAN_OPERATION → vectors
glyphs:
  structure:
    children:
      - type: BOOLEAN_OPERATION
        children:
          - type: VECTOR
            name: 'Glyph - *'
```

## Legacy name

In the pre-split `specs.config.yaml`, this option was the scalar `config.processing.glyphNamePattern`. That file is no longer read — [`specs migrate config`](/cli/commands/migrate/) converts it, moving that member to `figma.glyphs.match`.

## Further reading

- [Icon Glyphs guide](/guides/glyph-name-pattern/) for naming strategies and worked examples.
