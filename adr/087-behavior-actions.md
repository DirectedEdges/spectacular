# ADR 087: Behavior Actions via `anatomy.action`

**Branch**: `feat/react-from-specs`
**Created**: 2026-09-04
**Status**: ACCEPTED
**Summary**: An `action` field on an anatomy element records what activating it *does*, separate from the `role` that says what it *is*, so behavior and semantics compose rather than multiplying the vocabulary.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none; extends ADR 067)*

---

## Context

ADR 067 established `anatomy.<element>.role`, generated from a Dev Mode annotation of the
form `role:<concept>`, and the grammar that reads it: an annotation label is split on
newlines, every `key:value` line is a candidate signal, and only recognized keys are
consumed. `role` is the only recognized key today.

A role answers **what an element is**. It is a noun, and each concept names a control kind
that a platform has a counterpart for — `button`, `link`, `checkbox`. ADR 067 also fixes
**at most one role per owned element**, because composite semantics belong on distinct elements
and role resolution depends on that being true.

Some signals a designer wants to record are not what an element *is*. A dismiss affordance
in an alert is a button — it announces as a button, it takes the same native element, and
nothing about its accessible semantics differs. What distinguishes it is **what activating
it does**: the alert goes away.

That signal has nowhere to live today:

- It cannot be a second role on the same element — the one-role-per-element rule forbids it,
  and relaxing that rule would make part resolution ambiguous.
- It cannot be folded into `button` — every button would inherit it.
- It cannot be a new control role such as `dismissbutton`, because the vocabulary would then
  grow a concept per *behavior × control* pair rather than per control kind, and the concepts
  would stop mapping onto platform controls.

The validation library has the case directly. `deAlert` composes `deIconButton` as its
`dismiss` element; the icon button already carries `role:button` in its own spec, so the
alert has no way to state that activating that particular child closes it.

## Decision Drivers

- **Additive only**: extend the spec with an optional field; absence must behave exactly as
  today
- **One concept per axis**: a signal about what an element *is* and a signal about what it
  *does* are different questions and should not compete for one key
- **No new mechanism**: the annotation grammar already parses arbitrary `key:value` lines
  against a recognized-key list, so a second key should cost nothing to read
- **Declared, never inferred**: behavior must be stated by an author, never derived from a
  layer name, a prop name, or the shape of the emitted output
- **Open vocabulary, docs-governed**: like `RoleConceptName`, the set of behaviors grows in
  documentation without a schema release, and unrecognized values are ignored
- **Platform-neutral**: a behavior names an intent; each platform transform binds it to its
  own idiom

---

## Options Considered

Two decisions are in scope: whether behavior gets its own key at all, and what that key is
called.

## Decision 1 — Where a behavior signal lives

### Option 1A: A second annotation key on a parallel field, `anatomy.<element>.action` *(Selected)*

An element may carry a role, a behavior, or both. They are separate keys in the annotation
and separate optional fields on `AnatomyElement`.

```
role:button
action:dismiss
```

**Pros**:

- The one-role-per-element rule is untouched, because a noun and a verb are not two roles
- The annotation grammar reads it with no change — `action` becomes a second recognized key
- Role vocabulary stays confined to control kinds that platforms have counterparts for
- On an `instance` element it is a **routing** signal, exactly as a part role is: the alert
  declares which child dismisses it, while the child keeps its own `role:button` in its own
  spec. Noun and verb live in different files and never conflict
- Behaviors and roles evolve independently — a behavior can be added for a control kind that
  already exists

**Cons / Trade-offs**:

- Two vocabularies for an author to learn rather than one
- The boundary needs a stated test, or every new concept becomes an argument about which key
  it belongs to (see the Decision section)

---

### Option 1B: Allow multiple roles per element *(Rejected)*

Let an element carry `role:button` and `role:dismiss` together.

**Rejected because**: it breaks ADR 067's one-role-per-element rule, which part resolution
depends on. With two roles on an element, "the nearest control role" and "at most one element
per part role per control" both become ambiguous, and the ambiguity is silent.

---

### Option 1C: Compound control concepts (`dismissbutton`) *(Rejected)*

Add a role per behavior-and-control pair.

**Rejected because**: the vocabulary would grow as the product of behaviors and control
kinds, and the resulting concepts would no longer map onto platform controls — the property
that lets a role bind to a native type on every platform. `dismissbutton` has no counterpart
in ARIA, SwiftUI or Compose; `button` does.

---

### Option 1D: A prop-role binding *(Rejected)*

Express it through `propRoles`, as `accessibleName` and `value` are.

**Rejected because**: `propRoles` answers "which prop carries this fact," and a dismiss
affordance is an element, not a prop. ADR 067's scope discipline is explicit: anything an
element can carry is annotated on that element.

---

## Decision 2 — What the key is called

The key is called `action`. Three other candidates were weighed, and one — `command` — has
real web-platform precedent worth recording even though it is not taken.

### Option 2A: `action` *(Selected)*

```
action:dismiss
```

**Pros**:

- **Accurate.** An action is what a control does when activated, which is exactly the signal.
  The alternative, `event`, names the wrong half: the *event* is the click, and `dismiss` is
  the response to it
- Has counterparts on every target platform — `UIAction` on iOS, click semantics on Android,
  and the general accessibility notion of a control's action
- Unambiguously a verb, so it does not invite event-shaped values such as `hover` or `focus`,
  which this key is not for and which have their own home in `processing.states`

**Cons / Trade-offs**:

- Slightly less immediately familiar than `event` to someone arriving from `onClick`
- "Action" is an overloaded word in application frameworks (Redux actions, server actions);
  the annotation's meaning is narrower than any of them

---

### Option 2B: `event` *(Rejected)*

```
event:dismiss
```

- Immediately familiar to anyone who has written `onClick`, and reads naturally alongside the
  contract surface it produces, which is an event handler

**Rejected because**: it names the wrong half of the interaction. The event is the click;
`dismiss` is what happens in response, so `event:dismiss` reads as "the dismiss event," which
is not what is being declared. It also invites future values that genuinely are events —
`event:hover`, `event:focus` — which belong to state classification, not here.

---

### Option 2C: `command` *(Rejected)*

```
command:dismiss
```

- **Has direct web-platform precedent.** The Invoker Commands API ships `command` and
  `commandfor` attributes on `<button>`, with values such as `close`, `show-modal` and
  `toggle-popover`, plus author-defined `--custom` commands. A generated button could map a
  `command:` annotation onto the native attribute where the value lines up
- The vocabulary is close in spirit: declarative behavior stated on the activating element

**Rejected because**: borrowing a platform keyword invites the assumption that our vocabulary
is that vocabulary, and it is not — ours is platform-neutral and open, theirs is web-specific
and tied to dialog and popover semantics. The collision would be most confusing exactly where
the two overlap. Worth revisiting only if the transform intends to emit the native attribute.

---

### Option 2D: `behavior` *(Rejected)*

**Rejected because**: too broad. It invites values that are not activation responses at all —
drag, autofocus, scroll-into-view — which would need different resolution rules and different
contract surface. The key should describe one axis, not everything non-structural.

---

### Option 2E: `on` *(Rejected)*

**Rejected because**: `on:dismiss` reads as an event binding in several frameworks, so it
suggests the value is an event name and the annotation is wiring a listener. It is neither.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `types/Anatomy.ts` | Add exported type alias `ActionConceptName` (open string; documents the vocabulary) | MINOR |
| `types/Anatomy.ts` | Add exported interface `ActionEntry` (`{ type: ActionConceptName }`) | MINOR |
| `types/Anatomy.ts` | Add optional field `actions?: ActionEntry[]` to `AnatomyElement` | MINOR |
| `types/index.ts` | Export `ActionConceptName`, `ActionEntry` | MINOR |

**Example — new shape** (`types/Anatomy.ts`):

```yaml
# Before
AnatomyElement:
  type: ElementType | ElementTypeRef
  detectedIn?: string
  instanceOf?: string | SubcomponentRef
  role?: RoleConceptName

# After
AnatomyElement:
  type: ElementType | ElementTypeRef
  detectedIn?: string
  instanceOf?: string | SubcomponentRef
  role?: RoleConceptName
  action?: ActionConceptName   # optional — MINOR
```

`ActionConceptName` is an open `string` alias, matching `RoleConceptName` and
`StateConceptName`. The vocabulary is published on the docs site and grows without a schema
release; unrecognized values are ignored by transforms, so a spec and a transform may
disagree without breaking.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `schema/component.schema.json` | Add `actions` array to the anatomy element definition (optional; items require `type`) | MINOR |

```yaml
actions:
  type: array
  items:
    type: object
    required: [type]
    properties:
      type:
        type: string
        description: "The behavior's concept name (e.g. 'dismiss')."
  description: "Behaviors invoked when this element is activated, generated from Dev Mode annotations of the form action:<concept>."
```

**An array of objects, not a string.** Two reasons, both about what comes next rather than
what exists today:

- An element may reasonably perform more than one behavior, and a scalar field would have to
  become an array later — a breaking change once specs carry it.
- A behavior will want properties of its own. Where focus moves after a dismissal, what a
  navigation targets, whether a confirmation is required: all of these belong to the action,
  not to the element. `{ type: 'dismiss' }` has somewhere to put them; `action: 'dismiss'`
  does not.

Only `type` is defined now. The annotation grammar produces one entry per `action:` line, in
annotation order, with duplicates collapsed.

### Where the boundary sits

A stated test, so the two keys do not become an argument:

> **Does it change how the control is announced?** If yes, it is a `role`. If no, it is an
> `action`.

- `togglebutton` announces as a toggle and carries `aria-pressed` — a **role**
- `disclosure` announces its expanded state and controls a region — a **role**
- `dismiss` announces as an ordinary button and always would — an **action**

This keeps roles confined to concepts ARIA and native platforms have, and puts application
behavior on its own axis.

### Resolution rules

`action` follows the rules `role` already has, because they arrive through the same mechanism:

1. **Read from the same annotation**, as a `key:value` line in a Dev Mode annotation's label.
2. **The same variant rules** — annotate the default variant, fall back to a variant where
   the element appears, annotate once, first variant wins in child order.
3. **On an element the component owns, it is an emission signal** — the element gains the
   behavior's contract surface and its handler.
4. **On an `instance` element it is a routing signal only.** The instanced component keeps
   its own role and renders its own element; the composing component declares which child
   carries the behavior. This is what lets an alert say "this icon button dismisses me"
   without the icon button knowing anything about alerts.
5. **An unrecognized value is ignored**, with no diagnostic — the vocabulary is open.
6. **Several actions per element are permitted**, one per `action:` line, in annotation order. Duplicates collapse — declaring the same behavior twice means the same thing once. This is where actions differ from roles on an element the component **owns**: what that element *is* has one answer, and what activating it *does* does not. On an `instance` element the asymmetry disappears, because neither key is claiming anything about the wrapper — both route into the composed component, and both accept several (ADR-067 rule 5).

### Vocabulary snapshot

**Not authoritative.** The live vocabulary is at `/actions/` on the docs site.

| Concept | Meaning | Contract addition | Notes |
|---|---|---|---|
| `dismiss` | Activating this element removes the component it belongs to | `onDismiss?: () => void` | The component stops rendering itself; the consumer is notified. Focus handling is the consumer's — see Consequences |

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `AnatomyElement.actions` → `actions` array on the anatomy element definition in
    `component.schema.json` (optional; items are objects requiring `type`)
  - `ActionConceptName` is documentation-only (open string), matching the `RoleConceptName`
    and `StateConceptName` precedent — no schema enum
  - `ActionEntry` is a real interface with a real schema counterpart, because it has
    structure a consumer reads

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Populates `anatomy.<element>.action` during generation | Recognize `action` as a second annotation key; apply the same variant resolution as `role` |
| `specs-cli` | Transforms gain a behavior signal alongside the role signal | Read `anatomy.<element>.action`; emission per concept is defined by the docs vocabulary |
| `specs-plugin-2` | May surface recognized behaviors in UI | Recompile; optional |

---

## Semver Decision

**Version bump**: MINOR

**Justification**: All changes are additive optional fields (`action` on `AnatomyElement`)
plus one new exported alias. Absence behaves exactly as today. Per constitution III: "MINOR
for additive types or new optional fields."

---

## Consequences

**The vocabulary stops growing along the wrong axis.** Without a second key, every behavior
would have become a control concept, and the role vocabulary would have drifted away from the
platform controls it exists to name.

**Composition works without either side knowing about the other.** An icon button declares
what it is; an alert declares what one of its children does. Neither file mentions the other's
concern, and the same icon button is reused elsewhere with no dismiss behavior attached.

**`dismiss` is scaffold-grade and says so.** The component stops rendering itself and notifies
the consumer. It does **not** manage focus — activating it drops focus to the document, which
a production component must handle and a scaffold does not. The docs page states this rather
than leaving it to be discovered. This is a deliberate limit, not an oversight.

**React and Web Components differ, visibly.** React returns `null`; a custom element sets
`hidden` rather than removing itself, because a scaffold should not do anything irreversible.
Each target's page says which.

**The key name was chosen deliberately, and `command` is the one to revisit.** `event` was
the first candidate and was rejected for naming the response as though it were the trigger.
`command` remains interesting only if the web transform ever emits the native Invoker Commands
attribute — at which point aligning the vocabularies would buy something concrete. Until then
the platform-neutral term is the right one.
