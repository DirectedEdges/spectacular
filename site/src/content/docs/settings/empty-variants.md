---
title: "emptyVariants"
description: "Include layered variants that contain no element overrides"
---

Include layered variants that contain no element overrides. When `true`, all variants are included regardless of element presence; when `false`, semantically empty layered variants are excluded from output.

| | |
|---|---|
| **File** | `config/settings.yaml` |
| **Path** | `spec.emptyVariants` |
| **Type** | boolean |
| **Default** | `false` |

## Example

```yaml
spec:
  emptyVariants: false  # Exclude empty variants (default)
```
