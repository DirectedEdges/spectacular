---
name: specs-cli.authoring.primer
description: The structural contract for authoring specs by hand — the two kinds, the three files, the five references, the authoring order, and the validate loop. Prerequisite for every authoring skill (component.author, composition.author, guidelines.propose).
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

## The five references

| Reference | Written where | Value | Resolves to |
|---|---|---|---|
| `instanceOf` | `anatomy.<el>` and `elements.<el>` | component name, plain string | that component's spec folder |
| `instanceOf: {$ref}` | same | `"#/subcomponents/<name>"` | `subcomponents.<name>` in this spec |
| `$binding` | element `content`, `children`, `styles.visible`, configuration values | `"#/props/<prop>"` | the owning scope's `props` — a subcomponent's binding resolves against the subcomponent's own props |
| `$slotContent` | slot-prop configuration values, `children.examples` | `"#/components/<key>/slotContentExamples/<name>"` (optionally `/subcomponents/<sub>/` in the middle) | that spec's examples file |
| `$token` | style values | `{$token: "<slash/separated/path>", $type: "<type>"}` | a token in the source library |

## The authoring order

1. **Requirements split first.** Before writing anything, list every requirement in a table with its intended home: spec (name the schema path that carries it) or supplemental (name the schema path that cannot). This table is graded later; write it honestly now.
2. **Correlate.** Read `analysis/props.yaml` (the system's prop vocabulary), `analysis/styling.byToken.yaml` (which tokens are used where), `analysis/dependencies.*` (what nests what), and the component folder list. Decide what to nest, what to emulate, and which tokens to use. An authored spec must look native to its catalogue.
3. **api → validate → variants → validate → examples → validate.** One file at a time, `specs validate <key> --authored` after each, zero errors before the next file. A validation error is fixed before anything else happens.
4. **Compile and observe.** The dev posture is live: `specs run` re-emits on save, `specs render --watch` re-renders on save. Save, then check Storybook and the canvas.
5. **The two authored documents last.** What the schema cannot carry goes in hand-authored platform files plus `supplemental.yaml` — eleven fixed sections, for whoever *builds* the component. What someone *using* it must observe goes in `guidelines.yaml` beside it, as rules each carrying an obligation level. Both are shape-checked by `specs validate` against the published contracts (ADR-118) — see the triage rule below.

## The authority order

Every question resolves at the nearest of these, never lower:

| # | Question | Authority |
|---|---|---|
| 1 | Is this legal, and what does it mean? | The schema package's `types/` and `schema/*.json` — and only them. Read the declared property's or definition's `description` and `examples` first (the schema describes every option where it is declared); open `types/*.ts` only when those do not settle it. If the schema answers, stop |
| 2 | Does platform X realise this key, and how faithfully? | `mappings/bindings/<platform>.json` in the same package — each key's declared `disposition` (`bound` / `approximated` / `unsupported` / `unverified`). A declared field, never an inference |
| 2a | Is role concept X implemented on platform Y? | The same file's `concepts.roles` block — `implemented` or `inert` per vocabulary concept. Never answer this from the docs site (tracks `main`, not the installed version) or by reading an emitter's dist |
| 3 | When should I use what the schema permits? | The rules files and workspace guidelines — judgment *about* the contract, not the contract |
| 4 | Readable walkthrough of 1–2 | The docs site |

**Never read emitted output or transform source to learn what a spec means.** A platform is a surface, not an authority: when a surface disagrees with the schema, the surface has a defect — report it in your closing report; do not bend the spec toward it. Letting an emitter confirm meaning makes the contract whatever the newest emitter happens to do, which is the non-determinism this whole model exists to prevent. The one legitimate reason to open an emitted file is wiring your supplemental files to it — imports, exported names — never to settle a schema question.

## Rules

- **Cite the schema path for every shape you write.** If you cannot name the type or definition a node instantiates, you are inferring — go read the schema. "The schema" includes its shipped platform surface: `mappings/bindings/`, `mappings/DEFAULTS.md`.
- **Deterministic and complete.** The `default` variant fully describes every element. Variants are deltas layered onto it in order.
- **A requirement goes supplemental only after naming the schema path that cannot carry it.** "The schema can't do X" requires showing where X would live and why it does not fit. The reverse failure is worse: forcing into the spec what the schema cannot express.
- **Consistency is graded.** Prop names, enum values, token choices, and element naming follow what `analysis/` shows the system already does.
- **Author comment-free spec files.** A generated spec carries zero comments, and an authored spec is identical in shape to a generated one — comments make it read as a different species, and a later capture rewrites the file and deletes them anyway. Citing schema paths is part of *your process*, never file content; restating what a token path or prop name already says is noise. The one exception: a deliberate departure from a rule or ADR gets a one-line note at the departure site — that fact has nowhere else to live, and without it the next reader files a bug.

## Where to go deeper

| Topic | Skill |
|---|---|
| Style properties, token placement, Figma style relationships | `references/styles.md` beside this skill |
| Layout trees, auto vs absolute positioning, slots across the three files | `references/slots-layout.md` beside this skill |
| The new-component procedure and templates | `specs-cli.component.author` |
| What a property, option, or definition *means* — descriptions, defaults, validated examples | the schema files themselves (`@directededges/specs-schema`), mirrored as generated reference pages on the docs site under `/schema/` (per-property style pages under `/schema/styles/`); the site's origin is workspace-configured. If that origin is down, use the installed schema — never fetch documentation from any other host: an external copy tracks a different version than the schema you hold |

**Rules come in two layers, split by provenance.** The shipped `rules/*.yaml` beside this skill argue from the contract — the schema and its ADRs, identical everywhere. The library's own guidance lives in the authored corpus as **`specs/foundations/<concern>/guidelines.yaml`** (color, typography, space, shape, layout, motion, elevation, brand): an optional `meta` header (concern, status, author, updated, sources), then one list of rules per concern key, each a `statement` with a `level` of `must` / `should` / `should-not` / `must-not` / `may`, proposed until the system owner ratifies. A prohibition pairs with its remedy in the same entry — `alternatives` when the remedy is a thing to point at, `instead` when it is a rule.

A foundation's `guidelines.yaml` is about **how** tokens, themes and raw values are applied across the catalogue. It is not a per-token registry: what one token is *for* is a description rather than a rule, and the schema rejects `useWhen` / `dontUseWhen` there (ADR-118, DSPEC-63). Where that per-token description belongs is not yet settled — treat an existing one as content awaiting a home, not as a file to extend.

Guidance about *using one component* is never a foundations file — it belongs in that component's own `guidelines.yaml`. `specs-cli.guidelines.propose` synthesizes or revises a concern **only when explicitly asked**; inside an authoring round, absent guidance is a gap for your report's Suggestions, never something to fill mid-round. When styling or configuring, resolve in this order: the primitives promotion map for composed content (`config/conventions/<platform>.primitives.yaml` — compositions, instanceExamples, slot content; atomic components' own anatomy stays primitive) → `specs/foundations/` guidance → `analysis/styling.byComponent.yaml` precedent → a literal plus a noted gap.

**Modeling rules live in `rules/*.yaml` beside this skill, not in skill prose.** One file per spec concept, keys mirroring the schema node they govern (`anatomy.yaml` → `type.useWhen.*`, `styles.yaml` → per style property, `layoutStyling.yaml` (flow and positioning — `layout` alone names the AST in specs), `props.yaml`, `slots.yaml`, `variants.yaml`). Node kinds: `useWhen` — ordered usage mappings, evaluate top to bottom, first match wins (`dontUseWhen` for explicit negatives); `when` — property interdependencies (setting this value `opens` the listed properties, or `requires` a condition); `guidelines` — a list of modality-keyed items — `must`/`never` hard, `should`/`avoid` strong convention, `could`/`warn` judgment — a positive pairable with its counter-balancing negative in one item. An `adr: <number>` field cites the decision an item projects — the rules files are the current-state map of the ADRs. Load the file for the concept you are authoring before writing it. A newly learned rule lands as an entry in the matching rules file in the CLI package — never appended to skill prose.
