---
title: "value"
description: "The prop supplying a control's value where no element represents it"
---

A progress bar draws its progress rather than writing it, so nothing in its anatomy stands for the value — which prop carries it is declared here. `prop` names the prop carrying the value, and a generated component binds it to the value attribute the resolved role calls for — `aria-valuenow` on a progress bar, for instance.

| | |
|---|---|
| **File** | `config/conventions/specs.yaml` |
| **Path** | `value` |
| **Type** | block (`prop`, `indeterminate`) |
| **Default** | absent |

## Example

```yaml
value:
  prop: percent
  indeterminate: isIndeterminate
```

## An element beats a prop

Where a [`value` part role](/roles/value/) resolves, it wins, for the same reason a
`label` element beats an accessible-name prop.

## `indeterminate`

A boolean prop that forces the indeterminate presentation regardless of the value.
Resolution runs in order:

1. `indeterminate` is true — the value is suppressed
2. otherwise `prop` resolves — the determinate form is emitted
3. otherwise the indeterminate form is emitted, with a warning

## Distinction from state concepts

The state concepts are a governed vocabulary, each resolving to a canonical selector,
and `indeterminate` there already means a checkbox's mixed state — `:indeterminate`,
`aria-checked="mixed"`.

A progress bar with no known value is a different fact wearing the same word. It
suppresses `aria-valuenow` and has no selector at all. Folding the two would widen a
governed vocabulary to absorb a prop binding, which is what the governance exists to
prevent — so it is modelled as what it actually is: a property of the value.

## Further reading

- [Accessibility props](/settings/accessibility/) — the same idea for an accessible name.
- [States](/settings/states/) — the governed state vocabulary.
- [`value` role](/roles/value/) — where an element represents the value instead.
