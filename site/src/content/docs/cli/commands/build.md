---
title: "build"
---

Brings every derived part of a workspace up to date, in order, then exits.

A workspace is a chain: data produces a manifest, the manifest produces specs, specs produce the analysis reports and each platform's code, and all of that is what Storybook shows. Running those commands by hand means remembering the order and never skipping one — and nothing tells you when you did. `build` performs the whole chain, says what it ran, and fails with a non-zero exit code when a step fails, which is what makes it usable in CI.

[`specs run`](/cli/commands/run/) is the same chain, watching.

## Usage

```bash
specs build                          # everything this workspace has
specs build --components Alert       # just one component, through every step
specs build --only react             # one step
specs build --skip storybook         # everything but one step
specs build --skip analyze           # skip the analysis reports
specs build --dry-run                # print what would run, run nothing
```

## The chain

Each step reads what the one before it wrote. A step runs only when the workspace actually has something for it to do — specs to read, a scaffolded Storybook — so nothing needs declaring in settings. Platform trees are the one case worth knowing in detail; see below.

| Step | Reads | Writes | Runs when |
|---|---|---|---|
| `scan` | `data/<alias>.file/` | `data/<alias>.manifest.md` | A fetched file payload is on disk |
| `generate` | `data/<alias>.manifest.md` | `specs/` | A manifest exists |
| `analyze` | `specs/`, `config/`, fetched variables and styles | `specs/analysis/`, `styling.yaml` per spec | `specs/` exists |
| `react` | `specs/`, `config/` | `react/src/` | `react/src/` exists — or no platform tree does |
| `webcomponents` | `specs/`, `config/` | `webcomponents/src/` | `webcomponents/src/` exists — or no platform tree does |
| `storybook` | `specs/`, `specs/analysis/`, `config/`, `assets/` | `storybook/content/` | `storybook/.storybook/` exists |
| `render` | `specs/` | **the connected Figma file** | Only with `--render` |

### Which platforms emit

A platform tree is an opt-out, not a declaration you have to make first. **With specs to emit, no platform tree yet, and no `--only` or `--skip`, every platform emits** — which is what makes a first `build` produce working code without anyone configuring anything.

From then on the directories are the answer. `react/src` present means emit React there; absent, once the other tree exists, means this workspace does not want React. So deleting `webcomponents/` stops it being emitted, and deleting the last tree returns the workspace to emitting both — the same thing it meant before the first run.

Naming steps is itself a preference, so a scoped run never falls back to emitting everything: `--only storybook` means storybook, not storybook plus two trees the workspace never asked for.

### `analyze`

Where it sits is a real dependency, not a convention. It reads `specs/`, so it cannot come before `generate`; `storybook` publishes a page per analysis report, so it cannot come after the step that consumes what it writes. It is the only step whose output another local step reads — everything else reads `specs/` or `data/` directly.

Being ahead of `react` and `webcomponents` is not a dependency: neither reads an analysis. It still matters, because the styling analyzer writes a `styling.yaml` into each spec folder, and the spec folder is what the platform steps read. Running first means everything a pass will write into a spec folder is already there by the time a platform step looks, so one change settles in one pass instead of two.

**`--components` does not narrow it.** Each analyzer writes one aggregate report per concern — `analysis/props.yaml`, `analysis/dependencies.graph.yaml`, `analysis/styling.byToken.yaml` and the rest — built from the specs that pass read. Analysing a subset would replace a catalogue-wide report with a one-component one and report success, so `analyze` always reads the whole catalogue even when the rest of the pass is scoped to one component.

Skipping it is safe. `--skip analyze` leaves the reports as they were and nothing downstream breaks: the platform steps do not need a `styling.yaml`, and Storybook simply publishes the analysis pages it already had. See [Analyze](/cli/analyze/) for what each analyzer measures.

### `--render`

The one step that writes somewhere other than disk, so it is off unless you ask. It needs a running bridge and an open Figma session — see the [Render to Figma guide](/guides/render-to-figma/).

It does **not** overwrite. Overwriting deletes an existing same-titled page component first, which is fine when a watch loop re-renders what you just edited and a bad surprise in a build you ran once. A title collision is therefore an error here:

```
✗ render: Render failed: A component named "DS Button" already exists on this page.
          Pass --overwrite to replace it.
```

[`specs run --render`](/cli/commands/run/#--render) does overwrite, because re-rendering is the point of a watch loop. To overwrite in a one-shot run, use [`specs render --overwrite`](/cli/commands/render/) deliberately.

With `--components`, a name that matches no spec folder is reported and skipped. If *none* of them match, the run fails rather than reporting a success that rendered nothing.

#### When there is nowhere to render to

Not having a Figma session open is a fact about your environment, not a fault in the workspace. Rendering is **skipped with a warning** and the rest of the run is unaffected — a build whose every other step wrote what it should still passes:

```
  ⚠ render skipped — the bridge is not running — start it with `specs bridge start`, then open the plugin

✓ build complete — 4 steps, 1 skipped
```

Three cases skip rather than fail:

| Situation | What it says |
|---|---|
| Bridge not running | How to start it |
| Bridge up, no file connected | Open the plugin in the file you want |
| More than one file connected | Names them, and tells you to pass `--file` |

That last one matters more than it looks. `specs render` on its own prompts you to pick a file; a chain must never do that, because under [`run`](/cli/commands/run/) the prompt could arrive mid-pass with nobody watching, and the loop would sit there looking hung.

A render that was actually *attempted* and failed is a real failure and does fail the run — a title collision, a bad spec, or a `--file` naming something that isn't connected.

### `--file <fileKey>`

Which connected Figma file to render into, when more than one is open. Only meaningful with `--render`.

### What is not in the chain

**`specs fetch`** is not a step. Everything above runs because a file it watches changed, and fetch's input is the Figma file — which the CLI cannot watch. It is something you run when you mean to, and what it writes into `data/` is picked up from `scan` onward. In a script, say so plainly:

```bash
specs fetch && specs build
```

## Options

| Option | Effect |
|---|---|
| `--only <steps...>` | Run these steps and nothing else |
| `--skip <steps...>` | Run everything except these steps |
| `--components <keys...>` | Limit the run to these component folders |
| `--render` | Add the `render` step at the end — writes to the connected Figma file |
| `--file <fileKey>` | With `--render`: which connected Figma file to render into |
| `--dry-run` | Print the steps that would run, and run nothing |
| `--config <path>` | A workspace whose `config/` is not in the current directory |
| `--verbose` | Per-step detail |

`--only` and `--skip` name steps — `scan`, `generate`, `analyze`, `react`, `webcomponents`, `storybook`, `render` — and cannot be combined. Naming `render` in `--only` is as explicit as `--render`, so it needs no second flag.

`--components` narrows every step except `analyze`, whose reports are catalogue-wide by construction.

## Exit codes

`build` stops at the first step that fails and exits non-zero. It does not carry on: a step's output is the next step's input, so continuing would run the rest against stale files and report success.

| Code | Meaning |
|---|---|
| `0` | Every step succeeded, or was skipped for a reason outside the workspace |
| non-zero | A step failed — the code is the one that step's own command would have returned |

A skipped step never decides the exit code. The only step that can skip is `render`, and only when there is no Figma session to render into.

## The license is checked once

Steps run as function calls inside one process, not as separate `specs …` commands. That is what keeps the license check to one per run.

It matters more than it sounds. The license proxy is rate limited, and a throttled check is not a verdict — it means the question went unanswered. Asking repeatedly used to push a run past the limit, and a throttled check inside `generate` came back as free, so specs were written at the wrong tier and the run still reported success. One check per run removes that.

## In CI

Left alone, `build` needs no `FIGMA_TOKEN` and reaches no live Figma file — every step in the default chain is local, and `--render` is the only way out of that. Fetch separately, in a step that makes the network call visible:

```yaml
- run: specs fetch
  env:
    FIGMA_TOKEN: ${{ secrets.FIGMA_TOKEN }}
- run: specs build
  env:
    SPECS_LICENSE_KEY: ${{ secrets.SPECS_LICENSE_KEY }}
```

## See Also

- [`run`](/cli/commands/run/) — the same chain, watching
- [`storybook`](/cli/commands/storybook/) — the Storybook-only version of the watch loop
- [Analyze](/cli/analyze/) — what the `analyze` step measures
- [Workflows](/cli/workflows/) — where these fit in day-to-day use
