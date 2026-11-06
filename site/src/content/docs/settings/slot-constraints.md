---
title: "slotConstraints"
description: "Consolidate slot constraints from code-only props into the slot property"
---

<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge pro-badge">Pro</span>')</script>

Consolidate slot constraints (`anyOf`, `minChildren`, `maxChildren`) into the slot property. A library fact: it states that the library authors slot constraints as code-only props — a library that does, but leaves this off, loses declared constraint data.

| | |
|---|---|
| **File** | `config/conventions/figma.yaml` |
| **Path** | `slotConstraints` |
| **Type** | boolean |
| **Default** | `false` |

## Example

```yaml
slotConstraints: true
```

## Result

Constraints are read from two sources — Figma's native `slotSettings` API (when the slot has native settings configured) and code-only props (the legacy naming convention). Both sources produce the same output fields.

**Without** consolidation (`false`) the constraints remain standalone string props alongside the slot:

```json
{
  "props": {
    "children": { "type": "slot" },
    "childrenAnyof": { "type": "string", "examples": ["DS Button"] },
    "childrenMaxchildren": { "type": "string", "examples": ["2"] },
    "childrenMinchildren": { "type": "string", "examples": ["1"] }
  }
}
```

**With** consolidation (`true`) they collapse into the `children` slot as `anyOf`/`minChildren`/`maxChildren`, and the standalone props are removed:

```json
{
  "props": {
    "children": {
      "type": "slot",
      "anyOf": ["DS Button"],
      "minChildren": 1,
      "maxChildren": 2
    }
  }
}
```

## Further reading

- [Slot Constraints guide](/guides/slot-constraints/) for how constraint consolidation works.
- [Figma Slots for Repeating Items](https://nathanacurtis.substack.com/p/figma-slots-for-repeating-items) blog post for the authoring pattern.
