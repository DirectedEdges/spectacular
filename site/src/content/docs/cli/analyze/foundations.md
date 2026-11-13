---
title: "foundations"
description: "Emit the workspace's token language — variables, named styles, and icons — as one authoring-facing manifest"
---

Reads the fetched library data — never the specs — and produces the foundations manifest: a slim `analysis/foundations.yaml` index over one `analysis/foundations/<type>.yaml` file per token type, plus `foundations/icons.yaml`. The split is the point — a token lookup reads that type's own small file instead of scanning one file holding the whole token language. It is the one analyzer that works on an empty catalogue, because a fresh authoring workspace has zero specs and a complete token language.

Every token entry leads with the exact object a spec author writes — `{$token, $type}` — plus orientation: an alias target by name, the default-mode `defaultValue` (alias chains resolved, colors as hex) for understanding what a token is, a description where the library wrote one, and the *presence* of platform code names. Per-mode value dumps never appear, and `defaultValue` is never authored into a spec.

## Use When

- You are authoring specs from scratch and need the system's token vocabulary before any component exists.
- You want the exact `$token` spellings and the `$type` each takes, ready to paste.
- You need a glyph name's formatted key spelling — spec `content`, defaults, and examples use the key (`caretRight`), not the raw cache name (`Caret Right`).
- You want to see which semantic tokens alias which, by name, without exposing values.

## Invocation

```bash
specs analyze foundations
```

Requires fetched data (`specs fetch`). With nothing fetched the analyzer writes nothing.

## Output

The index, `analysis/foundations.yaml` — counts, the theming collections, and the file map:

```yaml
summary:
  tokens: { color: 96, dimension: 41, typography: 12, effects: 3 }
  icons: 56
collections:
  - collection: Brand Color
    modes: [Light, Dark]
files:
  color: foundations/color.yaml
  dimension: foundations/dimension.yaml
  typography: foundations/typography.yaml
  effects: foundations/effects.yaml
  icons: foundations/icons.yaml
```

One file per token type, `analysis/foundations/<type>.yaml`:

```yaml
$type: color
tokens:
  - $token: Brand Color/Icon/Primary
    $type: color
    source: variable
    aliasOf: Brand Palette/Neutral/900
    defaultValue: '#1A1A1A'
    description: Default icon color
    platformNames: [web]
  - $token: Images / Hero
    $type: color
    source: style
```

And the glyphs, `analysis/foundations/icons.yaml`:

```yaml
icons:
  - name: Caret Right
    key: caretRight
```

Every run rewrites the whole `foundations/` directory, so a type the library no longer has does not survive as a stale file.

| Field | Meaning |
|-------|---------|
| `$token`, `$type` | The reference exactly as a spec's styles write it |
| `source` | `variable` or `style` — where the name lives in the library |
| `aliasOf` | The variable this one aliases in its default mode, by token path. Only on aliases |
| `defaultValue` | The default-mode value, alias chains resolved, colors as hex — to *understand* a token, never to author into a spec and never to validate a choice against: values are **themed**, and other modes resolve differently |
| `description` | The library's own description. Only where one exists |
| `platformNames` | Platforms declaring a code-syntax name for this token — presence, not the names |
| `icons[].key` | The formatted key spelling under the workspace's `spec.keys` — the spelling specs use |

Named styles map by kind: `TEXT` → `typography`, `EFFECT` → `effects`, `FILL` → `color`. Grid styles bind to nothing a spec styles and are omitted. Variables map by resolved type: color, dimension (float), string, boolean.
