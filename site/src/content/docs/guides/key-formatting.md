---
title: "Key Formatting"
description: "Transform property and element key names to a consistent naming convention"
---

Component specs contain hundreds of keys — prop names, anatomy element names, variant configuration keys, layout node names, subcomponent identifiers. In Figma, these names follow whatever convention the designer used: `"Padding Left"`, `"padding-left"`, `"paddingLeft"`, or a mix. The `keys` format option normalizes every key in the output to a single, consistent naming convention.

## The Problem

Inconsistent key naming creates friction for downstream consumers. A code generator expecting `camelCase` breaks on `"Padding Left"`. A CSS-in-JS system expecting `kebab-case` must manually transform `"PaddingLeft"`. Even within a single Figma file, different designers may use different conventions for the same kind of name. Without normalization, consumers inherit this inconsistency.

## What It Does

The `keys` option applies a naming transformation to every key in the spec output. The transformation is applied uniformly across all key types: prop names, anatomy element names, variant configuration keys, enum values, child references, binding paths, layout node names, and subcomponent map keys.

### Available Formats

| Format | Input | Output | Best For |
|--------|-------|--------|----------|
| `SAFE` | `Padding Left` | `Padding Left` | Preserving original Figma names without corruption |
| `CAMEL` | `Padding Left` | `paddingLeft` | JavaScript/TypeScript APIs, React props |
| `SNAKE` | `Padding Left` | `padding_left` | Python, Ruby, database columns |
| `KEBAB` | `Padding Left` | `padding-left` | CSS custom properties, HTML attributes |
| `PASCAL` | `Padding Left` | `PaddingLeft` | C# properties, class names |
| `TRAIN` | `Padding Left` | `Padding-Left` | HTTP headers, title-style identifiers |

### Example Output

Given a component with props `"Has Icon"`, `"Label Text"`, and `"Button Size"`:

**SAFE**:
```yaml
props:
  Has Icon:
    type: boolean
  Label Text:
    type: string
  Button Size:
    type: enum
```

**CAMEL** (default):
```yaml
props:
  hasIcon:
    type: boolean
  labelText:
    type: string
  buttonSize:
    type: enum
```

**SNAKE**:
```yaml
props:
  has_icon:
    type: boolean
  label_text:
    type: string
  button_size:
    type: enum
```

The transformation applies to keys throughout the entire spec — not just props, but anatomy elements, variant names, layout nodes, and all other keyed structures.

## When to Use Each Format

- **`CAMEL`** — Default. Use when your consuming codebase is JavaScript or TypeScript. Props map directly to React component props or JS object keys without additional transformation.
- **`SAFE`** — Use when you want to preserve the original Figma names exactly as authored, including spaces and mixed case. Good for documentation, design-to-dev handoff where Figma names are the source of truth, or when downstream tools handle their own key transformation.
- **`SNAKE`** — Use when your consuming codebase is Python, Ruby, or another language that uses snake_case conventions. Also useful for database schemas.
- **`KEBAB`** — Use when keys feed into CSS custom properties (`--button-size`), HTML attributes, or URL-friendly identifiers.
- **`PASCAL`** — Use when keys map to class names, C# properties, or other PascalCase conventions.
- **`TRAIN`** — Uncommon. Useful for HTTP header-style names or title-case identifiers with hyphen separators.

## Configuration

Set `keys` under `spec` in `config/settings.yaml`:

```yaml
# config/settings.yaml
spec:
  keys: SAFE    # Preserve Figma names without modification
```

**Default**: `CAMEL` — transforms all keys to camelCase.

## Practical Guidance

**Choose one format and use it consistently.** Mixing formats across different spec runs creates the same inconsistency problem you're trying to solve. Set the format once in your config file and leave it.

**`SAFE` is lossless; everything else is lossy.** The `SAFE` format preserves the original name exactly. All other formats discard information (casing, separators, spaces). Names that would lose information are preserved separately — see [Round-Trip Safety](#round-trip-safety) below.

**Match your consuming platform.** If your specs feed a React component library, use `CAMEL`. If they feed a Python SDK, use `SNAKE`. The format should eliminate transformation work for the most common consumer, not add it.

**Special characters are handled gracefully.** Keys containing special characters (slashes, dots, brackets) are cleaned during transformation. The `SAFE` format preserves them as-is; other formats normalize them into the target convention.

## Round-Trip Safety

Formatting a key is one-way: `Icon leading`, `Icon-leading`, and `Icon_leading` all become `icon-leading` under `KEBAB`, and the formatted key alone cannot say which one it came from. That matters when a spec is rendered back into Figma, where layer and property names are the identity used to match existing nodes.

Two settings make the round trip reliable.

### The source convention

The `figma.naming` convention declares the convention your Figma file already uses, so a formatted key has a defined name to reverse into. It lives in `config/conventions/figma.yaml` — it is a fact about the library, while `keys` is a choice about the run:

```yaml
# config/conventions/figma.yaml
naming: SENTENCE   # what your Figma file uses
```

```yaml
# config/settings.yaml
spec:
  keys: KEBAB        # what the spec emits
```

| Value | Shape | Example |
|-------|-------|---------|
| `NONE` (default) | No convention declared | — |
| `SENTENCE` | First word capitalized, rest lowercase | `Icon leading` |
| `TITLE` | Every word capitalized | `Icon Leading` |

Everything in the rest of this guide is **opt-in**. Under the `NONE` default, names are formatted per `keys` and nothing else happens: no grammar check, no preserved names, no defined reversal. Declaring `SENTENCE` or `TITLE` turns all of it on, and your specs grow an extension block for each name that needs one. Declare a convention when you intend to render specs back into Figma, or when you want divergent names surfaced.

### The safe key grammar

*Applies when `figma.naming` is `SENTENCE` or `TITLE`.*

A Figma name survives every `keys` format when it satisfies all of the following:

- ASCII letters and digits only — no `&`, `+`, `/`, `.`, parentheses, punctuation, or accented characters
- Exactly one space between words, with no leading, trailing, or repeated spaces
- Each word is either all letters or all digits — `Badge count 2` is fine, `Badge count2` is not
- The name does not begin with a digit
- Casing matches your declared `figma.naming`

```yaml
# naming: SENTENCE

# Safe — reconstructs under every keys format
Icon leading
Label
Badge count 2       # the digit is its own word, so the boundary survives
Icon 2 leading

# Unsafe — the Figma name is preserved separately
Icon-leading        # separator is not a space
URL field           # inner capitals are lost
Badge count2        # letters and digits share a word
2 icons             # begins with a digit
Cut & paste         # the symbol and its word boundary are deleted
```

A digit run always counts as its own word, in both directions. That is what lets `Badge count 2` become `badgeCount2` and come back intact — and why `Badge count2` cannot, since it formats to the same key but is not the same name.

### Names already written as keys

Figma files are rarely uniform. If yours is mostly sentence case but a few properties were named `isDisabled` or `is-disabled` for the engineers consuming them, those names fail the grammar — yet they are already exactly what you want on both sides.

A name that is already a well-formed key **in the convention you emit** is kept exactly as authored, and recorded. With `keys: CAMEL`, a layer named `isDisabled` stays `isDisabled`, and rendering the spec back into Figma restores it rather than rewriting it to `Is disabled`:

```yaml
props:
  isDisabled:
    type: boolean
    $extensions:
      com.figma:
        name: isDisabled
```

Only the convention you emit is retained. A name in some *other* key convention is formatted like any divergent name — with `keys: KEBAB`, a layer named `isDisabled` or `IsDisabled` becomes `isdisabled` and carries its Figma name in the extension. Formatting splits on spaces, hyphens, and underscores rather than case, so it flattens such names rather than converting them; the extension is what keeps them recoverable.

### What happens to unsafe names

Unsafe names are fully supported — nothing is rejected. When a key cannot reconstruct its Figma name, that name is recorded on the definition:

```yaml
anatomy:
  icon-leading:          # safe — nothing extra emitted
    type: glyph
  url-field:
    type: text
    $extensions:
      com.figma:
        name: URL field
```

References elsewhere in the spec (`elements`, `propConfigurations`) keep pointing at the formatted key; the Figma name is resolved through the definition.

Because well-formed names emit nothing, the presence of `com.figma.name` doubles as a signal that a Figma layer or property name is worth tidying.

### What is not covered

The Figma names of anatomy elements and props are preserved, including those nested inside compositions and slot content. Two things are not:

- **Variant option values.** The values inside a variant prop's `options` are formatted like keys, but no Figma name is recorded for them.
- **Titles.** Component and subcomponent titles are never formatted — they carry the Figma name verbatim already, so there is nothing to preserve.

## See Also

- [Keys](/settings/keys/) — the output convention setting
- [Figma Keys](/settings/figma-keys/) — the source convention setting
- [CLI Configuration](/settings/) — full config reference
