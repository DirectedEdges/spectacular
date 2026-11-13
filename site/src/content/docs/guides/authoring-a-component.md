---
title: "Authoring a Component"
description: "What happens when you describe a component you want and let the agent build it."
---

A spec does not have to come from Figma. You can describe a component in plain language and get back a specification, a working React or Web Components implementation, a rendering on the Figma canvas, and written guidance on how the component should be used.

This guide is that loop from your side: what you write, what comes back, and what you do with it.

## The loop

| You | The agent |
|-----|-----------|
| Describe the component you want | Reads your system, then writes the spec |
| Look at it in Storybook and in Figma | Reports what it decided, what it could not carry, and what it noticed |
| Answer the decisions | Revises and re-renders |

You repeat the middle two rows until the component is right. Most components take two or three passes.

## What you write

A prompt. Plain sentences, one requirement each. This is a real one, for a badge:

> Create a badge component.
>
> Make the badge composable, with a label visible by default and an icon glyph hidden by default to carry primitive formatting.
>
> Include a color prop, with options for basic, info, success, error, and warning.
>
> Include a subtle prop that varies color based on a subtle vs not subtle appearance. Element colors and background colors vary together based on this property.
>
> Provide XS, S, and M sizes that end up 24, 28 and 32 px tall respectively.

Nothing in that prompt names a token, a schema property or a file. It names outcomes — a prop and its options, a default, a behavior, three pixel heights — and the agent is responsible for finding the parts of your system that deliver them.

Three things are worth saying explicitly when they matter to you:

- **What should be visible by default**, when a component is composable. The badge prompt says the label shows and the glyph does not.
- **What an existing component already does**, when the new one should match it. The button prompt opens by saying it should carry similar properties *and heights* to the existing icon button.
- **Concrete values**, where you have them. `24, 28 and 32 px`, or `2px border`, or `96% of its original size` when pressed.

Vagueness is not fatal — an unanswered question comes back as a decision rather than a guess — but every specific you give is a round you do not spend.

## Priming: the agent learns your system first

Before anything is written, the agent reads:

- **Your conventions** — how your components and props are named, how your Figma file is organised.
- **Your catalogue** — which components already exist, so the badge nests your icon rather than inventing one.
- **Your analysis reports** — the prop vocabulary your system already uses, which tokens exist and what they are worth, and what nests inside what.
- **The rules and the schema** — what a specification is allowed to contain, which is fixed and the same in every workspace.

This is the step that makes the result look like it belongs to you. A badge authored without it would be a reasonable badge; a badge authored with it reuses your `size` enum, your surface tokens, and your spelling.

It is also why an authored component inherits your system's decisions for free. If your library already calls the prop `appearance` and not `variant`, the new component does too, without you saying so.

:::note
Priming reads your reports rather than regenerating them. If they are out of date the agent runs [`specs analyze`](/cli/commands/analyze/) first; it will tell you when it does.
:::

## The first round

The agent writes three files, in order, checking each one before starting the next:

| File | Holds |
|------|-------|
| `api.yaml` | The contract — every part of the component, and every prop |
| `variants.yaml` | The appearance — the default, then what each prop configuration changes |
| `examples.yaml` | Ready-made usages, and the fills for any slot |

Each file is checked with [`specs validate`](/cli/commands/validate/) before the next one starts, so a mistake surfaces in the file that caused it rather than three files later.

You do not need to watch this happen. It matters only because it is why the report you get back names a specific file when something went wrong.

## Watching it appear

While the round runs, the component is live on two surfaces.

**Storybook refreshes as files save.** The React and Web Components implementations are re-emitted on every save, so the component appears and then changes under you as variants land. This is effectively instant.

**Figma is rendered on command, once per round.** The canvas is deliberately not watched — a many-variant component cannot finish drawing before the next save would trigger the next draw, and the loop breaks Figma. So the agent renders after all three files are clean, which takes a few seconds, and re-renders when you ask for it.

Between the two you can assess direction visually before you read a word of the report: whether the sizes look right, whether the subtle and non-subtle colors read as a pair, whether the glyph sits where you expected.

That is the assessment you are best placed to make, and the agent cannot make it for you.

## The report you get back

Every round ends with the same six sections. Three are informational and three want something from you.

| Section | What it is |
|---------|------------|
| Files updated | What was written |
| Props updated | Which props exist now |
| Tokens applied | Which of your tokens were used |
| **Decisions to confirm** | Judgment calls made for you, numbered |
| **Gaps** | Requirements the specification format could not carry |
| **Suggestions** | Things noticed but deliberately not built |

**Decisions** are where your prompt left room and the agent chose. For the badge: which of your color tokens carries "info", whether `subtle` is a boolean or a two-value enum, whether XS is a size the rest of your catalogue has. They are numbered so you can answer by number.

**Gaps** are honest limits. A requirement goes here only once the agent can name where it would have lived in the specification and why it does not fit. Most land in the supplemental overlay rather than being dropped.

**Suggestions** are scope the agent spotted and did not take — an accessibility behavior, a missing state, an interaction. Nothing here is built unless you ask. This is deliberate: it keeps a round from growing while you are not looking.

## Responding

Short answers are fine. Answer by number, and say nothing about the sections you are happy with:

> 1. Yes, use `color/status/info` — that's the one the alerts use.
> 2. Boolean. Everything else in the library that reads as on/off is a boolean.
> 3. Drop XS. Nothing else goes below S and I don't want to start.
>
> From suggestions: do the focus ring, skip the rest for now.

The agent revises, re-validates, re-renders, and reports again. Ignoring a decision is also an answer — it stands as made, and the report tells you so next round.

## Three things you end up with

A finished component is more than its specification.

| Artifact | Carries | Who reads it |
|----------|---------|--------------|
| The spec — three files | Everything the format can describe | Every platform that emits from it |
| Supplemental overlay | Behavior the format cannot describe, hand-built onto your React or Web component | Whoever builds or maintains the component |
| `guidelines.yaml` | How the component should and should not be used | Whoever uses it |

The overlay is the part worth understanding. Most of a component comes out of the specification automatically — the markup, the classes, the state selectors. What the format cannot express is written by hand *beside* the generated files, never on top of them, so regenerating the component never destroys it. The button prompt's press animation is exactly this shape: nothing in a specification describes shrinking to 96% on pointer-down, so it lands in the overlay with a note saying which schema path would have carried it if one existed.

Guidelines are separate because they bind a different person. "Always include a label; an icon-only button is what Icon Button is for" is not something the component does — it is something its caller must observe. That belongs in guidelines, where it reaches the people choosing between two components.

:::caution
[`specs generate`](/cli/commands/generate/) writes a Figma round-trip over any component folder with the same name, including one you authored by hand. In a workspace with authored components, generate one component at a time and check the manifest's selections after any fetch.
:::

## Related

- [`component.author`](/cli/skills/component-author/) — the skill that runs this loop
- [`author`](/cli/commands/author/) and [`validate`](/cli/commands/validate/) — the two commands behind it
- [`authoring.primer`](/cli/skills/authoring-primer/) — the structural contract, if you want to read what the agent reads
- [supplemental](/schema/documents/supplemental/) and [guidelines](/schema/documents/guidelines/) — the two documents beside the spec
