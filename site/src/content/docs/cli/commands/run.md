---
title: "run"
---

Brings the workspace up to date, then keeps it that way. Watches your data, specs and config, and redoes only the part a change affects. Runs until Ctrl-C.

It is [`specs build`](/cli/commands/build/) — the same chain, the same steps, in the same order — with a watcher on the front.

## Usage

```bash
specs run                        # the whole workspace
specs run --skip storybook       # watch, but leave Storybook out
specs run --skip analyze         # watch, without re-running the analysis reports
specs run --dry-run              # print the plan and what it would watch
```

## What a change starts

The point of the chain is that a change enters at one step and everything after it follows. Editing a spec does not re-scan your Figma data.

| You change | It starts at | So this runs |
|---|---|---|
| `data/<alias>.file/` — you ran `specs fetch` | `scan` | scan → generate → analyze → react, webcomponents → storybook |
| `data/<alias>.manifest.md` — you ticked a checkbox | `generate` | generate → analyze → react, webcomponents → storybook |
| `data/<alias>.variables.json`, `<alias>.styles.json` | `analyze` | analyze → react, webcomponents → storybook |
| `assets/icons/` — you ran `specs fetch --only <alias>,icons` | `react`, `webcomponents` | react, webcomponents → storybook |
| `specs/components/Alert/api.yaml` | `analyze` | analyze → react, webcomponents → storybook, **for Alert only** |
| `config/` — a convention or setting | `scan` | scan → generate → analyze → react, webcomponents → storybook, for everything |
| `storybook/content-overrides/` | `storybook` | storybook publish |

A spec change is narrowed to the component it is inside. A `config/` change is not: one file there decides the shape of every component's output. Deleting a spec folder is not narrowed either — a pass limited to one component never prunes, and the stale emitted directory is exactly what needs removing.

A `config/` change runs the whole chain, starting at `scan`, because conventions decide what a spec says and not merely how it is reported. `scan` reads the `glyphs` convention to know what to exclude, and `generate` reads keys, naming and slots to write the specs themselves. Entering later would re-run the analysis and both platform trees against specs written under the old convention — a pass that looks clean and emits from stale input. It also means a convention edit re-derives the manifest from Figma's dev status, the same as new data arriving, so `settings.curation.preserveManualSelections` applies here too.

Glyph SVGs are the one `assets/` input, and they enter at the platform steps rather than at `analyze`, because no analysis reads one and no spec changes when they arrive. Only the icons directories are watched, never `assets/` itself — the platform steps write `assets/cssvars/`, so watching the parent would make each pass start the next one.

`analyze` is where a spec edit now lands, because it is the first step that reads `specs/`. The narrowing still happens there — the pass knows it was Alert, and passes that to the platform steps — but `analyze` itself ignores it and reads the whole catalogue, because its reports are catalogue-wide. Fetched variables and styles enter here too: refreshing them changes what the unused-token report should say with no spec having changed at all.

### The chain re-reads your workspace each time

Which steps run is worked out per pass, not once at startup. Delete `react/` mid-session and the react step stops — it will not recreate the tree you just removed. Add it back and the step returns. Either way it names only what moved, not the whole chain:

```
[specs run] react is no longer in this workspace — dropped from the chain
```

Every pass prints what it decided before it does it:

```
[specs run] analyze → react → webcomponents → storybook publish (Alert)
  ✓ analyze — 73 specs (0.8s)
  ✓ react — 1 component (0.4s)
  ✓ webcomponents — 1 component (0.3s)
  ✓ storybook publish — 2 files changed (0.2s)
```

Note the asymmetry on that pass: `analyze` reads all 73 specs while the platform steps emit the one component that changed. That is the scoping rule, not a bug — the analysis reports describe the catalogue, so a partial one would be wrong.

That line is worth reading when something looks stale. A chain that decided wrongly what to rebuild looks exactly like a broken transform, and the printed plan is the difference between the two.

## Curation runs both ways

`data/<alias>.manifest.md` is yours — you tick the boxes. Because `scan` writes it and `generate` reads it, it is a step in the chain, which means **editing the manifest regenerates what you selected.** No rescan, no second command.

The other direction needs a word of warning. When new data arrives and `scan` runs, it re-derives the checkboxes from each component's dev status in Figma, which can un-tick something you ticked. That is `settings.curation.preserveManualSelections`, and `run` says so once at startup when it is off:

```
[specs run] note: new data in data/ will re-tick the manifest from Figma's dev status.
            Set settings.curation.preserveManualSelections to keep your own selections.
```

The setting behaves exactly as it always has — see [Curation](/settings/curation/). It is just no longer silent.

## Failures do not stop the session

A failed step is reported and the watcher keeps running, because the fix is the next time you save a file. Only the steps after the failed one are skipped for that pass — their input is what the failed step did not write.

## The license is checked once per session

`run` asks once, at startup, and never again. Steps are function calls in one process, so the answer is reused by every step and every later pass.

One consequence worth knowing: a session holds the answer until you quit it. If a license is revoked while `specs run` is open, that session keeps working until it is restarted. This is deliberate — re-checking on a timer would bring back the repeated calls that used to push a run past the proxy's rate limit and silently produce free-tier output under a paid key.

## Options

| Option | Effect |
|---|---|
| `--only <steps...>` | Watch and run these steps and nothing else |
| `--skip <steps...>` | Everything except these steps |
| `--components <keys...>` | Limit every pass to these component folders |
| `--render` | Also render each changed spec into the connected Figma file |
| `--file <fileKey>` | With `--render`: which connected Figma file to render into |
| `--dry-run` | Print the plan and the paths it would watch, then stop |
| `--config <path>` | A workspace whose `config/` is not in the current directory |
| `--verbose` | Per-step detail |

`--only` and `--skip` name steps — `scan`, `generate`, `analyze`, `react`, `webcomponents`, `storybook`, `render` — and cannot be combined. `specs fetch` is not a step; [`build`](/cli/commands/build/#what-is-not-in-the-chain) explains why.

`--components` limits every pass except `analyze`, which always reads the whole catalogue — [`build`](/cli/commands/build/#analyze) explains why.

### `--render`

Renders each changed spec back into the connected Figma file as the last step of every pass. Needs a running bridge and an open Figma session — see the [Render to Figma guide](/guides/render-to-figma/).

Unlike [`specs build --render`](/cli/commands/build/#--render), this **overwrites**: it deletes the existing same-titled page component before re-rendering. In a watch loop that is the whole point — you edit a spec, the component in Figma is replaced. It is also why the flag is off by default, and why the one-shot `build` refuses instead.

Scoping applies here too. A spec edit is already narrowed to the component it is inside, so a pass renders that one component rather than the catalogue.

**Closing Figma does not end your session.** If the bridge stops, or no file is connected, rendering is skipped with a warning and the rest of the pass carries on as normal. Reopen the plugin and the next pass renders again — there is nothing to restart.

```
  ✓ react — 1 component (0.4s)
  ⚠ render skipped — no Figma file is connected — open the plugin in the file you want to render into
```

If more than one Figma file is connected, rendering is skipped too, naming them and asking for `--file <fileKey>`. It is never a prompt: `specs render` on its own asks you to pick, but a watch loop that stopped on a keystroke — possibly mid-pass, hours later — would just look hung.

### `--file <fileKey>`

Which connected Figma file `--render` targets, when more than one is open.

## Storybook

`specs run` starts Storybook for you, once the content it serves is current, and prints where:

```
  ✓ storybook publish — already current (0.1s)
[specs run] Storybook starting — http://localhost:6006
```

It uses the Storybook your workspace installed, through the script [`specs storybook init`](/cli/commands/storybook/#specs-storybook-init) scaffolded — your port, your flags. The CLI never ships or installs Storybook itself.

If Storybook exits — it needs Node 20.19+, and will say so — the message names it and **everything else keeps running.** The chain does not depend on the server.

`--skip storybook` skips the server too, not just the publish step. A server showing content nothing is maintaining would be worse than no server.

### `run` and `specs storybook dev`

Both serve Storybook, and they share one implementation of it — the server and its index recovery live in one place, so they cannot drift.

| | Starts at | Serves Storybook |
|---|---|---|
| [`specs storybook dev`](/cli/commands/storybook/#specs-storybook-dev) | `specs/` — you generate yourself | Yes |
| `specs run` | `data/` — the whole chain | Yes |

`specs storybook dev` remains the right choice when Storybook is what you're working on and you'd rather run `generate` by hand. `specs run` is the one command for everything.

## See Also

- [`build`](/cli/commands/build/) — the same chain, once, for CI
- [`storybook`](/cli/commands/storybook/) — the Storybook-scoped watch loop
- [Analyze](/cli/analyze/) — what the `analyze` step measures
- [Curation](/settings/curation/) — what `preserveManualSelections` does
