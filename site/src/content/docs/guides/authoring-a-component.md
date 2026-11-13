---
title: "Authoring a Component"
description: "The hand-authoring round: prompt, prime, work, respond, iterate."
---

A spec does not have to come from Figma. An authored spec is identical in shape to a generated one — the same three concern files, the same schema, the same [`validate`](/cli/commands/validate/) referee — so a component that does not exist in the library yet can be specified first and rendered onto the canvas afterwards.

This guide is the round itself: what happens before any file is written, the order the files get written in, and what a finished pass hands back. The skills that drive it are described on their own pages; this is the shape they follow.

## The round

| Phase | What happens |
|-------|--------------|
| **Prompt** | A request names a component and its requirements |
| **Prime** | Read the contract sources — once, in one batch |
| **Work** | `api` → validate → `variants` → validate → `examples` → validate |
| **Respond** | Files written, decisions to confirm, gaps, suggestions |
| **Iterate** | Re-work on your answer, re-validate, re-render |

## Prompt

A round opens with one command:

```bash
specs author start pageHeader --title "Page Header"
```

That writes `specs/components/pageHeader/` with all three concern files from templates, and prints the authoring status digest — the catalogue, the freshness of `analysis/`, the config paths, and whether the Storybook posture is answering. The folder starts **valid**, which is the point: every validation error from here on is one the round introduced.

`start` never overwrites. An existing folder under the key is an error that names the path and leaves it alone.

## Prime

Priming is reading the sources that settle what the component may contain. It is staged by file lifecycle, because context read too early sits idle.

**Before `api.yaml` — the contract pack.** The two primers, the rules files for the concepts this request touches, `config/conventions/*.yaml`, [`analysis/props.yaml`](/cli/analyze/props/), and [`analysis/dependencies.byComponent.yaml`](/cli/analyze/dependencies/).

**Before `variants.yaml` — the styling pack.** The style reference, [`analysis/foundations/<type>.yaml`](/cli/analyze/foundations/) for the token types the component needs, and [`analysis/styling.byToken.yaml`](/cli/analyze/styling/).

Nothing about styling belongs in the first pack, and a pack is read once rather than reopened.

### The authority order

Every question about what a spec may contain resolves at the nearest of these, never lower:

| # | Question | Authority |
|---|----------|-----------|
| 1 | Is this legal, and what does it mean? | The schema package's types and JSON Schema files, and only them |
| 2 | Does platform X realise this key, and how faithfully? | `mappings/bindings/<platform>.json` — each key's declared disposition |
| 3 | When should I use what the schema permits? | The rules files and your workspace guidelines |
| 4 | A readable walkthrough of 1 and 2 | This site |

**Emitted output is never an authority.** A platform is a surface: when a surface disagrees with the schema, the surface has a defect to report, not a reason to bend the spec toward it. Letting the newest emitter confirm what a spec means makes the contract whatever that emitter happens to do, which is the non-determinism the model exists to prevent.

Existing spec files are exemplars of *idiom* — naming, prop vocabulary, token choices — and never of structure. When a sibling spec appears to answer a schema question faster than the schema does, that is a prompt to go read the schema.

### Two layers of rules

| Layer | Lives in | Argues from |
|-------|----------|-------------|
| Shipped rules | `rules/*.yaml` beside the authoring primer skill | The contract — the schema and its ADRs, identical in every workspace |
| System guidance | `specs/foundations/<concern>/guidelines.yaml` | This library's own tokens, styles and conventions |

One shipped rules file per spec concept, keyed to mirror the schema node it governs: `anatomy`, `styles`, `layoutStyling`, `props`, `slots`, `variants`. Load the file for the concept you are about to write.

System guidance is authored by [`guidelines.propose`](/cli/skills/guidelines-propose/) and ratified by the system owner. Guidance about using *one component* is never a foundations file — it belongs in that component's own [`guidelines.yaml`](/schema/documents/guidelines/).

## Work

### Split the requirements first

Before writing anything, restate every requirement from the request with its intended home:

| Requirement | Home | Carried by |
|-------------|------|------------|
| … | spec | the schema path that carries it |
| … | supplemental | the schema path that *would* carry it, and why it cannot |
| … | guidelines | the obligation level it binds a consumer at |

A requirement goes supplemental only after naming the schema path that cannot carry it. The reverse failure is worse: forcing into the spec what the schema cannot express.

Sort by **who acts on it**. Something the component must do is [supplemental](/schema/documents/supplemental/); something its caller must do is [guidelines](/schema/documents/guidelines/).

Before marking anything supplemental, check it is not a prop. A behavior the consumer configures in code — a semantic element choice, an accessibility label, a heading level — is a [code-only prop](/guides/code-only-props/) in `api.yaml`, not a hand-authored platform file.

### Correlate against the catalogue

An authored spec must look native to the catalogue it joins. Reuse a prop name and its value set when the concept matches; never coin a synonym for a prop the system already has. `analysis/dependencies.byComponent.yaml` shows what nests what, which is how `instanceOf` targets get chosen.

Conventions outrank precedent. A `config/conventions/` file that names your component or its props settles the naming before anything else gets a vote — and in an empty catalogue, the conventions are the only place the system's vocabulary lives.

### One file at a time, with a gate between each

```bash
specs validate pageHeader --authored
```

[`api.yaml`](/schema/documents/component-api/) first — anatomy with every element typed, then props, then `invalidPropCombinations`. Validate. Zero errors before the next file.

[`variants.yaml`](/schema/documents/component-variants/) next. The `default` block fully describes every anatomy element: layout tree, styles, content, bindings. Then one delta per prop configuration that changes something. Validate.

[`examples.yaml`](/schema/documents/component-examples/) last — at least one realistic `instanceExamples` entry, and a `slotContentExamples` entry for every slot the component declares. Validate.

:::note
A slot-bearing component's `variants.yaml` fails once by design. Its `children.examples[0]` pointer targets a slot-content example that does not exist yet. That dangling pointer means "author examples next" — never "rework the binding".
:::

### Compile and observe

The live posture re-emits the platform trees on save and refreshes Storybook. The Figma canvas is **not** watched — render it once, after all three files validate clean:

```bash
specs render specs/components/pageHeader --overwrite
```

Never put a render on a watch. A many-variant component cannot finish rendering before the next save triggers the next render, and the loop breaks Figma.

Observing means the running surfaces — Storybook and the canvas — not the emitted source.

:::caution
[`specs generate`](/cli/commands/generate/) writes a Figma round-trip over any same-keyed folder under `specs/`, so in a workspace with authored specs it can offer your own work back for overwriting. Generate one component at a time, and check the manifest's checkboxes after any fetch or scan.
:::

### The two authored documents last

Read the fresh scaffold before writing any platform file. The emitter already produces more than it looks like — element wrappers, `object-fit` on a replaced element, `border-radius: inherit`, the selectors the [`states`](/settings/states/) convention generates. Author only what the scaffold does not, and delete any overlay rule it now covers.

- Implement supplemental behavior in hand-authored files **beside** the emitted output, never by editing emitted files.
- Name the entry point `component.tsx` (React) or `component.ts` (Web Components). The emitter finds it by that name and points the generated stories at it; nothing in the spec declares it.
- Fill `supplemental.yaml` section by section — each entry a testable `intent` plus a `schemaGap` naming the surface that cannot carry it.
- Put anything a *consumer* must observe in `guidelines.yaml`, each entry a `statement` with an obligation level.

Both documents are shape-checked by `specs validate`, so run it after writing them too.

## Respond

A finished pass reports, in this order:

- **Files updated** — a linked list.
- **Props updated** — names only.
- **Tokens applied** — one per line, by name.
- **Decisions to confirm** — numbered, so a reply can answer by number.
- **Gaps** — requirements the schema could not carry, and what went supplemental.
- **Suggestions** — opportunities noticed but not asked for.

Suggestions is also a scope rule. An unprompted improvement is proposed there and built in a later pass, never in the same one.

## Iterate

Answering the decisions reopens the round. Re-validate the file that changed, re-render once when the change should reach the canvas, and diff the fresh scaffold against your custom files again — the anatomy may have gained an element the scaffold now handles on its own.

Renaming a component orphans its old emitted directory, and prune removes that directory with your custom files inside it. Move those files first.

## Related

- [Authoring specs: the primer](/cli/skills/authoring-primer/) — the structural contract this guide follows
- [`component.author`](/cli/skills/component-author/) — the skill that runs the round
- [`author`](/cli/commands/author/) and [`validate`](/cli/commands/validate/) — the two commands it gates on
- [supplemental](/schema/documents/supplemental/) and [guidelines](/schema/documents/guidelines/) — the two authored documents
