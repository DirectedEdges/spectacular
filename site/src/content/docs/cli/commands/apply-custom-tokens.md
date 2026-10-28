---
title: "applyCustomTokens"
description: "Inject your team's token shapes into fetched Figma data so generated specs use your format, not ours"
---

## The Problem

Spectacular generates token references in a fixed shape — `{ $token, $type }` or one of the other [built-in profiles](/settings/tokens/). But many teams already have a token system with its own naming conventions and output shapes: Style Dictionary aliases, JSON schema references, platform-specific formats, or custom structures built for their toolchain.

You can't make Spectacular guess your format. You need a way to say: _"For this Figma variable, output **this exact object** instead."_

## The Solution

`applyCustomTokens` lets you inject a `$custom` object onto each variable and style in your fetched data files. When you set `spec.tokens: CUSTOM` in `config/settings.yaml`, Spectacular uses those objects **verbatim** as the token reference value in generated output — no transformation, no reformatting. Your object becomes the property value.

### Where It Fits in the Pipeline

The command runs **between `fetch` and `generate`** — it modifies the raw data files that `fetch` downloaded, before `generate` reads them:

```
specs fetch                              ← Downloads raw Figma data
specs applyCustomTokens mapping.json     ← Injects $custom onto matched entries
specs generate                           ← Reads $custom when spec.tokens: CUSTOM
```

No changes to `fetch` or `generate` are needed. The augmented files are transparent to both commands.

## Usage

```bash
specs applyCustomTokens <mapping> [options]
```

### Arguments

#### `<mapping>`

Path to a JSON mapping file. Keys are Figma variable or style IDs; each entry must contain a `$custom` property (a non-null object). Other properties on the entry are ignored.

### Options

| Flag | Description |
|------|-------------|
| `-v, --variables <path>` | Path to a variables JSON file. Overrides config-based discovery |
| `-s, --styles <path>` | Path to a styles JSON file. Overrides config-based discovery |
| `--config <path>` | Use a specific `config/` directory (or legacy config file) instead of auto-discovery |

When `-v` and `-s` are omitted, the command auto-discovers data files from `config/settings.yaml` using `data.directory` and `data.sources` — the same resolution that `generate` uses.

## The Mapping File

The mapping file is a JSON file you create and maintain. Each key is a Figma ID (`VariableID:*` for variables, `S:*` for styles), and each value must include a `$custom` object — the exact shape you want in the output:

```json
{
  // Variable: map a Figma variable to a Style Dictionary alias
  "VariableID:4350:72": {
    "$custom": {
      "name": "color-text-primary",
      "value": "{color.text.primary}"
    },
    "note": "This property is ignored — only $custom is read"
  },

  // Variable: map to a JSON schema reference format
  "VariableID:4350:85": {
    "$custom": {
      "$token": "tokens/$brand#/color/$theme/outline",
      "$type": { "$ref": "foundations#/definitions/color" }
    }
  },

  // Style: map a published Figma style
  "S:abc123def456,": {
    "$custom": {
      "typography": "body.medium",
      "platform": "web"
    }
  }
}
```

The `$custom` value can be **any JSON object** — Spectacular does not validate its contents beyond requiring it to be a non-null object. Your downstream consumers define the shape.

> **Where do the Figma IDs come from?** Inspect your fetched `*.variables.json` or `*.styles.json` files — the IDs are the keys in the `meta.variables` and `meta.styles` objects.

## What Happens to the Data

The command injects `$custom` onto matching entries in the fetched JSON files. Here's a before/after for a variable:

**Before** (raw fetched data):
```json
{
  "meta": {
    "variables": {
      "VariableID:4350:72": {
        "name": "Text/Primary",
        "resolvedType": "COLOR",
        "variableCollectionId": "VariableCollectionId:100:0",
        "valuesByMode": { "200:0": { "r": 0.1, "g": 0.1, "b": 0.1, "a": 1 } }
      }
    }
  }
}
```

**After** (`applyCustomTokens` has run):
```json
{
  "meta": {
    "variables": {
      "VariableID:4350:72": {
        "name": "Text/Primary",
        "resolvedType": "COLOR",
        "variableCollectionId": "VariableCollectionId:100:0",
        "valuesByMode": { "200:0": { "r": 0.1, "g": 0.1, "b": 0.1, "a": 1 } },
        "$custom": {
          "name": "color-text-primary",
          "value": "{color.text.primary}"
        }
      }
    }
  }
}
```

Everything else is preserved — only `$custom` is added (or overwritten if it already exists).

## Impact on Generated Output

When `generate` runs with `spec.tokens: CUSTOM`, every token reference that has a `$custom` object uses it verbatim. References without `$custom` fall back to the `TOKEN_FIGMA_EXTENSIONS` format.

**Config:**
```yaml
# config/settings.yaml
spec:
  tokens: CUSTOM
```

**Generated output** (YAML shown):
```yaml
elements:
  label:
    styles:
      # This variable had $custom injected — uses your object verbatim
      color:
        name: color-text-primary
        value: "{color.text.primary}"

      # This variable had NO $custom — falls back to TOKEN_FIGMA_EXTENSIONS
      borderColor:
        $token: DS Color.Border.Default
        $type: color
        $extensions:
          com.figma:
            id: "VariableID:789:012"
            rawValue: "#e0e0e0"
            name: Border/Default
            collectionName: DS Color
```

This applies uniformly to all reference sites — including gradient stop colors and any other property bound to a Figma variable or style.

> **Without `spec.tokens: CUSTOM`**, the `$custom` objects sit inert in the data files. Other token profiles (`TOKEN`, `TOKEN_NAME`, etc.) ignore `$custom` entirely.

## Full Pipeline Example

```bash
# Step 1: Fetch raw data from Figma
specs fetch

# Step 2: Inject your custom token shapes
specs applyCustomTokens data/token-mappings.json

# Step 3: Generate specs — your $custom objects appear in the output
specs generate
```

Or with explicit file paths instead of config discovery:

```bash
specs applyCustomTokens data/token-mappings.json \
  -v data/library.variables.json \
  -s data/library.styles.json
```

## The Render Cache

Because this command rewrites your fetched variables data in place, the lookup tables [`render`](/cli/commands/render/) uses would otherwise describe your data as it was before the custom tokens were applied. To prevent that, `applyCustomTokens` rebuilds the [cache](/cli/commands/cache/) as its final step, and reports what it rebuilt.

If the command is interrupted before that step, the cache is left stale — `render` detects this and stops, telling you to run `specs cache`.

## Behavior Details

- **Idempotent**: Running the command multiple times with the same mapping produces identical output. Existing `$custom` values are overwritten.
- **Non-destructive**: Only the `$custom` property is modified — all other data on each entry is preserved.
- **Mixed mapping**: A single mapping file can contain both variable IDs and style IDs. The command augments variables and styles files in a single invocation.
- **Empty `$custom` objects**: An empty `{}` is treated as absent — the `CUSTOM` profile will fall back to `TOKEN_FIGMA_EXTENSIONS` for that reference.

## Status Summary

After running, the command reports what it did:

- **No matches**: `No custom tokens found in mapping file. No files were modified.`
- **Matches found**: Reports count of variables augmented, styles augmented, and unmatched mapping entries

## Error Scenarios

| Scenario | Result |
|----------|--------|
| Mapping file not found | Error with file path |
| Malformed JSON | Error identifying the file |
| `$custom` value is not a non-null object (string, array, number, null) | Error identifying the invalid entry |
| No data files found (no config, no flags) | Error suggesting `-v`/`-s` flags or config setup |

## Branch-Fetched Data

If your data files were fetched from a Figma branch (using a branch file key in `data.sources`), variable and style IDs may differ from the IDs on main. Your mapping file must use the IDs that appear in the branch data.

Inspect the fetched files directly to verify which IDs are present. If you maintain separate mapping files per branch, keep them alongside the branch data.

See [Fetching Figma Branches](/cli/commands/fetch/#fetching-figma-branches) for details.

---

**See Also:**
- [Tokens configuration](/settings/tokens/) — all token profiles compared
- [Configuration Reference](/settings/) — `data.directory` and `data.sources` setup
- [Generate Command](/cli/commands/generate/) — processing augmented data
- [Fetch Command](/cli/commands/fetch/) — fetching raw data before augmentation
