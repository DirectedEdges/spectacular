---
title: "details"
description: "Control the detail level for variant data"
---

Detail level for variant data. Both levels describe the same component; they differ only in how much they repeat.

| | |
|---|---|
| **File** | `config/settings.yaml` |
| **Path** | `spec.details` |
| **Type** | enum |
| **Default** | `LAYERED` |

## Options

| Value | Description |
|---|---|
| `FULL` | Complete data for all variants |
| `LAYERED` | Optimized layered format showing only differences from default |

## Example

```yaml
spec:
  details: LAYERED
```

## Further reading

- [Variant Layering guide](/guides/variant-layering/) for how the layered format works.
