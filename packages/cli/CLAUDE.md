# CLAUDE.md — specs-cli

`@directededges/specs-cli` orchestrates fetch → scan → generate → transform →
render over the closed `specs-from-figma` engine and the emitter packages.
The structural map — commands, key nodes, data flows, gotchas — is
`ARCHITECTURE.md` in this directory; this file is operating rules only.

## Operating rules

- Invoke the built CLI as `node <repo>/packages/cli/dist/specs.js …` — never
  the globally installed `specs` binary (stale published release; a workspace
  hook blocks it). The dev watcher keeps `dist/specs.js` fresh.
- The watcher does **not** rebuild `dist/bridge-server.js` — after bridge
  server changes, run a build explicitly.
- Run tests from the repo root (`npm test` uses the root `vitest.config.ts`);
  package-local runs don't resolve.
- There is no MCP server. The persistent process is the plugin **bridge**
  (WS 9001 / HTTP 9002); `specs bridge start|stop|status` manages it.
- `figma-shim.ts` installs a stub `global.figma` so engine code written
  against the Plugin API runs in Node — it must stay the first import.
- Config is the split `config/` layout (ADR-071/078); legacy
  `specs.config.yaml` is refused, `specs migrate config` converts.
- Engine + emitters (`@directededges/specs-from-figma`, `react-from-specs`,
  `webcomponents-from-specs`) and `specs-schema` resolve from `node_modules`,
  which in dev are symlinks into sibling checkouts — never `npm install` a
  local path; the workspace links handle resolution.

## License validation is rate-limited — design loops around when it fires

The validate endpoint allows roughly **3 requests per 32 seconds**. What matters is
not what the license proxy does when the limit trips, but which CLI invocations fire
a check in the first place:

- A loop of back-to-back runs bursts past the limit. The symptom is silent FREE
  output partway through a round, which reads as a licensing bug in the product
  rather than as throttling.
- Pace scripted runs at **13 seconds or more** apart, or re-run after 30 seconds.
- `specs run` and `specs build` hold the whole chain to **one check per run**
  (ADR-101), because steps call each command's `runX()` in-process rather than as a
  subprocess. Driving the same work as separate `specs` invocations fires a check
  each time — which is the usual cause of an unexpected burst.
- `SPECS_DEV_TIER=PRO` skips the call entirely, and covers `transform` only — not
  `generate`. Reach for it before pacing a development loop by hand.
