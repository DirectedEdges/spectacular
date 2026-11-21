---
title: "Actions"
description: "Declare what activating an element does, so transforms emit the behavior and its contract alongside the control"
---

An **action** declares what happens when an element is activated — this button *closes* the
alert it sits in. It is the second half of a pair: a [role](/roles/) says what an element
*is*, an action says what activating it *does*. Without one, a close button scaffolds as a
button that does nothing, and nothing in the spec records which child of an alert is the one
that closes it.

Actions are stored in `anatomy.<element>.actions` in the spec, as an array of entries. The
concept name is an open string; the documented vocabulary comes from ADR 087.

## Vocabulary

| Action | Status | Meaning | Contract addition |
|--------|--------|---------|-------------------|
| [`dismiss`](/actions/dismiss/) | implemented | Activating this element removes the component it belongs to | `onDismiss?: () => void` |
| [`navigate`](/actions/navigate/) | specified | Activating this element goes somewhere | `onNavigate?: (href?) => void` |
| [`submit`](/actions/submit/) | specified | Activating this element submits the values around it | `onSubmit?: () => void` |
| [`select`](/actions/select/) | specified | Activating this element chooses it among alternatives | `onSelect?: (selected?) => void` |
| [`open` / `close`](/actions/open/) | specified | Activating this element reveals or conceals a named surface elsewhere | `onOpen?` / `onClose?` |

Each page declares the concept's **payload** — named members and the deterministic source each value comes from — and its user message. `ACTION_SPECS` in the shared emitter core transcribes these pages the way `ROLE_SPECS` transcribes the role pages: the page is the specification, and when the two disagree the page is right. A `specified` concept emits nothing from the React and Web Components transforms yet; the A2UI target consumes its payload declaration.

## Roles and actions

The two keys sit side by side on the same element and never compete, because they answer
different questions. Where both want the same event they compose into a single handler,
in a defined order — see [precedence](/roles/precedence/). The test is announcement:

> **Does it change how the control is announced?** If yes, it is a role. If no, it is an
> action.

A `togglebutton` announces as a toggle and carries `aria-pressed`, so it is a role. A
`disclosure` announces its expanded state, so it is a role. A dismiss affordance announces as
an ordinary button and always would — the only thing that distinguishes it is the
consequence of pressing it — so it is an action.

That boundary is what keeps the role vocabulary confined to concepts ARIA and the native
platforms actually have. The alternative was a role per behavior-and-control pair —
`dismissbutton` — and the vocabulary would then grow as the product of the two, naming
concepts no platform has a counterpart for.

The two also differ in how many an element may carry. A role answers a question that has one
answer, so there is **at most one role per owned element**. A behavior does not, so an element may
carry **several actions**, one per `action:` line, in annotation order, with duplicates
collapsed.

## Where actions are authored

Actions are annotated in Figma, in the same Dev Mode annotation a role is, and
`specs generate` writes them into the component's anatomy. An annotation's label carries one
signal per line, in the form `key:value`, and an element may carry both keys:

```
role:button
action:dismiss
```

Anything the pipeline does not recognize is ignored, so an annotation may hold ordinary prose
alongside its signals, and an unrecognized action value costs nothing — the vocabulary is
open and grows in these docs without a schema release.

The variant rules are the ones roles already use: annotate the **default variant**, falling
back to a variant where the element appears; **annotate once**; where the same element is
annotated on more than one variant, the **first variant wins**.

## Owned elements and instances

Where the annotated element is one the component owns, an action is an **emission** signal:
the element gains the behavior's handler and the component's contract gains its props.

Where the annotated element is an **instance** of another component, it is a **routing**
signal instead. The instanced component keeps its own role and renders its own control; the
composing component only declares which child carries the behavior. This is what lets an
alert say "this icon button dismisses me" without the icon button knowing anything about
alerts — and it is why that instance takes an action but not a second `role: button`, which
would nest interactive content.

## Why entries, not strings

`actions` is an array of objects rather than a list of names, because a behavior will want
properties of its own: where focus moves after a dismissal, what a navigation targets,
whether a confirmation is required. `{ type: 'dismiss' }` has somewhere to put them; a bare
string does not. Only `type` is defined today.

## See also

- [Roles overview](/roles/) — what an element *is*, the other annotation key
- [Anatomy schema](/schema/anatomy/) — where `actions` lives in the spec
- [ADR 087](https://github.com/DirectedEdges/specs/blob/main/adr/087-behavior-actions.md) — the mechanism: the `action` key, the boundary test, resolution rules
- [ADR 067](https://github.com/DirectedEdges/specs/blob/main/adr/067-anatomy-element-roles.md) — the annotation grammar and variant rules both keys share
