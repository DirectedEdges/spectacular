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

This procedure compiles live — saving a spec must re-emit into Storybook and onto the canvas. **The Storybook port comes from `storybook/package.json` — read it before any curl; never probe a guessed port.** If the posture is down (that port does not answer), run `specs-cli.posture` first; it is idempotent, so checking by running it is fine.

**Preparation is staged by file lifecycle, and each stage is one batched read.** Before `api.yaml`, load the **contract pack** in one call: the two primers, the rules files for the concepts this request touches, `config/conventions/*.yaml`, `analysis/props.yaml`, `analysis/dependencies.byComponent.yaml`, the component folder list, and `templates/api.yaml`. Nothing about styling belongs here — tokens, `references/styles.md`, and the styling reports are not used until `variants.yaml`, and loading them now dilutes the anatomy and props work they sit idle through. Before `variants.yaml` (step 5), load the **styling pack** in one call: `references/styles.md`, the `analysis/foundations.yaml` sections for the token types this component needs, `analysis/styling.byToken.yaml` and `analysis/styling.byComponent.yaml` — plus `references/slots-layout.md` when the component has a layout tree or slot. A pack is read once and never reopened — returning to a skill or rules file later means the first read was skimmed, and re-reading is the largest avoidable cost measured in a round. Every remaining question is resolved *during* the file that raises it — one lookup per question, local schema first — never by reading ahead "to be safe." If you notice yourself reading a source the current file does not need, stop and write.

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
4. `analysis/dependencies.byComponent.yaml` — how components nest, for choosing `instanceOf` targets.
5. `mappings/bindings/` in the schema package, for the **concepts this component actually touches** — a prop type, a role, a style key. Each concept carries a disposition, and the two that matter are `approximated` (the platform keeps something lossier than the spec says) and `bound` (the platform substitutes a value, such as emitting an authoring-default example as a fallback). Reading them here is half a minute and tells you up front what a surface will do with what you are about to write; reaching for them only after a surface looks wrong has cost whole rounds.

If `analysis/` is missing or stale, run `specs analyze` first. A report that is empty at this catalogue size is skipped, not studied. When emulating the closest sibling, read **all three** of its concern files — the pattern a task hinges on has sat in the one file a session skipped. Decide and write down: components to nest and the closest sibling to emulate (idiom only — structure always comes from the schema). The token set is decided at step 5, from the styling pack — not here.

## 3. Scaffold

Create `specs/components/<key>/` (camelCase folder key). Copy each template in **at the step that authors it**, not all three upfront — an unauthored template still carries placeholders, and validating the folder would report them as errors that look like yours. Fill `metadata.concern` and `title`; leave `metadata.source` out — this spec is authored, not captured.

## 4. Author api.yaml, then validate

Anatomy first (every element, typed), then props (reusing the catalogue's vocabulary), then `invalidPropCombinations` if any. Then:

```
specs validate <key> --authored
```

Zero errors before touching the next file. Fix the file the error names, re-run, repeat. Never proceed past a validation error — with one expected exception: **a slot-bearing component's `variants.yaml` fails once by design**, because its `children.examples[0]` `$slotContent` pointer targets an `examples.yaml` that does not exist yet. That dangling-pointer error means "author examples next," never "rework the binding."

## 5. Author variants.yaml, then validate

Load the styling pack first, in one call (step 0): `references/styles.md`, the `analysis/foundations.yaml` sections for the token types this component needs, and both styling reports — `analysis/styling.byToken.yaml` and `analysis/styling.byComponent.yaml`. Token choices come from these; `analysis/foundations.yaml` is the single answer for a token's path, type and value. The `default` block fully describes every anatomy element — layout tree, styles, content, bindings. Then one `variants[]` delta per prop configuration that changes anything. Validate again; zero errors.

## 6. Author examples.yaml (when needed), then validate

At least one `instanceExamples` entry showing a realistic configuration. `slotContentExamples` for every slot the component declares. Validate; zero errors.

**A component that shows an image also carries an `images` registry here.** Find what the library holds in `data/cache/images.yaml` — keyed by content hash, each entry giving its `src`, the library's `name`, which components `usedBy` it, and an `origin`. Write the entry under a name you choose, carrying `src` and `$extensions.com.figma.imageHash`, then point at it with `$image: "#/components/<key>/images/<name>"` from `backgroundImage` or from an image prop's `examples`. Never put a raw Figma hash in a style value (`rules/styles.yaml · images`).

## 7. Compile and observe

The dev posture is live — `specs run` re-emits the platform trees on save. The canvas is NOT watched: render it yourself, **once, after `api.yaml`, `variants.yaml`, and `examples.yaml` all validate clean** — a render per save on a many-variant component cannot finish before the next save, and the loop breaks Figma:

```bash
node_modules/.bin/specs render specs/components/<key> --overwrite
```

(render takes a spec *path*, not a key). Re-run the same command after any later change to those files that should reach the canvas. **Observe means the running surfaces — Storybook and the canvas — never the emitted source.** An agent that cannot see those surfaces (no browser, no canvas access) reports the render log's result and node id with an explicit "not visually verified" — that substitute is sanctioned; scraping the Storybook server, curling story HTML, or driving a browser to compensate is not. Visual verification belongs to the human. When a surface disagrees with what the spec declares, consult the platform's binding dispositions (`mappings/bindings/` in the schema package), and a disagreement the bindings call `bound` is a platform defect for your report — not a reason to rework the spec or to read the emitter. Check:

1. The emitted component in Storybook — renders, variants switch.
2. The rendered component on the Figma canvas — structure matches the authored anatomy.

If the posture is not running, start it; do not fall back to one-shot `specs react` invocations per iteration — emit stays the posture's job. If render reports a stale or unusable cache, run `specs cache` once and retry.

Two situations with sanctioned answers, so they cost no deliberation:

- **The bridge plugin is not connected** — that is a human-side control in the Figma app. Report it as a pending human action, keep authoring; run the render once the plugin reconnects.
- **The canvas needs refreshing** (the plugin just reconnected, the canvas was cleared) — run the same one-shot render command again; `--overwrite` replaces the previous result.

## 8. The two authored documents

**Read the fresh scaffold first, before authoring any platform file.** The emitter regenerates it from the spec you just wrote, and it already produces more than it looks like: the element wrappers your anatomy declares, `object-fit` on a replaced element, `border-radius: inherit`, the selectors the states convention generates. Author only what the scaffold does not produce, and delete any overlay rule it now covers. An overlay written before the scaffold is read duplicates the generator by hand — and when the anatomy changes, every one of those hand-built rules has to be found and removed again.

Then, for every requirement the table in step 1 marked supplemental:

- Implement it in hand-authored files **beside** the emitted output in the platform tree. Never edit emitted files — a re-emit overwrites them. Files you add are safe: emit overwrites only its own filenames, and prune removes only whole directories whose spec is gone.
- **Name the entry point by convention.** An emitter imports an authored `component.tsx` (React) or `component.ts` (Web Components) in place of the scaffold when it finds one beside it, and points the generated stories at it. It finds the file by that **name** — nothing in the spec or either document declares it. A file under any other name is reached only if one of those imports it, so put the implementation in `component.*` and let it import whatever else it needs.
- Copy `templates/supplemental.yaml` to the spec folder and fill it, section by section (`anatomy`, `props`, `styles`, `slotComposition`, `events`, `accessibility`, `behavior`, `motion`, `layout`, `overrides`, `naming`): each entry a testable `intent` and the `schemaGap` object — `{ path, need }` — naming the surface that cannot carry it. Add `platforms` as a *list* when the entry is scoped (`[react]`, `[web]`), `checkedBy` for how it is verified, and `checks` pointing at what verifies it. No rationale prose.
- For anything a *consumer* must observe, copy `templates/guidelines.yaml` as `guidelines.yaml`: each entry a `statement` with a `level` of `must` / `should` / `should-not` / `must-not` / `may`. Prefer `alternatives` over `instead` whenever the remedy is a thing you can point at. A consumer rule never belongs in `supplemental.yaml`, and never carries a `schemaGap`.
- `specs validate` checks both documents' shape against their published contracts — run it after writing, like any concern file.
- **Rename procedure:** renaming the component orphans its old emitted directory — prune removes it, custom files included. Move custom files first.

After every later re-emit, diff the fresh scaffold against your custom files again — the anatomy may have gained an element the scaffold now handles. Where an overlay depends on something the emitter produces — a BEM class, a selector the states convention generates — record that dependency in the entry's `checks` so the next re-emit has something to re-verify against.

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
