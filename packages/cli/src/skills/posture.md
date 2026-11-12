---
name: specs-cli.posture
description: Bring the workspace's live authoring posture up — specs run (emit + Storybook) — detached, verified, idempotent. Run it whenever the posture is down; authoring assumes it is on. Canvas rendering is NOT part of the posture — it is an explicit step after a spec's files are complete.
---
<!--
  Canonical skill emitted by `specs skills install` — overwritten on every
  refresh; do not edit in place. Local customizations belong in your own
  separate skill.
-->

# The live authoring posture

Authoring runs against a live emit chain: saving a spec re-emits it to every platform and refreshes Storybook. This skill turns that chain on. It is idempotent — safe to run when unsure whether the posture is up.

**The canvas is not watched.** A render watch re-rendered on every save, and a many-variant component cannot finish rendering before the next save triggers the next render — the loop breaks Figma. Rendering is an explicit, once-per-component step (`specs render specs/components/<key> --overwrite`) that `component.author` runs after `api`, `variants`, and `examples` are all validated — never a background process.

## 1. Check — read the port first, then one command

The port is **read, never guessed**: `storybook/package.json`'s `storybook` script pins it with `-p <port>`. Curling a default port and declaring the posture down is the recorded failure this ordering exists to prevent.

```bash
grep '"storybook"' storybook/package.json   # read -p <port> from this line first
curl -sf -o /dev/null http://localhost:<port>/ && echo "storybook up"
```

Up → the posture is on; **stop here and author**. No pid archaeology, no log reading, no process listing — those are failure diagnostics, not checks.

## 2. Start if missing, detached

**Never kill a running posture process** — a live process passing its check is the posture working; a stale pidfile whose process is dead is simply overwritten by starting.

```bash
mkdir -p .posture
nohup node_modules/.bin/specs run > .posture/specs-run.log 2>&1 & echo $! > .posture/specs-run.pid
```

Portable sh — no `setsid` (absent on macOS), no GNU-only flags.

Detached means the posture outlives this session — never run it in the foreground, and never through `npm run storybook` (its interactive prompts exit silently when backgrounded; `specs run` owns Storybook correctly).

A leftover `render-watch.pid` from the old posture shape is stale by definition: kill its process if alive, delete the pidfile, and never start a replacement.

## 3. Verify

Poll the Storybook port until it answers (first boot can take a couple of minutes); on timeout, read the tail of `.posture/specs-run.log` and report what it says rather than retrying blind. `specs render` needs the Figma plugin connected to the bridge — plugin-not-connected is a human action item: report it and continue; the bridge reconnects on its own when the plugin opens.

## 4. Stop (only when asked)

```bash
kill "$(cat .posture/specs-run.pid)" 2>/dev/null; rm -f .posture/*.pid
```

A child still holding the Storybook port afterwards: `lsof -ti :<port>` names it.

Stopping the posture is never part of finishing a task — it stays up between authoring sessions by design.
