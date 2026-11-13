---
title: "skills"
description: "Install the orchestration skills distributed with the CLI."
---
Install the AI orchestration skills that ship with the CLI. Each one sequences commands you could run yourself, stops at the human review gates, and — where the data does not contain the answer — shows the evidence behind a proposal instead of guessing.

## Usage

```bash
specs skills install [--dir <path>]
```

| Flag | Description |
|------|-------------|
| `--dir <path>` | Skill directory to emit into (default: `.claude/skills`) |

## What gets installed

Thirteen skills, in three groups. `specs-cli.workspace.setup` is the one a new workspace starts from, and `specs-cli.primer` is a prerequisite every other skill names rather than carrying a copy of — what Specs is, which artifact is authoritative for which question, and where to look for the rest.

### Context

| Skill | Carries |
|-------|---------|
| `specs-cli.primer` | What Specs is and the rules for reading its data. Read once per session; every other skill assumes it |
| [`specs-cli.authoring.primer`](/cli/skills/authoring-primer/) | The structural contract for writing a spec by hand — the two kinds, the three files, the six references, the authority order — plus the shipped `rules/*.yaml` layer |

### Setting up a system

| Skill | Orchestrates |
|-------|--------------|
| `specs-cli.workspace.setup` | A workspace from nothing: [`init`](/cli/commands/init/), config and Figma sources, secrets, [`fetch`](/cli/commands/fetch/), [`scan`](/cli/commands/scan/) → human curates → [`run`](/cli/commands/run/) with Storybook live → human picks which improvement passes to run |
| [`specs-cli.icons.setup`](/cli/skills/icons-setup/) | [`specs scan`](/cli/commands/scan/) → decide which components are the icon set → derive a [`glyphs`](/settings/glyphs/) convention by name pattern or child structure → add `icons` to the source and refetch → [`specs generate`](/cli/commands/generate/) to prove the glyph names resolve |
| [`specs-cli.images.setup`](/cli/skills/images-setup/) | Check what published fill styles already give you → decide which laid-out frames are library images → derive an [`images`](/settings/images/) convention → add `images` to the source and refetch → read `data/cache/images.yaml` and the Foundations Images page to prove they resolved |
| [`specs-cli.states.setup`](/cli/skills/states-setup/) | [`specs analyze props`](/cli/analyze/props/) → sort every variant prop into a state concept, a visibility toggle or a presentation flag → human clears the rows they disagree with → paste the [`states`](/settings/states/) block and [`specs react`](/cli/commands/react/) to prove the selectors emit |
| `specs-cli.roles.propose` | [`specs analyze`](/cli/commands/analyze/) → read the live components over the bridge → write `reports/<YYYY-MM-DD>.roles.proposal.md` → human marks up the Decision column |
| `specs-cli.roles.apply` | Parse the approved decisions → annotate the Figma file one page at a time → human confirms in Dev Mode → [`fetch`](/cli/commands/fetch/), [`generate`](/cli/commands/generate/), [`analyze roles`](/cli/analyze/roles/) to prove the round trip |

### Authoring and running a system

| Skill | Orchestrates |
|-------|--------------|
| [`specs-cli.component.author`](/cli/skills/component-author/) | [`specs author start`](/cli/commands/author/) → split the requirements → correlate against the catalogue → `api` → [`validate`](/cli/commands/validate/) → `variants` → validate → `examples` → validate → [`render`](/cli/commands/render/) once and observe → the two authored documents → a structured report |
| [`specs-cli.guidelines.propose`](/cli/skills/guidelines-propose/) | [`specs analyze`](/cli/commands/analyze/) → synthesize one foundations concern's rules from its own evidence → write `specs/foundations/<concern>/guidelines.yaml` at `status: proposed` plus dated ratifier notes → human ratifies |
| [`specs-cli.posture`](/cli/skills/posture/) | Read the pinned Storybook port → check it → start [`specs run`](/cli/commands/run/) detached if it is down → verify. Idempotent; the canvas is deliberately not watched |
| `specs-cli.premerge` | [`specs version figmapremerge`](/cli/commands/version/#specs-version-figmapremerge) fetches, generates, and reports → human reviews the report → merge proceeds or not |
| `specs-cli.release` | [`specs version report`](/cli/commands/version/#specs-version-report) → human review → [`specs version cut`](/cli/commands/version/#specs-version-cut) → [`specs version tag`](/cli/commands/version/#specs-version-tag) → publish |

## The skills that author rather than sequence

`roles.propose`, `states.setup`, `icons.setup`, `images.setup` and `guidelines.propose` **author** something rather than only sequencing commands, and for the same reason: the data does not contain the answer.

Which [role](/roles/) an element takes is a judgment — the discriminator between `checkbox`, `switch` and `togglebutton` is what the control does when operated, which no prop records. A rule reading `checked` and `indeterminate` would be right about `checkbox` and wrong about `toggle`, `switch` and `togglegroup`. Whether a boolean variant prop is a [state](/settings/states/) is the same shape of question: `filled`, `segmented`, `showChevron` and `highlighted` are indistinguishable by name, type or frequency, and one of them is a state.

`icons.setup` is the same shape again: a child structure can be read off the file, but which of a file's populations are icons — against its illustrations, logos and chrome — cannot.

So each one carries the evidence behind its proposal and a human gate: before anything reaches a Figma file for `roles`, and before anything reaches your config for `states` and `icons`.

## Refreshing

The emitted files are **canonical and overwritten on every install** — re-running after a CLI upgrade refreshes them to match the commands they orchestrate. Keep local customization in your own separate skills rather than editing the emitted ones.

## See Also

- [Authoring a component](/guides/authoring-a-component/) — the round the authoring skills follow
- [version](/cli/commands/version/) — the commands the premerge and release skills orchestrate
- [Reports & Changelogs](/versioning/reports/) — the outputs the human gates review
