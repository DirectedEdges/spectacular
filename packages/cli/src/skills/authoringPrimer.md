---
name: specs-cli.authoring.primer
description: The structural contract for authoring specs by hand — the two kinds, the three files, the six references, the authoring order, and the validate loop. Prerequisite for every authoring skill (component.author, composition.author, guidelines.propose).
---
<!--
  Canonical skill emitted by `specs skills install` — overwritten on every
  refresh; do not edit in place. Local customizations belong in your own
  separate skill.
-->

# Authoring specs: the primer

**Prerequisite:** read `specs-cli.primer` first — what Specs is and the rules for reading its data. This primer adds what *writing* a spec requires. Read both once per session.

An authored spec is identical in shape to a generated one: the schema is the single source of structural truth, and `specs validate` is the referee. You never infer a shape from an existing spec file — existing specs are exemplars of idiom (naming, token choices, prop vocabulary), never of structure **and never an authority**: when the question is what the schema permits or how a mechanism works, the schema answers it even when an exemplar seems to answer faster, and an exemplar that appears to settle a schema question is a prompt to go read the schema, not a substitute for it. When you need a structure fact, it comes from the schema; when you need a consistency fact, it comes from `analysis/` reports.

## The two kinds

| Kind | Folder | Is |
|---|---|---|
| component | `specs/components/<key>/` | A reusable contract: anatomy, props, variants, examples |
| composition | `specs/compositions/<key>/` | An arrangement of components: page type, template, pattern |

`<key>` is the camelCase folder key (`tooltip`, `pageHeader`) — compositions included, with no kind prefix (`destinationPicker`, never `compositionDestinationPicker`). Keys *inside* a spec follow the workspace's `spec.keys` setting.

A composition is written as the same three concern files a component is. What differs is the content: most of its anatomy is `type: instance` elements naming real components, its layout is the page structure down from `root`, and its instances configure their targets through `propConfigurations`.

**"Composition" names this spec kind, and nothing else.** The act of arranging and nesting elements — including through instances and into slots — is layout, and it lives in `references/layout.md`. Conflating the two sends a round looking for a composition spec when it is authoring one component's tree. (The schema's bare `Composition` triplet — `anatomy` + `elements` + `layout` — is the shape a `$slotContent` pointer resolves to, not the on-disk folder format.)

## The three files

| File | Holds | Required top-level |
|---|---|---|
| `api.yaml` | The contract: `title`, `anatomy`, `props`, optional `invalidPropCombinations`, optional `subcomponents` | `metadata`, `title`, `anatomy`, `props` |
| `variants.yaml` | The appearance: complete `default` (layout + every element's styles/content), then `variants` — each a delta activated by a `configuration` | `metadata`, `default`, `variants` |
| `examples.yaml` | Ready-made usages: `instanceExamples` (whole-component configurations) and `slotContentExamples` (named slot fills) | `metadata` |

Every file's `metadata` states its `concern` (`api`, `variants`, or `examples`). An authored spec omits `metadata.source` — those are Figma capture facts you do not have — and validates with `--authored`, which downgrades exactly that omission to a warning. Never fabricate a `pageId`/`nodeId`.

## Anatomy and elements

`anatomy` declares every element: a key plus `type` — one of `container`, `text`, `glyph`, `slot`, `instance`, `vector`, `line`, `ellipse`, `rectangle`, `polygon`, `star`. An `instance` element carries `instanceOf`. There is always a `root`.

In `variants.yaml`, `default.elements` describes **every** anatomy element: `styles`, `content` (text string, glyph name, or a `$binding`), `children`, `propConfigurations` (nested instances only). Entries under `variants` describe only what that configuration changes.

## The six pointer forms

These are the six ways one spec node points at another thing. They are not the `references/*.md` files beside this skill — those are reading material, and the collision of the word is worth keeping straight.

| Pointer | Written where | Value | Resolves to |
|---|---|---|---|
| `instanceOf` | `anatomy.<el>` and `elements.<el>` | component name, plain string | that component's spec folder |
| `instanceOf: {$ref}` | same | `"#/subcomponents/<name>"` | `subcomponents.<name>` in this spec |
| `$binding` | element `content`, `children`, `styles.visible`, configuration values | `"#/props/<prop>"` | the owning scope's `props` — a subcomponent's binding resolves against the subcomponent's own props |
| `$slotContent` | slot-prop configuration values, `children.examples` | `"#/components/<key>/slotContentExamples/<name>"` (optionally `/subcomponents/<sub>/` in the middle) | that spec's examples file |
| `$token` | style values | `{$token: "<slash/separated/path>", $type: "<type>"}` | a token in the source library |
| `$image` | `backgroundImage`, an image prop's `examples` or `default` | `"#/components/<key>/images/<name>"` | an entry in that spec's own `images` registry |

An `images` registry sits in `examples.yaml`, keyed by a name you choose. Each entry carries `src` — the workspace-relative path to the file — and the Figma identity under `$extensions.com.figma.imageHash`:

```yaml
images:
  poolDeck:
    src: ../../../assets/images/ab843a9f….jpg
    $extensions:
      com.figma:
        imageHash: ab843a9f…
```

What the library already holds is in `data/cache/images.yaml`, keyed by content hash, each entry carrying its `src`, the library's `name` for it, which components `usedBy` it, and an `origin` of `style`, `pageFrame` or `component`. Read that to find an image; never write a raw Figma hash into a style value.

## The authoring order

**A round opens with `specs author start <key>`** — the collision-checked folder with all three concern templates, valid as shipped, plus the status digest.

**Context then loads in three packs, one per concern file, each pack one batched call, each read once.** A pack is named for the document it precedes, and it loads immediately before that document is authored — never earlier. Context read ahead of its document sits idle through the work in between, and a model follows whichever rule is nearest rather than whichever applies.

| Pack | Loads before | Carries |
|---|---|---|
| api | `api.yaml` | the primers; `rules/` for the concepts the request touches; `references/props.md`, and `references/slots.md` / `references/subcomponents.md` when the request describes either; `config/conventions/*.yaml`; `analysis/props.yaml`; `analysis/dependencies.*` |
| variants | `variants.yaml` | `references/layout.md`, `references/styles.md`; the `analysis/foundations/<type>.yaml` files for the token types the component needs; `analysis/styling.byToken.yaml`; `analysis/styling.byComponent.yaml` |
| examples | `examples.yaml` | `rules/examples.yaml`, `rules/primitives.yaml`; `data/cache/images.yaml` when the component carries imagery |

The catalogue is already in the digest, so no pack re-reads it.

**A pack is read once and never reopened.** Re-reading a skill or rules file mid-author is the single largest avoidable cost measured in a round, ahead of every other startup activity; returning to one later means the first read was skimmed. Reading properly once is the whole technique.

Later documents build on what earlier packs already loaded rather than re-reading them. Slot content triplets in `examples.yaml` carry styles, and the styles map the variants pack loaded still applies — that is the same context, not a reopen. The examples pack is small because of it.

The order itself, which every authoring skill follows:

1. **Requirements split first.** Before writing anything, list every requirement with its intended home: spec (name the schema path that carries it) or supplemental (name the schema path that cannot). The table is graded at the end of the round; write it honestly now.
2. **Correlate.** Decide what to nest and what to emulate, from `analysis/props.yaml`, `analysis/dependencies.*`, and the digest's `catalogue`. Token correlation waits for the variants pack. An authored spec must look native to its catalogue.
3. **api → validate → variants → validate → examples → validate.** The files already exist — start wrote them — so the order governs authoring, not creation. One file at a time, `specs validate <key> --authored` after each, zero errors before the next. A validation error is fixed before anything else happens.
4. **Compile and observe, once, after all three validate.** The dev posture re-emits on save; the canvas is not watched and is rendered once. Never run a render watch.
5. **The two authored documents last.** What the schema cannot carry goes in hand-authored platform files plus `supplemental.yaml`, for whoever *builds* the component. What someone *using* it must observe goes in `guidelines.yaml` beside it. Both are shape-checked by `specs validate` against the published contracts (ADR-118).

Steps 4 and 5 are procedure, and the skill running the round owns their detail — `specs-cli.component.author` carries the render invocation, the posture repair, and the eleven supplemental sections. Resolving a token is judgment, and `rules/styles.yaml · tokens` owns it: which report is authoritative, what a zero in the index means, and why the render caches never answer a token question.

## The authority order

`specs-cli.primer` carries it — the precedence table and the prohibition on learning a spec's meaning from emitted output. It governs reading in every skill, not just authoring, so it lives there and is read once per session. Nothing in this file overrides it.

The one authoring-specific consequence: when a surface disagrees with the schema, the surface has a defect — report it in your closing report rather than bending the spec toward it.

## Rules

- **Cite the schema path for every shape you write.** If you cannot name the type or definition a node instantiates, you are inferring — go read the schema. "The schema" includes its shipped platform surface: `mappings/bindings/`, `mappings/DEFAULTS.md`.
- **Deterministic and complete.** The `default` variant fully describes every element. Variants are deltas layered onto it in order.
- **A requirement goes supplemental only after naming the schema path that cannot carry it.** "The schema can't do X" requires showing where X would live and why it does not fit. The reverse failure is worse: forcing into the spec what the schema cannot express.
- **Consistency is graded.** Prop names, enum values, token choices, and element naming follow what `analysis/` shows the system already does.
- **Author comment-free spec files.** A generated spec carries zero comments, and an authored spec is identical in shape to a generated one — comments make it read as a different species, and a later capture rewrites the file and deletes them anyway. Citing schema paths is part of *your process*, never file content; restating what a token path or prop name already says is noise. Two exceptions: a deliberate departure from a rule or ADR gets a one-line note at the departure site — that fact has nowhere else to live, and without it the next reader files a bug — and a **deferred feature**, a prop or block left in the file but out of service pending a decision, gets a short note at its site saying what it is waiting on. A deferred feature is not a departure, and the note is not a license to annotate anything else.
- **`specs generate` overwrites authored specs — it is never yours to run unprompted.** Generate writes a Figma round-trip over any same-keyed folder under `specs/components/`, and a component `specs render` placed on the canvas comes back as a library component on the next fetch — so the manifest can offer your own authored work back for overwriting. In a workspace with authored specs: never generate against the fetched file or the whole manifest; one component at a time (`specs generate -c <component>`), and only on an explicit human instruction naming that component. After any fetch or scan, check the manifest's checkboxes before anything else runs.

## Where to go deeper

The five `references/*.md` files beside this skill each map one mechanism. A reference carries the map — what exists, what shape it takes, which file each step is written in. It never decides which value to write; that is the matching `rules/*.yaml` file, and where the two seem to overlap the rules file governs.

| Topic | Reference | Pack |
|---|---|---|
| The prop kinds, their required fields, where a prop is read and set | `references/props.md` | api |
| A slot across the three files, default against named fills, the pointer forms | `references/slots.md` | api |
| A part that exists only inside its parent, and the names that must agree | `references/subcomponents.md` | api |
| Layout trees, flow against pinning, sizing, arranging through instances and slots | `references/layout.md` | variants |
| The style property map, structural properties, the token reference shape | `references/styles.md` | variants |

The new-component procedure and its templates are `specs-cli.component.author`. What a property or option *means* comes from the schema package itself — `specs-cli.primer` names it and the sources that mirror it.

## Reading the two layers beside this skill

**`rules/*.yaml` — judgment, one file per spec concept**, keyed to mirror the schema node it governs. Node kinds: `useWhen` — ordered usage mappings, first match wins (`dontUseWhen` for explicit negatives); `when` — property interdependencies (setting this value `opens` the listed properties, or `requires` a condition); `guidelines` — modality-keyed items, `must`/`never` hard, `should`/`avoid` strong convention, `could`/`warn` judgment, a positive pairable with its counter-balancing negative in one item. An `adr: <number>` cites the decision an item projects, so the rules files are the current-state map of the ADRs. Load the file for the concept you are authoring before writing it.

**`references/*.md` — the map**, one per mechanism, listed above.

**Rules outrank references.** A rules entry is a judgment at one schema node; a reference maps a mechanism spanning several nodes or files. A choice at a single node is a rule; a fact spanning more than one node or file is a reference. When the two appear to say the same thing, the rules file governs — the reference is the stale copy, and the fix is to delete the sentence from the reference rather than reconcile them. Neither layer says what a spec *means*: that is the schema's, and both cite it. A newly learned rule lands as an entry in the matching rules file in the CLI package — never as skill prose and never as reference prose.

**A third layer is the library's own, and it is not yours to write mid-round.** `specs/foundations/<concern>/guidelines.yaml` and a component's own `guidelines.yaml` carry ratified guidance about this system rather than about the contract. `specs-cli.guidelines.propose` owns their format and writes them **only when explicitly asked**. Inside an authoring round, absent guidance is a gap for your report's Suggestions — never something to fill as you go.
