---
title: "Glyph Name Pattern"
description: "Detect icon glyph instances and classify them as content elements instead of generic instances"
---

Design system components frequently contain icon instances — a `Button` with a leading icon, an `Alert` with a status icon, a `MenuItem` with an action icon. In Figma, these icons are component instances just like any other nested component. Without special handling, they appear as generic `instance` elements with an `instanceOf` reference to the full icon component. The `glyphs` convention tells the processing engine how to recognize these icon instances and reclassify them as lightweight `glyph` elements with a human-readable content name.

## The Problem

Consider a `Button` component containing an instance of `DS Icon Glyph / Check`. Without glyph detection, the spec output treats it as a generic instance:

```yaml
elements:
  icon:
    type: instance
    instanceOf: DS Icon Glyph / Check
    styles:
      width: 20
      height: 20
      fillColor: "#1A1A1A"
```

This is technically accurate but unhelpful. The consumer doesn't need to know the icon's full Figma component path — they need to know the icon is called "Check." And unlike a true subcomponent, an icon glyph is a content asset, not a structural one.

## What It Does

When the `glyphs` convention is declared, the processing engine tests every `INSTANCE` node against it during element detection — the `match` pattern against the instance's **main component name**, and/or the `structure` form against the instance's child shapes ([glyphs](/settings/glyphs/)). A component either form identifies is created as a `glyph` instead of an `instance`:

```yaml
elements:
  icon:
    type: glyph
    content: Check
    styles:
      width: 20
      height: 20
      fillColor: "#1A1A1A"
```

The key differences from a regular instance:

| | `instance` element | `glyph` element |
|---|---|---|
| **Type** | `instance` | `glyph` |
| **Identity** | `instanceOf: "DS Icon Glyph / Check"` | `content: "Check"` |
| **Style properties** | Full set (effects, strokes, corners, etc.) | Reduced set (size, fill color, position, visibility) |
| **Subcomponent candidate** | Yes | No |

Glyph elements carry fewer style properties because icon assets are typically simple vectors — the styles that matter are size, color, and visibility.

## Pattern Syntax

The pattern is a plain string with a single placeholder: **`{i}`** marks where the glyph name appears in the component name.

```yaml
glyphs:
  match: 'DS Icon Glyph / {i}'
```

The engine converts the pattern into a regex internally: all special characters are escaped, and `{i}` becomes a `(.+)` capture group. The captured text becomes the glyph's `content` value.

**Examples** with pattern `DS Icon Glyph / {i}`:

| Component name | Match? | Extracted name |
|---|---|---|
| `DS Icon Glyph / Check` | Yes | `Check` |
| `DS Icon Glyph / Arrow Left` | Yes | `Arrow Left` |
| `DS Icon Glyph / ` | No | (empty extraction rejected) |
| `Button` | No | — |
| `DS Icon Glyph` | No | (no `{i}` portion) |

### Variant components

When the icon component is a variant (part of a `COMPONENT_SET`), the engine matches against the **component set name**, not the individual variant name. So if `DS Icon Glyph / Check` is a component set containing variants like `size=small` and `size=large`, the pattern matches the set name and extracts `Check`.

### Special characters

Parentheses, dots, and other regex-special characters in the pattern are escaped automatically. These patterns work as-is:

```yaml
# Parentheses in prefix
glyphs:
  match: 'Icons (v2) / {i}'

# Dots in prefix
glyphs:
  match: 'icon.glyph.{i}'
```

### Whitespace

The component name is whitespace-normalized before matching — multiple spaces collapse to one, and leading/trailing whitespace is trimmed. You don't need to worry about inconsistent spacing in Figma layer names.

## Configuration

Declare `glyphs` under `figma` in `config/conventions/figma.yaml`:

```yaml
# config/conventions/figma.yaml
glyphs:
  match: 'DS Icon Glyph / {i}'
```

**Default**: absent (no glyph detection). When omitted, all `INSTANCE` nodes are treated as regular instance elements — the library declares no glyph convention.

**Validation**: if `match` is not a string or is empty/whitespace-only, the block is dropped and glyph detection is disabled.

### Common patterns

**Slash-separated prefix** (most common):
```yaml
glyphs:
  match: 'DS Icon Glyph / {i}'
```

**Shorter prefix**:
```yaml
glyphs:
  match: 'Icon / {i}'
```

**Dot-separated**:
```yaml
glyphs:
  match: 'icon.glyph.{i}'
```

**Versioned prefix**:
```yaml
glyphs:
  match: 'Icons (v2) / {i}'
```

The right pattern depends on how your Figma library names its icon glyph components. Open your icon library in Figma and look at the component names — the prefix before the individual icon name is what goes before `{i}`.

## Fetching the Assets

The same pattern powers asset download: `specs fetch` with `icons` in a source's `fetch` array walks the fetched file payload for components matching the `glyphs` pattern and downloads each one as an SVG to `assets/icons/`, beside `assets/images/`:

```yaml
# config/settings.yaml
data:
  sources:
    library:
      key: YOUR_FILE_KEY
      fetch: ['file', 'icons']
```

Filenames are kebab-case slugs of the extracted name (`Arrow Left` → `arrow-left.svg`, `expandMore` → `expand-more.svg`) — the same slugs generated component output references, so serving the directory as static assets makes glyphs render directly. See [fetch](/cli/commands/fetch/#fetching-icon-assets) for details.

## Prop Binding

When a glyph element's Figma instance node has a `mainComponent` **component property reference** (an instance swap prop), the `content` field is automatically bound to that prop. This means the glyph name tracks the prop value across variants:

```yaml
elements:
  icon:
    type: glyph
    content:
      $value: Check
      $binding: "#/props/icon"
```

This binding is created automatically — no additional configuration needed. It reflects how designers typically wire up icon swaps in Figma: the icon instance has an instance swap property that lets consumers pick a different glyph.

## Practical Guidance

**Find your naming convention first.** Before configuring, browse your icon library in Figma. Component names like `DS Icon Glyph / Check`, `DS Icon Glyph / Arrow Left`, `DS Icon Glyph / Close` suggest the pattern `DS Icon Glyph / {i}`.

**One pattern covers all icons.** Unlike subcomponent patterns (which use `{C}` and `{S}` per component), the glyph pattern is global — it applies to every instance across all components. Choose the common prefix that all your icon glyphs share.

**Glyphs are mutually exclusive with instances.** A matched node becomes a `glyph`; an unmatched node stays an `instance`. If the pattern is too broad, real subcomponent instances might be misclassified as glyphs. Keep the pattern specific to your icon asset naming convention.

**Start without it.** Generate specs first without a `glyphs` convention to see which elements are instances. Look for icon instances that would be more useful as content references, then declare the convention to capture them.

## Further Reading

- [CLI Configuration](/settings/) — full config reference
- [Subcomponent Scoping](/guides/subcomponent-scoping/) — related config for detecting subcomponents (separate from glyph detection)
