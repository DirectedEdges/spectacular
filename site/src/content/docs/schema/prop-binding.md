---
title: "PropBinding"
description: "Dynamic links between props and element or style properties"
---

A `PropBinding` creates a dynamic link between a prop and an element or style property. When the bound prop changes value, the linked property updates accordingly.

```ts
interface PropBinding {
  $binding: string;   // JSON Pointer to a prop, e.g. "#/props/label"
}
```

## Where PropBindings Can Appear

PropBindings are accepted on these element properties:

| Property | Effect |
|----------|--------|
| `children` | Element's children are driven by a slot prop |
| `instanceOf` | The component instance swaps based on a prop value |
| `visible` | Element visibility is controlled by a prop |
| `content` | Text or glyph content is bound to a prop |

PropBindings can also appear as style values anywhere a [`Style`](/schema/styles.md/#values) is accepted.

## Further Reading

- [ADR 008 — Introduce PropBinding to Replace ReferenceValue](https://github.com/DirectedEdges/specs/blob/main/adr/008-prop-bindings.md) — introduces `PropBinding` with `$binding` to avoid JSON Schema `$ref` key collision
