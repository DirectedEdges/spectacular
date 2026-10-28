---
title: "testing visual"
---

<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge experimental-badge">Experimental</span>')</script>

Pixel-diffs your emitted Storybook against Figma exports (fidelity) or against the renders you last accepted (regression). [The Testing section](/testing/) covers what you get and how the stages fit together; this page is the command reference.

The CLI never ships a browser: `init` writes a `package.json` declaring Playwright, pixelmatch and pngjs, and you run the one install in your own workspace.

## Usage

```bash
specs testing visual init                        # scaffold testing/visual/, once
specs testing visual manifest [--check]          # payloads + specs + contracts → manifest
specs testing visual status                      # which baselines exist
specs testing visual baseline                    # capture Figma exports — only when you ask
specs testing visual shoot [--target <t>]        # screenshot the running Storybook
specs testing visual diff [--against accepted]   # score pairs, write the report
specs testing visual report                      # regenerate report views
specs testing visual accept --components <k...>  # promote renders into the regression baseline
specs testing visual                             # = shoot → diff
```

Every form accepts `--config <path>` for a workspace whose `config/` is not in the current directory, and the per-spec stages accept `--components <keys...>`. The bare command runs shoot then diff, and takes what both need: `--components`, `--target`, `--port` and `--against`.

## Platforms

`shoot`, `diff`, `accept` and the bare command take `--target <react|webcomponents>`, defaulting to `react`. One Storybook serves both platforms' stories, so the target picks a story-title prefix rather than a server — but each platform keeps its own renders, diffs, accepted baselines and report.

A stage never does both platforms at once. Measuring both means two calls:

```bash
specs testing visual shoot --target react
specs testing visual diff  --target react
specs testing visual shoot --target webcomponents
specs testing visual diff  --target webcomponents
```

The Figma baseline is the exception: one export is the design for every platform, so `baseline` has no target.

## Output

```
testing/visual/
├── package.json                        your install: playwright, pixelmatch, pngjs
├── manifest.json
├── visual-ignore.yaml                  yours — scoring judgments, each with its note
├── figma/<kind>/<key>/                 Figma exports + .capture.json  (durable, local)
├── accepted/<target>/<kind>/<key>/     renders you promoted           (regression baseline)
├── render/<target>/<kind>/<key>/        this run                      (rebuilt on demand)
├── diff/<target>/<kind>/<key>/          masks + triptych composites   (rebuilt on demand)
└── report/                             fidelity.<target>.{json,md}
                                        regression.<target>.{json,md}
```

`<kind>` is `components` or `compositions` — the two may share a name, and the kind directory keeps their baselines apart. `<target>` is `react` or `webcomponents`, for the same reason one level up: without it, shooting one platform overwrote the other's renders, and one report held both platforms' rows with nothing to say which was which.

## `specs testing visual init`

Writes `testing/visual/package.json` and a `.gitignore`, then prints the install to run rather than running it. Everything except `shoot` works with nothing installed.

It also seeds `visual-ignore.yaml` — the diff's own defaults written out, with the note rule stated — but only when the file is absent.

### `--force`

Rewrite the scaffold's own files. Never touches `visual-ignore.yaml` or anything else kept beside them: every line in that file is a judgment, and `--force` has no business discarding one.

## `specs testing visual manifest`

For every spec of both kinds carrying a Figma source node, locates the node in the fetched payload, enumerates its variant children, and precomputes which story answers for each variant. A component yields one pair per variant; a composition yields exactly one. Deterministic — same inputs, byte-identical output.

### `--check`

Dry run: report unmapped Figma props and variant-name problems, write nothing. An unmapped prop defers every variant that uses it, so drive this to zero before trusting a workspace's numbers.

### `--components <keys...>`

Build entries for these spec folders only.

## `specs testing visual status`

Current, changed, or missing, per shootable baseline. "Changed" compares a fingerprint of the spec's Figma node (recorded at capture) against the same fingerprint in your fetched data — offline, exact per spec, and unmoved by edits elsewhere in the file. It scopes the overt `baseline` command; it never triggers one.

Status only knows what has been fetched: it states the payload's own fetch time rather than claiming knowledge of Figma edits since. Baselines captured before fingerprints existed report as not comparable and are treated as current.

### `--json`

The worklist as machine-readable JSON.

## `specs testing visual baseline`

Captures Figma exports for shootable variants over the REST images API — 50 nodes per request, PNG at scale 2, `Retry-After` backoff. Needs `FIGMA_TOKEN` in the environment or the workspace `.env`.

**Never implicit.** Not part of the bare command, never triggered by a watcher, never invoked by [`specs build` or `specs run`](/cli/commands/build/) — it is slow, rate-limited, and spends your API quota. Without `--components` it captures everything missing or changed — on an 80-component library where three designs moved, that is three recaptures, not eighty. Each capture records when it happened, what it was a picture of (the node fingerprint `status` compares), and when the payload it read was fetched.

### `--components <keys...>`

Capture these spec folders only.

### `--force`

Recapture the scope even where baselines exist — the recapture path after a design change.

## `specs testing visual shoot`

Screenshots the Storybook render for every shootable variant on a pool of parallel browser pages, recording exactly how each pair was produced (story, URL, join kind). Needs the Storybook running ([`specs storybook dev`](/cli/commands/storybook/)) and the customer-installed Playwright.

Renders are pinned to each variant's authored width — Figma constrains a fill root by the frame it sits in, and Storybook has no equivalent, so an unpinned render measures the viewport instead of the component. Compositions also pin height when the frame's vertical sizing is fixed. If the running Storybook's index doesn't match the manifest, the shoot warns — a stale server measures old code and would read as a pass.

### `--components <keys...>`

Shoot these spec folders only.

### `--workers <n>`

Parallel pages (default 8).

### `--port <port>`

The Storybook port, for this run. Default: [`host.port` in `conventions/storybook.yaml`](/schema/conventions/#host), else the scaffolded npm script, else `6006` — the same resolution `specs storybook dev` serves on.

### `--target <react|webcomponents>`

Which emitted tree's stories to shoot (default `react`).

## `specs testing visual diff`

Scores every baseline/render pair and writes the report. Both images are flattened onto a shared opaque canvas, then pixel-diffed; a pair passes when its dimensions match within tolerance **and** its pixel difference is at or under the pass threshold. Dimension deltas are reported separately — a render two pixels wide of the design fails even at a low pixel diff. Every failing pair gets a baseline | render | diff composite.

The only stage that reads `visual-ignore.yaml`, so a tolerance edit re-scores in seconds with no browser. Scoped runs merge into the stored report: only the named specs' rows are replaced, and each row keeps its prior summary for the delta column.

Composition rows are informational — full pixel counts, never the exit status. Components decide it: any component failure exits non-zero.

### `--against <figma|accepted>`

Which baseline to score against. `figma` (default) writes `report/fidelity.<target>.{json,md}`; `accepted` writes `report/regression.<target>.{json,md}`. Each mode and platform keeps its own report and its own improvement history — running one never overwrites another.

### `--components <keys...>`

Diff these spec folders only, merging into the stored report.

### `--target <react|webcomponents>`

Which platform's renders to score, and which report to write (default `react`).

### `visual-ignore.yaml`

Scoring judgments, per kind — flat top-level keys (the earlier shape) still work and read as components:

```yaml
$defaults:
  passPct: 3
  dimTolerancePx: 4

components:
  badge:
    passPct: 8
    note: letterform-only noise until licensed fonts land

compositions:
  homeSmall:
    skip: true
    note: awaiting image fixtures
```

| Key | Read by | Effect |
|---|---|---|
| `passPct` | diff | Pixel-diff percentage at or under which a pair passes |
| `dimTolerancePx` | diff | Allowed width/height delta, in baseline (2×) pixels |
| `threshold` | diff | Per-pixel colour threshold — rarely touched |
| `skip: true` | diff | Not scored at all; pairs report ignored, neither pass nor fail |
| `skipVariants` | diff | Figma configurations to skip, matched exactly against `Prop: "Value"` |
| `note` | diff | **Required** on every entry — the diff warns when it is missing |
| `sampleVariants: N` | **manifest** | Cap a spec at N variants on an even stride |
| `pinWidth: false` | **manifest** | Opt out of the render width pin |

The scoring keys take effect on a re-diff alone; the two manifest keys need a manifest rebuild and a re-shoot before they mean anything.

## `specs testing visual report`

Regenerates the markdown views from the stored JSON for every mode present — never re-scores.

### `--format <md|json>`

`md` (default) rewrites the markdown files; `json` prints every stored report to stdout.

## `specs testing visual accept`

Promotes the current run's renders into `accepted/` — the regression baseline — recording which run they came from. Scope is explicit; promoting everything silently would bless renders nobody reviewed.

There is no accepting in fidelity mode, by construction: the Figma export *is* the design, and `accept` writes only the accepted tree — it can never touch a Figma baseline.

### `--components <keys...>`

Promote these spec folders only.

### `--all`

Promote every spec with renders.

### `--target <react|webcomponents>`

Which platform's renders to promote (default `react`). One platform per call: promoting both at once would bless whichever renders were on disk, including a platform nobody had just shot.

## Examples

```bash
# First run, scoped to prove the loop before spending API quota
specs testing visual manifest --check
specs testing visual baseline --components button badge
specs testing visual shoot --components button badge
specs testing visual diff --components button badge

# Both platforms against the same Figma baseline
specs testing visual shoot --target react
specs testing visual diff  --target react
specs testing visual shoot --target webcomponents
specs testing visual diff  --target webcomponents

# Everyday regression check after a regeneration
specs testing visual
specs testing visual diff --against accepted

# Re-score after loosening a tolerance — seconds, no browser
specs testing visual diff --components badge
```

## See Also

- [Testing Overview](/testing/) — the two questions, the stages, and the report pages
- [Testing Getting Started](/testing/getting-started/) — the first run, step by step
- [`specs storybook`](/cli/commands/storybook/) — the host the shoot runs against, and where the report pages publish
