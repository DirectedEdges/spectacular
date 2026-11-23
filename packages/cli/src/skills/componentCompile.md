---
name: specs-cli.component.compile
description: Render an authored spec onto the Figma canvas once, observe it in Storybook and on the canvas, and classify the render's warnings — the spec defects to fix, the platform limits to report, and the expected rows to pass over. Invoked at the compile step of an authoring round, and again after any later change that should reach the canvas.
---
<!--
  Canonical skill emitted by `specs skills install` — overwritten on every
  refresh; do not edit in place. Local customizations belong in your own
  separate skill.
-->

# Compile a spec and observe it

**Prerequisites:** `specs-cli.primer`, then `specs-cli.authoring.primer`.

Invoked by `specs-cli.component.author` at its compile step, and on its own after any later change to a spec's concern files that should reach the canvas.

**Do not run this before all three concern files validate clean.** A render of an inconsistent spec puts something wrong on the canvas and costs a second render to replace.

## 1. Render once

The dev posture is live — `specs run` re-emits the platform trees on save. The canvas is **not** watched, so it is rendered by hand, once:

```bash
node_modules/.bin/specs render specs/components/<key> --overwrite
```

Render takes a spec *path*, not a key. `--overwrite` replaces the previous result, so the same command is the answer to "the canvas needs refreshing" as well as to the first render.

**Never run a render watch.** A render per save on a many-variant component cannot finish before the next save, and the loop breaks Figma.

If the posture is not running, start it with `specs-cli.posture`. Do not fall back to one-shot `specs react` invocations per iteration — emit stays the posture's job. If render reports a stale or unusable cache, run `specs cache` once and retry.

## 2. Observe the running surfaces

| Look at | For |
|---|---|
| The emitted component in Storybook | it renders, and variants switch |
| The rendered component on the Figma canvas | the structure matches the authored anatomy |

**Observe means the running surfaces, never the emitted source.** An agent that cannot see them — no browser, no canvas access — reports the render log's result and node id with an explicit "not visually verified". That substitute is sanctioned. Scraping the Storybook server, curling story HTML, or driving a browser to compensate is not; visual verification belongs to the human.

When a surface disagrees with what the spec declares, consult the platform's binding dispositions in `mappings/bindings/`. A disagreement the bindings call `bound` is a **platform defect for your report** — never a reason to rework the spec or to read the emitter.

## 3. Two situations with sanctioned answers

Neither costs deliberation:

- **The bridge plugin is not connected.** That is a human-side control in the Figma app. Report it as a pending human action, keep authoring, and run the render once the plugin reconnects.
- **The canvas needs refreshing** — the plugin just reconnected, or the canvas was cleared. Run the same command again.

## 4. Classify the warnings

**A render that exits successfully still warns**, and `⚠ INCOMPLETE: N instance element(s) could not be resolved` exits successfully too — so the command reads as a pass either way. The reason is never on stdout. Read `.posture/bridge-server.log`, whose tail covers the render just run.

Classifying a warning is the expensive part, so it is done here once. **Act only on the spec-defect rows.** A platform limit is report material; an expected row is noise to recognise and pass over.

| The log says | Class | What to do |
|---|---|---|
| `instance element "X": no manifest entry for "(none)"` | spec defect | A subcomponent's title, its `subcomponents` key and the parent slot's `anyOf` disagree — `rules/subcomponents.yaml`. For a sibling component, render that component once from this tree first |
| `"X.children": slot fill failed — component id not found` | spec defect | The target has never been rendered into this file, or its cached node was replaced. Render it, then retry |
| `layoutSizingHorizontal "FILL" skipped` | spec defect | `FILL` needs an auto-layout parent; the parent element declares no `layoutMode` |
| `exposes no slot by that name (it has: Y)` | platform limit | A collapsed-root instance exposes its slot by the layer name, not the prop name. Nothing to fix in the spec |
| `unsupported style key "X"` | platform limit | Declared unsupported in `mappings/bindings/figma.json`. `specs validate` lists these per spec |
| `built from a BOOLEAN_OPERATION node` | platform limit | The glyph is placed but its interior is not modelled |
| `gradient stop: cannot resolve color` | platform limit | The stop's token has no cached raw value. Write the literal and note the token |
| `propConfig "X.y": follows the host's …` | expected | A live binding cannot be wired on a documented configuration. The instance keeps its own default |

### Diagnosing `INCOMPLETE`

A line per unresolved element names the element key and why it could not be placed, and a `slot fill failed` line is followed by the example it caused to be dropped. Two causes account for nearly all of them, and they are different problems:

| Unresolved thing | Why | Fix |
|---|---|---|
| An **instance of another component** | it has never been rendered into this file, so there is no node to point at | render that component once, then retry |
| A **subcomponent of the spec being authored** | it resolves through its `title`, and the title, the `subcomponents` key and the parent slot's `anyOf` disagree | reconcile the three — `rules/subcomponents.yaml` |

An example the render dropped is not a styling problem. It documented content the render could not build, so it was removed rather than shown wrong.

## 5. Report

Hand back to the round: the render's result and node id, what you observed on each surface or could not, the spec defects you fixed, and the platform limits that belong in the round's closing report. A platform limit is never silently absorbed — it is the one kind of finding this step exists to surface.
