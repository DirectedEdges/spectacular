---
title: "submit"
description: "Activating this element submits the values around it"
---

The `submit` action declares that activating an element sends the form it sits in — the sign-in button under two text inputs, the search button beside its field.

**Status:** specified — this page is the specification. The React and Web Components transforms do not emit it yet; the A2UI target consumes its payload declaration.

It is an **action**, not a role. A submit button announces as a [button](/roles/button/); nothing about its semantics changes. What distinguishes it is that pressing it gathers and sends the named values of the controls around it.

## Payload

| Member | Source | Meaning |
|---|---|---|
| `componentId` | the dispatching component | Which control submitted |

The submitted values themselves are not payload members this action declares, because the action cannot know them — they belong to the input controls, whose roles already owe the contract `name` and `value` (the form-identity obligations on [textbox](/roles/textbox/) and [checkbox](/roles/checkbox/)). A runtime target that two-way-binds those values (A2UI's data model) delivers them with the event for free; a code target reaches them through the form.

## User message

> Submitted

## Where to annotate it

On the activating element, inside the component (or composition) that holds the inputs:

```
role:button
action:submit
```

Role and action compose into one handler, role first, per [precedence](/roles/precedence/).

## Contract addition (specified)

| Prop | Type | Tier |
|------|------|------|
| `onSubmit?` | `() => void` | Always |

## See also

- [textbox](/roles/textbox/), [checkbox](/roles/checkbox/) — where the submitted values live
- [dismiss](/actions/dismiss/) — the shipped action this page's shape follows
