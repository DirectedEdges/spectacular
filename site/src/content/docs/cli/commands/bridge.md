---
title: "bridge"
---

Starts, stops, and checks the local CLI bridge — the background process that relays requests between the CLI and a connected Spectacular Figma plugin. [`render`](/cli/commands/render/) sends specs into the live file through it, and [`generate --from-bridge`](/cli/commands/generate/#bridge-mode) reads specs back out of the current selection.

## Usage

```bash
specs bridge <start|stop|status> [options]
```

## Subcommands

### `start`

Starts the bridge server in the background. Prints the process ID, the ports it's listening on, and where its logs go. Safe to run again while already running — reports the existing process instead of starting a second one.

```bash
specs bridge start
```

#### `--workspace <path>`

Pin a workspace directory for the whole bridge session, instead of deriving it per-request from each spec's path. Useful when every render in a session targets the same workspace.

```bash
specs bridge start --workspace ~/design-system
```

### `stop`

Stops the background bridge server. Sends a graceful shutdown signal, then forces termination if it doesn't exit within a few seconds. Safe to run when nothing is running.

```bash
specs bridge stop
```

### `status`

Reports whether the bridge server is running and, if so, whether a Figma plugin is currently connected to it.

```bash
specs bridge status
```

Each connected plugin is listed by the file key it's connected from, with the file's name when the plugin reported one:

```
Bridge running (pid 12345). 2 plugins connected:
  abc123XYZ (Design System Library) — connected
  def456UVW (Brand Marketing) — connected
```

```
Bridge running (pid 12345). No plugin connected.
```

Those file keys are what [`render --file`](/cli/commands/render/#--file) and [`generate --from-bridge --file`](/cli/commands/generate/#--file-filekey) take, so `bridge status` is how you find the value to pin in a scripted run.

Exits non-zero when the bridge isn't running, so it's safe to use in a conditional (`if specs bridge status; then ...`). It also exits non-zero when the process is up but its control port isn't answering:

```
Bridge running (pid 12345), but the control port isn't responding.
```

## What It Does

The bridge server listens on two local ports: a WebSocket for the Specs 2 plugin (`ws://localhost:9001`) and an HTTP control endpoint for the CLI (`http://localhost:9002`). `specs render` posts a spec (or a render manifest) to the HTTP endpoint; the bridge relays it to whichever plugin is connected over the WebSocket, which builds the component live in Figma and reports back.

Traffic runs both directions. `specs generate --from-bridge` posts to the same endpoint asking the plugin to generate a spec from its current selection; the plugin runs generation against the live document and returns the finished spec, which the CLI writes out. Reading a rendered component's spec is always this explicit second call — never a side effect of `render`.

Two further operations serve [role adoption](/roles/), and they are the reason the bridge reads as well as writes.

**Inspect** describes a live component's anatomy elements, keyed the way the spec keys them, with the Figma layer name behind each key, which variants carry it, and the annotations already standing on it. Read-only. It exists because a spec records `metadata.source` for the component only — no anatomy element carries a node id — and under `figma.naming: NONE` the original layer name is not preserved either, so neither is recoverable from the spec alone.

**Annotate** adds role annotations to components on one page. Elements are named by anatomy key, never by node id: the plugin resolves each key against the live component at write time, so nothing depends on an id recorded earlier. The write is additive — a new annotation is appended and nothing already on the layer is read for content, rewritten, or reordered, so a designer's review notes and any `action:` lines survive. An element already carrying a role on any variant is reported as a conflict and left alone, because an element the component owns has one answer to what it is.

Both load the target page and never switch to it. The current page is where renders land and is the user's viewport, so a read must not move it.

Starting the bridge doesn't connect it to anything by itself — you still need the Specs 2 plugin open in Figma with its **CLI Bridge** toggle enabled. See the [Render to Figma guide](/guides/render-to-figma/) for the full setup.

## Logs and Process Files

`bridge start` writes a pid file and a log file under `~/.specs/`:

```
~/.specs/
  bridge.pid   # process ID of the running bridge server
  bridge.log   # stdout/stderr from the bridge server
```

Tail the log while debugging a render:

```bash
tail -f ~/.specs/bridge.log
```

---

**See Also:**

- [Render to Figma](/guides/render-to-figma/) — bridge architecture, setup, and prerequisites
- [`render`](/cli/commands/render/) — sends specs to the bridge
