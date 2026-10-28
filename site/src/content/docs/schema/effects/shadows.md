---
title: "shadows"
description: "Drop and inner shadow definitions"
tableOfContents: false
---

Array of shadow definitions. Part of [`Effects`](/schema/effects/).

#### Type(s)

`Shadow[]` — see [`Effects`](/schema/effects/#shadow) for the `Shadow` shape.

```yaml
- visible: true
  offsetX: 0
  offsetY: 4
  blur: 8
  spread: 0
  color:
    $token: DS Color.Shadow.Default
    $type: color
```

#### Source

[`packages/schema/types/Effects.ts`](https://github.com/DirectedEdges/specs/blob/main/packages/schema/types/Effects.ts)
