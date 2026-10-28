---
title: "Testing Overview"
description: "Pixel-diff the components your workspace emits — against the Figma designs, or against the last output you accepted."
---

<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge experimental-badge">Experimental</span>')</script>

The code your workspace emits renders somewhere — and the only way to know it renders *right* is to look. Visual testing automates the looking: it screenshots every component variant in your Storybook and pixel-diffs each one against a baseline, so a regeneration tells you what changed instead of making you scroll and squint.

It answers two different questions, against two different baselines:

| Question | Baseline | Mode |
|---|---|---|
| **Does the code match the design?** | A Figma export of the same variant | Fidelity |
| **Did this regeneration change anything?** | The renders you last accepted | Regression |

Fidelity is the deeper check — it measures your generated code against the design itself, variant by variant. Regression is the cheap everyday one: no Figma access, no token, just "is today's output identical to yesterday's?" — and because emitted output is deterministic, *identical* means zero pixels, not "close".

One command drives both: [`specs testing visual`](/cli/commands/testing/). [Getting Started](/testing/getting-started/) walks the first run.

## How it works

Five stages, each its own subcommand because each has a different cost — re-scoring after a tolerance change takes seconds and must never cost a browser run:

| Stage | What it does | Cost |
|---|---|---|
| `manifest` | Finds each spec's node in your fetched Figma data, enumerates its variants, and works out which Storybook story renders each one | seconds |
| `baseline` | Downloads a Figma image of every variant — **only when you run it**, never automatically | minutes, uses your Figma API quota |
| `shoot` | Screenshots each variant's story in your running Storybook | minutes |
| `diff` | Compares each baseline/render pair, scores pass or fail, writes the report | seconds |
| `accept` | Promotes renders you've reviewed into the regression baseline | instant |

A pair passes when its dimensions match and its pixel difference is under the threshold. Dimension mismatches are reported separately from pixel noise — a render two pixels too wide fails even when its pixels look fine, because size errors and paint errors have different causes.

Components and compositions are both covered. A component yields one pair per variant; a composition — a full page or pattern — is a single frame and yields one pair. **Composition results are informational**: a page is built from components, so when a component is off, every page using it looks off too. Their rows carry full pixel counts but never fail a run — fix the components first.

Each emitted platform is measured separately. One Figma export is the design for all of them, but React and Web Components each get their own screenshots, diffs and report, so `shoot`, `diff`, `accept` and the bare command take `--target <react|webcomponents>` — defaulting to `react`. One Storybook serves every platform's stories, so the target picks which stories to shoot rather than which server to talk to. No stage does both platforms at once: one that did would overwrite one platform's screenshots with the other's.

## Where you see results

Each mode and platform writes its own report, and your [workspace Storybook](/storybook/) publishes a page per report:

- **Testing → React: Fidelity to Figma**
- **Testing → React: Changes vs Accepted**
- **Testing → Web Components: Fidelity to Figma**
- **Testing → Web Components: Changes vs Accepted**

A page appears only once its report exists, so a React-only workspace never sees an empty Web Components page.

Sortable per-component results, ranked so dependency-graph leaves come first — fixing a leaf shrinks every diff downstream of it. Click a row and its worst failures expand as **baseline | render | diff** composites, the picture that diagnoses most failures in one glance. The pages read the report live: re-run `diff`, reload, done.

## What stays yours

Rendering engines never agree perfectly — Chrome and Figma rasterize the same text differently, and a design file has quirks no tool should silently absorb. `visual-ignore.yaml` is where your workspace records those judgments: a looser pass threshold for a component with font noise, a skipped variant whose baseline is a placeholder, a capped sample for a 700-variant matrix.

Every entry requires a `note:` saying why. These entries suppress real signal, and the note is what lets the next person tell a permanent measurement fact from a temporary allowance — an entry without one is indistinguishable from a bug someone hid.

`init` seeds the file with the diff's own defaults and those rules, so your first judgment is an edit rather than a blank page. It is seeded only when absent, and `--force` never touches it: every line in it is a decision.

## What it costs you

The CLI ships no browser and no image library. `specs testing visual init` writes a small `package.json` into `testing/visual/` declaring Playwright, pixelmatch and pngjs, alongside the seeded `visual-ignore.yaml`; you run one install there, the same way the [Storybook host](/storybook/) works. Everything except `shoot` runs with nothing installed.

Baseline capture is the one stage that spends something of yours — Figma API quota — which is why it never runs implicitly: not from the bare command, not from a watcher, not from [`specs build` or `specs run`](/cli/commands/build/). It runs when you type it, and it scopes itself: `status` compares a per-spec fingerprint of your fetched Figma data against what each baseline was captured from, so after a refetch, `baseline` recaptures the three designs that changed rather than the whole catalog.
