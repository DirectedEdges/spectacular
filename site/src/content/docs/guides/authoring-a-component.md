---
title: "Authoring a Component"
description: "The loop a designer runs to specify a component by hand: prompt, prime, round, report, response."
---

A spec does not have to come from Figma. You describe a component in plain language, and you get back a specification, a React and Web Components implementation, a rendering on the Figma canvas, extended requirements for whoever builds it, and guidelines for whoever uses it.

This guide is that loop from your side.

- [The loop](#the-loop)
- [Your prompt](#your-prompt)
- [Priming](#priming)
- [The first round](#the-first-round)
- [What appears](#what-appears)
- [Decisions, gaps and suggestions](#decisions-gaps-and-suggestions)
- [Your response](#your-response)
- [Extended requirements and guidelines](#extended-requirements-and-guidelines)
- [Concluding a component](#concluding-a-component)

## The loop

| Step | Who | What |
|------|-----|------|
| **Prompt** | You | Describe the component |
| **Prime** | Agent | Load the schema, rules, conventions, catalogue and analysis for this request |
| **Round** | Agent | Write `api`, `variants` and `examples`, validating each; render and emit |
| **Report** | Agent | Decisions, gaps and suggestions, numbered |
| **Response** | You | Answer by number |

Round, report and response repeat. Most components settle in two or three passes.

## Your prompt

Plain sentences, one requirement each. This is a real one:

> Make an image component.
>
> Add a prop for rounding the corners of an image, using a few most relevant options from shaping tokens and those names. Default to squared/none.
>
> Include a source prop, especially modeled in Figma. Default to a sensible image already available in the workspace.
>
> Include an accessibility label akin to an alt tag. Write usage guidelines about its use if needed.
>
> Include an aspect ratio prop, with values of 16:9, 4:3, 1:1, 3:2, 2:3, 21:9, and none. Default to none.
>
> In Figma, can we set the default width to be 373, and say that by default it fills parent horizontally like a block level element?

Nothing there names a token, a schema property or a file. It names outcomes, and the agent is responsible for finding the parts of your system that deliver them. Say explicitly what should be visible by default when a component is composable, what an existing component already does when the new one should match it, and any concrete values you already hold — `373`, `16:9`, `2px` — because each specific is a round you do not spend; vagueness is not fatal, since an unanswered question comes back as a decision rather than a guess.

## Priming

Nothing is written until the agent has loaded the request's context, and every tool in this part of the system exists to make that loading short. The time between your prompt and the first written line is the cost that compounds across a component, and it is the one the tooling is tuned against.

The round opens with [`specs author start`](/cli/commands/author/), which writes the component folder from templates — valid as shipped — and prints a startup digest. The digest is an index rather than a context dump: it names your catalogue, the paths and dates of your [analysis reports](/cli/analyze/), your conventions files, and whether Storybook is answering. It carries no token names and no prop vocabularies, because its job is to say what to read and whether it is current, not to pay for reading it.

What is then read arrives in two batches, each loaded once and never reopened. The **contract batch** comes before `api.yaml`: the [authoring primer](/cli/skills/authoring-primer/) and the rules files for the concepts this request touches, your `config/conventions/` files, [`analysis/props.yaml`](/cli/analyze/props/) for the prop vocabulary your system already uses, and [`analysis/dependencies`](/cli/analyze/dependencies/) for what nests inside what. The **styling batch** comes later, at `variants.yaml`, and holds the style reference, [`analysis/foundations/<type>.yaml`](/cli/analyze/foundations/) for the token types this component needs, and [`analysis/styling.byToken.yaml`](/cli/analyze/styling/). Styling context read before the contract work would sit idle through it, so it is not read yet.

Several structures exist only to keep these batches small. The foundations analysis is split one file per token type behind an index, so a question about a corner radius reads one small file rather than scanning a library-wide manifest. The rules files are keyed to mirror the schema node they govern — `anatomy`, `styles`, `props`, `slots`, `variants` — so a component with no slots never loads the slot rules. And [`specs-cli.primer`](/cli/commands/skills/) is named as a prerequisite by every other skill rather than copied into each one, so a session that touches three skills pays for it once.

The effect you see is that the result looks like your system. The image component reuses your shape token names, your prop spelling, and the source-prop name your `config/conventions/figma.yaml` already declares — none of which you had to say.

## The first round

Three files, in order, each checked with [`specs validate`](/cli/commands/validate/) before the next one starts:

| File | Holds |
|------|-------|
| `api.yaml` | The contract — every part of the component, and every prop |
| `variants.yaml` | The appearance — the default, then what each prop configuration changes |
| `examples.yaml` | Ready-made usages, slot fills, and the image registry entries a component paints from |

Validating between files means a mistake surfaces in the file that caused it. It matters to you only because it is why a report names a specific file when something went wrong.

## What appears

By the end of a round the component exists on every surface your workspace emits:

| Surface | Written by | Refresh |
|---------|-----------|---------|
| Figma canvas | [`specs render`](/cli/commands/render/) | Once per round, on command |
| React | [`specs react`](/cli/commands/react/) | On save |
| Web Components | [`specs webcomponents`](/cli/commands/webcomponents/) | On save |
| CSS | both emitters | On save |
| Storybook | [`specs storybook`](/cli/commands/storybook/) | On save |
| Examples | `examples.yaml`, through both emitters | On save |
| Analysis | [`specs analyze`](/cli/commands/analyze/) | Re-run when the catalogue changes |

Everything except the canvas is driven by [`specs run`](/cli/commands/run/), which re-emits on save. The canvas is rendered on command because a render watch cannot finish a many-variant component before the next save triggers the next render.

## Decisions, gaps and suggestions

Every round closes with a report. Three of its sections want something from you, and they mean different things.

**Decisions** are judgment calls made where your prompt left room. They stand unless you change them.

> **D1 — `cornerRadius` takes four rungs, not the whole scale.** `None`, `L`, `XL` and `Max`, named as your shape tokens name them, with `None` as the default you asked for. Your scale has eleven rungs; "a few most relevant options" reads as the four that change the silhouette.
>
> **D2 — `ratio` is ordered widest to tallest, `None` last.** `21:9`, `16:9`, `3:2`, `4:3`, `1:1`, `2:3`, `None`, defaulting to `None`.
>
> **D3 — the source prop is named from your conventions.** `config/conventions/figma.yaml` declares the Figma-side name, so the prop follows it rather than a name chosen here.
>
> **D4 — the root takes `role: image`.** A recognised role concept, previously unused in this catalogue, and it is what the element is.

**Gaps** are requirements the specification format could not carry. A requirement reaches this section only once the agent can name where it would have lived and why it does not fit — most then land in the extended requirements rather than being dropped.

> **G1 — no spec key binds an image prop to a painted fill.** `backgroundImage` accepts an image value or a token, never a binding, so a code-settable source has no surface in the spec. Carried in extended requirements, implemented in both platform files.
>
> **G2 — `objectFit` could not be stated until the image registry had an entry.** It lives inside the image value on `backgroundImage`, which needs a registry entry to point at. Resolved once `specs fetch --only library,images` found the workspace image.
>
> **G3 — `ratio: None` does not reach React.** The variant states it; the emitted sheet keeps the default ratio. The binding map declares this key as bound, so this is a platform defect rather than a spec problem. Reset authored into both platform files.

**Suggestions** are scope noticed and deliberately not taken. Nothing here is built unless you ask, which is what keeps a round from growing while you are not looking.

> **S1 — a loading and error state.** Nothing states what the frame shows before the image arrives or when it fails.
>
> **S2 — a `fit` prop** exposing contain beside the implied cover, for images that must not crop.
>
> **S3 — lazy loading, with `srcset` and `sizes`** for responsive sources. Would land as extended requirements with a React overlay.

The report also lists the files written, the props that now exist, and the tokens applied, so you can see what changed without opening anything.

## Your response

Answer by number. Say nothing about the items you are happy with — silence accepts them.

> D1 Ok.
>
> D2 Great.
>
> D3 Favor prepending the visual property name for specificity — `topStartCornerRadius`, not `topStartRounded`. Propose that as a shape guideline too.
>
> G1 The bridge now selects a frame with that fill; capture it to derive the source.
>
> G3 Resolve it at worst with an extended requirement.
>
> S1 Declined.
>
> S2 Yes.
>
> S3 Yes — extended requirement with a React overlay.

A reply like that produces a round that renames the prop across every variant, proposes the naming rule into [`specs/foundations/shape/guidelines.yaml`](/schema/documents/guidelines/), resolves the source, and builds the two accepted suggestions. The declined one is not raised again.

## Extended requirements and guidelines

Most of the component comes out of the specification on its own — the markup, the classes, the state selectors, the stories. Two documents carry what it cannot, and they are written for different people.

**Extended requirements** ([`supplemental.yaml`](/schema/documents/supplemental/)) hold behavior the format cannot describe, for whoever builds and maintains the component. Each entry states a testable intent and names the schema path that would have carried it, so the document doubles as a standing record of where the format stops. The implementation sits in hand-authored files *beside* the generated ones — `component.tsx` for React, `component.ts` for Web Components — so regenerating never overwrites it. G1's image source and S3's lazy loading both land here.

Eleven sections are available: anatomy, props, styles, slot composition, events, accessibility, behavior, motion, layout, overrides and naming. An entry can be scoped to one platform where it only applies there.

**Guidelines** ([`guidelines.yaml`](/schema/documents/guidelines/)) hold what someone *using* the component must observe, each as a statement carrying an obligation level — must, should, should-not, must-not, may. The image prompt asks for usage guidance on the accessibility label, and that is exactly this shape: nothing the component does, everything its caller must do. A prohibition pairs with its remedy in the same entry, so a rule never tells someone to stop without telling them what to do instead.

The split is who acts. A thing the component must do is an extended requirement; a thing its caller must do is a guideline. Both are shape-checked by `specs validate` alongside the three concern files.

System-wide guidance is a third layer, and a separate job — [`specs-cli.guidelines.propose`](/cli/skills/guidelines-propose/) writes a concern's rules into `specs/foundations/<concern>/guidelines.yaml` from your own token and styling data, for a system owner to ratify.

## Concluding a component

A finished component produces two outputs: the component, and what the round taught you about your system.

**Debrief first.** The gaps are a list of places the schema, a binding map, or an emitter fell short of what you wanted, written while the evidence was in front of you. The declined suggestions say where you drew the line. Both are input to the system rather than to this component — a gap that recurs across three components is a schema proposal, and a platform defect named in a gap is a bug report with a reproduction already attached. Run the debrief before the context is gone.

**Then ship it.** The rendered component on the canvas is a real Figma component: publish it with the library so designers can place it. Merge the spec folder and its two authored documents into your catalogue, and release the workspace with [`specs version`](/cli/commands/version/) — the [`specs-cli.version.release`](/cli/commands/skills/) skill sequences the report, the human review, the cut, the tag and the publish. The emitted React and Web Components builds go out with it, which is what puts the component into a prototyping kit rather than only into a specification.

What a consumer receives at the end is the whole set: the spec, both implementations, the stories, the extended requirements, and the guidelines that say when to reach for it.

## Related

- [`component.author`](/cli/skills/component-author/) — the skill that runs this loop
- [`author`](/cli/commands/author/) and [`validate`](/cli/commands/validate/) — the two commands behind it
- [`authoring.primer`](/cli/skills/authoring-primer/) — the structural contract, if you want to read what the agent reads
- [supplemental](/schema/documents/supplemental/) and [guidelines](/schema/documents/guidelines/) — the two authored documents
