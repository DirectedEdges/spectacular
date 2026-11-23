---
title: "component.compile"
description: "Render an authored spec onto the canvas once, observe it, and classify what the render warned about"
---

Renders a validated spec onto the Figma canvas, says which running surfaces to look at, and sorts the render's warnings into the ones that mean the spec is wrong, the ones that mean a platform cannot carry something, and the ones that are expected noise.

A render exits successfully even when it reports `⚠ INCOMPLETE`, and the reason never appears on standard output — so a round that reads the exit code alone concludes it is finished when it is not. Sorting that out is the work this skill holds.

Installed by [`specs skills install`](/cli/commands/skills/) as `.claude/skills/specs-cli.component.compile/`.

## Prerequisites

- [`specs-cli.primer`](/cli/commands/skills/) — what Specs is and the rules for reading its data.
- [`specs-cli.authoring.primer`](/cli/skills/authoring-primer/) — the structural contract for writing a spec by hand.
- All three concern files validating clean, and a live posture that [`specs-cli.posture`](/cli/skills/posture/) brings up.

## Why it is a separate skill

[`component.author`](/cli/skills/component-author/) names it at its compile step rather than carrying it. Three things follow from that:

- A round stops paying for it during priming. It is around 790 words that matter only once all three files validate, and a round used to read them before writing its first line.
- The compile's cost is measurable apart from the authoring that preceded it.
- Anything that should reach the canvas after the round — a late edit, a cleared canvas, a reconnected plugin — is another invocation rather than a different procedure.

It is a directive, not a decision: the parent skill names the invocation at a numbered step, so there is no moment where a session has to work out that it needs this.

## Outline

- Renders once with [`specs render`](/cli/commands/render/) and `--overwrite`, against a spec path rather than a key. Never as a watch — a render per save on a many-variant component cannot finish before the next save.
- Names the two surfaces to observe, and the sanctioned substitute when an agent cannot see them: report the render log's result and node id with an explicit "not visually verified". Scraping Storybook or driving a browser to compensate is not an alternative.
- Carries the two situations that cost no deliberation — the bridge plugin disconnected, the canvas needing a refresh.
- Classifies every warning the render log can produce, so only the spec defects get acted on.
- Diagnoses `INCOMPLETE` down to its two usual causes: an instance of a component never rendered into this file, or a subcomponent whose title, key and `anyOf` disagree.

## Your input

Visual verification. The skill reports what rendered and where; whether the component looks right on the canvas and in Storybook is yours to judge, and the skill is explicit that it never substitutes for you.

## Related

- [`component.author`](/cli/skills/component-author/) — invokes this at its compile step
- [`posture`](/cli/skills/posture/) — what brings the surfaces up
- [`render`](/cli/commands/render/) — the command it runs
- [Authoring a component](/guides/authoring-a-component/) — the full round
