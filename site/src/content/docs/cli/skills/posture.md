---
title: "posture"
description: "Bring the live authoring posture up — emit and Storybook, detached and verified"
---

A skill that turns on the live emit chain authoring runs against: saving a spec re-emits it to every platform target and refreshes Storybook. It is idempotent, so it is safe to run whenever the posture might be down.

Installed by [`specs skills install`](/cli/commands/skills/) as `.claude/skills/specs-cli.posture/`, then invoked in Claude Code.

## Prerequisites

[`specs-cli.primer`](/cli/commands/skills/). A workspace with a `storybook/` directory, which [`specs build`](/cli/commands/build/) creates.

## Outline

- Reads the Storybook port from `storybook/package.json` — the script pins it with `-p <port>`, and it is never guessed.
- Curls that port. If it answers, the posture is up and the skill stops there.
- Starts [`specs run`](/cli/commands/run/) detached if it is not, logging to `.posture/specs-run.log`.
- Polls the port until it answers, and on timeout reports the log tail rather than retrying blind.
- Stops the posture only when asked — it stays up between authoring sessions by design.

## The canvas is not part of it

A render watch re-rendered on every save, and a many-variant component cannot finish rendering before the next save triggers the next render. The loop breaks Figma.

Rendering is an explicit once-per-component step that [`component.author`](/cli/skills/component-author/) runs after `api`, `variants` and `examples` all validate — never a background process.

## Related

- [`run`](/cli/commands/run/) — the command the posture is built on
- [`storybook`](/cli/commands/storybook/) — the surface it serves
- [Authoring a component](/guides/authoring-a-component/) — the round that assumes it is on
