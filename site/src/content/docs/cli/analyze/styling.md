---
title: "styling"
description: "Emit a token inventory showing which variables are applied to each anatomy element"
---

The styling analyzer builds a design-token inventory from your generated specs. It records every Figma variable, color style, text style, and effect style a component applies, how it is applied (fill, background, spacing, etc.), and — when foundations data is available — which published tokens no component uses at all.

## Use When

- You want an audit of which design tokens a component uses without reading the spec YAML directly.
- You want to cross-reference token application across components.
- You want to detect when a component uses a token not in your design system's published set.
- You want to find published tokens that no component spec references.

## Invocation

```bash
specs analyze styling
```

## How Tokens Are Collected

For every component directory containing an `api.yaml`, the analyzer walks the styles of each anatomy element in the `default` configuration and in every variant. In split-concerns output this styling lives in `variants.yaml`; in single-file output it falls back to `api.yaml`. Subcomponents are analyzed as their own scopes, keyed with a dot path (`dsAlert.actions`).

Only token references count — style values written as `$token` references in the spec. Hardcoded literal values (a raw hex color, a plain number) are ignored. Each reference records:

| Field | Description |
|-------|-------------|
| `name` | Full token name as the spec references it. For variables this is collection-prefixed: `Collection name/Variable name`. |
| `appliedAs` | The dot-joined style key path where the token is applied: `backgroundColor`, `fillColor`, `padding.start`, `cornerRadius.topEnd`, etc. |
| `appliedTo` | Map of anatomy element name → occurrence count, accumulated across the default and all variants. |

Each reference is classified into one of four categories by its `$type`: `typography` → **text styles**; `shadow`, `blur`, or `effects` → **effect styles**; everything else → **variables**. The same token applied through different style keys produces one entry per distinct `appliedAs`.

In addition to the aggregate reports below, each component folder receives its own `styling.json` with the same structure as its `byComponent` entry, plus a `rawValue` field (the resolved value from Figma) where available.

## Outputs

Three aggregate files are written to `analysis/` after all components are processed. The extension follows `spec.format` in `config/settings.yaml` — `.json` shown here, `.yaml` when configured.

| File | Answers |
|------|---------|
| [`styling.byComponent`](#stylingbycomponent) | Which tokens does each component use? |
| [`styling.byToken`](#stylingbytoken) | Which components use each token? |
| [`styling.unused`](#stylingunused) | Which tokens does no component use? |

### styling.byComponent

The component-first view. Every analyzed scope — components and their subcomponents — appears as a key in alphabetical order, and each entry holds the four category arrays (`variables`, `colorStyles`, `textStyles`, `effectStyles`) sorted by token name. Entries mirror the per-component `styling.json` files with `rawValue` stripped, so the report stays stable when only resolved values change.

Use it to review a component's full token footprint at a glance, or to diff token usage between releases.

```json
{
  "dsAlert": {
    "variables": [
      {
        "name": "Color/Surface/Warning",
        "appliedAs": "backgroundColor",
        "appliedTo": { "root": 1 }
      },
      {
        "name": "Color/Icon/Warning",
        "appliedAs": "fillColor",
        "appliedTo": { "icon": 1 }
      },
      {
        "name": "Size/Icon/MD",
        "appliedAs": "width",
        "appliedTo": { "icon": 1 }
      },
      {
        "name": "Size/Icon/MD",
        "appliedAs": "height",
        "appliedTo": { "icon": 1 }
      },
      {
        "name": "Space/4",
        "appliedAs": "padding.top",
        "appliedTo": { "root": 1 }
      }
    ],
    "colorStyles": [],
    "textStyles": [
      {
        "name": "Typography/Body/SM",
        "appliedAs": "textStyle",
        "appliedTo": { "body": 1 }
      }
    ],
    "effectStyles": []
  },
  "dsAlert.actions": {
    "variables": [
      {
        "name": "Space/3",
        "appliedAs": "itemSpacing",
        "appliedTo": { "root": 1 }
      }
    ],
    "colorStyles": [],
    "textStyles": [],
    "effectStyles": []
  }
}
```

### styling.byToken

The token-first view — the same data inverted into an index that answers "which components use this token, and how?" Useful for auditing token coverage, planning a rename, or assessing the blast radius of a token change.

Tokens are grouped under the four category keys. Each token name maps to an array of usage entries, one per distinct component scope and `appliedAs` pair, in alphabetical component order. A component that applies the same token as both `width` and `height` contributes two entries.

```json
{
  "variables": {
    "Color/Surface/Warning": [
      {
        "component": "dsAlert",
        "appliedAs": "backgroundColor",
        "appliedTo": { "root": 1 }
      },
      {
        "component": "dsToast",
        "appliedAs": "backgroundColor",
        "appliedTo": { "root": 1 }
      }
    ],
    "Size/Icon/MD": [
      {
        "component": "dsAlert",
        "appliedAs": "height",
        "appliedTo": { "icon": 1 }
      },
      {
        "component": "dsAlert",
        "appliedAs": "width",
        "appliedTo": { "icon": 1 }
      }
    ]
  },
  "colorStyles": {},
  "textStyles": {
    "Typography/Body/SM": [
      {
        "component": "dsAlert",
        "appliedAs": "textStyle",
        "appliedTo": { "body": 1 }
      }
    ]
  },
  "effectStyles": {}
}
```

### styling.unused

The inverted audit: which published tokens does *no* spec reference? Where `byComponent` and `byToken` describe what specs use, `styling.unused` compares that usage against the full token universe of your design system and lists what's left over.

The universe is built from the foundations data downloaded by `specs fetch` into your data directory — every source in `config/settings.yaml` that declares `variables` or `styles` under `fetch` contributes its `{alias}.variables.json` and `{alias}.styles.json`. **If no foundations data files are found, this report is skipped** and the other two are still written.

The comparison works on token names, constructed exactly as specs reference them:

- **Variables** are named `Collection name/Variable name`, so the same variable name in two collections is tracked as two distinct tokens.
- **Styles** use their Figma style name as-is, and are categorized by style type: fill styles → `colorStyles`, text styles → `textStyles`, effect styles → `effectStyles`. Grid styles are never referenced by specs and are excluded entirely.
- A token counts as **used** if any analyzed scope references its name in *any* category — a fill style whose name matches a referenced variable is not reported as unused.

Each category lists its unused token names in alphabetical order, and the `summary` block gives the totals: `total` tokens in the universe, how many are `used` by at least one spec, and how many are `unused`.

```json
{
  "summary": {
    "variables": { "total": 1394, "used": 146, "unused": 1248 },
    "colorStyles": { "total": 8, "used": 1, "unused": 7 },
    "textStyles": { "total": 55, "used": 52, "unused": 3 },
    "effectStyles": { "total": 6, "used": 4, "unused": 2 }
  },
  "variables": [
    "Color/Surface/Inverse",
    "Space/12"
  ],
  "colorStyles": [
    "Gradient/Primary/Horizontal"
  ],
  "textStyles": [
    "Typography/Body/SM/Underline"
  ],
  "effectStyles": [
    "Background blur/Thin"
  ]
}
```

Note that "unused" means unused *by the analyzed component specs* — a token may still be consumed elsewhere (documentation, marketing files, other libraries). Treat the report as a candidate list for deprecation review, not a deletion list.

## See Also

- [Analyze overview](/cli/analyze/)
- [`props` analyzer](/cli/analyze/props/)
- [`dependencies` analyzer](/cli/analyze/dependencies/)
- [What gets emitted](/code/) — the files `specs react` and `specs webcomponents` write
