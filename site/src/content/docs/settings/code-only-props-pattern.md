---
title: "codeOnlyProps"
description: "Naming pattern used to detect the code-only props container layer"
---

Naming pattern used to detect the code-only props container layer. A library fact: every consumer reading the same library must declare the same layer name — a wrong one leaves code-only props unextracted, and absence means the library has no such convention and no extraction is performed.

| | |
|---|---|
| **File** | `config/conventions/figma.yaml` |
| **Path** | `codeOnlyProps.match` |
| **Type** | block with a single `match` string — a literal layer name |
| **Default** | absent (no such convention) |

## Example

```yaml
codeOnlyProps:
  match: 'Code only props'
```

## Result

When the pattern matches, the container **and all of its children are omitted from `anatomy` and `elements`** (they are metadata, not formal layout), while the properties they were bound to **still surface in `props`**:

```json
{
  "title": "DS Text Area",
  "anatomy": {
    "root": { "type": "container" },
    "label": { "type": "text" },
    "control": { "type": "text" }
  },
  "props": {
    "value": { "type": "string", "examples": ["{Value}"] },
    "minRows": { "type": "string", "default": "2" },
    "maxRows": { "type": "string", "examples": ["6"] },
    "minLength": { "type": "string", "examples": ["3"] }
  }
}
```

`minRows`, `maxRows`, and `minLength` appear in `props` but **not** in `anatomy` — the only trace of the code-only props layer is the props themselves.

Their numeric values (`"2"`, `"6"`, `"3"`) remain strings here. Pair this with [`inferNumberProps`](/settings/infer-number-props/) to emit them as `NumberProp` (`2`, `6`, `3`) instead.

Without a `codeOnlyProps` block, the container and its children are treated as ordinary layout elements — they appear in `anatomy`/`elements` and no props are extracted.

## The authoring pattern

A `Code only props` layer is a tiny, clipped container parked at `(0,0)` that holds child layers bound to behavioral component properties with no visual representation — for example, a Text Area's `minRows`/`maxRows` sizing bounds and a `minLength` constraint.

## Legacy name

In the pre-split `specs.config.yaml`, this option was the scalar `config.processing.codeOnlyPropsPattern`. That file is no longer read — [`specs migrate config`](/cli/commands/migrate/) converts it, moving that member to `figma.codeOnlyProps.match`.

## Further reading

- [Code-Only Props guide](/guides/code-only-props/) for how detection and extraction works.
- [Code-Only Props in Figma](https://nathanacurtis.substack.com/p/code-only-props-in-figma) blog post for the authoring pattern.
