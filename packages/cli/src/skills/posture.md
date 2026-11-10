---
name: specs-cli.posture
description: Bring the workspace's live authoring posture up — specs run (emit + Storybook) and specs render --watch (canvas via the bridge) — detached, verified, idempotent. Run it whenever the posture is down; authoring assumes it is on.
---
<!--
  Canonical skill emitted by `specs skills install` — overwritten on every
  refresh; do not edit in place. Local customizations belong in your own
  separate skill.
-->

# The live authoring posture

Authoring runs against a live chain: saving a spec re-emits it to every platform, refreshes Storybook, and re-renders it onto the Figma canvas. This skill turns that chain on. It is idempotent — safe to run when unsure whether the posture is up.

## 1. Check — read the port first, then two commands

The port is **read, never guessed**: `storybook/package.json`'s `storybook` script pins it with `-p <port>`. Curling a default port and declaring the posture down is the recorded failure this ordering exists to prevent.

```bash
grep '"storybook"' storybook/package.json   # read -p <port> from this line first
curl -sf -o /dev/null http://localhost:<port>/ && echo "storybook up"
kill -0 "$(cat .posture/render-watch.pid 2>/dev/null)" 2>/dev/null && echo "render watch up"
``` Both up → the posture is on; **stop here and author**. No pid archaeology, no log reading, no process listing — those are failure diagnostics, not checks.

## 2. Start what is missing, detached

Start only the process whose check failed. **Never kill a running posture process** — a live process passing its check is the posture working; a stale pidfile whose process is dead is simply overwritten by starting.

```bash
mkdir -p .posture
nohup node_modules/.bin/specs run > .posture/specs-run.log 2>&1 & echo $! > .posture/specs-run.pid
nohup node_modules/.bin/specs render --watch --overwrite specs/components > .posture/render-watch.log 2>&1 & echo $! > .posture/render-watch.pid
```

Portable sh — no `setsid` (absent on macOS), no GNU-only flags.

Detached means the posture outlives this session — never run either command in the foreground, and never through `npm run storybook` (its interactive prompts exit silently when backgrounded; `specs run` owns Storybook correctly).

## 3. Verify

Poll the Storybook port until it answers (first boot can take a couple of minutes); on timeout, read the tail of `.posture/specs-run.log` and report what it says rather than retrying blind. `specs render --watch` needs the Figma plugin connected to the bridge — if the log shows it waiting for a connection, report that the canvas side is pending the plugin, not failed; it reconnects on its own when the plugin opens.

## 4. Stop (only when asked)

```bash
kill "$(cat .posture/specs-run.pid)" "$(cat .posture/render-watch.pid)" 2>/dev/null; rm -f .posture/*.pid
```

A child still holding the Storybook port afterwards: `lsof -ti :<port>` names it.

Stopping the posture is never part of finishing a task — it stays up between authoring sessions by design.
