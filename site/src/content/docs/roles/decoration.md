---
title: "decoration"
description: "Declare that an element conveys nothing, so assistive technology skips it and its subtree"
---

`decoration` declares that an element carries no meaning a user needs to perceive — a background texture, a divider flourish, a gradient panel, an icon that merely repeats the text beside it. Without it a transform cannot tell such an element from one that matters, so it must expose all of them or none; the ones it exposes announce as "graphic" with no name, which is noise a screen reader user has to step past.

**Status** — React: Specified • Web Components: Specified • iOS: Not yet planned • Android: Not yet planned

The name is specs-native. ARIA's nearest token is `presentation`, which strips an element's own semantics and is therefore inert on the containers this lands on — a different mechanism with a similar word, and borrowing it would invite a transform to emit it.

## Roles

Apply the following roles to elements:

| Role | Type | Element |
|---|---|---|
| `decoration` | Part | Element of any type except `slot` and `instance` |

| Where | What is emitted |
|---|---|
| The decoration element | `aria-hidden="true"`, plus `focusable="false"` where the element emits an `<svg>` |
| Everything else | Nothing |

Tag, classes, `data-element` values, layout, and styling are unchanged — only the attribute is added, so nothing visual changes.

`decoration` is the one part that **resolves to no control.** Every other part wires to something: a `label` to the control it names, a `panel` to its disclosure, an `indicator` to the control whose state it draws. A decoration asserts a fact about itself alone, so there is nothing to resolve, nothing to route across a component boundary, and no component that must contain a control for it to be valid. A component whose only role is a decoration is well-formed.

### Why `slot` and `instance` are excluded

| Type | Why |
|---|---|
| `slot` | A slot's content comes from the consumer, who alone knows whether it means anything. Hiding it would hide content the component never saw |
| `instance` | A role on an instance [routes rather than claims](/roles/#parts-across-a-composed-component), and there is nothing to route. Declare the decoration inside the component that draws it |

### The focusable-content rule

**An `aria-hidden` element must not contain focusable content.** A decoration whose subtree holds an interactive element or a slot warns rather than emitting: hiding it would strand the focusable descendant where assistive technology cannot reach it, which is a worse defect than the noise the role was added to remove.

This is the same rule [`indicator`](/roles/indicator/) carries, and the reason the slot exclusion above is a type rule rather than a warning — a slot is focusable content by assumption.

### Not the same as `indicator`

Both emit `aria-hidden="true"`, and they assert different things:

| The element draws | Role | Because |
|---|---|---|
| State the control already announces | [`indicator`](/roles/indicator/) | It is validated against an accepting control, and `radio` consumes it into styling rather than emitting it |
| Nothing anyone needs to perceive | `decoration` | It belongs to no control and is never consumed |

Where both look right — a chevron on a disclosure, a tick inside a checkbox — `indicator` is the answer. It says more, and the extra it says is checked.

## Specs

Component anatomy typically has elements and roles like:

```yaml
anatomy:
  root:
    type: container
  backgroundFlourish:
    type: vector
    role: decoration
  divider:
    type: line
    role: decoration
  heading:
    type: text
```

## Figma

Annotate the following layers:

- background art, textures, and gradient layers as `role:decoration`
- rules and dividers drawn as `line` or thin `rectangle` layers as `role:decoration`
- an icon that only repeats adjacent text as `role:decoration`

Annotate the **outermost** layer of a decorative group, not each child. One `aria-hidden` on a wrapper removes the whole subtree, and annotating the children instead produces several attributes where one would do.

Where a decorative group's wrapper also holds something meaningful, it is not a decoration — move the art into its own layer first. That is an authoring change, not an annotation choice.

## React

### Implementation

Nothing. `decoration` is a declaration the component acts on for itself. It adds no prop, because there is no instance-level decision to make — an element the design declares meaningless cannot be made meaningful by a consumer. An element whose meaning varies per instance is an [image](/roles/image/).

### Before / After

```tsx
// before
<svg className="card__flourish" data-element="backgroundFlourish">{/* … */}</svg>

// after
<svg
  className="card__flourish"
  data-element="backgroundFlourish"
  aria-hidden="true"
  focusable="false"
>{/* … */}</svg>
```

### Contract

None.

## Web Components

Identical — `aria-hidden="true"` on the element inside the shadow root. No host involvement, because the attribute describes the decoration, not the component.

A root `decoration` is the one difference: the host cannot be hidden from inside its own shadow root, so the attribute lands on the host element itself. A component that is wholly decorative is a reasonable thing to build, and a consumer composing it inherits the hiding without having to know.

## iOS

Not yet planned. Intended binding:

| | |
|---|---|
| Emits | `.accessibilityHidden(true)` |
| Result | VoiceOver skips the element and its subtree |
| Rotor | The element is not a stop |

## Android

Not yet planned. Intended binding:

| | |
|---|---|
| Emits | `clearAndSetSemantics {}` |
| Result | TalkBack skips the element and its subtree |
| Alternative | `contentDescription = null` where the node is an `Image` — see [image](/roles/image/) |

## Additional details

### What it is not for

A decoration is not a way to quiet something inconvenient. Three cases that look like candidates and are not:

- **An element that repeats a fact the control announces.** That is an [`indicator`](/roles/indicator/), which says the same thing with a check behind it.
- **An element conveying something new — a count, a warning, a status dot.** Hiding it removes information, which is a defect rather than a tidy-up.
- **A layout container.** A wrapper that only stacks and spaces its children already announces nothing. `aria-hidden` on it adds a constraint — no focusable descendants — in exchange for no benefit. Leaving it [bare is the correct outcome](/roles/choosing/#when-the-answer-is-no-role).

## See also

- [indicator](/roles/indicator/) — decoration that specifically draws a control's state
- [image](/roles/image/) — a picture whose name the consumer supplies
- [Choosing a role](/roles/choosing/) — which of two plausible roles an element takes
- [Roles overview](/roles/) — the vocabulary and how roles are authored
