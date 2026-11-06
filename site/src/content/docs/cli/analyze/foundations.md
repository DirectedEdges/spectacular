---
title: "foundations"
description: "Emit the workspace's token language — variables, named styles, and icons — as one authoring-facing manifest"
---

Reads the fetched library data — never the specs — and produces `analysis/foundations.yaml`: the workspace's variables and named styles consolidated as tokens, plus its icon glyphs. It is the one analyzer that works on an empty catalogue, because a fresh authoring workspace has zero specs and a complete token language.

Every token entry leads with the exact object a spec author writes — `{$token, $type}` — and carries names only: an alias target by name, a description where the library wrote one, and the *presence* of platform code names, never a resolved value. The report is as safe to publish as a spec is.

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

```yaml
summary:
  tokens: { color: 96, dimension: 41, typography: 12, effect: 3 }
  icons: 56
tokens:
  color:
    - $token: Brand Color/Icon/Primary
      $type: color
      source: variable
      aliasOf: Brand Palette/Neutral/900
      description: Default icon color
      platformNames: [web]
    - $token: Images / Hero
      $type: color
      source: style
  dimension:
    - $token: Brand Sizing/icon/large
      $type: dimension
      source: variable
  typography:
    - $token: Label/Large
      $type: typography
      source: style
icons:
  - name: Caret Right
    key: caretRight
```

| Field | Meaning |
|-------|---------|
| `$token`, `$type` | The reference exactly as a spec's styles write it |
| `source` | `variable` or `style` — where the name lives in the library |
| `aliasOf` | The variable this one aliases in its default mode, by token path. Only on aliases |
| `description` | The library's own description. Only where one exists |
| `platformNames` | Platforms declaring a code-syntax name for this token — presence, not the names |
| `icons[].key` | The formatted key spelling under the workspace's `spec.keys` — the spelling specs use |

Named styles map by kind: `TEXT` → `typography`, `EFFECT` → `effect`, `FILL` → `color`. Grid styles bind to nothing a spec styles and are omitted. Variables map by resolved type: color, dimension (float), string, boolean.
