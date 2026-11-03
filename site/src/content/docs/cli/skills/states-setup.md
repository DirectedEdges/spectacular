---
title: "states.setup"
description: "Propose the states block for your library from its own prop data, with the reasoning for every row"
---

A skill that proposes the [`states`](/settings/states/) block for your `config/conventions/specs.yaml`: which of your variant props carry state concepts, which value of each activates the concept, and which props are deliberately left as `data-*`.

Installed by [`specs skills install`](/cli/commands/skills/) as `.claude/skills/specs-cli.states.setup/`, then invoked in Claude Code.

## Rationale

Deciding whether a boolean variant prop is a state is a judgment, and the data does not contain it. A library can carry `filled`, `segmented`, `showChevron` and `highlighted` — four booleans on variant props, indistinguishable by name, type or frequency. One of them is a state concept, two are presentation, and one toggles whether a layer renders.

A command would have to guess. The skill reasons, shows you the evidence per row, and stops before anything is written.

## Your input

One decision per row, and nothing else. Every proposed row arrives checked; you clear the ones you disagree with, then paste the block.

It never edits your config.

## Procedure

1. Reads `analysis/props.yaml` from [`specs analyze props`](/cli/analyze/props/) — every prop name with its types, the components carrying it, and where one name means two things.
2. Reads an existing `states` block, if you have one, and treats the run as an audit: what is newly present, what no longer matches any prop, and nothing else touched.
3. Narrows to variant props, since only a Figma variant prop can drive a state.
4. Sorts each candidate into a **state concept**, a **visibility toggle** or a **presentation flag**. Most candidates are not states — on one 69-component library the split was 7 states against 20 of the other two.
5. Checks `variants.yaml` to see what each candidate actually changes. A prop whose configuration only flips an element's visibility is a toggle however much its name sounds like a state.
6. Matches each state to a concept from the [table](/settings/states/), reading the activating value out of the prop's own `enum`.
7. Writes a report: the proposed block, a table of what was rejected and why, and any interaction state your library has that no concept covers.

## Matching rules

These come from reading what real libraries declare, and each one is a way the obvious approach is wrong.

**Values are copied from the prop's `enum`, not invented from the concept name.** Case is forgiven, so `hover` finds `Hover`; a value the enum does not hold at all is not. And naming a prop in any row already excludes it from `data-*`, so an unresolvable value leaves that variant's styling with neither a concept selector nor the attribute it had — dropped outright, with no error. One real library carried `value: active` against an enum spelling it `press`, and silently lost every pointer-down rule on its button.

**One prop commonly serves several concepts.** A single `state` enum may carry hover, active, focus, disabled, readonly, invalid and current at once. A `selected` boolean may be both `selected` and `pressed`. Of seven libraries examined, six reuse at least one prop, so treating prop and concept as one-to-one gets most libraries wrong.

**A boolean can map the absence of a condition.** A `filled` prop that is true when a field has content is [`placeholder-shown`](/settings/states/) at `value: "false"`.

## Unresolved cases

Two cases it will not decide for you, because the config cannot express either:

- **Two props competing for one concept.** It picks one, says why, and names what the other falls back to.
- **One enum spelling a value several ways** — `Read-only` against `Read only`. Case and whitespace differences are forgiven, but a different separator is a different value, and a concept takes only one. The spellings that lose are a finding about the library rather than something the config absorbs.

## Verification

A classification that emits nothing looks exactly like one that was never made. After pasting the block, run [`specs react`](/cli/commands/react/) and look for the concept's documented selector in the emitted stylesheet — `:disabled`, `[aria-expanded="true"]` — where `[data-*]` used to be.

If it has not changed, two reasons are worth knowing apart. The styling may sit on an element that cannot enter the state, which is a [role](/roles/) question rather than a states one — a container can never be `:disabled`. Or the prop may drive no styling at all, in which case the classification is correct and simply has nothing to attach to.

---

**See Also:**

- [`states` convention](/settings/states/) — the concept table, selectors, and contract behaviour
- [`specs skills install`](/cli/commands/skills/) — how the skill reaches your project
- [`analyze props`](/cli/analyze/props/) — the report the skill reads
- [Roles](/roles/) — the independent input that makes some states reachable at all
