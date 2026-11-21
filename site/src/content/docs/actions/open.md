---
title: "open and close"
description: "Activating this element reveals or conceals a named surface"
---

The `open` and `close` actions declare that activating an element shows or hides a surface that is **not the component's own** — the button that opens a drawer, the link that opens a sheet, the affordance inside the drawer that closes it.

**Status:** specified — this page is the specification for both concepts. The React and Web Components transforms do not emit them yet; the A2UI target consumes their payload declarations.

They are **actions**, not roles. A control that reveals *its own* subtree announces that relationship — `aria-expanded` — and that is the [disclosure](/roles/disclosure/) role. A button that opens a drawer elsewhere announces as an ordinary button; only the consequence distinguishes it. And a close affordance that removes *its own* component is [dismiss](/actions/dismiss/) — `close` conceals a surface that continues to exist.

| Concept | The surface | Announcement changes? | Use instead when… |
|---|---|---|---|
| `disclosure` (role) | its own subtree | yes (`aria-expanded`) | the control owns what it reveals |
| `dismiss` (action) | its own component, removed | no | the component goes away |
| `open` / `close` (actions) | a named surface elsewhere, toggled | no | the surface outlives the toggle |

## Payload

| Member | Source | Meaning |
|---|---|---|
| `componentId` | the dispatching component | Which control toggled it |
| `target` | the annotation's `target` argument | The surface being opened or closed |

`target` is the first per-instance argument in the vocabulary — the concept cannot know which drawer, so the annotation says. It rides `ActionEntry.args`.

## User messages

> Opened · Closed

## Where to annotate it

```
action:open target:filtersDrawer
```

## Contract addition (specified)

| Prop | Type | Tier |
|------|------|------|
| `onOpen?` / `onClose?` | `(target?: string) => void` | Always |

## See also

- [disclosure](/roles/disclosure/) — when the control owns what it reveals
- [dismiss](/actions/dismiss/) — when the component itself goes away
