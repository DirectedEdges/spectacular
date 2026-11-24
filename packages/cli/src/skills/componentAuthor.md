---
name: specs-cli.component.author
description: Author a new component spec from a request — one-command start (specs author), requirements split, correlation against the catalogue, one-file-at-a-time validation, live compile into Storybook and Figma, then supplemental platform files for what the spec cannot carry.
---
<!--
  Canonical skill emitted by `specs skills install` — overwritten on every
  refresh; do not edit in place. Local customizations belong in your own
  separate skill.
-->

# Author a new component

**Prerequisites:** `specs-cli.primer`, then `specs-cli.authoring.primer`. Its five `references/*.md` files load with the pack for the concern file each one serves — step 0 lists them.

Two templates ship beside this skill in `templates/` — `supplemental.yaml`, `guidelines.yaml` (step 7). Never author a file from a blank page or from another spec's structure.

## 0. Start: one command

```
specs author start <key>
```

One call writes the collision-checked folder with all three concern files (`--title` when the request names one) and prints the status digest. The folder starts **empty**: each file carries its metadata and its commented guide, nothing more, so the only errors `specs validate` reports are the required nodes you have not written yet (`anatomy` and `props` until api.yaml exists; `default` until variants.yaml does). They clear as you author each file in order, and any error naming something *you* wrote is one you introduced. Read the digest instead of deriving its facts — no folder listing, no port probing, no freshness checks. Two fields act:

- `posture.up: false` — run `specs-cli.posture` (idempotent; this procedure compiles live). Never probe a guessed port yourself.
- `analysis.stale: true` — run `specs analyze` before correlating.
- `posture.hostStale: true` — run `specs storybook init --force`, then restart the server. The port answers either way, so a stale host serves pages the emitters have already replaced and the symptom reads as missing content.
- `cache.stale: true` — run `specs cache` now, before the first write. Render treats a stale cache as fatal and render is the last step of this procedure, so the cost of leaving it is a failure that arrives after everything else has already passed. `null` means the workspace fetches nothing, so there is no cache to judge.

**Preparation is staged by concern file, one pack per file, each pack one batched read.** A pack is named for the document it precedes and loads immediately before that document — never earlier.

| Pack | Load before | In one call |
|---|---|---|
| **api** | `api.yaml` (step 3) | the two primers; the `rules/` files for the concepts this request touches; `references/props.md`; `references/slots.md` and `references/subcomponents.md` when the request describes a slot or an internal part; `config/conventions/*.yaml`; `analysis/props.yaml`; `analysis/dependencies.byComponent.yaml` |
| **variants** | `variants.yaml` (step 4) | `references/layout.md`; `references/styles.md`; the `analysis/foundations/<type>` files for the token types this component needs; `analysis/styling.byToken.yaml`; `analysis/styling.byComponent.yaml` |
| **examples** | `examples.yaml` (step 5) | `rules/examples.yaml`; `rules/primitives.yaml`; `data/cache/images.yaml` when the component carries imagery |

Nothing about styling belongs in the api pack — tokens, the styles map, and the styling reports are not used until `variants.yaml`, and loading them early dilutes the anatomy and props work they sit idle through.

**A pack is read once and never reopened** — returning to a skill or rules file later means the first read was skimmed, and re-reading is the largest avoidable cost measured in a round. The examples pack is small because the styles map the variants pack loaded still applies to slot content triplets; continuing to use loaded context is not a reopen.

Every remaining question is resolved *during* the file that raises it — one lookup per question, local schema first — never by reading ahead "to be safe." If you notice yourself reading a source the current file does not need, stop and write.

## 1. Split the requirements

Before writing anything, restate every requirement from the request as a table:

| Requirement | Home | Carried by |
|---|---|---|
| … | spec | the schema path that carries it |
| … | supplemental | the schema path that *would* carry it and why it cannot |
| … | guidelines | the obligation level it binds a consumer at |

**A named concept that resolves to nothing is a question, never a guess.** When the request names something in the system's own voice — a color concept, a token name, a prop vocabulary, a glyph — look it up where that kind of key lives (the foundations files, the token caches, the analysis reports, the icon report). A named concept the lookup cannot find stops that requirement: it goes into the report as a question for the requester, never approximated with an invented literal. Proving an absence once is the point of the lookup; burning a search re-proving it, then guessing anyway, is the recorded failure this rule retires.

Rules: a requirement goes supplemental only after naming the schema path that cannot carry it; forcing into the spec what the schema cannot express is the worse failure. And before marking anything supplemental, check it is not a prop: a behavior the consumer configures in code — a semantic element choice, an accessibility label, a heading level — is a **code-only prop** in api.yaml (`rules/props.yaml · codeOnly`), not a hand-authored platform file; routing a prop to supplemental is a wrong-surface failure even when the overlay works. Sort by **who acts on it** — a thing the component must do is supplemental, a thing its caller must do is guidelines. This table is the plan — keep it, you grade against it in step 7.

## 2. Correlate against the catalogue

Read, in order:

1. `config/conventions/*.yaml` — the workspace's declared vocabulary: component naming, prop naming, platform idioms. A convention that names your component or its props settles the naming before anything else gets a vote; in an empty catalogue the conventions are the *only* place the system's vocabulary lives. `figma.yaml` in particular answers questions that otherwise read as judgment calls: `naming` (layer-name casing), `codeOnlyProps.match` (the code-only container layer), `glyphs` (icon naming), `images`, `subcomponents`, `instanceExamples`.
2. The start digest's `catalogue` — what exists to nest or emulate (collisions were already checked at start).
3. `analysis/props.yaml` — the system's prop vocabulary. Reuse a prop name and its value set when the concept matches; never coin a synonym for a prop the system already has.
4. `analysis/dependencies.byComponent.yaml` — how components nest, for choosing `instanceOf` targets.
5. `mappings/bindings/` in the schema package, for the **concepts this component actually touches** — a prop type, a role, a style key. Each concept carries a disposition, and the two that matter are `approximated` (the platform keeps something lossier than the spec says) and `bound` (the platform substitutes a value, such as emitting an authoring-default example as a fallback). Reading them here is half a minute and tells you up front what a surface will do with what you are about to write; reaching for them only after a surface looks wrong has cost whole rounds. Check the key's `elements` scope too: a key `bound` on a platform but scoped to element types that do not include the element you are giving it is skipped silently there — `strokes` on a `glyph` passed validation and died on canvas exactly this way. Validation will not catch this class; the bindings are the only place it is knowable before a render.

If the digest said `analysis.stale: true`, run `specs analyze` first. A report that is empty at this catalogue size is skipped, not studied.

**Patterns come from the analysis reports first, individual specs second.** The reports are the catalogue's own summary of its api and styling idiom — start there, and open an individual sibling only when a specific question the reports cannot answer warrants it. Specs are never read to learn *how to write a spec* (the schema, rules, and references carry that); a sibling is opened only to look for api and styling patterns. When one is warranted, check its `metadata.source` first: a captured spec carries it, an authored one omits it — prefer an authored sibling, and treat a captured one as evidence of what capture produced, not of authored idiom. When you do open the sibling, read **all three** of its concern files — the pattern a task hinges on has sat in the one file a session skipped. Decide and write down: components to nest and the closest sibling to emulate (idiom only — structure always comes from the schema). The token set is decided at step 4, from the variants pack — not here.

## 3. Author api.yaml, then validate

Anatomy first (every element, typed), then props (reusing the catalogue's vocabulary), then `invalidPropCombinations` if any. Then:

```
specs validate <key> --authored
```

Zero errors before touching the next file. Fix the file the error names, re-run, repeat. Never proceed past a validation error — with one expected exception: **a slot-bearing component's `variants.yaml` fails once by design**, because its `children.examples[0]` `$slotContent` pointer targets a slot-content example you have not authored yet. That dangling-pointer error means "author examples next," never "rework the binding."

## 4. Author variants.yaml, then validate

**Before writing a delta, multiply the axes.** A Figma component set is the cross product of its variant axes, not the number of `variants[]` entries you write — so compute it from `api.yaml`'s enum lengths and state the product (`mode 2 × itemSpacing 10 × padding 7 = 140`). Over 100, stop and get the human's approval: name the number, name the risk — render time, and a set large enough to make their Figma file unusable — and offer the alternative of fewer enum values or fewer axes. `rules/variants.yaml · variantBudget` carries the rule; a round that skipped this arithmetic rendered 990 frames and locked a human's Figma file.

Load the variants pack (step 0) first, in one call; token choices come from it. The `default` block fully describes every anatomy element — layout tree, styles, content, bindings. Then one `variants[]` delta per prop configuration that changes anything. Validate again; zero errors.

## 5. Author examples.yaml (when needed), then validate

`slotContentExamples` for every slot the component declares. `instanceExamples` only for what the variants cannot reach — a configuration outside the matrix, a content composition, or content that reads differently from the default. A component whose every configuration is a variant has **no** instance examples, and that is the right answer rather than a gap (`rules/examples.yaml`). Validate; zero errors.

**A component that shows an image also carries an `images` registry here.** Find what the library holds in `data/cache/images.yaml` — keyed by content hash, each entry giving its `src`, the library's `name`, which components `usedBy` it, and an `origin`. Write the entry under a name you choose, carrying `src` and `$extensions.com.figma.imageHash`, then point at it with `$image: "#/components/<key>/images/<name>"` from `backgroundImage` or from an image prop's `examples`. Never put a raw Figma hash in a style value (`rules/styles.yaml · images`).

## 6. Compile and observe

Invoke **`specs-cli.component.compile`** — it renders once, says which surfaces to observe and what the substitute is when you cannot see them, and classifies the render's warnings into the spec defects to fix, the platform limits that belong in your report, and the expected rows to pass over.

Two conditions before invoking it, both yours to check:

- **All three concern files validate clean.** A render of an inconsistent spec puts something wrong on the canvas and costs a second render to replace it.
- **The posture is up.** `specs-cli.posture` if the start digest said otherwise.

It is the same skill for a later change: anything that should reach the canvas after this point is another invocation, not a different procedure.

## 7. The two authored documents

**Read the fresh scaffold first, before authoring any platform file.** The emitter regenerates it from the spec you just wrote, and it already produces more than it looks like: the element wrappers your anatomy declares, `object-fit` on a replaced element, `border-radius: inherit`, the selectors the states convention generates. Author only what the scaffold does not produce, and delete any overlay rule it now covers. An overlay written before the scaffold is read duplicates the generator by hand — and when the anatomy changes, every one of those hand-built rules has to be found and removed again.

Then, for every requirement the table in step 1 marked supplemental:

- Implement it in hand-authored files **beside** the emitted output in the platform tree. Never edit emitted files — a re-emit overwrites them. Files you add are safe: emit overwrites only its own filenames, and prune removes only whole directories whose spec is gone.
- **Name the entry point by convention.** An emitter imports an authored `component.tsx` (React) or `component.ts` (Web Components) in place of the scaffold when it finds one beside it, and points the generated stories at it. It finds the file by that **name** — nothing in the spec or either document declares it. A file under any other name is reached only if one of those imports it, so put the implementation in `component.*` and let it import whatever else it needs.
- Copy `templates/supplemental.yaml` to the spec folder and fill it, section by section (`anatomy`, `props`, `styles`, `slotComposition`, `events`, `accessibility`, `behavior`, `motion`, `layout`, `overrides`, `naming`): each entry a testable `intent` and the `schemaGap` object — `{ path, need }` — naming the surface that cannot carry it. Add `platforms` as a *list* when the entry is scoped (`[react]`, `[web]`), `checkedBy` for how it is verified, and `checks` pointing at what verifies it. No rationale prose.
- For anything a *consumer* must observe, copy `templates/guidelines.yaml` as `guidelines.yaml`: each entry a `statement` with a `level` of `must` / `should` / `should-not` / `must-not` / `may`. Prefer `alternatives` over `instead` whenever the remedy is a thing you can point at. A consumer rule never belongs in `supplemental.yaml`, and never carries a `schemaGap`.
- `specs validate` checks both documents' shape against their published contracts — run it after writing, like any concern file.
- **Rename procedure:** renaming the component orphans its old emitted directory — prune removes it, custom files included. Move custom files first.

After every later re-emit, diff the fresh scaffold against your custom files again — the anatomy may have gained an element the scaffold now handles. Where an overlay depends on something the emitter produces — a BEM class, a selector the states convention generates — record that dependency in the entry's `checks` so the next re-emit has something to re-verify against.

## 8. Report

End every pass with this summary, in this order. Keep unstructured narrative to a sentence or two above it — the sections carry the content.

- **Files updated:** a linked list — `[api.yaml](specs/components/<key>/api.yaml), [variants.yaml](…), …`
- **Props updated:** `prop`, `prop`, `prop`
- **Tokens applied:** one per line, by name only — no narrative about how or why each was chosen
- **Decisions to confirm:** a numbered list (1., 2., …) so a reply can reference them by number; each item a **bolded term** followed by two or three sentences. A formatted list, never a table
- **Gaps:** same numbered format — requirements the schema could not carry, what went supplemental, and anything the skills did not predict
- **Suggestions:** same numbered format — opportunities you noticed but were **not asked to build**: events, accessibility, interactions, refinements. Never build these on your own; surface them here and wait. One that would land as an authored entry is listed literally, naming its document and section (`supplemental: events:`, `guidelines: accessibility:`), so the user can approve some, all, or none
- One stats line: validate attempts per file; requirements spec-carried vs supplemental vs guidelines

The Suggestions section is also a scope rule: an unprompted improvement is proposed there, never implemented in the same pass.

## 9. The revision round

A reply to your step-8 report is a work round of its own, and it does not start over. Steps 1 and 2 are already done — the requirements table and the catalogue correlation stand, amended by the reply. Re-enter only the steps the reply touches, in file order (`api.yaml` → `variants.yaml` → `examples.yaml`), validating after each exactly as in a first pass, then compile and report again. Amend the step-1 table in place rather than rewriting it: a reply that renames a prop or drops a value changes a row, and the table is still what you grade against.

Two mechanics the posture does not make obvious:

- **A new hand-authored platform file does not re-point the generated story at itself.** The posture watches `specs/`, so the story keeps importing the scaffold until a spec file changes. Touch the spec's `api.yaml` (or save any concern file) to force the re-emit, then confirm the import by reading the emitted story.
- **Anything that changes what the canvas should show needs another render** — a new prop, a changed variant matrix, a changed style. A code-only prop is the one case that does not: it exists in code, and the Figma side carries only its layer. Render once per revision round that changed canvas-visible facts, never once per file.

**Foundations guidelines are the exception to waiting.** A guess that only a foundations guideline could have settled — which colors a concept may use, what a type scale's default is — names a missing `guidelines/<area>/<topic>`. Propose the topic in Suggestions, and you may go further: run `specs-cli.guidelines.propose` for it in the same pass. Its output is a proposal for the ratifier, not shipped behavior, so drafting one expands no scope — and the next component inherits a ruling instead of re-guessing.
