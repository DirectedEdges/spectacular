# ADR 068: Form Control and Field Plumbing Role Concepts

**Branch**: `feat/react-from-figma`
**Created**: 2026-08-08
**Status**: ACCEPTED
**Deciders**: Nathan Curtis (author)
**Summary**: Role concepts for form controls and the parts that plumb a field — `textbox`, `checkbox`, `switch`, `label`, `errormessage` and their siblings — so a control and the elements describing it resolve to one another.
**Decides**: none
**Supersedes**: *(none; extends ADR 067; companion to ADR 055)*

---

## Context

ADR 067 establishes `anatomy.<element>.role`, the Dev Mode annotation that generates it, the
`processing.propRoles` prop bindings, and the contract composition rules. It also makes
`RoleConceptName` an **open string** with no schema enum, exactly as ADR 055 did for
`StateConceptName`.

This ADR takes one decision: **what shape the form-control vocabulary has, and how it changes
over time.** It deliberately does not decide transform behavior.

Today the `react` transform emits form components with no form semantics. A checkbox
scaffolds with no `<input>`, an incorrect `aria-selected` bridge, and unassociated label and
error-message instances. The missing native element cascades:

- No focus, keyboard, or form participation (`name` / value submission, constraint validation)
- No change contract — the scaffold is render-only
- The `css` transformer's pseudo-class selectors (`:checked`, `:disabled`,
  `:placeholder-shown`) target states the markup can never enter
- Label, description, and error elements exist in the anatomy but carry no `htmlFor` or
  `aria-describedby` association

A vocabulary is what lets a transform fix all of that without guessing.

**What is deliberately not here.** Emission strategies, per-concept attribute bridges,
contract additions, wiring rules, and worked illustrations were drafted before any transform
existed. They are hypotheses, not decisions, and freezing them in an accepted record would
create obligations to untested design. They now live in
`projects/018-behavior-conventions/form-control-transform-behavior.md`, and whatever survives
contact with the code belongs on the docs site.

---

## Decision Drivers

- **Additive only**: extends a documented open-string vocabulary; no schema structural change
- **Platform-neutral concepts, per-platform bindings**: a concept names an interaction
  semantic; each platform transform binds it to its own idiom. Nothing web-specific enters the
  vocabulary or the schema
- **Native-first**: where a platform provides a native control, name the concept so a
  transform can reach for it
- **Cheap to change**: the vocabulary will be wrong in places, and finding out requires
  annotating a real library. Correcting it must not require an ADR
- **Usable on a real library**: a concept set that cannot describe the validation library's
  text-input family is not a usable set

---

## Decision — An open, docs-governed set of flat leaf concepts

### Option A: Flat leaf concepts, open string, docs site as the registry *(Selected)*

One concept per distinct control, spelled as a single flat lowercase token. The set is carried
in `RoleConceptName`'s documentation and published at `/roles/` on the docs site. **Adding,
renaming, or removing a concept is a documentation change and does not require an ADR.**

This is safe because ADR 067 already specifies that **unrecognized role values are ignored by
transforms**. A spec naming a concept a transform does not know degrades to today's behavior
rather than breaking, so vocabulary and transform move independently and in either order.

- Matches the `StateConceptName` precedent exactly — an open alias whose live vocabulary lives
  in the docs (`/settings/states/`), which nobody has found under-specified
- Keeps the expensive, stable decisions (schema shape, transmission, obligations) in ADR 067
  where they belong, and keeps the cheap, volatile one out of the record entirely
- A concept resolves on its own, so a transform reads one value rather than deriving intent
  from a combination of other config
- Concept names are what designers annotate, so they deserve care — but care here is
  editorial, not procedural

**Cons / Trade-offs**:

- Nothing procedurally prevents churn, and churn means re-annotating files. The brake is
  editorial judgment and docs review, not an approval gate
- A reader looking for "the official list" must go to the docs rather than to this record. The
  snapshot below is a convenience and is explicitly not authoritative

---

### Option B: Enumerate the vocabulary in the schema *(Rejected)*

Close `RoleConceptName` to a schema enum, validated on read.

**Rejected because**: it makes every vocabulary addition a schema release, and a spec written
against a newer vocabulary fails validation against an older schema instead of degrading.
That is the coupling ADR 055 already rejected for state concepts, for the same reasons.

---

### Option C: One ADR per vocabulary change *(Rejected)*

Keep the vocabulary here and amend this ADR whenever it changes.

**Rejected because**: the vocabulary is the part of this feature most likely to be wrong, and
the only way to find out is to annotate a real library and read the output. Making each
correction an ADR amendment taxes exactly the iteration the design needs most, and produces a
record whose entries are mostly reversals of earlier entries.

---

### Option D: A single generic `control` concept, with the kind inferred *(Rejected)*

One concept, with the control's kind derived from its `processing.states` classification.

**Rejected because**: it reintroduces inference. Two libraries with identical state configs
can mean different controls, and the signal that distinguishes them is exactly what the author
is trying to state.

---

## Vocabulary snapshot

**Not authoritative.** The live vocabulary is at `/roles/` on the docs site. This table records
the set at the time of writing so the ADR reads on its own, and may be edited without amending
this record.

### Form control concepts

Placement: **root** when the whole component is the control (annotate the component node), **element** when the control sits inside a field composite (annotate the layer). Both use `role:<concept>`.

| Concept | Typical web emission | Accepted element types | Accepted parts |
|---|---|---|---|
| `textbox` | `<input type="text">` | container | `value`, `placeholder`, `label`, `description`, `errormessage` |
| `password` | `<input type="password">` | container | as `textbox` |
| `searchbox` | `<input type="search">` | container | as `textbox` |
| `spinbutton` | `<input type="number">` | container | as `textbox` + `increment`, `decrement` |
| `slider` | `<input type="range">` | container | `value`, `label`, `description` |
| `checkbox` | `<input type="checkbox">` | container, glyph | `label`, `description`, `errormessage`, `indicator` |
| `radio` | `<input type="radio">` | container, glyph | as `checkbox` |
| `textarea` | `<textarea>` | container | as `textbox` |
| `switch` | `<button type="button" role="switch" aria-checked>` | container | `label`, `description`, `indicator` |

The emission column is an orientation aid, not a specification — it says what a concept
means in the most familiar terms. What a transform actually emits, and by which strategy, is
transform behavior and lives outside this record.

**Part concepts used above** — bare names, scoped to the nearest ancestor control per ADR 067:

| Part | Meaning | Emission |
|---|---|---|
| `value` | the element standing in for the control's value | consumed by `collapse` into the control's value |
| `placeholder` | the element standing in for placeholder text | consumed into the `placeholder` attribute |
| `label` | the control's visible label | `<label htmlFor>`, or supplied by the control's `wrap` |
| `description` | supplementary text describing the control | element gains an `id`; control gains `aria-describedby` |
| `errormessage` | validation message for the control | element gains an `id`; control gains `aria-describedby` when it renders |
| `indicator` | decorative state indicator (a check glyph, a switch thumb) | preserved, `aria-hidden` |
| `increment` / `decrement` | stepper affordances | `<button>` with `stepUp()` / `stepDown()` handlers on the control's ref |

`label`, `description`, and `errormessage` are parts rather than free-standing concepts: each one only means anything relative to a control, and scoping them removes the "which control does this label belong to" question that the earlier draft answered by assuming there was only one.

The **contract additions** column names the concept's event surface. Value and name props are *not* listed as additions where `processing.propRoles` or an existing variant prop already supplies them — per ADR 067's contract composition rules, an existing prop wins as the value source and the role contributes only the change signal. Spellings here are the React binding; other platform transforms bind the same surface to their own idiom. The concept owns *that a value and a change signal exist*, not their names.

**Cut from this vocabulary**: `select`. A native `<select>` with no options is a non-functional control, and options are runtime content that the spec deliberately does not carry. The validation library's select component is also the most expensive collapse in the library — its entire visual chrome would be discarded — for a control that cannot work. `select` is deferred with `combobox` / `listbox` / `option`, where the option-source question is answered for all of them at once.

**The `selected` state concept has no role in this vocabulary, and will not until that deferral is resolved.** `selected` is a documented state concept mapping to `[aria-selected="true"]`, but every ARIA role that carries `aria-selected` — `option`, `tab`, `treeitem`, `row` — is in the deferred set above. Until then a prop classified as `selected` continues to emit as a `data-*` attribute, exactly as today. This is stated rather than left to be discovered mid-implementation: the concept is documented, the config accepts it, and nothing bridges it.

**Cross-platform binding** (illustrative — each platform transform owns its own column; no binding is normative in the schema):

**Reach** records how far the concept travels: `all` means web, iOS, and Android. Partial
reach is an acceptable property of a concept, recorded so a transform author knows what to
expect rather than to mark the concept deficient.

| Concept | Web | SwiftUI | Compose | Reach |
|---|---|---|---|---|
| `textbox` | `<input type="text">` | `TextField` | `TextField` | all |
| `password` | `<input type="password">` | `SecureField` | `TextField` + `PasswordVisualTransformation` | all |
| `searchbox` | `<input type="search">` | `.searchable` | `SearchBar` | all |
| `textarea` | `<textarea>` | `TextEditor` | `TextField(singleLine = false)` | all |
| `checkbox` | `<input type="checkbox">` | `Toggle` | `Checkbox` (`Role.Checkbox`) | all |
| `radio` | `<input type="radio">` | `Picker` option | `RadioButton` (`Role.RadioButton`) | all |
| `switch` | `role="switch"` button | `Toggle` (`.switch` style) | `Switch` (`Role.Switch`) | all |
| `slider` | `<input type="range">` | `Slider` | `Slider` | all |
| `spinbutton` | `<input type="number">` | `Stepper` | *(no native type — composes from parts)* | web + iOS |
| `group` | `<fieldset>` | `Section` + header | `Modifier.semantics(mergeDescendants)` | all |
| `label` | `<label for>` / `<legend>` | `.accessibilityLabel` / `LabeledContent` | `contentDescription` | all |
| `description` | `aria-describedby` | `.accessibilityHint` | `stateDescription` | all |
| `errormessage` | `aria-describedby` | `.accessibilityHint` | `Modifier.semantics { error() }` | all |
| `placeholder` | `placeholder` | `TextField` prompt | `placeholder` slot | all |
| `indicator` | `aria-hidden="true"` | `.accessibilityHidden(true)` | `clearAndSetSemantics {}` | all |
| `increment` / `decrement` | `<button>` + `stepUp()` / `stepDown()` | *(internal to `Stepper`)* | composed buttons | web + Android |

### Field plumbing concepts

Placement: **element** — annotate the label / error layers or instance wrappers (`role:label`, `role:errormessage`). Plumbing wires by reference to the component's single value-bearing control.

`label`, `description`, and `errormessage` are **parts** of a control (above). What remains here is `group`, which is control-level rather than part-level because a group has no single control to scope to.

`group` names itself with the ordinary `label` part rather than a distinct `legend` concept. A `label` part resolved to a `group` emits `<legend>` rather than `<label htmlFor>`, and must be the first rendered child of its `<fieldset>`. This keeps `group` regular: it accepts `label`, `description`, and `errormessage`, exactly as a control does.

| Concept | Typical web emission | Accepted parts |
|---|---|---|
| `group` | `<fieldset>` | `label`, `description`, `errormessage` |

### Cross-platform naming: two deliberate asymmetries

The table above hides two places where the web shape and the native shape genuinely differ.
Both are recorded here so a native transform author reads them as intended design rather
than as oversights.

**The text-control family fans in, and that is the point.** `textbox`, `password`,
`searchbox`, and `textarea` are four peer concepts because HTML has four spellings. SwiftUI
has three types (`TextField`, `SecureField`, `TextEditor`); Compose has **one** `TextField`
with `visualTransformation`, `keyboardOptions`, and `singleLine` parameters. So Compose sees
one type plus three modifiers where the vocabulary declares four peers.

This is real web bias and it is the correct trade. The modifier information has to be
carried somewhere, and carrying it in the concept name lets a native transform map four
names onto one type plus three parameter values with a lookup table. Collapsing to a single
`textbox` concept with modifier fields would move the same information into a second
mechanism, adding a schema surface without removing any information.

**`spinbutton` has no Compose counterpart, and the em-dash above is literal.** Material
provides no stepper control; the pattern is composed from two buttons and a text field. On
such a platform the concept **degrades to its parts** — the transform emits the control plus
its `increment` and `decrement` parts as separate elements rather than seeking a single
native type. The concept still earns its place, because it is the correct ARIA token on the
web and it is what tells a native transform that the two affordance buttons belong to the
field between them.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes (trivially — documentation-only change)
- **Parity check**: `RoleConceptName` in `types/Anatomy.ts` grows its documented set; the schema
  `role` property remains an open string per ADR 067. No schema file changes, now or when the
  vocabulary next changes

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Gains recognized concept names to switch on | None from this ADR — behavior is not specified here |
| `react-from-specs` | Gains recognized concept names to switch on | None from this ADR |
| `specs-from-figma` | None beyond ADR 067 | Recompile |
| `specs-plugin-2` | May surface recognized concepts in UI | Recompile; optional |

---

## Semver Decision

**Version bump**: MINOR

**Justification**: Extends the documented vocabulary of an existing open-string alias —
additive type-level documentation, no structural change. Per constitution III: "MINOR for
additive types." Subsequent vocabulary changes are documentation-only and carry no bump.

---

## Consequences

**The vocabulary can be wrong cheaply.** That is the point. Annotating a real library will show
which concepts are missing, which are misnamed, and which never get used, and every one of
those findings is a docs edit rather than a decision to revisit.

**The record stays small.** ADR 067 holds what other packages depend on — the schema field, the
transmission surface, the obligation mechanism. This ADR holds a naming convention and a
governance rule, and it should not grow.

**Behavior is written down elsewhere, deliberately.** The transform hypotheses are in
`projects/018-behavior-conventions/form-control-transform-behavior.md`; the consolidated
role × state, role × handler, obligation, and authoring tables are in `ROLE-MAPPINGS.md` beside
it; author-facing behavior is on the docs site. None of those needs an approval gate to change,
which is the property this ADR exists to protect.

### What the vocabulary makes possible

These are consequences of the vocabulary existing, not commitments about how a transform
achieves them. The behavioral detail behind each sits in
`projects/018-behavior-conventions/form-control-transform-behavior.md`.

- Scaffolded form components can participate in forms — focus, keyboard, submission,
  constraint validation — because a concept names a native control to reach for
- `processing.states` classifications can become fully truthful, since a real control can
  enter the states the config already describes
- Label and error association becomes generatable rather than hand-wired
- The vocabulary stays platform-neutral, so iOS and Android transforms bind the same concepts
  with no schema change. The *strategies* a web transform needs are web-shaped by nature, and
  that is precisely why they stay in the transform and out of this record

### What the vocabulary already cost, and what it bought

- **Part roles are the largest simplification the design found.** They removed binding
  discovery, removed the "which control owns this label" question from every plumbing
  concept, and cost nothing in schema — they are ordinary role values in the same field,
  distinguished only by rows in a table
- **`select` is cut** for lack of an option source, and is deferred with `combobox` /
  `listbox` / `option`, where the question is answered for all of them at once
- **Structural concepts move DOM.** Any concept whose emission is more than a tag swap will
  change positional relationships, so positional and sibling selectors need auditing. This
  vocabulary is not a drop-in on a fully styled library, and no naming choice can make it one
- **The one-value-bearing-control rule** is what keeps the vocabulary usable on a real
  library; an earlier any-control formulation would have rejected every text input in the
  validation set
