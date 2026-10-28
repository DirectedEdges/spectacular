---
title: "Render to Figma"
description: "The full command sequence behind a successful render — config, fetch, cache, bridge, plugin, render, and verification"
---

Every other command in Spectacular reads Figma and produces a spec. [`render`](/cli/commands/render/) runs the pipeline in reverse: it takes a spec and creates or updates the matching component in a real, open Figma file.

`render` itself is a thin client. Almost everything that determines whether a render succeeds happens *before* you type it — the data you fetched, the lookup cache built from it, the bridge process, and the plugin connection. This guide walks the whole chain in order, with what each stage contributes, how to verify it before moving on, and what it looks like when it's wrong.

## The Chain

```
specs init          config/: conventions, settings (sources, directories), pipeline
      ↓
specs fetch         Figma payloads  →  data/{alias}.file.json, .variables.json
      ↓             (and builds the cache as its last step)
specs cache         lookup tables   →  data/cache/*.yaml
      ↓
specs bridge start  background server on localhost
      ↓
Figma plugin        Specs 2 open, CLI Bridge toggled on → connects to the bridge
      ↓
specs render        spec → bridge → plugin → component in Figma
      ↓
specs generate      --from-bridge: read back what actually landed
  --from-bridge
```

The first three stages are about *meaning* — a spec names components, styles, tokens, and glyphs, and those names are resolved against your fetched library. The next two are about *reach* — a Node process cannot touch a Figma document, so the bridge relays to a plugin that can. The last is how you check the result, and it is always an explicit second call, never a side effect of `render`.

## Stage 1 — Config

A render workspace is an ordinary Spectacular workspace. If you don't have one:

```bash
specs init
```

Then fill in `data.sources` in `config/settings.yaml` with your Figma file keys. Three settings matter to the render path:

| Setting | Why `render` cares |
|---|---|
| `data.sources` | Each declared source must be fetched and cached. `render` fails naming any that aren't. |
| `data.directory` | Where fetched payloads and `cache/` live. `--refresh-cache` requires it. |
| `spec.directory` | What `specs render` with no path argument renders as a batch. |

See [sources config](/settings/data-sources/) for the full shape.

## Stage 2 — Fetch the Library

```bash
export FIGMA_TOKEN=figd_...
specs fetch
```

This downloads the raw Figma payloads *and* builds the render cache as its final step, which is why a normal workflow never runs `specs cache` by hand.

Re-run `fetch` whenever the library moves underneath you — components added or renamed, styles or variables changed. A spec binds by name, so rendering against data that predates a rename silently binds to the wrong thing or drops content.

Verify the last lines of the output name your sources and non-zero entry counts:

```
  Cache rebuilt: library
  Entries: 3567 components, 97 styles, 1458 variables, 469 icons
```

See [`fetch`](/cli/commands/fetch/) for flags, and note that `variables` data requires a Figma Enterprise plan over REST — on any other plan, fetch it [through the bridge](/cli/commands/fetch/#fetching-variables-via-the-bridge). `file`, `styles`, and `icons` work over REST on any plan.

## Stage 3 — The Cache

The [cache](/cli/commands/cache/) is the set of lookup tables that give a spec's names meaning. Four files under `{data.directory}/cache/`:

| File | Resolves | What breaks without it |
|---|---|---|
| `components.yaml` | instance elements → published component keys | Instances can't be placed; content is missing |
| `styles.yaml` | style names → style keys | Styles aren't applied |
| `variables.yaml` | token names → variable keys | Token bindings fall back to raw values |
| `icons.yaml` | glyph names → icon node ids | Glyph elements can't be placed |

You run [`specs cache`](/cli/commands/cache/) by hand only when the cache is missing, when something outside `fetch` changed your data directory, or when `render` tells you to:

```bash
specs cache            # rebuild whatever is out of date
specs cache --force    # rebuild every source from scratch
```

The bridge checks the cache against your data files before **every** render, and a mismatch is a hard failure rather than an automatic rebuild:

```
Error: Render failed: Render cache is not usable:
  - variables.yaml: "library" is stale

Run `specs cache` to rebuild it.
```

Rebuilding on every render would reintroduce exactly the cost the cache exists to remove, and rendering against data that has moved on produces a failure that surfaces far from its cause. When you'd rather not run a separate command, [`render --refresh-cache`](/cli/commands/render/#--refresh-cache) rebuilds first and then renders.

Note that `render` reads nothing produced by [`scan`](/cli/commands/scan/). A scan manifest is generated and then hand-authored, which makes it a poor thing to resolve against; `scan` serves `generate`, not `render`.

## Stage 4 — The Bridge

Making a spec real in Figma means placing frames, applying styles, wiring variants, and building instances inside a running Figma session — work that can only happen inside the plugin runtime, not in a Node process. The bridge is what connects the two.

```bash
specs bridge start
```

```
Bridge started (pid 12345).
  WebSocket : ws://localhost:9001  (plugin)
  HTTP      : http://localhost:9002/render  (control)
  Logs      : /Users/you/.specs/bridge.log
Enable the CLI Bridge in the Figma plugin to connect.
```

It runs in the background until you stop it, so this is once per session, not once per render. `specs render` never starts it for you — if it isn't running, the command fails immediately rather than hanging:

```
Error: bridge is not running.
  Start it with: specs bridge start
```

Pin a workspace for the whole session with `specs bridge start --workspace ~/design-system` when every render targets the same one; otherwise it's derived per request from each spec's path.

## Stage 5 — Connect the Plugin

Starting the bridge connects it to nothing by itself. In Figma:

1. Open the **target file** — the one you want components rendered into.
2. Run the **Specs 2** plugin.
3. Toggle **CLI Bridge** on. If the plugin was already open before you started the server, toggle it off and back on.
4. Navigate to the **page** you want rendered onto, unless you plan to pass `--page`.

Verify from the terminal:

```bash
specs bridge status
```

```
Bridge running (pid 12345). 1 plugin connected:
  abc123XYZ (Design System Library) — connected
```

`bridge status` exits non-zero when the bridge isn't running, so it's safe in a conditional (`if specs bridge status; then ...`).

**More than one file can be connected at once.** When two or more plugins are connected, `render` asks which file to use in an interactive terminal, and reports the ambiguity as an error in a non-interactive one rather than hanging on stdin. Scripted runs should always pass `--file <fileKey>` — the key is the first column of `bridge status`.

## Stage 6 — Render

### One component

```bash
specs render specs/components/deButton.yaml     # a spec file
specs render specs/components/deButton/         # a component folder (api.* + variants.*)
```

A spinner holds the line while Figma works, then the outcome replaces it:

```
✓ Rendered: deButton (2.4s, nodeId: 1234:5678)
```

The node id is the component that was created or updated — open it directly at `figma.com/file/.../?node-id=1234-5678`.

### A batch

Point `render` at a directory of component folders, or omit the path entirely to use `spec.directory`:

```bash
specs render specs/       # every component beneath specs/
specs render specs/components/forms/ # one group
specs render              # resolved from config
```

```
Found 6 components in specs:
  - deButton
  - deCard
  ...
✓ Rendered: deButton (2.4s, nodeId: 1234:5678)
✓ Rendered: deCard (3.1s, nodeId: 1234:5690)
...

Done: 6 rendered in Figma, 0 failed.
```

Batch scanning looks at most two levels deep and never descends into a component folder. Components render **one at a time, in path order** — order isn't configurable, so when one component's spec references another, render them individually in the order you need. A single failure doesn't abort the sweep; the exit code reflects the total.

### Reading the outcome

| Output | Means |
|---|---|
| `✓ Rendered: name (…)` | The component was created or updated |
| `⚠ INCOMPLETE: n instance element(s) …` | The component exists but is **missing content** — an instance couldn't be resolved |
| `✗ name: Render failed: …` | Nothing was produced for that component |
| `⚠ n rendered with missing content: …` | Batch summary of the incomplete ones |

An incomplete render is a success, not a failure — the component is in Figma, minus what couldn't be placed. Missing instances almost always mean the cache doesn't know the referenced component: re-run `specs fetch`. Pass [`--strict`](/cli/commands/render/#--strict) to turn incompleteness into a failure, which is what you want in CI where a silently partial component is worse than a red build.

## Stage 7 — Verify What Landed

`render` reports success and a node id — nothing about fidelity. To read back what actually exists in Figma, select the rendered component and run generation through the same bridge:

```bash
specs generate --from-bridge -o roundtrip/
diff specs/components/deButton/api.yaml roundtrip/components/deButton/api.yaml
```

That round trip is the real check. Because render is under active development, treat every render as something to look at in Figma too, rather than a guaranteed match to the source spec.

## Stage 8 — Iterate

While working on one spec, let the watcher re-render on every save:

```bash
specs render specs/components/deButton/ --watch
```

`--watch` implies `--overwrite`, since each pass replaces the component the last one produced. It requires an explicit path, debounces changes (300ms), defers rather than overlaps when a render is in flight, and keeps going after a failed render — the next save may fix it. Ctrl+C to stop.

Without `--watch`, a title collision is an error; [`--overwrite`](/cli/commands/render/#--overwrite) deletes the existing same-titled component first. That's destructive, so an interactive batch of more than one component asks for confirmation.

When a render is slow, [`--timing`](/cli/commands/render/#--timing) attributes the wall clock to bridge lookup work and each plugin write phase.

## Stage 9 — Scripted Runs

Everything ambiguous in an interactive session must be pinned in a script:

```bash
specs render specs/ --file abc123XYZ --page 12:345 --strict
```

- `--file` — never rely on the prompt; a non-interactive run errors instead of asking.
- `--page` — without it the target is whatever page the user has open, which can drift mid-run if someone navigates in Figma.
- `--strict` — fail on incomplete renders instead of shipping partial components.

Note that a render session still needs a human-driven Figma app open with the plugin connected, so `render` is not a fit for headless CI.

## Stage 10 — Tear Down

```bash
specs bridge stop
```

Graceful first, forced if it doesn't exit within a few seconds. Safe to run when nothing is running.

## Troubleshooting

| Symptom | Stage | Fix |
|---|---|---|
| `Error: bridge is not running.` | 4 | `specs bridge start`, then retry |
| `Bridge running … No plugin connected.` | 5 | Enable CLI Bridge in the Specs 2 plugin; toggle off/on if it was already open |
| Prompted to choose a file, or an ambiguity error | 5 | Two plugins are connected — pass `--file <fileKey>` from `bridge status` |
| Nothing happens / times out | 5 | `specs bridge status` to confirm the connection; check you're on the intended page; `tail -f ~/.specs/bridge.log` |
| `Render cache is not usable` | 3 | `specs cache`, or render with `--refresh-cache` |
| `Not fetched, skipped: <alias>` then a render failure | 2 | `render` needs every declared source fetched — run `specs fetch` |
| `⚠ INCOMPLETE: n instance element(s)` | 2–3 | The cache can't resolve a referenced component — `specs fetch` to refresh it |
| Missing glyphs, styles, or variable bindings | 2–3 | `specs fetch`, then render again |
| Rendered onto the wrong page | 5 | Pass `--page <id>`; without it the target is the plugin's current page |
| `Error: provide a spec path.` | 6 | No path given and no `spec.directory` in config to fall back to |
| `no component folders found` | 6 | A component folder holds `api.(yaml\|json)` and `variants.(yaml\|json)`, at most two levels deep |

## Limits

- **One render at a time.** The bridge holds a single render slot; concurrent calls queue.
- **No automatic round trip.** Reading a rendered component back is always an explicit `generate --from-bridge`.
- **Render order isn't configurable.** Batches go in path order.
- **This is a young feature.** Expect rough edges on more elaborate components.

## Further Reading

- [`render` command reference](/cli/commands/render/) — every flag, argument shape, and exit code
- [`bridge` command reference](/cli/commands/bridge/) — start/stop/status, logs, pid file
- [`cache`](/cli/commands/cache/) — what the lookup tables hold, and when they go stale
- [`fetch`](/cli/commands/fetch/) — downloads the library data and builds the cache
- [`generate`](/cli/commands/generate/) — produces the specs that `render` consumes, and reads them back with `--from-bridge`
- [sources config](/settings/data-sources/) — how workspace aliases and data files are resolved
