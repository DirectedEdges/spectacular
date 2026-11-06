---
title: "invalidCombinations"
description: "Calculate and include invalid property combinations"
---

<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge pro-badge">Pro</span>')</script>

Calculate and include invalid property combinations. When `true`, [`generate`](/cli/generate/) computes which prop combinations are invalid and records them in the spec's `invalidPropCombinations` block in [`api.yaml`](/schema/documents/component-api).

| | |
|---|---|
| **File** | `config/settings.yaml` |
| **Path** | `spec.invalidCombinations` |
| **Type** | boolean |
| **Default** | `true` |

## Example

```yaml
spec:
  invalidCombinations: true  # Show invalid combinations (default)
```

## Further reading

- [Invalid Variant Combinations guide](/guides/invalid-variant-combinations/) for what invalid combinations are, why they matter, and worked examples.
- [invalidVariants](/settings/invalid-variants/) — the related setting that includes invalid variant data in output.
