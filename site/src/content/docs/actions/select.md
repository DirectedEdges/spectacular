---
title: "select"
description: "Activating this element chooses it among alternatives"
---

The `select` action declares that activating an element picks it from a set — a card in a chooser, a row in a picker, a chip in a filter bar.

**Status:** specified — this page is the specification. The React and Web Components transforms do not emit it yet; the A2UI target consumes its payload declaration.

It is an **action** when the element's announcement does not change — a selectable card is still a card. Where selection *is* the control's semantics — a radio, an option, a tab — that is a role's territory, and several ([radio](/roles/radio/), [switch](/roles/switch/)) already carry it. The admission test from the [actions overview](/actions/) decides the hard cases.

## Payload

| Member | Source | Meaning |
|---|---|---|
| `componentId` | the dispatching component | Which thing was chosen |
| `selected` | the prop the states convention binds to the `selected` concept | The selection state after activation |

Where no states entry binds `selected`, the member contributes nothing — the same degrade the role contracts use for an unbound concept.

## User message

> Made a selection

## Where to annotate it

```
action:select
```

## Contract addition (specified)

| Prop | Type | Tier |
|------|------|------|
| `onSelect?` | `(selected?: boolean) => void` | Always |

## See also

- [States](/settings/states/) — binding the `selected` concept to this library's prop
- [togglebutton](/roles/togglebutton/) — selection that changes announcement is a role
