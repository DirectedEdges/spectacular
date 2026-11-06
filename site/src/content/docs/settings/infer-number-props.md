---
title: "inferNumberProps"
description: "Automatically emit numeric code-only props as NumberProp instead of StringProp"
---

When enabled, TEXT code-only props whose default and all examples parse as valid numbers (no leading zeros) are emitted as `NumberProp` instead of `StringProp`. A library fact: it states that the library authors numeric props as Figma `TEXT` props — a library that does, but leaves this off, gets worse typing for genuinely numeric props, not different typing.

| | |
|---|---|
| **File** | `config/conventions/figma.yaml` |
| **Path** | `inferNumberProps` |
| **Type** | boolean |
| **Default** | `false` |

## Example

```yaml
inferNumberProps: true  # Infer numeric code-only props as NumberProp
```

## Result

The example uses a Text Area that exposes [code-only props](/settings/code-only-props-pattern/) whose values are purely numeric strings — `minRows` = `"2"`, `maxRows` = `"6"`, `minLength` = `"3"`.

**Without** inference (`false`) the numeric values stay string props:

```json
{
  "props": {
    "minRows": { "type": "string", "default": "2" },
    "maxRows": { "type": "string", "examples": ["6"] },
    "minLength": { "type": "string", "examples": ["3"] }
  }
}
```

**With** inference (`true`) they are emitted as number props:

```json
{
  "props": {
    "minRows": { "type": "number", "default": 2 },
    "maxRows": { "type": "number", "examples": [6] },
    "minLength": { "type": "number", "examples": [3] }
  }
}
```

Text code-only props whose values aren't purely numeric (e.g. `value` = `"{Value}"`) are unaffected and remain string props.

## Further reading

- [Number Inference guide](/guides/number-inference/) for how inference works and when to use it.
