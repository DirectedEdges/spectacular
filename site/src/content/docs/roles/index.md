---
title: "Roles"
description: "Declare what an anatomy element is for, so transforms emit native controls, accessibility wiring, and event contracts"
---

A **role** declares the interaction semantic of an anatomy element — this element *is* the button, *is* the checkbox control, *is* the label for that control. Without roles, transforms emit visually correct but behaviorally inert markup: a button scaffolds as a `<div>` that cannot be focused or clicked through the contract, and a checkbox has no `<input>` to check. With a role, each transform deterministically emits the platform's native control, the accessibility wiring between elements, and the event handlers in the generated contract.

Roles are stored in `anatomy.<element>.role` in the spec. The value is an open string; the documented vocabulary comes from ADRs 067, 068, and 086 (087 for actions). Nothing is read or emitted unless [`settings.spec.roles`](/schema/settings/) is on.

## Control roles and part roles

The vocabulary splits into two kinds:

- **Control roles** name an interactive or announced thing — `button`, `checkbox`, `textbox`, `disclosure`, `alert`. A control role changes what element is emitted and adds event handlers to the contract.
- **Part roles** name a piece of a control — `label`, `value`, `errormessage`, `panel`. Most parts add **no handlers**: their value is id generation plus an attribute on some other element (a `<label htmlFor>`, an `aria-describedby`, an `aria-controls`). A part resolves **by component**, not by tree position: a part a value-bearing control accepts resolves to that component's single value-bearing control wherever either sits in the layout, and a part only the non-value-bearing concepts accept (`button`, `togglebutton`, `link`, `disclosure`) resolves to the nearest of those by proximity. Resolution never walks for an ancestor — a control's label and error message are usually siblings of it, not descendants.

## Where roles are authored

Roles are annotated in Figma, on the component node or on a layer inside it, and
`specs generate` writes them into the component's anatomy. No generated file is ever
hand-edited, and there is no authored file to keep in sync.

An annotation's text carries one signal per line, in the form `key:value`:

```
role:button
```

Anything the pipeline does not recognize is ignored, so an annotation may hold ordinary
prose alongside its signals, and existing annotations in a file pick up no new meaning.

**A spec carries the signals it recognizes, and nothing else from the annotation.** Prose,
review notes, and any other `key:value` line are read and discarded — they stay in the
Figma file and never reach the spec. So `specs generate` is lossy by design with respect
to annotations, and the reverse direction can only write back what the spec holds: an
element's `role` and `actions`. A render reproduces those two and no more.

That is also why the spec cannot tell you about an annotation that failed to land. There
is no record of what the file said, only of what the spec took from it, so comparing the
two needs a live read of the Figma file — which [`specs analyze roles`](/cli/analyze/roles/)
does not do, by design.

Three rules cover components with variants:

- Annotate the **default variant**. Where a layer does not exist there, annotate a variant
  where it does appear.
- **Annotate once.** One annotation per element per role.
- Where the same element is annotated on more than one variant, the **first variant wins**.

A component *set* carries no layers of its own, so roles go on a component node or below.

### Annotating a component whose root collapses

With [`collapsePrimitiveWrapper`](/settings/collapse-primitive-wrapper/) enabled, a root that wraps a single child is stripped and the child becomes the spec root — two Figma layers, one anatomy element. The spec records which layer each role came from, so the round trip puts it back where it was: `role` for the component node, `$extensions.com.figma.childRole` for the collapsed child.

Only `role` reaches generated code. **Annotate the component node** on a component that collapses; a role on the child is preserved and traceable but emits nothing. The settings page has the full table.

## Adopting roles across an existing library

A library that predates roles has none, and nothing observable in Figma supplies them — which makes adoption the one part of this system that is neither derivable nor free. Two shipped skills carry it, installed by [`specs skills install`](/cli/commands/skills/):

1. [`specs analyze roles`](/cli/analyze/roles/) measures what you have: which elements declare a role, which are bare and of what type, and which concepts the library has never reached for.
2. **`specs-cli.roles.propose`** reads those elements, the live components over the [bridge](/cli/commands/bridge/), and this vocabulary, then writes `reports/<YYYY-MM-DD>.roles.proposal.md` — one table for the whole library, a row per element, each with the evidence behind it.
3. You mark it up. Every row arrives checked as `[x]`; clearing it to `[ ]` skips that row. There is no third answer, so nothing has to be interpreted later.
4. **`specs-cli.roles.apply`** adds the approved roles to the Figma file as annotations, one page at a time. The write is additive, so existing notes survive, and an element that already carries a role is left alone.
5. `specs analyze roles` again, diffed against the first run, shows what landed. Then `specs react` — the sweep proves the annotation arrived, and only the emitted code proves the role did anything.

Four things about adoption that the per-role pages do not say, because they only appear at library scale:

- **One already-annotated component is worth a great deal.** It is the library's own convention, and it settles how every similar component should read. Annotate one field component by hand before proposing the rest.
- **Check each control against the parts it accepts, before proposing anything.** An element-by-element pass only sees elements that exist, so a part the design never drew is invisible to it. One library turned out to have a label and a description on every field and no error message anywhere — `errormessage` is implemented, and there was simply nothing to annotate. That is a finding about the library, not a proposal.
- **A component needing two announcement semantics has to be reauthored first.** An element the component owns carries at most one role, so a banner that interrupts as a danger and confirms as a success cannot say both on one element. Separate elements per semantic, then one role each — an authoring change, not an annotation choice.
- **Annotate the concept an element *is*, not the nearest thing that emits.** A concept with no implementation is inert: the spec carries it and every transform ignores it. A spec recording what an element is stays true as support arrives; one recording a near-miss has to be re-annotated, and nobody remembers which entries were compromises. Take that from the [Inventory](/roles/inventory/) rather than from whether a page exists — `group`, `radio` and `textarea` have full pages and emit nothing.

## Parts across a composed component

A part is authored in the component that **wires** it, which is not always the component
that renders it.

Where the element carrying the part is one the component owns, the part role is an
**emission** signal: this is where the `<label>`, the id, the `aria-describedby` target
is emitted.

Where the element is an `instance` of another component, it is a **routing** signal: the
consumer's control id is routed into that instance, and the instance emits its own
element. The wrapper's tag never changes, and two nested `<label>` elements are
impossible by construction — a component never emits a part's semantic element for
content it does not own.

A component with a part and no control of its own is valid and self-describing: a label
component carrying `label` declares that it *provides* that part. It emits the element
and an id, and no wiring, because it has nothing to wire to. Wiring arrives when it is
composed.

### Routing more than one part

A composed component may provide several parts — a label component that also holds a
description. So on an `instance` element, `role` accepts a list. The consumer names every
concept it is wiring:

```yaml
# switch — the consumer declares what it wires
formLabel:
  type: instance
  instanceOf: formLabel
  role: [label, description]
```

```yaml
# formLabel — the provider declares what it is
label:
  type: text
  role: label
description:
  type: text
  role: description
requiredAsterisk:
  type: text
  role: indicator
```

Each concept routes to whichever element of the provider ascribes it. **Two declarations
that must agree** — the consumer asserts, the provider declares — and a concept the
provider does not ascribe is an error naming it and the component. Nothing reads across
the boundary to resolve: the consumer has already said everything, and the agreement is
checked rather than discovered.

The consumer names concepts, never the provider's element keys, so renaming an element
inside the provider breaks nothing.

`requiredAsterisk` is not in the consumer's list. `indicator` is self-contained — it hides
itself wherever it renders and needs nothing routed — so naming it would wrongly suggest
the consumer wires it. Only parts that wire by id need declaring: `label`, `description`,
`errormessage`, `value`, `placeholder`.

### What routing looks like in emitted code

The consumer generates every id — it is the component that can see both ends — and hands
the wiring to the composed component as generated props. From the switch example above,
the consumer's scaffold emits:

```tsx
const actionRoleId = React.useId();
const formLabelDescriptionRoleId = React.useId();
// …
<FormLabel {...defaults} htmlFor={actionRoleId} descriptionId={formLabelDescriptionRoleId} />
// …
<input id={actionRoleId} type="checkbox" role="switch"
  aria-describedby={formLabelDescriptionRoleId} /* … */ />
```

and the provider's generated contract grows the id props, which its own part elements
prefer over their self-generated ids:

```tsx
<label htmlFor={p.htmlFor}>{p.label}</label>
<span id={p.descriptionId ?? descriptionRoleId}>{p.description}</span>
```

On Web Components id wiring cannot cross the boundary: an IDREF does not reach into
another shadow root, so the consumer's control and the provider's part cannot reference
each other. This is a deliberate decision, not a pending feature — the platform mechanism
aimed at it (`referenceTarget`) is experimental with limited browser support, and
generated output must not depend on a specific browser to work.

Accessible **text** recovers through a generated convention instead, in the same
two-sides-meet style as the routing itself: every provider whose own elements carry
text-bearing part roles exposes `partText(concept)` on its generated class — built from
its own spec's element→prop bindings, never from a name — and the consumer reads it at
runtime, feature-detected, mirroring the result onto its control as `aria-label` /
`aria-description`. A provider without the surface degrades to the warning. What does
not recover is activation: clicking the composed label's text does not operate the
control on this target.

In Figma this is one `role:` line per concept on the instance layer, the same way `action:`
lines accumulate. Where the set is annotated on more than one variant, the first variant
wins for the whole set.

## What a swapped element looks like

A role that replaces an element's tag — a container becoming a `<button>`, an `<a>`, or a
collapsed `<input>` — would inherit that element's user-agent styling: borders,
backgrounds, fonts, and padding the design never drew. The `css` transformer neutralizes
this wherever a role swaps the element: the swapped element gets `appearance: none`, zero
border, margin and padding, no background, and inherited font, color, and text alignment,
so the spec's own declarations govern and the before and after render alike. Anchors
additionally drop link decoration.

What a swap *can* change is structure, and each page records its own case: a proxy-input
role injects one sibling, a rehosted glyph adds one wrapper level, and the textbox
collapse changes the label's depth. Positional CSS in those subtrees needs review;
classes and `data-element` values never change.

## Platform reach

A role names a concept, not a web element. Every transform binds the concept to its own
platform's type, and **no binding is normative in the schema** — which is what lets one
vocabulary serve web, iOS, and Android without any of them owning it.

Most concepts reach all three platforms. Two do not, and that is recorded rather than
treated as a defect:

| Role | Reach | Note |
|------|-------|------|
| `spinbutton` | web + iOS | Compose has no stepper type; the concept degrades to its parts — the field plus its two affordance buttons |
| `increment` / `decrement` | web + Android | On iOS the `Stepper` owns these internally, so they are not separately addressable |
| everything else | all | — |

A concept that serves two platforms well and degrades explicitly on the third is a working
concept. Where a concept does not reach a platform it degrades to its **parts**, never to
nothing — the role still records that the affordances belong to the control between them,
which is information no structural analysis recovers.

## Where the names come from

The tokens are borrowed from several places, and it is easy to over-read that. Origin does
not predict reach: `password` is an HTML-derived name for a concept every platform has, and
`switch` is an ARIA name for a concept every platform has.

| Origin | Roles |
|--------|-------|
| WAI-ARIA role tokens | `button`, `link`, `checkbox`, `radio`, `switch`, `textbox`, `searchbox`, `spinbutton`, `slider`, `group`, `alert`, `status`, `progressbar` |
| ARIA *attribute* or APG *pattern* names | `togglebutton`, `disclosure`, `errormessage`, `description` |
| HTML element names | `textarea`, `password`, `label` |
| Spectacular-native, no external counterpart | `value`, `placeholder`, `indicator`, `panel`, `increment`, `decrement` |

Origin has exactly one consequence, and it belongs to the **web** transform alone: only the
first row contains legal ARIA role values. Emitting `role="disclosure"` or `role="password"`
is invalid — assistive technology discards an unrecognized role, leaving the element with no
semantics at all rather than approximate ones. Each role page states its web emission
explicitly for this reason.

For the iOS and Android transforms this distinction is inert, because neither platform has a
role string to emit. They bind concepts to native types and read the reach table above.

## The vocabulary

Every concept, what it declares, and whether anything emits for it yet, is on the
[Inventory](/roles/inventory/). The two tables below name the split the inventory
groups by.

Where two roles both look right for the same element — a two-state control that could be a
checkbox, a switch or a togglebutton; a piece of text that could be a description or an error
message — [Choosing a role](/roles/choosing/) gives the question that separates them.

## Control role vocabulary

| Role | Declares | Page |
|------|----------|------|
| `button` | An element that performs an action on activation | [button](/roles/button/) |
| `togglebutton` | A button with a persistent pressed state | [togglebutton](/roles/togglebutton/) |
| `link` | An element that navigates on activation | [link](/roles/link/) |
| `disclosure` | A trigger that shows and hides a companion panel | [disclosure](/roles/disclosure/) |
| `textbox` | A single-line free-text control | [textbox](/roles/textbox/) |
| `password` | A concealed-text control | [textbox](/roles/textbox/) |
| `searchbox` | A search-text control | [textbox](/roles/textbox/) |
| `textarea` | A multi-line text control | [textbox](/roles/textbox/) |
| `spinbutton` | A numeric control with stepper affordances | — |
| `slider` | A control selecting a value from a range | — |
| `checkbox` | A binary (or indeterminate) selection control | [checkbox](/roles/checkbox/) |
| `radio` | An exclusive-selection control within a group | [radio](/roles/radio/) |
| `switch` | An on/off control with immediate effect | [switch](/roles/switch/) |
| `group` | A set of related controls answered together | [group](/roles/group/) |
| `alert` | An assertive live region announcing interruptions | [status](/roles/status/) |
| `status` | A polite live region announcing transient updates | [status](/roles/status/) |
| `progressbar` | An element reporting progress toward completion | [status](/roles/status/) |

## Part role vocabulary

| Part | Declares |
|------|----------|
| `label` | The control's visible label; wires `htmlFor` to the control. On a `group` it emits `<legend>` |
| `description` | Supplementary text; wires `aria-describedby` |
| `errormessage` | Validation message; wires `aria-describedby` when it renders |
| `value` | The element standing in for the control's value |
| `placeholder` | The element standing in for placeholder text |
| `indicator` | Decorative state indicator (check glyph, switch thumb); `aria-hidden` |
| `panel` | The region a `disclosure` shows and hides |
| `increment` | Step-up affordance on a `spinbutton` |
| `decrement` | Step-down affordance on a `spinbutton` |

Composite widgets — `dialog`, `tablist`/`tab`, `menu`, `combobox`/`listbox`/`option`, `select`, `tooltip` — are deferred to a future vocabulary: their value is focus and keyboard *behavior*, which scaffolds deliberately do not implement. Until that lands, the `selected` state concept has no role that bridges it and keeps its `data-*` behavior.

## Roles and actions

A role answers what an element **is**. A second annotation key, [`action`](/actions/), answers
what activating it **does** — a dismiss affordance in an alert is a button in every way that
announcement can see, and what distinguishes it is that pressing it closes the alert. The two
keys sit side by side on the same element:

```
role:button
action:dismiss
```

Two keys, and deliberately only two. Both are **categorical**: each names a concept from
a governed vocabulary, and each answers a question about the element that has one answer.
A key for every attribute a platform happens to accept — autofill hints, input modes,
spellcheck — would make the annotation surface an API in its own right, with no principle
saying where it ends. Facts that are neither identity nor behavior reach the output as
**contract props** the consumer sets, not as annotations.

The boundary between them is announcement:

> **Does it change how the control is announced?** If yes, it is a role. If no, it is an
> action.

`togglebutton` and `disclosure` announce their own state, so both are roles. `dismiss` never
changes how its button is announced, so it is an action. Keeping the two apart is what confines
this vocabulary to concepts ARIA and the native platforms have counterparts for — the
alternative was a role per behavior-and-control pair, such as `dismissbutton`, which no
platform can bind to a native type.

An element the component **owns** carries **at most one role**, because the question of what
it *is* has one answer. It may carry **several actions**, because that question does not. An
`instance` element is different — see below — because a role there routes rather than claims. Where a role and an action want the
same event, they compose into one handler rather than competing — see
[precedence](/roles/precedence/). Both keys are read from the same
annotation, with the same variant rules, and both route rather than emit when they land on an
`instance` element.

## Roles and states

Roles and the [`states` convention](/settings/states/) are **independent inputs**. Either can
exist without the other, and neither supersedes the other. They answer different questions:

| Input | Answers |
|-------|---------|
| the `states` convention | Which variant prop carries this concept? |
| `anatomy.role` | What mechanism is available to express it? |

Neither answer is derivable from the other. The states convention cannot know an element will
become a native control; the role cannot know a library spells its disabled state
`isDisabled`. A states classification with no role behaves exactly as it does today, and a
role with no states classification still emits its element, its semantics, and its contract
additions.

Where both apply to the same concept on the same element, the concept is emitted **once**:
the role decides the mechanism, the config decides which prop drives it. The full rule,
including what happens when a role claims a concept nothing drives, is on
[precedence](/roles/precedence/). What a role changes
is emission quality — `disabled` becomes a real attribute rather than an `aria-disabled`
string on an inert container.

This holds for the pointer and focus concepts too, where it is easiest to get backwards. A
role makes `:hover` and `:focus-visible` *reachable*, because a container can never enter
those states and a native control always can. The config is what makes them *addressable*,
by naming which variant prop's styling belongs to each. Both are needed; a role never makes
a states entry unnecessary.

The dependency runs **role → states**, not the reverse. Several roles generate real state
management — a `togglebutton` flips its own pressed state — and to do that they must be told
which prop holds the state. Only the `states` convention can tell them. Without that binding the
role degrades to an inert handler and warns.

### The wired state model

Every wired role — `togglebutton`, `disclosure`, `checkbox`, `switch`, `textbox` — holds
its state the same way, and it is neither of the two classic modes:

- **Between prop changes the component is uncontrolled.** Internal state is seeded from
  the classified prop, the control moves itself on interaction, and the consumer callback
  reports each change. A consumer may attach nothing and the control still works.
- **Whenever the prop changes, the prop wins.** The scaffold detects the change during
  render and resets its internal state to the new value — a consumer driving the prop
  from external state (including one that just echoes the callback back) gets classic
  controlled behavior, not a component that ignores it.

There are deliberately no `default*` companion props: the classified prop is both the
seed and the override, so there is one prop per state fact rather than two. The one
consequence to know: setting the prop to the *same* value the control has already moved
to is not a change, and does not snap the control back.

## See also

- [Choosing a role](/roles/choosing/) — the question that separates each role from the ones it is confused with
- [Precedence](/roles/precedence/) — how role, states and action resolve when more than one applies
- [Actions overview](/actions/) — what activating an element *does*, the other annotation key
- The [`states` convention](/settings/states/) — state concept classification the roles bridge
- [Anatomy schema](/schema/anatomy/) — where `role` lives in the spec
- [ADR 067](https://github.com/DirectedEdges/specs/blob/main/adr/067-anatomy-element-roles.md) — the mechanism: role field, Dev Mode annotation, obligations, contract composition
- [ADR 068](https://github.com/DirectedEdges/specs/blob/main/adr/068-form-control-roles.md) — form controls and field plumbing
- [ADR 086](https://github.com/DirectedEdges/specs/blob/main/adr/086-interactive-root-roles.md) — interactive roots and announcements
