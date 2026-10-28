---
title: "invalidVariants"
description: "Include invalid variant data in output"
---

Include invalid variant data in output. When `true`, variants that don't match all property combinations are included.

| | |
|---|---|
| **File** | `config/settings.yaml` |
| **Path** | `spec.invalidVariants` |
| **Type** | boolean |
| **Default** | `false` |

## Example

```yaml
spec:
  invalidVariants: false  # Exclude invalid variants
```

## Further reading

- [invalidCombinations](/settings/invalid-combinations/) — the related setting that computes which prop combinations are invalid; this one controls whether invalid variant data appears in output.
