---
name: specs-cli.primer
description: What Specs is — a schema at the hub of bidirectional transforms over strongly structured data — plus the rules for reading that data and a map of the schema, settings and guides. Read once per session; every other specs-cli skill assumes it.
---
<!--
  Canonical skill emitted by `specs skills install` — overwritten on every
  refresh; do not edit in place. A local override layer (a separate file the
  refresh never touches) is planned but not yet implemented; until it exists,
  local customizations belong in your own separate skill.
-->

# Specs: the primer

Every other `specs-cli` skill names this as a prerequisite. Read it once per session.

**Specs is a schema and a CLI. The schema types a design system as data — visual foundations, components, compositions. The spec is the hub; every platform is a surface that data is read from and written to.**

The data is strongly structured so that every transform is **deterministic**: same input, same output, no side effects. That is the product, and it is why an inference is a defect here rather than a shortcut — it inserts a non-deterministic step into the one pipeline built to have none.

## The model

The spec sits at the centre. Figma is an implementation *and* an expression surface, not an origin:

| Transform | Direction | Commands |
|---|---|---|
| Read a Figma library into spec data | Figma → spec | `fetch`, `scan`, `generate` |
| Render spec data onto the Figma canvas | spec → Figma | `render` |
| Emit working code from spec data | spec → code | `react`, `webcomponents` |
| Report across the library | spec → analysis | `analyze` |

Any implementation can be a surface in either direction. Nothing about the spec is Figma-shaped, and no transform is privileged.

## Rules

1. **Name the file and the field, or you do not know the fact.** Every fact about a library is declared somewhere in a typed field. If you cannot cite where, you are inferring — say so, or go read it.
2. **Resolve paths from config, never hardcode them.** `data.directory`, `spec.directory` and `assets.directory` are settings (defaults `./data`, `./specs`, `./assets`); `spec.directory` is also overridable with `-o`, and the config directory itself with `--config`. Read the settings, then build the path.
3. **Indexes are not authorities.** Analysis reports and scan manifests aggregate across a library, which no single spec can do, and they are lossy by design. An index says where to look; it never says what is true.
4. **Verify against output.** A classification that emits nothing is indistinguishable from one never made. Report the numbers, never that a step succeeded.
5. **Absence in one library is not absence in the domain.** A shape you did not find in this workspace is not a shape that does not occur.

## Reports

A skill that proposes something writes its report to **`reports/`** at the workspace root, named:

```
reports/<YYYY-MM-DD>.<skill>.<purpose>.<format>
```

`<skill>` drops the `specs-cli.` prefix — `reports/2026-10-14.states-setup.proposal.md`, `reports/2026-10-14.icons-setup.proposal.md`, `reports/2026-10-14.roles.proposal.md`. Add `-HHMM` after the date when a second run the same day would collide.

Three rules, and the first is the one that gets broken:

1. **Never write a report into `analysis/` or `specs/`.** Both are regenerated, so a report there is destroyed by the next run — and a report a human has marked up is destroyed silently.
2. **Say where you wrote it**, as the last line of what you tell the user. "Where did that go" is the first question a report provokes, and the answer belongs in the output rather than in documentation.
3. **A report is a working document, not an output.** `reports/` is gitignored in a scaffolded workspace. Anything meant to be kept belongs in config, in a spec, or in the Figma file.

## Artifact authority

| Authority on | Artifact | Path from |
|---|---|---|
| Figma as fetched — `type`, `children`, `componentPropertyDefinitions`, `absoluteBoundingBox`, fills | `<data>/<alias>.file/page-*.json` | `data.directory` |
| The declared contract — anatomy, prop types, enums | `<spec>/components/<name>/api.yaml` | `spec.directory` |
| Per-variant configuration — element styles, `$binding` | `<spec>/components/<name>/variants.yaml` | `spec.directory` |
| What the library declares about itself | `config/settings.yaml`, `config/conventions/*.yaml` | `--config` |
| **What is legal in a spec** | `node_modules/@directededges/specs-schema/` — `types/*.ts` and `schema/*.schema.json` | a CLI dependency, so always present |
| What actually shipped | the emitted platform trees | `react.directory`, `webcomponents.directory` |
| Where to look (never what is true) | `<spec>/analysis/*.yaml`, `<data>/<alias>.manifest.md` | as above |

## Names, keys and conventions

A name is not self-evidently a fact — **but a declared convention can make it one.** That distinction is the system's core mechanic, and both halves matter:

- **Declared** — `glyphs.match`, `subcomponents.match`, `codeOnlyProps.match`, `instanceExamples.match`, `naming`, `images.match`. When a convention declares a pattern, a matching name *is* the fact: that is the library telling you what it means, and the transform acts on it deterministically.
- **Undeclared** — everything else. A `/` in a layer name is not containment. A prop called `filled` is a state in one library and presentation in the next. Here the name is a hint, and the declared field decides.

So: check whether a convention claims the name before treating it as evidence, and read the structure when none does.

## Derivations

The spec is not a dump of Figma. These are the transforms that make it a contract, each with a guide — reach for one when a library's data does not look the way you expect:

| Derivation | Guide |
|---|---|
| Variant structure: depth, layering, empty and invalid combinations | `variant-depth`, `variant-layering`, `invalid-variant-combinations` |
| Props: naming, consolidation, number inference, code-only props | `prop-naming`, `consolidating-props`, `number-inference`, `code-only-props` |
| Slots: constraints, default content, instance examples | `slot-constraints`, `default-slot-content`, `instance-examples` |
| Layout: positioning, absolute positioning, data layout | `layout-positioning`, `absolute-positioning`, `data-layout` |
| Assets: glyph detection, images, subcomponent scoping | `glyph-name-pattern`, `images`, `subcomponent-scoping` |
| Keys: formatting, and what a key cannot reconstruct | `key-formatting` |
| Rendering spec data back onto the canvas | `render-to-figma` |

## Sources

Do not read these now. Use them when a question needs an authority, nearest source first.

**1. The schema package — local, versioned with the CLI, and the only enforcement surface.** It is a CLI dependency, so it is in `node_modules` of any workspace that can run these commands. Prefer it over any prose about it.

| For | Read |
|---|---|
| What a spec document may contain, validatably | `node_modules/@directededges/specs-schema/schema/` — `component`, `components`, `concern`, `conventions`, `settings`, `metadata`, `styles`, `root` |
| The authored types, with the reasoning in their doc comments | `node_modules/@directededges/specs-schema/types/` — `Anatomy`, `Props`, `Variant`, `PropBinding`, `PropConfigurations`, `SlotContent`, `SlotContentRef`, `Styles`, `Layout`, `Conventions`, `Settings`, `Metadata`, `Subcomponent`, `InstanceExample`, `Conditional`, and more |

When forming or validating spec data, this is the answer. A doc page describes it; these files *are* it.

**2. The docs, as markdown.** Not shipped with the CLI — fetch the source file rather than the rendered page, so you read what was written rather than HTML converted back:

```
https://raw.githubusercontent.com/DirectedEdges/specs/main/site/src/content/docs/<path>
```

| Question | `<path>` |
|---|---|
| What does this setting accept? | `settings/<topic>.md` — `states`, `glyphs`, `subcomponents`, `tokens`, `keys`, `curation`, `data-sources`, … |
| How do I express this correctly in data? | `guides/<guide>.md` — the derivations table above names them |
| What is a role, and which exist? | `roles/index.md`, and a page per role |
| What does a command do? | `cli/commands/<name>.md` |
| How does versioning classify a change? | `versioning/index.md` |
| A schema concept in prose rather than types | `schema/<concept>.md` |

Two limits worth knowing. These are `main`, so they describe the newest documentation rather than the CLI you are running — if a page names something the installed CLI does not have, trust the CLI. And each fetch is independent, so look up what you need rather than browsing; `https://spectacular.systems/<topic>/` is the same content rendered, for a human you are pointing at it.
