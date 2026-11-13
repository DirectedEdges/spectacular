---
title: "themes"
description: "Report which themes a library's specs select, by component and by theme"
---

The themes analyzer records every theme selection a spec carries — an element's [`themes`](/schema/themes/) entry, naming a token group and the theme its subtree resolves under. The [`foundations`](/cli/analyze/foundations/) report declares the vocabulary; this one says which of it the catalogue actually uses.

## Use When

- You want to know which components re-theme part of themselves, without reading every `variants.yaml`.
- You want every element that selects a given theme, before changing what that theme resolves to.
- You want the themes a library declares that nothing selects.

## Invocation

```bash
specs analyze themes
```

## What Counts

Every `themes` key on an element, in the `default` configuration and in each variant. In split-concerns output those live in `variants.yaml`; in single-file output they fall back to `api.yaml`. Subcomponents are their own scopes, keyed with a dot path (`deCard.reviews`). Compositions are read too — a screen pinned to a dark surface is the clearest case there is.

**Authored selections only.** A selection is written on the element that made it and inherited by its descendants, so the effective theme an element renders under is the merge of its own selection over its ancestors'. That merge is not reported here: computing it in a report would put a second implementation of the resolution rule beside the one the emitters use, free to disagree with it.

| Field | Description |
|-------|-------------|
| `element` | The element key as the spec writes it |
| `variant` | `default`, or the variant's configuration as `prop=value` pairs |
| `themes` | Token group → theme, verbatim as the spec carries them |

## Reports

| File | Keyed by | Answers |
|---|---|---|
| `themes.json` (beside the spec) | Component scope | What does this component select, element by element and variant by variant |
| `analysis/themes.byComponent.json` | Component scope | The same across the catalogue, listing only components that select something |
| `analysis/themes.byTheme.json` | `group: theme` | Who selects this theme — component, element, variant |
| `analysis/themes.unused.json` | — | Declared groups and themes nothing selects, with totals |

### By component

```json
{
  "deCard": {
    "selections": [
      { "element": "root", "variant": "default", "themes": { "DE Color": "Dark" } },
      { "element": "root", "variant": "appearance=Secondary", "themes": { "DE Color": "Bright" } }
    ]
  }
}
```

### By theme

```json
{
  "DE Color: Dark": [
    { "component": "deCard", "element": "root", "variant": "default" },
    { "component": "deToggle", "element": "track", "variant": "on=true" }
  ]
}
```

### Unused

```json
{
  "summary": {
    "groups": { "total": 10, "selected": 2, "unselected": 8 },
    "themes": { "total": 17, "selected": 3, "unselected": 14 }
  },
  "groups": ["DE Motion", "DE Palette"],
  "themes": ["DE Color: Light", "DE Shape: Squared"]
}
```

An unselected theme is not a problem. Most libraries switch themes at the document root rather than per element, and a theme nothing *selects* may still be the one a whole page renders under. The report says what the specs declare, not what a consumer does with them.

## See Also

- [Themes](/schema/themes/) — the schema member this reports on
- [`foundations`](/cli/analyze/foundations/) — where the groups and themes are declared
- [`styling`](/cli/analyze/styling/) — the token inventory a selection changes the resolution of
- [`analyze` command reference](/cli/commands/analyze/)
