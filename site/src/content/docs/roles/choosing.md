---
title: "Choosing a role"
description: "The question that separates each role from the ones it is most often confused with"
---

Every role page says what its concept declares. This page answers the question you actually
face when annotating a library: **between two roles that both look right, which one is this?**

Each cluster below groups roles that compete for the same element. For each, the evidence that
points at the cluster, then the single question that resolves it. The questions are deliberately
about the design's intent rather than its markup — what a control *does* is the thing only a
designer knows, and it is the thing the vocabulary is organised around.

One rule governs all of them. From [the roles overview](/roles/): **does it change how the
control is announced?** If yes, it is a role. If no, it is an [action](/actions/). Everything
here is downstream of that.

## Binary and persistent: `checkbox`, `switch`, `togglebutton`

The hardest cluster, because all three are two-state, all three keep their state, and all three
are often drawn as a track with a knob or a box with a tick.

**Evidence that you are here:** a boolean prop named `checked`, `on`, `enabled`, `pressed`,
`selected`, or `active`, usually with a `disabled` sibling, on a component whose name contains
toggle, switch, check, or nothing at all.

> **When does the change take effect, and what is it part of?**

| Answer | Role |
|---|---|
| Immediately, and it stands alone — a setting | [`switch`](/roles/switch/) |
| On submit, as one answer in a form | [`checkbox`](/roles/checkbox/) |
| Immediately, and it is a *button* that stays in | [`togglebutton`](/roles/togglebutton/) |

The switch/checkbox line is about **form participation**, not appearance. A notification setting
drawn as a tickbox is still a `switch`; a terms-acceptance drawn as a sliding track is still a
`checkbox`. Ask whether a submit button exists that this value travels with.

The togglebutton line is about **whether the thing is a button**. A bold control in a formatting
bar, a favourite heart, a filter chip that stays on — these perform an action *and* retain a
condition. If removing the two-state behaviour would still leave something you would call a
button, it is a `togglebutton`.

A component named `toggle` or `togglegroup` is the trap: the name tells you nothing. Libraries
use it for all three.

## Activation: `button`, `link`

**Evidence:** an element with pointer affordance and no state of its own.

> **Does activating it act, or go somewhere?**

A [`link`](/roles/link/) navigates. It opens in a new tab on modifier-click, appears in a screen
reader's list of links, and can be copied as a URL. A [`button`](/roles/button/) does none of
that. The distinction is not cosmetic, and a button styled as a link is still a button.

Where the answer is "it reveals something already on the page", you are in the next cluster.

## Revealing: `disclosure`, `togglebutton`, `button`

**Evidence:** a prop named `expanded`, `open`, or `collapsed`; a component named accordion,
collapsible, details, or "show more".

> **Is there a companion region on the page whose visibility this controls?**

If yes, [`disclosure`](/roles/disclosure/) — and the region it reveals takes
[`panel`](/roles/panel/). Trigger and region are **one concept, not two**: the trigger carries
the role, the panel carries the part, and the association follows from the pairing.

If no — it opens a dialog, navigates, or flips something unrelated — it is a `button` or a
`togglebutton` by the question above. `expanded` on its own is not enough; a menu trigger also
has it, and composite widgets like menus are [deliberately out of this
vocabulary](/roles/#the-vocabulary) for now.

## Free text: `textbox`, `password`, `searchbox`, `textarea`

**Evidence:** a text element standing in for typed content, usually beside a label and a
placeholder; props named `value`, `placeholder`, `maxLength`.

> **What kind of text, and how much of it?**

| Answer | Role |
|---|---|
| One line of anything | [`textbox`](/roles/textbox/) |
| Concealed | [`password`](/roles/textbox/) |
| A search query | [`searchbox`](/roles/textbox/) |
| Several lines | [`textarea`](/roles/textbox/) |

These are four concepts rather than one with a modifier because each names a distinct native
type on at least one platform. Choosing `textbox` where `password` belongs is not a styling
difference — it is a missing concealment and a missing autofill contract.

The text elements *around* the control are parts, not controls. See the next cluster.

## Which part is this text?

**Evidence:** a `type: text` element inside a component that has a control.

> **What is this text for?**

| Answer | Part |
|---|---|
| It names the control | [`label`](/roles/label/) |
| It explains or qualifies the control | `description` |
| It says what is wrong, and renders only when something is | [`errormessage`](/roles/errormessage/) |
| It stands in for the control's current value | [`value`](/roles/value/) |
| It stands in for text shown when the value is empty | `placeholder` |

`description` and `errormessage` both wire through the same mechanism and are easy to merge by
mistake. Keep them apart: a description is always present, an error message renders
conditionally, and only the error message should disappear when the control is valid. A
conditionally-visible text element bound to a nullable prop is usually `errormessage`; an
always-present one is `description`.

`value` and `placeholder` matter because a designed text field is a *stack* of text layers where
a native control is one element with attributes. Without these parts a transform would have to
guess which layer is which.

## Decoration that announces nothing: `indicator`

**Evidence:** a glyph, vector, or small container that appears in some variants and not others —
a tick inside a checkbox, the knob of a switch, a chevron on a disclosure.

> **Does this element convey state the control already announces?**

If yes, it is an [`indicator`](/roles/indicator/), and its job is **subtraction**: the control
already says "checked", so a glyph that also exposes itself announces the same fact twice, the
second time as noise. This is the one part that exists to remove something.

An element that appears conditionally but conveys something *new* — a count, a warning text — is
not an indicator.

## Gathering controls: `group`

**Evidence:** a component containing several controls of the same kind, often with a heading, and
frequently named fieldset, group, or radiogroup.

> **Are these controls one answer, or several?**

[`group`](/roles/group/) is for one answer gathered from several controls: a set of radios, a row
of related checkboxes, an address block. The heading that says what is being chosen becomes
programmatically connected to the set, and a `disabled` variant disables rather than merely
greys.

A toolbar, a list of unrelated settings, or a card containing a button is not a group. The test
is whether a user would describe the set as answering one question.

Within a group, each option takes [`radio`](/roles/radio/) when the choice is exclusive and
`checkbox` when it is not. A `radio` cannot un-choose itself — only a sibling becoming chosen
clears it — which is why exclusivity has its own role rather than being a property of the group.

## Announcing change: `status`, `alert`, `progressbar`

**Evidence:** a component named toast, banner, alert, snackbar, spinner, meter, or progress, and
content that arrives *after* load.

> **How urgent is it, and is there a value to report?**

| Answer | Role |
|---|---|
| A transient confirmation — saved, copied | [`status`](/roles/status/) |
| An interruption that must be heard now | [`alert`](/roles/status/) |
| Progress toward completion | [`progressbar`](/roles/status/) |

There is no partial credit in this cluster: a live region declared **after** its content arrives
announces nothing at all. Because the declaration has to be in the markup up front, this is
exactly the kind of fact a spec can carry and a runtime cannot infer — which makes annotating a
toast component more valuable than it looks.

A dismiss affordance inside an alert is a `button` in every way announcement can see. What
distinguishes it is that pressing it closes the alert, and that is an
[`action`](/actions/), not a role.

## When the answer is "no role"

Most elements in a library take no role, and leaving them bare is the correct outcome rather
than a gap:

- **Layout containers.** A wrapper that only stacks and spaces its children carries nothing.
- **The root, usually.** A role belongs on the element that *is* the control. For a checkbox
  that is the control element, not the component root that also holds the label.
- **Anything whose concept is not in the vocabulary yet.** Dialogs, tabs, menus, comboboxes and
  tooltips are [deliberately deferred](/roles/#the-vocabulary), because their value is focus and
  keyboard behaviour that scaffolds do not implement. Annotating them with a near-miss role is
  worse than leaving them alone.
- **An element that already carries a role.** One element the component owns takes **at most
  one** role, because the question of what it *is* has one answer.

A concept in the vocabulary that nothing emits yet is also a reasonable thing to annotate: the
spec carries it, every transform ignores it, and nothing breaks. The
[Inventory](/roles/inventory/) records which those are.

## See also

- [Roles overview](/roles/) — what a role is, how one is authored, and the platform reach
- [Inventory](/roles/inventory/) — every concept and whether anything emits for it yet
- [Precedence](/roles/precedence/) — how a role, a states classification and an action resolve together
- [Actions](/actions/) — what activating an element *does*, the other annotation key
