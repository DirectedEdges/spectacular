---
name: specs-cli.roles.propose
description: Propose a role for every unannotated anatomy element in a library, as a markdown table a system designer marks up — then stop. Writes nothing to Figma.
---
<!--
  Canonical skill emitted by `specs skills install` — overwritten on every
  refresh; do not edit in place. A local override layer (a separate file the
  refresh never touches) is planned but not yet implemented; until it exists,
  local customizations belong in your own separate skill.
-->

> **Prerequisite — read once per session.** If you have not already read
> `.claude/skills/specs-cli.primer/SKILL.md` in this session, read it now. It is
> what Specs is and why its data is structured, and this procedure assumes it.

# Propose roles

Produce `reports/<YYYY-MM-DD>.roles.proposal.md`: a per-component table proposing a [role](https://spectacular.systems/roles/) for each unannotated anatomy element, with the evidence behind it and a **Decision** column a system designer edits in place.

This skill **authors its report**, unlike the others here. Which role an element takes is a judgment — the discriminator between `checkbox`, `switch` and `togglebutton` is what the control does when operated, which no prop records. A rule that read `checked` + `indeterminate` and emitted `checkbox` would be right about `checkbox` and wrong about `toggle`, `switch` and `togglegroup`. Everything below exists to keep that judgment reviewable.

Nothing is written to Figma. The sweep is `specs-cli.roles.apply`, and it runs only after a human has marked this file up.

## Steps

1. **Check the preflight.**

   ```bash
   specs bridge status
   ```

   One plugin must be connected — **and you must check which file it is connected to.** The status line prints the connected file's key and name:

   ```
   Bridge running (pid 36652). 1 plugin connected:
     043ln8eiOoivUN5FicuGCF (ADS Components) — connected
   ```

   **A key match is a fast path, not the gate.** When that key equals a `key` under `data.sources` in `config/settings.yaml`, you are in the right file and can continue.

   A mismatch does **not** mean the wrong file. An unsaved Figma document reports an id like `unsaved-1uzd9salubn (DE Library)`, which can never equal a published file key, so key-equality alone would block a correctly-opened file outright.

   **When the key does not match, prove identity by reading instead.** Pick one component whose spec you have, and `/inspect` it with its `pageId` and `nodeId` from `specs/latest.metadata.yaml`:

   - The returned name matches the spec's `title`, and the anatomy keys match the spec's anatomy → **this is the right file.** Continue.
   - The ids do not resolve, or the component that comes back is something else → **this is the wrong file.** Stop and say which file the bridge reported.

   That is a stronger proof than a key string in both directions: it is one read-only call, it fails closed, and it confirms the file actually contains the components you are about to annotate rather than that someone typed the same key into a config.

   "Connected" on its own is not the gate, and treating it as the gate is how a sweep ends up in the wrong Figma file. A bridge left running from earlier work answers exactly like the right one, every request succeeds, the report says `applied`, and the write lands in a file nobody was looking at. Nothing downstream detects it, because the file you meant to annotate is unchanged and still looks like it simply has no roles yet. `settings.spec.roles` must be `true`, or generated specs carry no roles and the before-measure is meaningless rather than zero.

2. **Produce the inputs.**

   ```bash
   specs analyze
   ```

   `analysis/roles.yaml` is the before-measure and the list of bare elements with their types. `analysis/props.yaml` is the cross-library prop inventory. `analysis/dependencies.byComponent.yaml` says which elements are instances of other components.

3. **Read what is already annotated, first.** In `analysis/roles.yaml`, any component with a `roles` entry was annotated by hand, and it is the library's own convention. It calibrates everything else — one hand-annotated field component settles how every other field in the library should read. Check it for gaps too: a partial annotation is a likely oversight, and proposing the missing part is one of the most valuable rows in the report.

4. **Read the live components.** `POST /inspect` per component, with `pageId` and `nodeId` from each spec's `metadata.source`, and `conventions` / `settings` taken from `specs/latest.metadata.yaml` — that file records the resolved pair, so do not reconstruct it. The response gives, per anatomy key: the Figma layer name behind it, the element type, which variants carry it, and any annotations already standing on it.

   The Figma layer name is the part a spec cannot supply under `figma.naming: NONE`, and it is often the strongest evidence in the report — a layer named `Field.Label` says what `fieldLabel` only hints at.

   Variant coverage matters for the same reason: a spec's `detectedIn` names a single variant that witnesses the element, not the set it appears in.

5. **Read the vocabulary, in this order.** [Choosing a role](https://spectacular.systems/roles/choosing/) first — it is the differentials, which is where most of the judgment comes from. Then the per-role pages for the mechanics of each candidate, which also state **which parts each control accepts and on which element types**; a part proposed onto a type its control does not accept will not resolve.

   Two pages, not three. [Precedence](https://spectacular.systems/roles/precedence/) answers one question — how a role, a states classification and an action resolve when they land on the same element — and on a first sweep over a library that carries no roles yet, nothing competes. Fetch it when you hit that collision or when auditing a library that is already annotated. A 64-row first sweep used nothing from it.

6. **Check each control against the parts it accepts.** Do this before writing any proposal, because it is the only pass that can see what is *absent* — an element-by-element walk only ever looks at elements that exist, so a part the design never drew is invisible to it.

   Each control role's page carries a "Roles" table listing the parts it accepts. Read it as a checklist and ask, for every control you are proposing: does this component have an element for each part, and if not, why not?

   | Control | Parts it accepts |
   |---|---|
   | `textbox` family | `label`, `description`, `errormessage`, `value`, `placeholder` |
   | `checkbox`, `radio`, `switch` | `label`, `description`, `errormessage`, `indicator` |
   | `group` | `label`, `description`, `errormessage` |
   | `disclosure` | `label`, `panel`, `indicator` |
   | `button`, `togglebutton`, `link` | `label`, `description`, `indicator` |
   | `spinbutton` | `label`, `description`, `value`, `increment`, `decrement` |
   | `slider` | `label`, `description`, `value`, `indicator` |
   | `progressbar`, `meter` | `label`, `value`, `indicator` |
   | `status`, `alert` | `label`, `description`, `indicator` |

   The last three rows are the announcement and measurement families, and they were missing from this table while every other family had one — four rows on a live sweep rested on inference where the rest had a checklist. **A control not listed here accepts the value-bearing part set**: `label`, `description`, `value`, `indicator`. Take that as the default rather than proposing nothing, and say in the report that the row came from the default.

   An absence resolves one of two ways, and they want different outcomes:

   - **The element exists and you did not propose for it.** A defect in the proposal. Add the row.
   - **The design has no such element.** A finding about the library, reported and never proposed — there is nothing to annotate. State which components are affected and what the consequence is.

   The second is the one worth the pass. On a real 69-component library every field had a label and a description and **no component drew an error message at all**, so `errormessage` — fully implemented — went unproposed and unmentioned. Ten components could say what a value is for and none could say what was wrong with it. No per-element reading surfaces that; only asking what a control usually comes with does.

   Check the inverse too: a part with no control anywhere in its component is valid — that is a provider declaring what it offers — but a part whose control is a *deferred-vocabulary instance* will emit an id pointing at nothing. Report those rather than proposing them.

7. **Write the report, in this order.** The shape matters: a reviewer reads the decisions first and the exceptions after.

   **Intro.** Three sentences on what a role is and why it cannot be derived, then one sentence carrying every number — components, elements, roles proposed, roles that do not exist, Figma changes needed, components needing none — then the decision rule. No separate summary table; it duplicates the intro. Follow it with an anchor list of the sections.

   **Proposed roles.** One flat table for the whole library, not per-component tables. Reviewers do group by component, but the flat shape is what makes a library-wide inconsistency visible — eight `label` rows side by side is how a missing ninth gets noticed.

   | Column | Content |
   |---|---|
   | `✓` | `[x]` to apply, `[ ]` to skip. Default every row to `[x]` |
   | Component | spec key |
   | Element | anatomy key |
   | Role | the concept, linked to its page on spectacular.systems |
   | Rationale | the evidence, prefixed by a marker where one applies |

   Append `(Not yet supported)` to a role that emits nothing, and keep its link — a link is to documentation, not a claim that the concept works. **Take support from the Inventory's status, never from whether a page exists**: `group`, `radio` and `textarea` have complete pages and emit nothing. Only **Implemented** emits; **Specified** and a bare dash do not. Reading the link as the signal mislabels six rows on a library of this size, and the error only surfaces when someone runs the transform and finds a `<div>` where they expected a `<fieldset>`.

   `[x]` / `[ ]` rather than a checkmark-or-blank, so clearing a row is a positive act. Blank cannot distinguish "rejected" from "never read", and both would stop the sweep.

   No confidence column: on a real library it is one value for ninety per cent of rows, which is a column of noise that also hides the few rows worth arguing about. Put `⚠️ Lower confidence` at the front of those rows' Rationale instead.

   Prefix a row with `✏️ Figma change, see below` when it depends on an asset change. Propose the role on the element that **will** exist, so the table is the whole picture rather than the applicable part of it.

   Rationale carries **checkable evidence only** — `an open prop and a panel beside it`, `Field.Label, a text sibling of the control`. Never provenance:
   a rationale reading "library convention" on eleven rows tells a reviewer nothing they can verify, and it is really a pointer to a sentence below the table. Put that sentence below the table and let each row stand on its own evidence.

   **Figma asset changes**, below the proposal table. An element carries at most one role, so a component needing two semantics across its variants has to say so with two elements — a banner that interrupts as a danger and confirms as a success cannot do both on one. Show it as before and after layout trees, each node `<layer name> (<type>) ## comment where needed`, indented. Keep the prose to a few sentences; the trees carry the explanation.

   **Proposed new roles**, below that. Only concepts that are **not in the vocabulary at all** — a concept that exists but emits nothing is real vocabulary and belongs in the proposal table marked `(Not yet supported)`. Columns:
   `#`, Role, Apply to, Rationale (one or two sentences), Existing alternatives. Then any gaps that are not new roles as short bullets: a missing resolution rule, a concept with no page, concepts deferred by design.

   **Always propose the concept the element actually is**, even when nothing emits for it, and name the working alternative in the Existing alternatives column. A spec recording what an element is stays true as support arrives; one recording a near-miss has to be re-annotated, and nobody will remember which rows were compromises.

8. **Say where no role belongs.** Most elements take none, and that is a correct outcome rather than a gap. A table of component names grouped by reason:
   deferred concepts, concepts that do not exist, layout-only, blocked on something else. Then the elements inside *annotated* components left bare on purpose — those are the ones a reviewer will otherwise ask about. Three recurring traps:

   - A part cannot resolve to a control in **another** component — parts resolve by component. A trigger component and a panel component used together cannot pair, so do not propose the part; record the gap.
   - An `aria-label` text layer is not a `label`. That part emits a visible `<label>`; an accessible name with no visible text reaches the output as a contract prop.
   - A control's own text is its content, not a `label`. Proposing `label` on a button's or disclosure's text points a `<label>` at a button.

9. **Reconcile, then validate.** Every component must appear exactly once across the proposal table and the no-role list — compute it rather than trusting the prose, because a component addressed in neither is invisible, and that is how two whole components get missed. Then check every row: the element key exists in that component's anatomy, and the role is in the vocabulary. A row naming an element that is not there fails at write time, mid-sweep.

10. **GATE — human review.** Hand over the path and stop. The reviewer clears the `[x]` on anything they reject. If they question a proposal, settle it to apply or skip in conversation and edit the row — the report never carries a third answer, because the applier would have to interpret one.

