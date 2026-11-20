---
title: "component.author"
description: "Author a new component spec from a request, one validated file at a time"
---

A skill that authors a new component spec end to end: it splits the request into what the schema can carry and what it cannot, correlates the result against your catalogue, writes the three concern files with a [`validate`](/cli/commands/validate/) gate between each, and compiles the result into Storybook and onto the Figma canvas.

Installed by [`specs skills install`](/cli/commands/skills/) as `.claude/skills/specs-cli.component.author/`, then invoked in Claude Code.

## Prerequisites

- [`specs-cli.primer`](/cli/commands/skills/) — what Specs is and the rules for reading its data.
- [`specs-cli.authoring.primer`](/cli/skills/authoring-primer/) — the structural contract for writing a spec by hand.
- A live posture, which [`specs-cli.posture`](/cli/skills/posture/) brings up.

## Outline

- Opens the round with [`specs author start <key>`](/cli/commands/author/) — one command for the folder, the templates and the status digest.
- Splits every requirement in the request into spec, supplemental or guidelines, naming the schema path in each case.
- Correlates against `config/conventions/`, the catalogue, [`analysis/props.yaml`](/cli/analyze/props/) and [`analysis/dependencies`](/cli/analyze/dependencies/) so the result looks native.
- Writes `api.yaml`, then `variants.yaml`, then `examples.yaml` — validating after each, zero errors before the next.
- Renders once to the canvas and observes the component in Storybook, after all three files are clean.
- Writes the two authored documents last: `supplemental.yaml` for what the component must do, `guidelines.yaml` for what its caller must do.
- Closes with a structured report — files, props, tokens, decisions to confirm, gaps, suggestions.

## Your input

Two gates. The requirements split is written before any file, and you can correct where a requirement landed. The closing report's **Decisions to confirm** is numbered so you can answer by number, and nothing in **Suggestions** is built without you asking for it.

## Related

- [Authoring a component](/guides/authoring-a-component/) — the full round this skill follows
- [`authoring.primer`](/cli/skills/authoring-primer/) — its prerequisite
- [`author`](/cli/commands/author/) — the command it opens with
- [`validate`](/cli/commands/validate/) — the gate between every file
