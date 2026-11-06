# ADR 086: Interactive Root and Announcement Role Concepts

**Branch**: `feat/react-from-figma`
**Created**: 2026-08-08
**Status**: ACCEPTED
**Deciders**: Nathan Curtis (author)
**Summary**: Role concepts for a component whose root is itself interactive, and for the live regions that announce — `button`, `link`, `alert`, `status`, `progressbar` — extending the vocabulary without a schema change.
**Decides**: none
**Supersedes**: *(none; extends ADR 067; companion to ADR 068)*

---

## Context

ADR 067 establishes `anatomy.<element>.role`, the Dev Mode annotation that generates it, the
variant rules that resolve it, the `processing.propRoles` bindings, and the obligation
mechanism. It also makes `RoleConceptName` an **open string** with no schema enum. ADR 068
establishes that the vocabulary is governed by the docs site rather than by decision records.

This ADR takes the same single decision for the remaining non-composite area: **the vocabulary
for components whose root is the layer of interaction** (buttons, links, disclosures) **and
components whose purpose is announcement** (alerts, statuses, progress indicators).

Today these components scaffold as inert containers. A button is a `<div aria-disabled>` that
cannot be tabbed to and offers no `onClick`; a toast announces nothing because a live region
must be declared before its content changes; a disclosure trigger has no way to say what it
controls.

**Sequencing: this vocabulary ships first.** Every concept here is a tag swap plus attributes,
with one exception (`promote`, when an interactive role lands on a glyph-typed element). None
of them insert, remove, or re-parent DOM nodes, so none disturb positional CSS. This is the
low-cost, high-yield half of the feature set and should land ahead of the form-control
vocabulary despite its higher ADR number. Its only prerequisites are ADR 067's per-element
attribute-assembly refactor and the role-index pre-pass.

**What is deliberately not here.** Emission rules, state bridges, contract additions,
disclosure pairing rules, and worked illustrations were drafted before any transform existed.
They are hypotheses, not decisions. They live in
`projects/018-behavior-conventions/interactive-root-transform-behavior.md`, and whatever
survives contact with the code belongs on the docs site.

---

## Decision Drivers

- **Additive only**: extends a documented open-string vocabulary; no schema structural change
- **Platform-neutral concepts, per-platform bindings**: nothing web-specific enters the
  vocabulary or the schema
- **Native-first**: where a platform provides a native control, name the concept so a transform
  can reach for it
- **Cheap to change**: correcting the vocabulary must not require an ADR
- **Declared, not inferred**: interruption severity and interactivity are designer
  declarations, not properties recoverable from structure or state config

---

## Decision — The same open, docs-governed vocabulary, extended to interactive roots

### Option A: Explicit flat concepts for interactive roots and announcements *(Selected)*

Name each interactive root and each announcement region as its own flat lowercase concept,
governed exactly as ADR 068 specifies: carried in `RoleConceptName`'s documentation, published
at `/roles/`, and **changed by editing the docs rather than by amending an ADR**.

- Consistent with ADR 068, so the feature has one vocabulary with one governance rule rather
  than two sets with different change costs
- Safe for the same reason: ADR 067 specifies unrecognized role values are ignored, so a spec
  and a transform may disagree without breaking
- `alert` versus `status` is a **declaration of interruption severity** that nothing in the
  markup can derive. Naming both makes the designer's choice explicit
- Interactive roots are the highest-frequency roles in any library, so the vocabulary earns its
  keep immediately

**Cons / Trade-offs**: the same as ADR 068 — nothing procedurally prevents churn, and the
snapshot below is a convenience rather than the authority.

---

### Option B: Infer interactivity from `processing.states` presence *(Rejected)*

Treat an element with `hover` / `active` / `focus` classifications as interactive.

**Rejected because**: styling a hover state does not make an element a control, and plenty of
genuinely interactive components carry no state classification at all. It also cannot
distinguish a button from a link from a disclosure, which is the entire question.

---

### Option C: Fold announcements into a future composite ADR *(Rejected)*

Defer `alert`, `status`, and `progressbar` until composite widgets are addressed.

**Rejected because**: they are the cheapest concepts in the whole feature — a single attribute
each, no DOM change, no handlers — and they fix a class of bug that is invisible in review and
total for the affected users. Deferring the cheapest wins to sit alongside the most expensive
work is the wrong pairing.

---

### Option D: Derive the root role from the component name *(Rejected)*

Infer `button` from a component named "Button".

**Rejected because**: it is heuristic guessing of exactly the kind this feature exists to
eliminate. Names are inconsistent across libraries, frequently decorative, and say nothing
about components whose name and behavior diverge.

---

## Vocabulary snapshot

**Not authoritative.** The live vocabulary is at `/roles/` on the docs site. This records the
set at the time of writing so the ADR reads on its own, and may be edited without amending
this record. The emission column is an orientation aid, not a specification.

### Interactive root concepts

Placement: **root** via an annotation on the component node, or **element** via an annotation on a layer inside it. One mechanism covers both per ADR 067.

| Concept | Typical web emission | Accepted element types | Accepted parts |
|---|---|---|---|
| `button` | `<button type="button">` | container, glyph | `label`, `description`, `indicator` |
| `togglebutton` | `<button type="button" aria-pressed>` | container, glyph | as `button` |
| `link` | `<a>` | container | `label`, `description` |
| `disclosure` | `<button type="button" aria-expanded aria-controls>` on the role element | container | `label`, `panel`, `indicator` |

**`disclosure` is a control with parts, not a two-concept pair.** An earlier draft defined `disclosurepanel` as a second free-standing concept paired to the first, which required bespoke pairing logic and made this the only multi-element concept in the vocabulary. Under ADR 067's part-role model it is ordinary: the trigger carries the control role, and the region carries `panel`, resolving to its nearest ancestor control exactly as a text control's `value` part does. The `aria-controls` linkage falls out of the role index with no concept-specific machinery.

The panel is typically **not a descendant** of the trigger — in the validation library the two are siblings under a shared root — which is exactly the case ADR 067's part-resolution rule 2 covers. `disclosure` is not value-bearing, so its parts resolve by proximity, and an ambiguous lookup (two disclosures in one component) is an error naming both. No resolution rule specific to this concept is introduced here; the mechanism ADR owns all of it.

**On `promote`.** Element-level interactive roles frequently land on glyph-typed elements — the validation library's inline affordances (a remove affordance in a pill, a select affordance in a select pill) are `type: glyph`, which today emits a decorative self-closing `<span>` with `aria-hidden`. A tag swap is not available there: the glyph must be re-hosted inside a real `<button>`. That is the `promote` strategy, and it is the one place this vocabulary is not purely `substitute`. It adds a DOM level and therefore is not positional-CSS-free, unlike every other concept here.

**On contract additions and existing props.** `pressed` and `expanded` are almost always already variant props on the components that need them. Per ADR 067's contract composition rules the existing prop is the value source, no `default*` companion is emitted, and the scaffold seeds internal state from it so the control is live without a handler. The naive `p.expanded ?? internalState` spelling would be dead code, because the scaffold's defaults merge makes every declared prop permanently defined.

**Cross-platform binding** (illustrative — each platform transform owns its own column; no binding is normative in the schema):

**Reach** records how far the concept travels: `all` means web, iOS, and Android. Every
concept in this vocabulary reaches all three, which is why the strategies here are the
cheapest in the feature set to port.

| Concept | Web | SwiftUI | Compose | Reach |
| `button` | `<button>` | `Button` | `Button` (`Role.Button`) | all |
| `togglebutton` | `<button aria-pressed>` | `Toggle` (`.button` style) | `IconToggleButton` (`Role.Switch`) | all |
| `link` | `<a href>` | `Link` | `ClickableText` (`Role.Button` + link semantics) | all |
| `disclosure` + `panel` | `aria-expanded` + `aria-controls` | `DisclosureGroup` | `AnimatedVisibility` + `Modifier.semantics { expand()/collapse() }` | all |
| `alert` | `role="alert"` | `.accessibilityAddTraits(.isStaticText)` + announcement | `LiveRegionMode.Assertive` | all |
| `status` | `role="status"` | announcement | `LiveRegionMode.Polite` | all |
| `progressbar` | `role="progressbar"` | `ProgressView` | `LinearProgressIndicator` (`progressBarRangeInfo`) | all |

**Emission notes per concept** (web binding):

- `button` — the emitted `onClick` and native `disabled` replace today's `aria-disabled` div. Presentational descendants (background layers, elevation layers, layout wrappers) survive as inert children, but **`<button>` accepts phrasing content**, so descendants that would otherwise emit as `<div>` emit as `<span>` with layout preserved by the existing styling. A **slot descendant inside the button's subtree is an interactive-inside-interactive hazard** — the validation library's button has exactly this, a `children` slot nested inside its trailing-visual container. The transform emits it unchanged and warns, since it cannot know whether a consumer will slot in interactive content.
- `togglebutton` — see **The two meanings of "pressed"** below, which this concept exists to resolve.
- `link` — `href` absent renders a valid placeholder (`<a>` without `href` is unfocusable; the scaffold notes this in a comment rather than inventing `href="#"`).
- `disclosure` + `panel` — see the pairing rules below.
- **Accessible name.** `button` and `togglebutton` on components with no text descendant depend entirely on ADR 067's `propRoles.accessibleName` binding — the validation library has a favorite-button whose body is two stacked glyphs, and a toggle button whose "custom content" variant erases its label subtree. Where the binding resolves, the emitted element gains `aria-label`. **Where it does not resolve, the transform warns**, because a correctly-roled unnamed control is worse than the `div` it replaced. This is the single most important dependency this vocabulary has on ADR 067.

**Disclosure pairing rules.** Validation surfaced geometry a naive implementation gets wrong:

1. **The panel is not hidden by the transform.** The role emits semantics and linkage; visibility stays with CSS and the variant conditions the analysis already produced. The reasoning is in `projects/018-behavior-conventions/interactive-root-transform-behavior.md`.
2. **DOM order is not assumed.** `aria-controls` is an id reference and is order-independent; nothing in the emission may depend on the trigger preceding the panel.
3. **A partless role degrades, loudly.** A `disclosure` with no `panel` part emits `aria-expanded` only, plus a warning. A `panel` element absent in the current variant — validation found a component whose panel wrapper exists only when expanded, with slot content reparenting to the root when collapsed — makes `aria-controls` conditional, matching the panel's own render condition. `aria-controls` pointing at an absent id is worse than omitting it.
4. **State-dependent trigger labels are out of scope, and the gap is loud rather than silent.** The validation library's disclosure carries separate collapsed and expanded trigger-label props, and its single `label` anatomy element is bound to only one of them. Pairing those two props would require prop-name matching, which ADR 067 forbids. The trigger therefore renders its bound label in both states — so an expanded disclosure announces its *collapsed* label, which is incoherent output the role has made newly visible by giving the trigger a working expanded state. **The transform warns** when a `disclosure` element's bound text prop has a sibling prop the spec cannot pair. The fix is a `propRoles` entry pairing a state concept to an alternate text prop, and it should land with or immediately after this vocabulary rather than being deferred indefinitely.

### Announcement concepts

Placement: **root** typically; **element** valid (e.g. an inline status region inside a larger component).

| Concept | Typical web emission |
|---|---|
| `alert` | `role="alert"` on the element (implicit assertive live region) |
| `status` | `role="status"` on the element (implicit polite live region) |
| `progressbar` | `role="progressbar"` + `aria-valuemin` / `aria-valuemax` / `aria-valuenow` |

**Emission notes**:

- `alert` vs `status` is the assertive/polite distinction: an interrupting alert vs a transient confirmation toast. The concept choice is the designer's declaration of interruption severity.
- `progressbar`'s **determinate/indeterminate split comes from `propRoles`**, not from a prop-name guess, and it needs two bindings rather than one. `value` names the prop carrying progress. `indeterminate` names a boolean prop that forces the indeterminate presentation regardless of value — the validation library's progress bar declares exactly such a boolean and no value prop at all, so a value-only mechanism would have thrown away the one signal the component actually models. Resolution order: an `indeterminate` binding that is true suppresses `aria-valuenow`; otherwise a resolved `value` binding produces the determinate form; otherwise the indeterminate form is emitted with a warning.
- An announcement region may legitimately contain an interactive element — validation found a toast whose dismiss affordance is an instance of a local subcomponent. That instance carries its own `button` role in its own spec; the containing `status` role is unaffected. **This is the sanctioned form of two roles in one rendered tree**: different elements, different specs. The prohibited form — two specs claiming the same DOM position — is handled by the cross-spec precedence rule drafted alongside the form-control behavior.

### The two meanings of "pressed"

The word does two different jobs in a states config, and a library that has both a momentary
highlight and a toggle will hit them one line apart:

- The **`active` state concept** maps to `:active` — the momentary condition while a pointer
  is held down. The states documentation recommends libraries *name* this Figma variant
  value `pressed`, because `pressed` is platform-neutral where `active` is a CSS term that
  means nothing on iOS or Android.
- The **`pressed` state concept** maps to `[aria-pressed="true"]` — the retained on/off
  condition of a toggle control.

Both readings are correct in their own context, and neither name can change: `active` is the
CSS pseudo-class and `pressed` is the ARIA attribute. The role is what disambiguates them,
and the rule is short enough to state once and rely on:

- A `button` bridges `active`. It never emits `aria-pressed`.
- A `togglebutton` bridges `pressed`. It emits `aria-pressed`.

A component with both declares two state entries against two different Figma props; the role
on the element decides which of the two reaches ARIA and which stays a pseudo-class. This
supersedes the ADR 055 note that recorded the ambiguity without resolving it.

### Notes

- Concept names follow ADR 067's naming scheme and its provenance note: some are ARIA role tokens (`alert`, `status`, `progressbar`), some are HTML element names (`button`), and some are Authoring Practices pattern names (`togglebutton`, `disclosure`). Origin does not predict platform reach, and only ARIA role tokens may ever be emitted as `role="…"`. Part names stay bare and unprefixed (`panel`, `label`, `indicator`) — `disclosurepanel` was an earlier spelling that the part-role model made unnecessary
- Deliberately absent (deferred composite vocabulary): `dialog`, `tablist` / `tab` / `tabpanel`, `menu` / `menuitem`, `combobox` / `listbox` / `option`, `tooltip`, `carousel` — their value is focus and keyboard *behavior*, which the markup-over-behavior driver excludes from scaffold scope. `select` is deferred with them per ADR 068's vocabulary snapshot
- `togglebutton` contract naming (`pressed` / `onPressedChange`) follows the prevailing headless-library convention rather than overloading `checked` — `checked` remains exclusive to the form-control concepts
- A component whose entire body is an instance of another component — a paging control wrapping an icon button, a menu wrapping variant-swapped sheets — has **no annotatable element and no meaningful root role of its own**. The transform emits unchanged markup and warns. This is a real category, not an edge case, and it is the honest limit of anatomy-level roles
- A candidate follow-up concept, deliberately not taken here: **`presentation`**, marking an element as decorative. Today decorativeness is inferred from element type (`glyph` elements get `aria-hidden`), which is a heuristic. An explicit token would give ADR 068's `collapse` a spec basis for what it may discard, tell `<button>` emission what may be flattened out of a phrasing-content model, and put `aria-hidden` on a declared footing. It is worth its own decision rather than a line in a vocabulary table

---

---

## Type ↔ Schema Impact

- **Symmetric**: Yes (trivially — documentation-only change)
- **Parity check**: `RoleConceptName` in `types/Anatomy.ts` grows its documented set; the schema
  `role` property remains an open string per ADR 067. No schema file changes

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

**This vocabulary is the cheapest to implement and the most immediately visible.** Every
concept is a tag swap plus attributes, so it disturbs no layout and needs no new composition
machinery — which is why it is sequenced first despite the higher number.

**The announcement concepts are the highest value per line of code in the feature.** One
attribute each, no DOM change, no handlers, and they fix a failure that is invisible in visual
review and complete for screen reader users.

**`button` has the feature's single most important dependency.** Components whose body is
glyphs have no text to name them, so they depend entirely on a resolved `accessibleName`
binding. Where it does not resolve the transform warns, because a correctly-roled unnamed
control is worse than the container it replaced. That obligation is specified in ADR 067.

### Everything else

- Buttons and links scaffold as real focusable, activatable elements with event contracts — the largest single quality jump for interactive components, at the lowest implementation cost in the feature set
- The `active` / `pressed` distinction established in ADR 055 becomes structurally enforced: only `togglebutton` bridges `pressed`
- Disclosure components gain correct trigger/region linkage and a working expanded contract, without the transform taking over visibility — which peek-style components require
- Alerts and toasts announce to assistive technology from a one-line annotation and no new machinery; `progressbar` delivers in proportion to the value binding and accessible name the library declares
- BEM classes, `data-element` values, variant data attributes, and DOM position are unchanged for every concept except `promote`, so this vocabulary is adoptable on a fully styled library — unlike the structural one
- The vocabulary stays platform-neutral: future iOS and Android transformers bind the same concepts without a schema change
- Nearly every interactive component in a library gains a one-line annotation — the surface's ergonomics matter more here than for form controls, and should be validated against a real library before implementation
- Without ADR 067's accessible-name binding, this vocabulary would emit correctly-roled but unnamed controls — a regression, not an improvement. The dependency is hard, not optional
- Components that are pure wrappers around other components' instances gain nothing and warn — an honest, bounded limit of anatomy-level roles
- State-dependent trigger labels and a `presentation` concept are both identified follow-ups with named justifications, rather than gaps discovered later
- The deferred composite vocabulary needs no new ADR: it extends the same open alias under the same docs-governed rule, with the part-role model as the precedent for multi-element concepts
