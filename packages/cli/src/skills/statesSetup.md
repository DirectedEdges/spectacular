---
name: specs-cli.states.setup
description: Propose the states block for a library's specs.yaml from its own prop data — which variant props are state concepts, which are not, and why — then stop for review.
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

# Set up states

Propose the `states:` block for `config/conventions/specs.yaml`: which of this library's variant props carry [state concepts](https://spectacular.systems/settings/states/), which value of each activates the concept, and which props are deliberately left as `data-*`.

Without the block, every variant prop emits as a `data-*` selector and nothing bridges to a real CSS pseudo-class or ARIA attribute. With it, `:hover` and `:disabled` reach the states they describe and `aria-expanded` says what a container only hinted at.

This skill **authors its report**, like `roles.propose` and unlike the others here. Whether a boolean prop is a state, a visibility toggle, or presentation is a judgment. Four booleans on variant props can be a condition the control is in, a look, an optional layer, and a behaviour flag, with nothing in their names, types or frequency to separate them — the distinction is what the library *means* by each, which the data does not record.

Classify from this library's own evidence. Where a step gives an example, it is a shape to recognise and never the answer for the prop it names: a prop called `filled` is a state in one library and a presentation flag in the next.

It writes no config. The last step hands you a block to paste and stops.

## Steps

1. **Produce the input.**

   ```bash
   specs analyze props
   ```

   `analysis/props.yaml` is the candidate list: every prop name with its types, the components carrying it, and `typeDiscordance` where one name means two things.

2. **Read what the library already declares.** If `config/conventions/specs.yaml` has a `states:` block, this is an audit rather than a first run: say which props are newly present and which declared entries no longer match any prop, and leave the rest alone. An existing entry is a decision someone made, not a draft.

3. **Narrow to the props a variant can drive.** `props.yaml` carries no flag for this — it is the candidate list, not the filter. The tell is in each component's `api.yaml`:

   | Shape in `api.yaml` | Candidate? |
   |---|---|
   | `type: boolean` | **yes, always** |
   | `type: string` with a closed `enum` | **yes** |
   | `type: string` with no `enum`, or `type: text`, `container`, `image` | no — content and slots |
   | code-only props | no |

   **Do not filter on `$extensions['com.figma'].type: VARIANT`, and do not filter on `nullable`.** Both read as the obvious discriminator and neither is one. Which booleans carry the VARIANT marker varies within a single library for reasons unrelated to state — a Figma boolean property drives a selector exactly as a variant does. And `nullable` is a property of content props, not of booleans: in real libraries every boolean omits the key entirely, so `nullable: false` selects the string props you mean to exclude and rejects every boolean you mean to keep.

   Expect this step to leave most of the library in. It removes content and slots; the candidate pool is still large, and step 4 is where the work is.

   Read prop names from `api.yaml`, never from a `detectedIn` string. `detectedIn` shows the Figma spelling, which the spec normalises — `Read only` becomes `readOnly`, and `prop:` must be the normalised name. The verbatim rule in step 6 applies to **values**, not to prop names.

4. **Sort every candidate into one of five.** This is the judgment, and most of the work:

   | Kind | Tell | Outcome |
   |---|---|---|
   | **State concept** | Names a condition the control is *in*, and the vocabulary has a concept for it | an entry in the block |
   | **State with no concept** | A real interaction condition the vocabulary cannot express — the keyboard-highlighted option in a listbox is the recurring one | no entry, and a row in the gaps section |
   | **Visibility toggle** | Turns an optional element on or off | no entry; it is structure, not state |
   | **Presentation** | Selects a look — a size, a colour, an alignment, a density | no entry |
   | **Behaviour flag** | Configures what the component *does* rather than what it looks like or is in: an auto-dismiss, a selection mode, a character limit | no entry; it belongs to the contract and carries no selector |

   The last two rows exist because three kinds do not partition a real library, and forcing a behaviour flag or a conceptless state into "presentation" to satisfy the table files it wrongly.

   Most props are not states across a whole library — by a wide margin, and the margin widens with library size. Do not calibrate against a ratio from another library; the proportions differ enough that a borrowed number is worse than none.

   **The ratio only means anything over a whole library.** Run against a curated subset, it is uninformative and will read as over-proposing: interactive form controls are the most state-dense corner of any library, so a starter set of a handful of them can legitimately classify a third or more of its props. Before reacting to a high ratio, check what you are looking at — a sample chosen for being interactive is not evidence of anything. Say which you ran against, so a reader knows whether the proportion is meaningful.

   Count props here, not rows. The block is keyed by concept and one prop can hold several, so a library can legitimately yield 9 classified props and 14 rows. A row count above the prop count is expected, not a sign of over-proposing.

5. **Check what each candidate actually changes.** A prop whose configuration only flips `visible` on some element is usually a visibility toggle however much its name sounds like a state — and a genuine state with no style delta is worth proposing but worth saying so about, because classifying it emits no selector.

   **Two markers settle most of the visibility toggles mechanically**, before any judgment:

   - `$extensions['com.figma'].visibilityProp` on an element names the prop that reveals it.
   - a `$binding: "#/props/<name>"` on an element's `visible` style, under `default.elements` in `variants.yaml`.

   Grep for both across the library and you will have identified a large fraction of the non-states with no reasoning at all. Do that first; spend the judgment on what is left.

   **Look in both halves of `variants.yaml`.** Style deltas live under `variants:`, but a visibility-only effect lives under `default.elements.<el>.styles.visible` and has no `variants:` entry whatsoever. Reading only `variants:` shows nothing for those props and leads straight to the wrong branch of this step — "a genuine state with no style delta" — for props that are plainly toggles.

   **On more than a handful of components, bucket the deltas mechanically rather than by reading.** Classify each delta as style / layout / visible-only / child-passthrough. A shell pipeline over the files is enough — `grep`, `awk`, `python3 -c`. A dozen components can be read directly; a library cannot, and done by eye it is neither repeatable nor finishable.

   Then three traps. Each one makes a real state look like a non-state, so the judgment is only safe with all three in hand.

   **A revealed layer can be the state.** The visibility test asks what the layer is *for*, not whether visibility changed. A layer that exists only to express a condition — a focus ring, an error message, a checkmark, a placeholder — is the library drawing the state, so the prop that reveals it is the state. `focusRing.visible` flipping is a focus state, not a toggle. A layer that would be meaningful with the state absent — a chevron, a caption, a trailing icon slot — is a toggle.

   This cuts both ways on names. `placeholderVisible` reads as pure visibility and is `placeholder-shown`; `showChevron` reads the same way and is a toggle. The name decides nothing either direction.

   **The delta may live one level down.** A prop whose configuration produces only `someChild: propConfigurations` is passing the state through to a nested instance, where the styling actually is. That is a state with a real delta, reported one level away — not a no-op. Follow it into the child component before concluding anything.

   **Subcomponent variants are nested.** `props.yaml` lists `parent.child` as its own component, but its variants sit under `subcomponents:` inside the *parent's* `variants.yaml`. A flat read shows the parent with no variants at all. Some libraries also carry the child a second time as a standalone component with the same props; where the two disagree, the nested one is what the parent renders.

6. **Match each state to a concept, and read its value from the data.** The vocabulary is fixed. This is the whole list — a name outside it cannot be configured, and a misremembered name fails the same silent way a wrong value does:

   | Concept | Emits | In the contract? |
   |---|---|---|
   | `hover` | `:hover` | omitted |
   | `active` | `:active` | omitted |
   | `focus` | `:focus-visible`, or `:has(:focus-visible)` on a wrapper root | omitted |
   | `focus-visible` | `:focus-visible` | omitted |
   | `focus-within` | `:focus-within` | omitted |
   | `placeholder-shown` | `:placeholder-shown` | omitted |
   | `disabled` | `:disabled, [aria-disabled="true"]` | included |
   | `readonly` | `[readonly], [aria-readonly="true"]` | included |
   | `required` | `[required], [aria-required="true"]` | included |
   | `invalid` | `[aria-invalid="true"]` | included |
   | `valid` | `[aria-invalid="false"]` | included |
   | `selected` | `[aria-selected="true"]` | included |
   | `checked` | `:checked, [aria-checked="true"]` | included |
   | `indeterminate` | `:indeterminate, [aria-checked="mixed"]` | included |
   | `expanded` | `[aria-expanded="true"]` | included |
   | `collapsed` | `[aria-expanded="false"]` | included |
   | `pressed` | `[aria-pressed="true"]` | included |
   | `busy` | `[aria-busy="true"]` | included |
   | `current` | `[aria-current="true"]` | included |

   The `/settings/states/` page carries the same table with the reasoning around it, but do not depend on reaching it — this skill has to work with no network.

   Read the **Emits** column when breaking a tie in step 7, and when deciding whether a concept describes your element at all.

   **Every row is a library-wide match on prop name plus value.** There is no way to scope a row to some components and not others, and this reframes several judgments below. Where one prop name means different things on different components — a boolean on some and an enum on others, or a value like `Selected` that is selection on a list item and the current tab on a tab — one row has to serve them all, and it will be wrong somewhere. Choose the reading that fits the most components, say which components it misdescribes, and report it as a gap rather than a decision. Check `typeDiscordance` in `props.yaml` for exactly this: it names the props whose meaning splits across components.

   Four rules the data will teach you anyway:

   - **The value must be one the prop's `enum` actually holds.** Copy it from the enum rather than inventing it from the concept name. Case and surrounding whitespace are forgiven — the match is case-insensitive, so `hover` finds `Hover` — but a value the enum does not contain at all matches nothing, and nothing warns you.

     That silence costs more than it looks. Naming a prop in *any* row excludes it from `data-*` emission entirely, so a row whose value resolves to nothing leaves that variant's styling with neither a concept selector nor the attribute it used to have. The styling is simply dropped. A real library carried `value: active` against an enum spelling it `press` and silently lost every pointer-down rule on its button.
   - **A boolean prop omits `value`** — it defaults to `"true"`. Quote `"false"` to map the *absence*, which is needed whenever the concept is the off side of the prop or the prop defaults to on. A `filled` prop that is true when a field has content is `placeholder-shown` at `value: "false"`. A drawer that defaults `expanded: true` records its only delta at `false`, so `collapsed` is the row that carries it.
   - **The focus concepts are three names for two behaviours.** `focus` and `focus-visible` are the same selector, so declaring both spends two rows on one thing. Choose by what you want emitted, not by what the prop is called:

     | Want | Declare |
     |---|---|
     | the ring to follow the component's shape — `:focus-visible` on a focusable root, `:has(:focus-visible)` on a wrapper | `focus` |
     | `:focus-within` verbatim, whatever the root is | `focus-within` |

     `focus` is the better default, because the narrowing is the behaviour most libraries want and it is decided per component rather than once in your config. Where a library has both a `state: Focus` enum value and a separate `focus` boolean, those are two props for one concept and step 7 applies.
   - **One prop commonly serves several concepts.** A single `state` enum may carry hover, active, focus, disabled, readonly, invalid and current at once; a `selected` boolean may be both `selected` and `pressed`. Six of seven real libraries reuse at least one prop. Treating prop and concept as one-to-one gets the library wrong.

7. **Where two candidates claim one concept, pick one and name the loser.** Two props may both look like `expanded`, or one enum may spell a value three ways — `Read-only`, `Read only`, `Read-Only`. Only one can be configured; say which you chose, why, and that the others stay `data-*`. A concept takes a single value today, so the spellings are a finding about the library rather than something the config can absorb.

   Expect these, and expect several — ties ran to a fifth of the rows in both libraries this procedure has been tested on. They come in two shapes the config treats alike:
   two different props claiming one concept, and two values of a *single* prop claiming it. Each loser leaves styling that exists with no selector at all, so every tie gets its own row in the report rather than a footnote.

   Break a tie in this order:

   1. **Does the concept's emitted selector actually describe this element?** `indeterminate` emits `:indeterminate, [aria-checked="mixed"]`, which describes a checkbox and not a progress bar — so a checkbox's prop wins over a progress bar's however the coverage falls. A row that emits a wrong ARIA attribute is worse than one that emits nothing, because nothing downstream will question it.
   2. **Which candidate covers more components?** Only once both candidates are semantically valid. This decides most ties and decides none of the hard ones.

   Say which rule settled it, and what the loser costs.

8. **Write the report to `reports/<YYYY-MM-DD>.states-setup.proposal.md`**, creating the directory if it does not exist, and name that path when you hand it over. It is a working document — the user marks it up, and the block they paste comes from it — so it does not belong in `analysis/` or `specs/`, which are regenerated.

   In this order:

   - **Intro**: one sentence on what the block does, then the numbers — candidates considered, proposed, left as `data-*` — then the decision rule.
   - **Proposed states**: one flat table. Columns: `✓` (`[x]` to apply, `[ ]` to skip, defaulting to `[x]`), Concept (linked to its page), Prop, Value, Rationale. Put `⚠️ Lower confidence` at the front of a rationale rather than adding a column for it — on a real library the confidence column reads the same for most rows.
   - **The YAML block**, ready to paste, matching the table.
   - **Not a state, and why**: a table grouping the rest by the three kinds above. This is most of the candidates and it is the half a reader will question.
   - **Concepts with two candidates**: one row per tie — the concept, the prop chosen, the prop that lost, and what styling the loser leaves on `data-*`. Omit the section only when there were none.
   - **Concepts this library needs that do not exist**: where a real interaction state has no concept. Frame each so it can become an issue.

9. **GATE — human review.** Hand over the path and stop. Paste the block only once the reviewer has cleared any `[x]` they disagree with.

10. **Verify the selectors appear.** A classification that emits nothing looks identical to one that was never made:

    ```bash
    specs react
    ```

    A configured concept shows up in the emitted stylesheet as its documented selector — `:disabled`, `[aria-expanded="true"]` — in place of `[data-*]`. Check **every row you wrote**, not a sample, and check that the `[data-*]` selectors it replaced are gone rather than merely joined. A row naming a value the enum does not hold removes the attribute and adds no selector, so its styling disappears from the output with no error anywhere — the one failure that looks like success from every other angle.

    Four reasons a selector may be missing. Separate them before reporting, because two are defects and two are the correct outcome:

    | Why | Verdict |
    |---|---|
    | The value is not in the prop's enum | **Defect.** Step 6; fix the value. |
    | The styling sits on an element that cannot enter the state — a container is never `:disabled` | **Defect**, but a [role](https://spectacular.systems/roles/) one, not a states one. Report it as that. |
    | The prop drives **conditional rendering** rather than styling — it reveals a layer and changes nothing about how anything looks | **Correct.** Expected, and it is the revealed-layer row step 5 told you to classify. |
    | The prop drives no output at all | **Correct**, and step 5 should already have said so. |

    The third row is the one to get right, because it is the predictable result of following step 5's first trap. A `required` or `placeholder-shown` row often sits on a prop that only toggles a layer's visibility: classifying it is still right, and it still earns its place — it reaches the contract and the markup rather than the stylesheet, as `aria-required` or a rendering condition. **Confirm that** instead of the selector: look for the attribute in the emitted scaffold.

    For every such row, also confirm **nothing was lost**. A revealed-layer prop that carried no styling has no `data-*` selector to give up, so classifying it costs nothing. Check the residual `data-*` set in the stylesheet: every attribute left in it should be a prop you declined to classify, and no classified prop should appear. That check is what distinguishes this case from the first row of the table.

