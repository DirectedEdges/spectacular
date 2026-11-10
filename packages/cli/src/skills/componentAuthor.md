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

Templates ship beside this skill in `templates/` — `api.yaml`, `variants.yaml`, `examples.yaml`, `supplemental.yaml`, `guidelines.yaml`. Copy them; never author a file from a blank page or from another spec's structure.

## 0. Ensure the posture

This procedure compiles live — saving a spec must re-emit into Storybook and onto the canvas. If the posture is down (the Storybook port does not answer), run `specs-cli.posture` first; it is idempotent, so checking by running it is fine.

**Preparation is bounded.** Before the first file, read exactly: the two primers, the rules files for the concepts this request touches, the correlation reports (step 2), and the token spellings the request needs. **Load the fixed set in one batched read** — the primers, rules files, references, and templates are known names, and a dozen serial reads is startup cost carrying no judgment. Then write `api.yaml`. Every remaining question is resolved *during* the file that raises it — one lookup per question, local schema first — never by reading ahead "to be safe." If you notice yourself reading a source the current file does not need, stop and write.

## 1. Split the requirements

Before writing anything, restate every requirement from the request as a table:

| Requirement | Home | Carried by |
|---|---|---|
| … | spec | the schema path that carries it |
| … | supplemental | the schema path that *would* carry it and why it cannot |
| … | guidelines | the obligation level it binds a consumer at |

Rules: a requirement goes supplemental only after naming the schema path that cannot carry it; forcing into the spec what the schema cannot express is the worse failure. And before marking anything supplemental, check it is not a prop: a behavior the consumer configures in code — a semantic element choice, an accessibility label, a heading level — is a **code-only prop** in api.yaml (`rules/props.yaml · codeOnly`), not a hand-authored platform file; routing a prop to supplemental is a wrong-surface failure even when the overlay works. Sort by **who acts on it** — a thing the component must do is supplemental, a thing its caller must do is guidelines. This table is the plan — keep it, you grade against it in step 7.

## 2. Correlate against the catalogue

Read, in order:

1. `config/conventions/*.yaml` — the workspace's declared vocabulary: component naming, prop naming, platform idioms. A convention that names your component or its props settles the naming before anything else gets a vote; in an empty catalogue the conventions are the *only* place the system's vocabulary lives. `figma.yaml` in particular answers questions that otherwise read as judgment calls: `naming` (layer-name casing), `codeOnlyProps.match` (the code-only container layer), `glyphs` (icon naming), `images`, `subcomponents`, `instanceExamples`.
2. The component folder list (`specs/components/`) — what exists to nest or emulate. The new component's folder key must not collide.
3. `analysis/props.yaml` — the system's prop vocabulary. Reuse a prop name and its value set when the concept matches; never coin a synonym for a prop the system already has.
4. `analysis/styling.byToken.yaml` and `analysis/styling.byComponent.yaml` — which tokens the system uses for which properties. Your token choices come from here.
5. `analysis/dependencies.byComponent.yaml` — how components nest, for choosing `instanceOf` targets.

If `analysis/` is missing or stale, run `specs analyze` first. A report that is empty at this catalogue size is skipped, not studied. When emulating the closest sibling, read **all three** of its concern files — the pattern a task hinges on has sat in the one file a session skipped. Decide and write down: components to nest, the closest sibling to emulate (idiom only — structure always comes from the schema), and the token set.

## 3. Scaffold

Create `specs/components/<key>/` (camelCase folder key). Copy each template in **at the step that authors it**, not all three upfront — an unauthored template still carries placeholders, and validating the folder would report them as errors that look like yours. Fill `metadata.concern` and `title`; leave `metadata.source` out — this spec is authored, not captured.

## 4. Author api.yaml, then validate

Anatomy first (every element, typed), then props (reusing the catalogue's vocabulary), then `invalidPropCombinations` if any. Then:

```
specs validate <key> --authored
```

Zero errors before touching the next file. Fix the file the error names, re-run, repeat. Never proceed past a validation error — with one expected exception: **a slot-bearing component's `variants.yaml` fails once by design**, because its `children.examples[0]` `$slotContent` pointer targets an `examples.yaml` that does not exist yet. That dangling-pointer error means "author examples next," never "rework the binding."

## 5. Author variants.yaml, then validate

Load the primer's `references/styles.md` first. The `default` block fully describes every anatomy element — layout tree, styles, content, bindings. Then one `variants[]` delta per prop configuration that changes anything. Validate again; zero errors.

## 6. Author examples.yaml (when needed), then validate

At least one `instanceExamples` entry showing a realistic configuration. `slotContentExamples` for every slot the component declares. Validate; zero errors.

## 7. Compile and observe

The dev posture is live — `specs run` re-emits the platform trees on save and `specs render specs/components/<key> --watch` re-renders onto the canvas (render takes a spec *path*, not a key). Save, then check. **Observe means the running surfaces — Storybook and the canvas — never the emitted source.** An agent that cannot see those surfaces (no browser, no canvas access) reports the render log's result and node id with an explicit "not visually verified" — that substitute is sanctioned; scraping the Storybook server, curling story HTML, or driving a browser to compensate is not. Visual verification belongs to the human. When a surface disagrees with what the spec declares, consult the platform's binding dispositions (`mappings/bindings/` in the schema package), and a disagreement the bindings call `bound` is a platform defect for your report — not a reason to rework the spec or to read the emitter. Check:

1. The emitted component in Storybook — renders, variants switch.
2. The rendered component on the Figma canvas — structure matches the authored anatomy.

If the posture is not running, start it; do not fall back to one-shot `specs react` / `specs render` invocations per iteration. If render reports a stale or unusable cache, run `specs cache` once and retry.

## 8. The two authored documents

For every requirement the table in step 1 marked supplemental:

- Implement it in hand-authored files **beside** the emitted output in the platform tree. Never edit emitted files — a re-emit overwrites them. Files you add are safe: emit overwrites only its own filenames, and prune removes only whole directories whose spec is gone.
- **Name the entry point by convention.** An emitter imports an authored `component.tsx` (React) or `component.ts` (Web Components) in place of the scaffold when it finds one beside it, and points the generated stories at it. It finds the file by that **name** — nothing in the spec or either document declares it. A file under any other name is reached only if one of those imports it, so put the implementation in `component.*` and let it import whatever else it needs.
- Copy `templates/supplemental.yaml` to the spec folder and fill it, section by section (`anatomy`, `props`, `styles`, `slotComposition`, `events`, `accessibility`, `behavior`, `motion`, `layout`, `overrides`, `naming`): each entry a testable `intent` and the `schemaGap` object — `{ path, need }` — naming the surface that cannot carry it. Add `platforms` as a *list* when the entry is scoped (`[react]`, `[web]`), `checkedBy` for how it is verified, and `checks` pointing at what verifies it. No rationale prose.
- For anything a *consumer* must observe, copy `templates/guidelines.yaml` as `guidelines.yaml`: each entry a `statement` with a `level` of `must` / `should` / `should-not` / `must-not` / `may`. Prefer `alternatives` over `instead` whenever the remedy is a thing you can point at. A consumer rule never belongs in `supplemental.yaml`, and never carries a `schemaGap`.
- `specs validate` checks both documents' shape against their published contracts — run it after writing, like any concern file.
- **Rename procedure:** renaming the component orphans its old emitted directory — prune removes it, custom files included. Move custom files first.

After every later re-emit, diff the fresh scaffold against your custom files. Where an overlay depends on something the emitter produces — a BEM class, a selector the states convention generates — record that dependency in the entry's `checks` so the next re-emit has something to re-verify against.

## 9. Report

End every pass with this summary, in this order. Keep unstructured narrative to a sentence or two above it — the sections carry the content.

- **Files updated:** a linked list — `[api.yaml](specs/components/<key>/api.yaml), [variants.yaml](…), …`
- **Props updated:** `prop`, `prop`, `prop`
- **Tokens applied:** one per line, by name only — no narrative about how or why each was chosen
- **Decisions to confirm:** a numbered list (1., 2., …) so a reply can reference them by number; each item a **bolded term** followed by two or three sentences. A formatted list, never a table
- **Gaps:** same numbered format — requirements the schema could not carry, what went supplemental, and anything the skills did not predict
- **Suggestions:** same numbered format — opportunities you noticed but were **not asked to build**: events, accessibility, interactions, refinements. Never build these on your own; surface them here and wait. One that would land as an authored entry is listed literally, naming its document and section (`supplemental: events:`, `guidelines: accessibility:`), so the user can approve some, all, or none
- One stats line: validate attempts per file; requirements spec-carried vs supplemental vs guidelines

The Suggestions section is also a scope rule: an unprompted improvement is proposed there, never implemented in the same pass.

**Foundations guidelines are the exception to waiting.** A guess that only a foundations guideline could have settled — which colors a concept may use, what a type scale's default is — names a missing `guidelines/<area>/<topic>`. Propose the topic in Suggestions, and you may go further: run `specs-cli.guidelines.propose` for it in the same pass. Its output is a proposal for the ratifier, not shipped behavior, so drafting one expands no scope — and the next component inherits a ruling instead of re-guessing.
