---
title: "accessibility"
description: "The prop supplying an accessible name where no element carries one"
---

Some controls have no text of their own — an icon-only button is the usual case — and the name a screen reader announces arrives as a prop instead. Which prop that is cannot be recovered by any rule, so it is declared, and a generated component binds that prop to `aria-label` on the element the control role resolved to.

| | |
|---|---|
| **File** | `config/conventions/specs.yaml` |
| **Path** | `accessibility.label.prop` |
| **Type** | block |
| **Default** | absent |

## Example

```yaml
accessibility:
  label:
    prop: a11yLabel
```

## An element beats a prop

Where a [`label` part role](/roles/label/) resolves, it wins. An element carrying the
name is preferred to a prop: it produces a real association rather than a string, and
the text stays visible and translatable.

The convention is the fallback for controls that have no such element.

## Object shape

`prop` sits inside an object rather than being a bare string so the convention can grow
properties of its own — pairing a label with the state that selects it, for instance —
without a breaking change.

## Further reading

- [Value prop](/settings/value/) — the same idea for a control's value.
- [States](/settings/states/) — the other conventions about the spec's own props.
- [Roles](/roles/) — where an element supplies the name instead.
