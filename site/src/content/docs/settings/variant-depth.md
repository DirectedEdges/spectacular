---
title: "variantDepth"
description: "Control how many variant property dimensions are expanded"
---

Maximum variant property depth to process. Deeper depth means more thorough (and slower) variant analysis, not more correct output.

| | |
|---|---|
| **File** | `config/settings.yaml` |
| **Path** | `spec.variantDepth` |
| **Type** | number |
| **Default** | `9999` (unlimited) |

## Options

| Value | Description |
|---|---|
| `1`, `2`, `3` | Process up to that many levels of variant properties |
| `9999` | Unlimited — every variant property dimension is expanded |

## Example

```yaml
spec:
  variantDepth: 3  # Process up to 3 levels of variant properties
```

## Further reading

- [Variant Depth guide](/guides/variant-depth/) for how depth affects variant expansion.
- [Variant Layering guide](/guides/variant-layering/) for how properties accumulate across variants.
