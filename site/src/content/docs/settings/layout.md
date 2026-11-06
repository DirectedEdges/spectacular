---
title: "layout"
description: "Choose how element hierarchy is represented in the spec output"
---

Layout representation format. Each representation carries the same hierarchy in a different shape.

| | |
|---|---|
| **File** | `config/settings.yaml` |
| **Path** | `spec.layout` |
| **Type** | enum |
| **Default** | `LAYOUT` |

## Options

| Value | Description |
|---|---|
| `LAYOUT` | Tree structure with layout properties |
| `PARENT_CHILDREN` | Parent-child relationships only |
| `BOTH` | Include both representations |

## Example

```yaml
spec:
  layout: LAYOUT
```

## Result

The same `DS Alert` hierarchy — a `root` containing `decorativeIcon` and `children` — expressed under each format.

**`LAYOUT`** — a top-level nested tree; leaves are strings, parents are name→children objects:

```json
{
  "default": {
    "layout": [
      { "root": ["decorativeIcon", "children"] }
    ]
  }
}
```

**`PARENT_CHILDREN`** — no top-level tree; each element carries its own `parent`/`children`:

```json
{
  "default": {
    "elements": {
      "root": { "children": ["decorativeIcon", "children"] },
      "decorativeIcon": { "parent": "root" },
      "children": { "parent": "root" }
    }
  }
}
```

**`BOTH`** emits the top-level `layout` tree *and* the per-element `parent`/`children` fields.

## Further reading

- [Data Layout guide](/guides/data-layout/) for a comparison of layout representations.
