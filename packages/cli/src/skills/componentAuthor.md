---
name: specs-cli.component.author
description: Author a new component spec from a request — requirements split, correlation against the catalogue, scaffold from templates, one-file-at-a-time validation, live compile into Storybook and Figma, then supplemental platform files for what the spec cannot carry.
---
<!--
  Canonical skill emitted by `specs skills install` — overwritten on every
  refresh; do not edit in place. Local customizations belong in your own
  separate skill.
-->

# Author a new component

**Prerequisites:** `specs-cli.primer`, then `specs-cli.authoring.primer`. Load its `references/styles.md` before authoring `variants.yaml`, and its `references/slots-layout.md` before authoring any layout tree or slot.

Templates ship beside this skill in `templates/` — `api.yaml`, `variants.yaml`, `examples.yaml`, `supplemental.yaml`. Copy them; never author a file from a blank page or from another spec's structure.

## 1. Split the requirements

Before writing anything, restate every requirement from the request as a table:

| Requirement | Home | Carried by |
|---|---|---|
| … | spec | the schema path that carries it |
| … | supplemental | the schema path that *would* carry it and why it cannot |

Rules: a requirement goes supplemental only after naming the schema path that cannot carry it; forcing into the spec what the schema cannot express is the worse failure. This table is the plan — keep it, you grade against it in step 7.

## 2. Correlate against the catalogue

Read, in order:

1. The component folder list (`specs/components/`) — what exists to nest or emulate. The new component's folder key must not collide.
2. `analysis/props.yaml` — the system's prop vocabulary. Reuse a prop name and its value set when the concept matches; never coin a synonym for a prop the system already has.
3. `analysis/styling.byToken.yaml` and `analysis/styling.byComponent.yaml` — which tokens the system uses for which properties. Your token choices come from here.
4. `analysis/dependencies.byComponent.yaml` — how components nest, for choosing `instanceOf` targets.

If `analysis/` is missing or stale, run `specs analyze` first. Decide and write down: components to nest, the closest sibling to emulate (idiom only — structure always comes from the schema), and the token set.

## 3. Scaffold

Create `specs/components/<key>/` (camelCase folder key). Copy each template in **at the step that authors it**, not all three upfront — an unauthored template still carries placeholders, and validating the folder would report them as errors that look like yours. Fill `metadata.concern` and `title`; leave `metadata.source` out — this spec is authored, not captured.

## 4. Author api.yaml, then validate

Anatomy first (every element, typed), then props (reusing the catalogue's vocabulary), then `invalidPropCombinations` if any. Then:

```
specs validate <key> --authored
```

Zero errors before touching the next file. Fix the file the error names, re-run, repeat. Never proceed past a validation error.

## 5. Author variants.yaml, then validate

Load the primer's `references/styles.md` first. The `default` block fully describes every anatomy element — layout tree, styles, content, bindings. Then one `variants[]` delta per prop configuration that changes anything. Validate again; zero errors.

## 6. Author examples.yaml (when needed), then validate

At least one `instanceExamples` entry showing a realistic configuration. `slotContentExamples` for every slot the component declares. Validate; zero errors.

## 7. Compile and observe

The dev posture is live — `specs run` re-emits the platform trees on save and `specs render specs/components/<key> --watch` re-renders onto the canvas (render takes a spec *path*, not a key). Save, then check:

1. The emitted component in Storybook — renders, variants switch.
2. The rendered component on the Figma canvas — structure matches the authored anatomy.

If the posture is not running, start it; do not fall back to one-shot `specs react` / `specs render` invocations per iteration. If render reports a stale or unusable cache, run `specs cache` once and retry.

## 8. Supplemental platform files

For every requirement the table in step 1 marked supplemental:

- Implement it in hand-authored files **beside** the emitted output (e.g. `component.tsx`, a hook, a stylesheet) in the platform tree. Never edit emitted files — a re-emit overwrites them. Files you add are safe: emit overwrites only its own filenames, and prune removes only whole directories whose spec is gone.
- Copy `templates/supplemental.yaml` to the spec folder as `supplemental.yaml` and fill it, section by section (`anatomy`, `props`, `styles`, `slotComposition`, `events`, `accessibility`, `behavior`, `motion`, `layout`, `guidelines`): each entry a testable `intent`, the `schemaGap` that cannot carry it, the implementing file per platform under `platforms`, and its `regenerationRisk`. No rationale prose. `specs validate` checks the file's shape — run it after writing, like any concern file.
- **Rename procedure:** renaming the component orphans its old emitted directory — prune removes it, custom files included. Move custom files first.

After every later re-emit, diff the fresh scaffold against your custom files and update each entry's `regenerationRisk`.

## 9. Report

End with the numbers: validate attempts per file, requirements carried by the spec vs supplemental, and anything the schema could not express that this skill did not predict.
