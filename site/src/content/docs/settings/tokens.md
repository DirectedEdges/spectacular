---
title: "tokens"
description: "Control how design token references are serialized in the spec output"
---

<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge pro-badge">Pro</span>')</script>

Style properties in a spec frequently reference design tokens — the colors, spacing, and typography defined as Figma variables or published styles. The `tokens` option controls **how those references are serialized**, ranging from a minimal name string to a rich object carrying full Figma provenance.

Different consumers need different levels of detail: a documentation site just needs the token name, a code generator needs a structured reference with a type hint, a Figma-native tool needs raw variable IDs, and a team with a bespoke token system needs to inject its own mapping entirely. One format can't satisfy all of these — so `tokens` selects a single **profile** applied uniformly to every token reference in the output, both variables and published named styles. Every profile serializes the same references correctly, just at different levels of detail.

| | |
|---|---|
| **File** | `config/settings.yaml` |
| **Path** | `spec.tokens` |
| **Type** | enum |
| **Default** | `TOKEN` |

## Options

The same `backgroundColor` reference, serialized under each profile:

| Value | Description |
|---|---|
| `TOKEN` *(default)* | A DTCG-aligned object: the token path plus its `$type`, with no tool-specific metadata, like `{ "$token": "DS Color/Alert/Info/Background", "$type": "color" }`. Good for code generators, documentation tools, and cross-platform design systems |
| `TOKEN_NAME` | The token path only, as a plain string with no wrapper object — the most compact format, like `"DS Color/Alert/Info/Background"`. Ideal for token-resolution pipelines that already have a registry |
| `TOKEN_FIGMA_EXTENSIONS` | Same as `TOKEN`, plus a `$extensions["com.figma"]` block with raw Figma identifiers, like `{ "$token": "…", "$type": "color", "$extensions": { "com.figma": { … } } }`. Useful for debugging, plugin integrations, or migration tooling |
| `FIGMA_NAME` | The raw Figma-native name as a plain string, exactly as it appears in the file, like `"DS Color/Alert/Info/Background"`. For teams whose token systems mirror the Figma variable structure directly |
| `CUSTOM` | Your own token object injected via `applyCustomTokens`, used verbatim, like `{ "name": "color-alert-info-bg", "value": "{color.alert.info.bg}" }` — for bespoke token formats (Style Dictionary references, custom JSON shapes). References without a `$custom` object fall back to `TOKEN_FIGMA_EXTENSIONS` |
| `FIGMA_SYNTAX_WEB` | The Web code-syntax name a designer set in Figma, like `"--ds-color-alert-info-bg"`. Falls back to `TOKEN` when none is defined |
| `FIGMA_SYNTAX_IOS` | The iOS code-syntax name, like `"DSColor.alertInfoBg"`. Falls back to `TOKEN` when none is defined |
| `FIGMA_SYNTAX_ANDROID` | The Android code-syntax name, like `"R.color.ds_alert_info_bg"`. Falls back to `TOKEN` when none is defined |

For variables the path includes the collection (`DS Color/…`); for named styles it is the style name as-is (e.g. `Body/Medium`).

### TOKEN_FIGMA_EXTENSIONS

The full shape adds raw Figma provenance under `$extensions`. For variables the block carries `id`, `rawValue`, `name`, and `collectionName`; for named styles it carries `id` and `name`:

```json
{
  "backgroundColor": {
    "$token": "DS Color/Alert/Info/Background",
    "$type": "color",
    "$extensions": {
      "com.figma": {
        "id": "VariableID:123:456",
        "rawValue": "#E8F1FBFF",
        "name": "Alert/Info/Background",
        "collectionName": "DS Color"
      }
    }
  }
}
```

### CUSTOM

`CUSTOM` substitutes your own token shapes for Spectacular's built-in ones. Before generating, run [`applyCustomTokens`](/cli/commands/apply-custom-tokens/) to inject a `$custom` object onto each variable and style in your fetched data; when `CUSTOM` is active, that object becomes the property value verbatim. References that never received a `$custom` object fall back to the `TOKEN_FIGMA_EXTENSIONS` shape.

```json
{
  "backgroundColor": { "name": "color-alert-info-bg", "value": "{color.alert.info.bg}" },
  "borderColor": {
    "$token": "DS Color/Alert/Info/Element",
    "$type": "color",
    "$extensions": { "com.figma": { "id": "VariableID:789:012", "rawValue": "#1B6FD6FF", "name": "Alert/Info/Element", "collectionName": "DS Color" } }
  }
}
```

The profile requires an extra step between `fetch` and `generate`:

```bash
specs fetch                              # 1. Download raw Figma data
specs applyCustomTokens mapping.json     # 2. Inject $custom objects into the data
specs generate                           # 3. Generate — uses $custom objects verbatim
```

The `applyCustomTokens` command auto-discovers variables/styles files from `data.directory` and `data.sources` in `config/settings.yaml`, or accepts explicit `-v`/`-s` paths. See [`applyCustomTokens` command](/cli/commands/apply-custom-tokens/) for the full mapping file format and pipeline details.

### FIGMA_SYNTAX_WEB / FIGMA_SYNTAX_IOS / FIGMA_SYNTAX_ANDROID

These emit the developer-facing token name a designer assigned for a specific platform via Figma's [code syntax](https://developers.figma.com/docs/plugins/api/CodeSyntaxPlatform/) — `WEB`, `iOS`, or `ANDROID`:

```yaml
backgroundColor: --ds-color-alert-info-bg     # FIGMA_SYNTAX_WEB
backgroundColor: DSColor.alertInfoBg          # FIGMA_SYNTAX_IOS
backgroundColor: R.color.ds_alert_info_bg     # FIGMA_SYNTAX_ANDROID
```

When a token has no code syntax defined for the chosen platform, the profile **falls back to the `TOKEN` output** for that reference, so these profiles are always safe to select.

## Example

```yaml
spec:
  tokens: TOKEN  # Default — DTCG-aligned objects
```

## Result

Under the default `TOKEN` profile, the `DS Alert` root's `backgroundColor` is emitted as a structured, typed reference:

```json
{
  "default": {
    "elements": {
      "root": {
        "styles": {
          "backgroundColor": {
            "$token": "DS Color/Alert/Info/Background",
            "$type": "color"
          }
        }
      }
    }
  }
}
```

Switching the profile reshapes that one reference — from the full object above down to a bare `"DS Color/Alert/Info/Background"` string under `TOKEN_NAME`, or up to an object with embedded Figma IDs under `TOKEN_FIGMA_EXTENSIONS`.

## Further reading

- [Promote Primitives](/settings/promote-primitives/#tokens) — a promotion table's `values` keys are matched against whatever this profile emits, so changing it stops them matching.
- [`applyCustomTokens` command](/cli/commands/apply-custom-tokens/) for the mapping file format and pipeline for the `CUSTOM` profile.
- [ADR 007 — Token Reference Config](https://github.com/DirectedEdges/specs/blob/main/adr/007-token-reference-config.md) for the decision consolidating token formatting into a single enum.
