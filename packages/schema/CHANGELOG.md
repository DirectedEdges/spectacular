# Changelog

All notable changes to the Specs schema will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.40.0] - Unreleased

### Added

### Changed

### Removed


## [0.39.0] - 2026-10-29

### Breaking

- `Settings.spec.format` — defaults to `YAML`, previously `JSON` (ADR-112)
- `Settings.spec.keys` — defaults to `CAMEL`, previously `SAFE` (ADR-112)
- `Settings.spec.color` — defaults to `HEXA`, previously `HEX` (ADR-112)
- `Settings.curation.preserveManualSelections` — defaults to `true`, previously `false` (ADR-112)
- `Settings.spec.collapsePrimitiveWrapper` — defaults to `true`, previously `false` (ADR-112)

### Added

- `Conventions.storybook` — typed as `StorybookConventions`, an open concern-keyed map of feature settings loaded from `conventions/storybook.yaml`; also on `ResolvedConventions`
- `Settings.curation` — which components of a library a run specs, defaulting to today's behaviour
- `Settings.curation.defaultSelection` — `READY_FOR_DEV` or `ALL`; defaults to `READY_FOR_DEV`
- `Settings.curation.preserveManualSelections` — hand edits outrank a changed Figma status; defaults to false
- `Settings.curation.includeDependencies` — select what a component is built from; defaults to true
- `SpecsConventions.slots.default.match` — naming patterns identifying a component's designated default slot, authored in `conventions/specs.yaml`. A spec convention, not a platform one: what it names is a `SlotProp` the spec declares, so every platform reads the same answer (ADR-099)
- `MetadataConventions.specs` — the spec conventions a run was performed under, recorded beside the one platform entry. Required by a reader that cannot re-derive one from the spec it holds: a render resolving a nested instance's default slot does not hold that instance's own component spec (ADR-099)
- `SlotProp.defaultSlot` — durable marker set at generation time when a slot prop matched `specs.slots.default.match`, read by consumers with no dependency on `Conventions` (ADR-099)
- `PrimitiveEntry.match` — layer-name prefixes selecting a promotion entry, ahead of style scoring; longest prefix wins (ADR-100)
- `PrimitiveSlotContent` — reserved `anyOf` values naming a primitive a slot accepts: `$text` and `$glyph` (ADR-102)
- `SlotProp.anyOf` — carries `PrimitiveSlotContent` markers alongside component names, and only where the slot already names a component. Type and absence semantics unchanged (ADR-102)
- `Element.contentStyles` — typed as `ContentStyles`; how primitive content filling an element is formatted, recorded and layered per variant exactly as `styles` is (ADR-102)
- `ContentStyles`, `TextContentStyles`, `GlyphContentStyles` — a `$text`/`$glyph` map over two closed property sets: text takes colour, typography, alignment, overflow and line clamp; a glyph takes fill colour, width and height (ADR-102)
- `PlatformConventions.slotPrimitives` — the library's slots carry the primitives they accept in their default content; defaults to `true`, and required on `ResolvedPlatformConventions` (ADR-102)
- `ObjectProp` — a prop whose value is an object of named scalar members (ADR-111)
- `PropConfigurationValue` — accepts a member-keyed `ObjectPropValue` under an object-prop key (ADR-111)
- `InstanceExample.propConfigurations` — accepts `ObjectPropValue` for object props (ADR-111)
- `platforms.<platform>.objectProps` — opt-in folding of separator-named flat props into object props (ADR-111)
- `Scalar` — a string, number or boolean value. Excludes `null`, which means *unset* (ADR-080) wherever it appears beside a scalar
- `ComponentName` — the name of a component or component set, as written in this spec's `format.keys`
- `LayoutBranch` — a parent layout node, element name as key and ordered child `LayoutNode`s as value. `LayoutNode` is now written as `string | LayoutBranch`, the same structural type it already was
- `SlotContentMap` — named `SlotContent` entries, keyed by a name of letters, digits, underscore or hyphen
- `ElementRole` — a semantic behavior role concept, or a non-empty list of them
- `InstanceExampleConfigurationValue` — the value of one prop in an `InstanceExample`; a deliberate subset of `PropConfigurationValue` with no `PropBinding` and no `ImageBinding`
- `AnatomyElementExtensions` and `FigmaAnatomyElementExtension` are now exported from the package root. Both already existed as types; only the export is new

These six types name shapes TypeScript carried only inline. Every one of them is new. No existing type was renamed, and no existing declaration changed its structural type.

Their JSON Schema counterparts are named definitions arriving separately; until that lands, these six are the type side of a pairing whose schema side is still inline. Parity closes when both are in (`CONSTITUTION.md` §I, `SPECIFICATION.md` DSPEC-22).

### Changed

- `$extensions['com.figma'].name` — documented rule corrected on props, anatomy elements and `platforms.<platform>.naming`. The field was described as absent under `naming: NONE`; NONE declares no source convention, which means nothing can be re-derived from a key, not that no name is kept. The field is recorded wherever formatting changed the name (ADR-066). Description only — no type or validation change

### Migration

- `Settings.spec.format`, `Settings.spec.keys`, `Settings.spec.color`, `Settings.curation.preserveManualSelections`, `Settings.spec.collapsePrimitiveWrapper`: a workspace that sets the member explicitly is unaffected. One that left it unset now resolves to the new value — set it explicitly to keep the former output.
- `Settings.spec.keys` carries the largest cost: a spec regenerated with `CAMEL` renames every anatomy key, prop key and reference to one, and every name derived from a key. Treat it as a migration, or set `keys: SAFE`.

### ADRs

#### Accepted

- [ADR-111](../../adr/111-object-props.md) — Object-Typed Props
- [ADR-112](../../adr/112-scaffolded-defaults.md) — Settings defaults adopt their scaffolded values


## [0.38.0] - 2026-10-21

### Breaking

- `SpecApiDocument`, `SpecVariantsDocument`, `SpecExamplesDocument`, `SpecConcernDocument` renamed to `ComponentApiDocument`, `ComponentVariantsDocument`, `ComponentExamplesDocument`, `ComponentConcernDocument` (ADR-110)
- `SpecApiSubcomponent`, `SpecVariantsSubcomponent`, `SpecExamplesSubcomponent` renamed to `ComponentApiSubcomponent`, `ComponentVariantsSubcomponent`, `ComponentExamplesSubcomponent` (ADR-110)
- `schema/concern.schema.json` renamed to `schema/component-concern.schema.json`; the `./schema/concern` package export becomes `./schema/component-concern` (ADR-110)

### Added

- `CompositionApiDocument`, `CompositionVariantsDocument`, `CompositionExamplesDocument` — type a composition's `splitConcerns` files, each exact to what it carries (ADR-109)
- `CompositionConcernDocument` unions the three composition concern documents, reachable from `root.schema.json` (ADR-109)
- `Composition.images` and `CompositionExamplesDocument.images` register image data referenced by a composition's elements, matching `Component.images` (ADR-109 amendment)

### Migration

- `SpecApiDocument` → `ComponentApiDocument`, `SpecVariantsDocument` → `ComponentVariantsDocument`, `SpecExamplesDocument` → `ComponentExamplesDocument`, `SpecConcernDocument` → `ComponentConcernDocument`: update imports to the new names — no shape change.
- `SpecApiSubcomponent` → `ComponentApiSubcomponent`, `SpecVariantsSubcomponent` → `ComponentVariantsSubcomponent`, `SpecExamplesSubcomponent` → `ComponentExamplesSubcomponent`: update imports to the new names — no shape change.
- `./schema/concern` → `./schema/component-concern`: update any package export subpath resolution or direct reference to `schema/concern.schema.json`.

### ADRs

#### Accepted

- [ADR-109](../../adr/109-composition-concern-documents.md) — Composition Concern Documents
- [ADR-110](../../adr/110-component-concern-document-naming.md) — Rename `Spec*Document` to `Component*Document`


## [0.37.0] - 2026-10-20

**The schema's home is now the DirectedEdges/spectacular repository.** The repo that was DirectedEdges/specs was renamed alongside the plugin's rebrand to Spectacular. Nothing in the types or the JSON Schema changes — this release updates the package's repository link so npm points at the right home, and every old link keeps resolving through GitHub's rename redirect.

### Changed

- **The package's repository link points at `DirectedEdges/spectacular`**, the renamed home of the schema. Old `DirectedEdges/specs` links keep resolving via GitHub's redirect


## [0.36.0] - 2026-10-20

**An annotation survives a collapsed layer knowing which layer it came from.** When a wrapper is folded into the element it wraps, a role annotated on the wrapper used to be indistinguishable from one annotated on the element itself — so writing the spec back to Figma could put it on the wrong layer. A spec now records the two separately, and a round trip returns each annotation to the layer that carried it. Generated code is unaffected: it still reads only the element's own role.

### Added

- **`FigmaAnatomyElementExtension.childRole` records a role annotated on the layer wrapper collapse folded into an element**, so `role` keeps meaning the element itself was annotated and a round trip returns each annotation to its own layer. Only `role` reaches emitted code (ADR-104)


## [0.35.0] - 2026-10-14

**A library declares the slot its nested layouts fill through.** `SpecsConventions.slots.default.match` names it, `SlotProp.defaultSlot` marks the prop that matched, and `MetadataConventions.specs` records the conventions a run used — so a reader holding only a spec can resolve a nested instance's default slot (ADR-099).

**Conventions and settings grow two open surfaces.** `Conventions.storybook` is a concern-keyed map a new Storybook concern can join without a schema change, and `Settings.curation` states which components of a library a run specs (ADR-093, ADR-098).

**Glyph membership can be declared by structure rather than by name.** `PlatformConventions.glyphs.structure` derives it from child shapes and fill, which makes `glyphs.match` optional (ADR-103).

### Added

- **`Conventions.storybook` carries a workspace's Storybook settings**, typed as `StorybookConventions` — an open concern-keyed map loaded from `conventions/storybook.yaml`, also on `ResolvedConventions`. Adding a concern needs no change to the type or its schema (ADR-098)
- **`Settings.curation` states which components of a library a run specs**, with `defaultSelection` (`READY_FOR_DEV` or `ALL`), `preserveManualSelections` for whether hand edits outrank a changed Figma status, and `includeDependencies`. Every default matches today's behaviour (ADR-093)
- **`SpecsConventions.slots.default.match` names the patterns identifying a component's designated default slot**, authored in `conventions/specs.yaml`. It is a spec convention, not a platform one — what it names is a `SlotProp` the spec declares, so every platform reads the same answer (ADR-099)
- **`MetadataConventions.specs` records the spec conventions a run was performed under**, beside the one platform entry, for the reader that cannot re-derive them: a render resolving a nested instance's default slot does not hold that instance's own component spec (ADR-099)
- **`SlotProp.defaultSlot` marks a slot prop that matched `specs.slots.default.match`**, set at generation time and read by consumers with no dependency on `Conventions` (ADR-099)
- **`PrimitiveEntry.match` selects a promotion entry by layer-name prefix**, ahead of style scoring; the longest prefix wins (ADR-100)
- **`PlatformConventions.glyphs.structure` derives glyph membership from child structure and fill**, typed as `GlyphStructure`, naming the glyph from the main component's name (ADR-103)

### Changed

- **`PlatformConventions.glyphs.match` becomes optional**, and a declared `glyphs` block now requires at least one of `match` or `structure` (ADR-103)

### Migration

- `glyphs.match` → `glyphs.match` or `glyphs.structure`: existing declarations stay valid; code reading `glyphs.match` must handle its absence when only `structure` is declared

### ADRs

#### Accepted

- [ADR-093](../../adr/093-curation-settings.md) — Curation is a settings concern
- [ADR-094](../../adr/094-subcomponent-pattern-matching-rules.md) — Subcomponent Pattern Matching Rules
- [ADR-095](../../adr/095-compositions-in-the-scan-manifest.md) — Compositions Are Curated Like Components, From a Smaller Eligible Set
- [ADR-096](../../adr/096-specs-directory-layout.md) — The `specs/` Directory Names What Kind of Thing Each Folder Is
- [ADR-097](../../adr/097-composition-emission-and-presentation.md) — A Composition Emits One Story in Its Own Nav Group, and Only Under Pro
- [ADR-098](../../adr/098-storybook-conventions.md) — Storybook Conventions — `config/conventions/storybook.yaml`
- [ADR-099](../../adr/099-default-slot-naming-convention.md) — `slots.default.match` — Naming the Default Slot, and Flattened Instance Nesting
- [ADR-100](../../adr/100-primitive-layer-name-match.md) — `PrimitiveEntry.match` — Promoting a Layer by Its Name, Short-Circuiting Style Scoring
- [ADR-101](../../adr/101-workspace-stage-graph.md) — The Workspace Stage Graph
- [ADR-103](../../adr/103-glyph-structure.md) — Structural glyph membership — `glyphs.structure` convention


## [0.34.0] - 2026-09-23

**A component's disallowed prop combinations now live with its API.** `invalidPropCombinations` renames `invalidVariantCombinations` and travels in the api concern document, so the constraint sits beside the props it constrains rather than with variant data. The schema also now states plainly that an element carrying positioning offsets always declares `position: ABSOLUTE`, so a spec's placement reads on its own, without consulting the parent's layout mode.

### Changed

- **An element carrying positioning offsets always declares `position: ABSOLUTE`**, so its placement is readable without consulting the parent's layout mode. Documentation-only: the presence contract is stated on `position` and the six offset properties in the types and schema; no shape changes (ADR-070)
- **`Component.invalidPropCombinations` renames `invalidVariantCombinations`**, carried by the api concern document so disallowed combinations live beside the props they constrain (ADR-092)

### Migration

- `Component.invalidVariantCombinations` → `Component.invalidPropCombinations`: read the renamed key, and from `api.yaml` rather than `variants.yaml` in split-concern output; regenerate specs to migrate


## [0.33.0] - 2026-09-20

**A generation run states its facts once, in a document of its own.** The author, timestamp, generator, schema, conventions and settings were identical in every file a run produced; `RunMetadata` holds them now, and `Metadata` keeps only `source` (ADR-089).

**A spec can be written as three documents, one per concern.** `SpecApiDocument`, `SpecVariantsDocument` and `SpecExamplesDocument` each require what their concern carries and permit nothing else, so a file states which of the three it is and validates as that alone (ADR-091).

**A component records the image it was authored with.** `ImageProp.examples` gives a component that paints its own image somewhere to say so, which a binding site cannot do for it (ADR-088).

**Breaking**: six `Metadata` keys become optional. Read them from the run's `RunMetadata` document instead — see Migration below.

### Breaking

- **`Metadata` requires only `source`.** `author`, `lastUpdated`, `generator`, `schema`, `conventions` and `settings` become optional, because the run's document states them once for every file it produced (ADR-089)

### Added

- **`RunMetadata` states a generation run's facts as a document of its own**, validated by the new `schema/metadata` entry point and reachable from `root.schema.json` (ADR-089)
- **`SpecApiDocument`, `SpecVariantsDocument` and `SpecExamplesDocument` type the files a `splitConcerns` run writes**, each requiring what its concern carries and permitting nothing else, all three reachable from `root.schema.json` (ADR-091)
- **`SpecApiSubcomponent`, `SpecVariantsSubcomponent` and `SpecExamplesSubcomponent` carry a nested subcomponent's slice of each concern** (ADR-091)
- **`SpecConcernDocument` unions the three concern documents**, narrowed on a key (ADR-091)
- **`Metadata.concern` names which concern a document carries**, typed as `Concern` — `'api' | 'variants' | 'examples'` (ADR-091)
- **An image prop records the image its component was authored with** in `ImageProp.examples`, the same `ImageValue` shape as `ImageBinding.examples` and distinct from `default` (ADR-088)
- **A promoted container records its hoisted fill on `FigmaElementExtension.children`**, typed `SlotContentRef`, so restoring the frame needs no table lookup (ADR-090)

### Changed

- **A container's `PrimitiveRule.source` honours every closed-value layout member** (ADR-090)

### Migration

- `Metadata.author`, `Metadata.lastUpdated`, `Metadata.generator`, `Metadata.schema`, `Metadata.conventions`, `Metadata.settings`: guard each read — when absent, read the value from the run's `RunMetadata` document instead.

### ADRs

#### Accepted

- [ADR-088](../../adr/088-image-prop-examples.md) — Authoring-default images on `ImageProp`
- [ADR-089](../../adr/089-manifest-shared-metadata.md) — Run Metadata Factored Out of the Component Spec
- [ADR-090](../../adr/090-container-promotion-sources.md) — Container Promotion Sources Opened to Closed-Value Layout Properties
- [ADR-091](../../adr/091-concern-documents.md) — Each concern document is its own type

## [0.32.0] - 2026-09-12

**`Pipeline` is retired, and the config split is two parts rather than three.** A transformer pipeline stopped being a thing to configure once each target emitted everything it needs — nothing left to order, and `css` had no output location of its own to name. The other half, `analyses`, never had a reader: `specs analyze` has always taken its analyzers as arguments. `Pipeline`, `ResolvedPipeline`, `TransformEntry`, `AnalysisEntry`, `DEFAULT_PIPELINE` and the `./schema/pipeline` entry point are gone from the package's exports; the retirement itself leaves `Conventions` and `Settings` untouched (both change elsewhere in this release). See the amendment on ADR-071.

**Breaking**: a published type and one of the schema entry points are removed. Nothing outside the CLI consumed them.

**Conventions are keyed by platform, and the spec declares its own.** `conventions.figma` becomes one entry in a `platforms` map whose keys name implementations, and the conventions that describe the spec rather than any platform — the states classification and the prop conventions — move to a `specs` sibling.

**Composed example content can map to preferred components** by matching a primitive's style values with designated component props. Since designers build examples with raw layers, that layer can now become an instance in specs for what component it stood for. Opt-in.

### Breaking

These reshape types that `0.31.0` published. This branch was cut before `0.31.0` shipped, so what began as a free relocation inside an unreleased type became a break in a published shape once that release went out ahead of it.

- `Conventions` — the `figma` namespace becomes a platform-keyed `platforms` map; `figma` is one key among `react`, `web-components`, `swiftui`, and an absent key means that platform declares nothing (ADR-073)
- `states` — moves from the `figma` conventions to `Conventions.specs.states`; it names a prop and an enum value the spec declares, so a transform reading only the spec can apply it (ADR-073)
- `DEFAULT_CONVENTIONS` — now `{}`; every default it carried belongs inside a declared platform entry (ADR-073)
- Conventions are authored as one file per platform in `config/conventions/`, the filename carrying the platform id; there is no single-file form (ADR-078)
- `Metadata.conventions` — typed as `MetadataConventions`; carries exactly the platform that produced the spec (ADR-079)

### Added

- `PlatformConventions` — one shape per platform, carrying encoding and vocabulary members alike, and the root of a single `config/conventions/<id>.yaml` (ADR-073, ADR-078)
- `Conventions.specs` — conventions about the spec itself, a sibling of `platforms` and `primitives`: the `states` classification, the prop supplying an accessible name (`accessibility.label`), and the props describing a control's value (`value.prop`, with an optional `indeterminate` prop). Authored as `config/conventions/specs.yaml` (ADR-073)
- `PropReference` and `ValueConvention` — prop conventions are objects rather than bare names, so one can grow fields without a break (ADR-073)
- `Settings.spec.roles` — the role feature's on-switch: read Figma Dev Mode annotations and emit `anatomy.<element>.role`/`.actions`; `false` by default, so nothing is read or emitted unless a workspace opts in (ADR-067, amendment)
- `Settings.spec.roleValidation` — severity for unmet required role obligations, `'warn'` (default) or `'error'`; sits beside `roles` because it tunes the same feature (ADR-067)
- `AnatomyElement.role` and `RoleConceptName` — a behavior concept (or several) an element carries, read from `role:` annotation lines (ADR-067)
- `AnatomyElement.actions`, `ActionEntry` and `ActionConceptName` — behavior actions read from `action:` annotation lines, deduped in annotation order (ADR-087)
- `PrimitiveKind` — `'text' | 'glyph' | 'container'`, the subset of `ElementType` that can be promoted to a design system component (ADR-074)
- `Conventions.primitives` — component-keyed `PrimitiveEntry` values, each an `elementType` and a `map` of `PrimitiveRule`; platform-neutral output, authored as `config/conventions/figma.primitives.yaml` because its sources and token names describe the design tool (ADR-075, ADR-073)
- `PrimitiveRule` — a `source` read from a captured layer, sent to a `prop` as-is or through a literal `values` lookup writing one or more props (ADR-075)
- `PlatformConventions.stylesProp` — prop receiving styling no promotion mapped, one per platform and the only styling-prop level; there is no per-primitive override, because a promotion target is named by the spec rather than by a platform binding (ADR-076)
- `PlatformConventions.images.component` — the image component's name on a code platform, beside the `match` naming it in Figma (ADR-077)
- `MetadataConventions` — a spec records the one platform entry that produced it, not every platform the workspace configures (ADR-079)
- `PlatformConventions.defaultFillWidth` — container width for a root that resizes to fill its parent; fixed and hugging roots unaffected (ADR-081)
- `Element.$extensions` — `com.figma.promotedPrimitive`, `com.figma.multipleMatches`, `com.figma.content` and `com.figma.styles`, recording that a layer was promoted, whether more than one entry resolved, and the content and styles it consumed (ADR-084)
- `Settings.spec.promotePrimitives` — primitive layers in composed example content promote to design system component instances; opt-in, defaults to `false` (ADR-085)

### ADRs

#### Accepted

Every ADR this release implements is accepted — fourteen written on this branch,
plus ADR-072, drafted in 0.31.0 and accepted here.

- [ADR-067](../../adr/067-anatomy-element-roles.md) — Element Behavior Roles via `anatomy.role` (amended: `settings.spec.roles` is the on-switch)
- [ADR-068](../../adr/068-form-control-roles.md) — Form Control and Field Plumbing Role Concepts
- [ADR-072](../../adr/072-numeric-variant-enum.md) — Numeric Enum on NumberProp
- [ADR-073](../../adr/073-platform-conventions-namespace.md) — `conventions.platforms`, with Figma as One Platform Among Them
- [ADR-074](../../adr/074-emit-time-primitive-resolution.md) — Primitives Promote to Component Instances During Capture, in Composed Content
- [ADR-075](../../adr/075-primitive-style-prop-mapping.md) — `conventions.primitives` — a Declared Table from Styles to a Component's Props
- [ADR-076](../../adr/076-container-primitives-and-shared-styles.md) — Promoting a Container, and a Platform-Level `stylesProp`
- [ADR-077](../../adr/077-images-and-the-convention-boundary.md) — The Image Component's Code Name, and the Encoding / Vocabulary Boundary
- [ADR-078](../../adr/078-conventions-file-per-platform.md) — One Conventions File per Platform, in `config/conventions/`
- [ADR-079](../../adr/079-metadata-conventions-single-platform.md) — `metadata.conventions` Carries Only the Producing Platform
- [ADR-081](../../adr/081-default-fill-width.md) — `defaultFillWidth` — the Width a Fill-Width Root Fills
- [ADR-084](../../adr/084-element-figma-extensions.md) — `Element.$extensions` — Figma Provenance for a Promoted Element
- [ADR-085](../../adr/085-promote-primitives-setting.md) — `promotePrimitives` — the Switch for Capture-Time Promotion
- [ADR-086](../../adr/086-interactive-root-roles.md) — Interactive Root and Announcement Role Concepts
- [ADR-087](../../adr/087-behavior-actions.md) — Behavior Actions via `anatomy.action`

### Fixed

- A test verifies every exports-map entry resolves to a file this package ships, so a retired subpath cannot outlive what it pointed at

## [0.31.0] - 2026-09-04

Configuration now separates what is true about a Figma library from what a run chooses to do with it. A convention — a naming pattern, a state classification, where subcomponents live — is a fact every consumer of that library must share, and getting one wrong produces incorrect output. A setting is a free choice that produces different output. They were peers in one `Config`; they are now two published types, each addressable, each validated on its own, with the work a workspace runs declared separately again.

### Added

- `PropConfigurationValue` — a `null` arm; a configuration states a nullable prop is unset, and an absent key inherits while `null` overrides (ADR-080)
- `InstanceExample.propConfigurations` — accepts `null`, so an example can leave a prop unset; still refuses `PropBinding`
- `NumberProp.enum` — the closed set of values a numeric prop accepts, so a Figma VARIANT whose options are all numbers carries its numeric type and its authored option order at once (ADR-072)
- `Conventions` — facts about the Figma library, namespaced by source under `figma`; blocks are optional and their absence means the library declares no such convention
- `Settings` — run choices grouped by concern (`data`, `spec`, `assets`), each carrying its own `directory`
- `Pipeline` — `transformers` and `analyses` a workspace runs, with `AnalysisEntry` alongside `TransformEntry`
- `SourceEntry` — a source's Figma file `key` and the artifacts to `fetch`
- `DEFAULT_SETTINGS`, `DEFAULT_PIPELINE` and `DEFAULT_CONVENTIONS` — one defaults constant per configuration artifact. `DEFAULT_CONVENTIONS` carries only the three members that have a meaningful default; convention blocks are absent by design, because absence is the statement that a library declares none
- `conventions.schema.json`, `settings.schema.json`, `pipeline.schema.json` — one schema per authored artifact

### Changed

- `Settings.spec.collapsePrimitiveWrapper` — also collapses a root wrapping one slot, keeping the slot's value on shared keys (ADR-083)
- **`Settings.spec.splitComponents`, `splitConcerns` and `useSubfolders` now default to `true`** and are required on `ResolvedSettings`. The split layout — one folder per component, one file per concern — is what `transform`, `analyze` and `render` read, so the shape of generated output is not a per-consumer choice. They previously carried no default, leaving each consumer to pick its own; both consumers picked `false`, which is the layout nothing downstream can use. Recorded spec `metadata.settings.spec` now carries all three on every spec.

- `Metadata.config` → `Metadata.conventions` and `Metadata.settings` — each half comparable across specs on its own
- `Config.format.figmaKeys` → `Conventions.figma.naming` — no longer shares the word `keys` with the emitted casing
- `Config.processing.glyphNamePattern` → `Conventions.figma.glyphs.match`; `codeOnlyPropsPattern` → `codeOnlyProps.match`; `images.imageComponent` → `images.match`
- `Config.processing.states`, `subcomponents`, `instanceExamples`, `images`, `slotConstraints`, `inferNumberProps` → `Conventions.figma`, whole, including `scope` and `backgroundImage`
- `Config.format.output` → `Settings.spec.format`; the rest of `format` and all of `include` fold into `Settings.spec`
- Workspace-level `sources`, `dataDirectory`, `outputDirectory`, and the `output` block absorbed into `Settings`

### Removed

- `Config`, `ResolvedConfig`, and `DEFAULT_CONFIG` — replaced by the types above
- `workspace.schema.json` — one schema per artifact replaces it
- `Config.transformers` — work to run now lives in `Pipeline`

### Migration

- `Config` → `Conventions` + `Settings`: read library facts from `conventions`, run choices from `settings`. A member describes the library if a different team pointing at the same Figma file would have to keep your value.
- `DEFAULT_CONFIG` → `DEFAULT_SETTINGS`: conventions have no defaults to supply, so nothing replaces the conventions half.
- `Metadata.config` → `Metadata.conventions` / `Metadata.settings`: read whichever half you compared before, and prefer `conventions` when checking that two consumers agree about a library.



### ADRs

#### Accepted

- [ADR-071](../../adr/071-config-conventions-split.md) — Separate Library Conventions from Tooling Settings
- [ADR-080](../../adr/080-null-prop-configuration.md) — `null` as a Prop Configuration Value
- [ADR-083](../../adr/083-slot-wrapper-collapse.md) — Collapsing a Slot-Only Wrapper

#### New drafts

- [ADR-072](../../adr/072-numeric-variant-enum.md) — Numeric Enum on NumberProp

## [0.30.0] - 2026-08-17

A spec can now declare the naming convention its Figma file follows, so a formatted property key can be turned back into the name a designer sees on the canvas. When a key can't reconstruct that name on its own — because the original contained characters formatting doesn't survive — the spec records the Figma name alongside it, on every property type. Together these make round-tripping between a formatted spec and its source file possible without a side-channel lookup of the file's own naming.

### Added

- **A spec can state the naming convention its Figma file uses** — `Config.format.figmaKeys` (`NONE` | `SENTENCE` | `TITLE`, default `NONE`) names the convention to reverse `format.keys` back into. `NONE` declares no convention, so the safe key grammar, the divergence extension, and reversal are all opt-in (ADR-066)
- **Properties whose key can't reconstruct their Figma name now carry that name** — `FigmaPropExtension.name` is emitted only when the key alone is insufficient (ADR-066)
- **The key grammar that survives every formatting mode is now defined** — `SafeKeySentence` and `SafeKeyTitle` describe keys that round-trip under any `format.keys` value (ADR-066)
- **Number properties can now carry platform extensions** — `NumberProp.$extensions` was the one prop type with nowhere to record its Figma name; the JSON schema already permitted `$`-prefixed keys, the TypeScript type did not

### Changed

- **The Figma layer-name extension now covers key divergence, not just wrapper collapse** — `FigmaAnatomyElementExtension.name`, renamed from `originalName` (ADR-066)
- **The clip flag now reads as a verb, matching the rest of the style vocabulary** — `Styles.clipsContent`, renamed from `clipContent`; type and token-bindability unchanged (ADR-069)

### Migration

`Styles.clipContent` → `Styles.clipsContent`: read `clipsContent` instead; the value shape is unchanged. No stored spec carries the old key — it never matched emitted output.

`FigmaAnatomyElementExtension.originalName` → `FigmaAnatomyElementExtension.name`: read `$extensions['com.figma'].name` instead; the value and its collapse-provenance meaning are unchanged. Consumers that read the extension through an inline structural type will not see a compile error — update those call sites explicitly.


## [0.29.0] - 2026-08-07

Numeric properties can now be marked nullable, matching the flexibility already available on strings, slots, and images. Horizontal text alignment now uses logical inline-axis direction (`START`/`END`) instead of physical `LEFT`/`RIGHT`, so specs read correctly regardless of writing direction.

### Added

- **Numeric properties can now be optional** — `NumberProp.nullable`, previously unexpressible, lets a numeric prop be absent (ADR-065)

### Changed

- **Nullable behavior is now documented for every prop type** — absence defaults to `true` for `StringProp`, `NumberProp`, `SlotProp`, `ImageProp`; `false` for `EnumProp` (ADR-065)
- **Horizontal text alignment now reads as logical direction, not physical side** — `Styles.textAlignHorizontal` narrows from `Style` to `TextAlignHorizontal` (`'START' | 'CENTER' | 'END' | 'JUSTIFY'`) or `null` (ADR-064)

### Migration

- `Styles.textAlignHorizontal` values `LEFT`/`RIGHT`/`JUSTIFIED` → `START`/`END`/`JUSTIFY`: read the logical enum; resolve `START`/`END` by writing direction and regenerate any stored specs


## [0.28.0] - 2026-07-16

Specs can now describe images. A container's image fill is captured as a typed background image, image-source properties become a first-class prop type, and every image a component references is collected in a single registry — resolved to a data URI, URL, or asset path when available. Text truncation is also now expressible: specs record how overflowing text is handled and the line limit at which truncation begins.

### Added

- **Text overflow handling is now captured** — `Styles.textOverflow`, typed as `TextOverflow` (`'CLIP' | 'ELLIPSIS'`) or `null`, records how overflowing text is handled (TEXT only, not token-bindable). Named after CSS `text-overflow` / Compose `TextOverflow`
- **Line limits are now captured** — `Styles.maxLines` records the maximum line count before `'ELLIPSIS'` text overflow applies; null for no limit (TEXT only)
- **Container image fills are first-class styles** — `Styles.backgroundImage`, typed as `ImageValue` (`{ $image, objectFit?: 'COVER' | 'CONTAIN' }`), a `TokenReference` with `$type: 'image'` (an applied Figma fill style whose paint is an image routes its style reference here, not to `backgroundColor`; `image` joins the `$type` set as a Specs extension), or `null` (ADR-063)
- **Every image a component references is collected in one registry** — `Component.images` maps ids to `ImageData`: resolved data (`data:` URI, URL, asset path) or a `figma:<imageRef>` placeholder
- **Image-source properties are a first-class prop type** — `ImageProp` (`type: 'image'`) joins `AnyProp` for properties that supply an image source
- **Images can be forwarded into nested instances** — `ImageBinding` (`{ $binding, examples? }`) joins `PropConfigurationValue`, routing an image prop into a subcomponent instance
- **Image processing is opt-in via config** — `Config.processing.images` (ADR-063); presence is the on-switch, like `subcomponents`. Independent triggers: `backgroundImage` (detect image fills; the fallback when a component is designated), `imageComponent` (designated component name; requires `sourceProps`), and `sourceProps` (raw Figma code-only prop names that re-type to `ImageProp`; the first entry is the designated component's own source prop)

### Fixed

- **Color token references no longer fail validation on their resolved raw value** — the `rawValue` provenance field on a token reference now accepts a DTCG Color object (the shape the generator emits for color tokens) alongside string, number, and boolean, clearing false schema violations on token-bound fills and gradient stops.
- **Subcomponent source identity no longer fails validation** — subcomponent entries carrying the ADR-060 `source` field (pageId/nodeId/nodeType) were rejected because the closed Component definition composed via allOf could not admit it; the property is now declared where draft-07 requires it.
- **Collapsed-root anatomy provenance no longer fails validation** — anatomy elements now accept `$extensions['com.figma'].originalName` (written by primitive-wrapper collapse, ADR-058) in both the JSON schema and the `AnatomyElement` type.
- **Nested-path configurations now enforce a non-empty path** — the schema declared the constraint with a misspelled keyword (`minChildren` instead of `minItems`), so validators silently skipped it; an empty `path` on a `$nested` entry is now rejected as ADR-052 intends.


## [0.27.0] - 2026-07-01

Dashed strokes are now first-class, typed data instead of falling through as an unrecognized style, and subcomponents carry enough Figma node identity for reverse-direction tools to resolve them back to a canvas location without a side-channel lookup.

### Added

- **Dashed strokes are typed and preserved in output** — `Styles.strokeDashPattern` is typed as `StrokeDashPattern` (`{ dash: number; gap: number }`) or `null`; presence signals a dashed stroke, null or absent signals solid. Maps from Figma `strokeDashes[0]` (dash) and `strokeDashes[1]` (gap).
- **Subcomponents carry their Figma source identity** — `Subcomponent.source` is an optional `SubcomponentSource` (`{ pageId, nodeId, nodeType }`) enabling reverse-direction tools to resolve `SubcomponentRef` entries back to Figma nodes without side-channels.


## [0.26.0] - 2026-06-22

Specs can now skip redundant wrapper frames around a lone text or glyph child. When `Config.processing.collapsePrimitiveWrapper` is enabled, a plain container holding a single text or icon leaf is collapsed away, promoting the leaf directly to spec root. This produces cleaner specs for simple label or icon components that Figma wraps in an auto-layout frame purely for sizing.

### Added

- **Single-child container frames can be collapsed out of specs** — `Config.processing.collapsePrimitiveWrapper` (boolean, default `false`) strips a plain wrapper frame around a lone text or glyph child and promotes the leaf to spec root (ADR-058). Useful for label-only or icon-only components where the Figma auto-layout frame adds structural noise without semantic meaning.


## [0.25.0] - 2026-06-15

`SlotProp.minItems`/`maxItems` are renamed to `minChildren`/`maxChildren`, aligning the schema vocabulary with Figma's native `slotSettings` API and with the universal "children" term across React, SwiftUI, and Jetpack Compose. Libraries using Figma's native slot settings can now read constraint values without a translation layer. This release also corrects `Metadata.generator.version` from `number` to `string`, fixing a type mismatch for TypeScript consumers.

### Changed

- **Slot child constraints use framework-native naming** — `SlotProp.minItems` and `maxItems` renamed to `minChildren` and `maxChildren` (ADR-056). Aligns with Figma’s `slotSettings.minChildren`/`maxChildren` and the “children” vocabulary used by React, SwiftUI, and Jetpack Compose. specs-from-figma can now read native `slotSettings` values directly without field translation.
- **Generator version is now correctly typed as a string** — `Metadata.generator.version` corrected from `number` to `string`; the field holds a semver string (e.g. `"1.10.0"`)

### Migration

- `SlotProp.minItems` → `minChildren`, `SlotProp.maxItems` → `maxChildren`: rename field access in any code reading these fields; schema validation will catch mismatches at generate time. Libraries using code-only props must also rename `{slot} minItems`/`{slot} maxItems` to `{slot} minChildren`/`{slot} maxChildren` in Figma.
- `Metadata.generator.version`: update any code that treated this field as a number; read it as a string instead

## [0.24.0] - 2026-06-05

Introduces the transformer pipeline's schema foundation. `Config.transformers` (a flat `TransformEntry[]`) replaces the old two-level `config.transform.transformers` wrapper, and a new `workspace.schema.json` provides IDE validation for `specs.config.yaml`. `Config.processing.states` adds a concept-keyed map that classifies Figma variant props as browser-driven or consumer-controlled states, enabling the `css` transformer to emit semantic CSS selectors and the `contract` transformer to omit browser-driven props from Props interfaces.

### Added

- **`TransformEntry` type (ADR-053)** — `{ name: string; [option: string]: unknown }`. Describes a single transformer entry in `config.transformers`. Transformer-specific options sit inline alongside `name`.

- **`workspace.schema.json` (ADR-054)** — New top-level JSON schema file for the workspace config file (`specs.config.yaml`). Defines the full workspace shape including `dataDirectory`, `outputDirectory`, `sources`, `output`, `author`, and the `config` block (which embeds the component `Config` schema). `Config.transformers` is defined here rather than in the component schema, keeping transform configuration CLI-only and out of the per-component spec.

- **`Config.transformers` — `TransformEntry[]` directly on `Config`** — Replaces the two-level `config.transform.transformers` shape. The wrapper object is gone; `config.transformers` is the array. Absence means CLI defaults apply.

- **`VariantStateEntry` type (ADR-055)** — classifies a Figma variant prop as a semantic state concept; fields: `prop` (string, required), `value` (string, optional — the Figma enum value activating the concept; defaults to `"true"` for boolean props), `contract` (`'omit'` | `'keep'`, optional — overrides the concept's canonical default)
- **`Config.processing.states` — `Record<string, VariantStateEntry>`** — concept-keyed map (key = concept name, e.g. `hover`, `disabled`); classifies variant props for deterministic use by CSS and contract transformers; absence means all props emit as `data-*` attribute selectors and all props are retained in contracts

### Changed

- **`Config.transform` removed; replaced by `Config.transformers`** — The intermediate `TransformConfig` wrapper object is eliminated. `transform.transformers` collapses to `transformers` directly on `Config`/`ResolvedConfig`.

### Removed


## [0.23.0] - never published (shipped in 0.24.0)

### Added

### Changed

### Removed


## [0.22.0] - 2026-05-23

Introduces the composition and slot-content model across ADRs 042, 046–052. `Composition` is a named registry entry with a top-level `anatomy + elements + layout` triplet and an optional `slotContent` map of bundled `SlotContent` fills. `SlotContentRef` (`{ $slotContent }`) is the universal pointer for all slot fills — component-scoped examples, intra-composition bundled fills, and cross-composition references all resolve to `anatomy + elements + layout`. `PropConfigurations` widens to accept `PropBinding` and `SlotContentRef`; `InstanceExample.propConfigurations` widens to accept `SlotContentRef` (not `PropBinding`). `Children` widens to `SlotBinding` for slot-bound containers. `Config` gains the examples-detection settings and output gates (ADR-050).

### Added

- `SlotContent` — `{ anatomy, elements, layout }`; the anonymous structural triplet used as a named slot fill. Carries no metadata; identity lives at the key where it is stored (ADR-046)
- `Composition` — `{ title?, description?, anatomy, elements, layout, slotContent?: Record<string, SlotContent> }`; a named registry entry whose top-level triplet is the primary content. Optional `slotContent` bundles named fills alongside it for authoring convenience (ADR-042, ADR-046)
- `Compositions` — `Record<string, Composition>`; registry alias for external composition files
- `SlotContentRef` — `{ $slotContent: string }`; universal JSON Pointer reference for slot fills. Resolves to a `Composition` entry (top-level triplet), a `Composition.slotContent` entry, or a `Component.slotContentExamples` entry — all yield `anatomy + elements + layout` (ADR-046)
- `Component.slotContentExamples` — `Record<string, SlotContent>`; named slot-content examples per component, referenceable by `SlotContentRef` from `SlotBinding.examples` and from `Element.propConfigurations` slot-prop entries. `specs-from-figma` de-duplicates entries by structural equality across variants and slots (ADR-047)
- `SlotBinding` — extends `PropBinding` with optional `examples?: SlotContentRef[]`; used in `Element.children` for slot-bound containers. Each `examples[i]` points to a slot-content entry; emitters currently write a single entry at index 0 — Figma's authoring default for the slot layer. Non-contractual reference material; code consumers handle missing slots through component logic and ignore it (ADR-047)
- `Component.instanceExamples` — typed as `InstanceExamples` (`Record<string, InstanceExample>`); named documented usages per component (ADR-048)
- `InstanceExample` — `{ title?, propConfigurations?: Record<string, string | number | boolean | SlotContentRef> }`; scalar props set directly, slot props filled via `SlotContentRef`. `PropBinding` not accepted — documented configurations are not live bindings (ADR-048)
- `Config.processing.instanceExamples` — `{ scope?: 'PAGE' | 'FILE', match?: string[], exclude?: string[], parentNames?: string[] }`; instance-example detection settings, mirroring `processing.subcomponents`. `scope` is `PAGE | FILE` (`NESTED` is inapplicable); `match` is an **optional** secondary name filter (the primary relevance test is structural identity — the candidate is an instance of the component being generated — so absence accepts every in-scope instance, subject to `exclude`/`parentNames`); `parentNames` filters candidates by immediate-parent frame/section name. Absence of the block is the off-switch — its **presence** enables both detection and output (no separate include flag), like `processing.subcomponents`. Pro-gated. Added to `ResolvedConfig` (with `scope` required, `match` optional) (ADR-050)
- `Config.include.defaultSlotContent` — `boolean` output gate, default `false`; added to `ResolvedConfig` (required) and `DEFAULT_CONFIG`. Pro-gated — ignored on the free tier (ADR-050)
- `Config.format.tokens` — adds `FIGMA_SYNTAX_WEB`, `FIGMA_SYNTAX_IOS`, `FIGMA_SYNTAX_ANDROID` profiles emitting per-platform Figma code syntax, falling back to `TOKEN` (ADR-051)

### Changed

- `Children` — widened from `string[] | PropBinding` to `string[] | SlotBinding`; existing `{ $binding }` values still validate because `SlotBinding` is a structural superset of `PropBinding` (ADR-047)
- `PropConfigurations` — value union widened from `string | number | boolean` to `string | number | boolean | PropBinding | SlotContentRef`; enables scalar prop pass-through (`PropBinding`) and slot-prop fills (`SlotContentRef`). `InstanceExample.propConfigurations` widens separately and does not accept `PropBinding` (ADR-049)
- `PropConfigurations.$nested` — added reserved key typed as `NestedPropConfiguration[]` (`{ path: string[] }` plus the prop-config payload, keyed value `PropConfigurationValue`); path-addressed configurations of nested descendant instances, where `path` is a list of `instanceOf` element keys to the configured descendant and the terminal instance owns the filled slot/prop. Deep slot fills reuse `SlotContentRef` — no new payload, no `Element` change. `InstanceExample.propConfigurations` does not gain `$nested` (ADR-052)

### Removed


## [0.21.0] - 2026-05-22

Extends `Config.format.tokens` with per-platform Figma code syntax profiles. The new `FIGMA_SYNTAX_WEB`, `FIGMA_SYNTAX_IOS`, and `FIGMA_SYNTAX_ANDROID` options emit the platform-specific code syntax authored on Figma variables, falling back to the resolved `TOKEN` reference when no syntax is defined.

### Added

- `Config.format.tokens` — adds `FIGMA_SYNTAX_WEB`, `FIGMA_SYNTAX_IOS`, `FIGMA_SYNTAX_ANDROID` profiles emitting per-platform Figma code syntax, falling back to `TOKEN`


## [0.20.0] - 2026-05-06

Adds configurable color output format (`Config.format.color`) supporting nine format options from hex strings to structured DTCG Color objects. Renames `ColorValue` to `ColorObject` for specificity and widens `ColorStyle`, `Shadow.color`, and `GradientStop.color` to accept formatted color strings alongside structured objects and token references.

### Added

- `Config.format.color` — typed as `ColorFormat` (`'HEX' | 'HEXA' | 'RGB' | 'RGBA' | 'HSLA' | 'HSB' | 'OKLCH' | 'OKLAB' | 'OBJECT'`); controls color value output format; defaults to `HEX`

### Changed

- `ColorObject` — renamed from `ColorValue` for specificity; the type represents a DTCG Color §4.1 structured object, not a generic "color value"
- `ColorStyle` — widened to `string | ColorObject | TokenReference | GradientValue | null`; the `string` arm supports formatted color strings when `Config.format.color` is non-`OBJECT`
- `Shadow.color` — widened to `string | ColorObject | TokenReference`; same `string` arm rationale as `ColorStyle`
- `GradientStop.color` — widened to `string | ColorObject | TokenReference`; same `string` arm rationale as `ColorStyle`


## [0.19.0] - 2026-04-28

Replaces Figma-raw `x`, `y`, and `layoutPositioning` with constraint-based positioning properties. `position` replaces `layoutPositioning` as a strict `Position` enum. Directional offsets (`top`, `bottom`, `start`, `end`, `centerHorizontalOffset`, `centerVerticalOffset`) replace `x`/`y` with anchor semantics derived from Figma constraints. See the [Layout Positioning guide](/guides/layout-positioning/) for constraint mapping rules and platform usage examples.

### Added

- `Styles.position` — typed as `Position` (`'AUTO' | 'ABSOLUTE'`) or `null`; structural property, not token-bindable (replaces `layoutPositioning`)
- `Styles.top` — typed as `PositionOffset` (`number | string | null`); block-start offset from vertical MIN, STRETCH, or SCALE constraint
- `Styles.bottom` — typed as `PositionOffset`; block-end offset from vertical MAX or STRETCH constraint
- `Styles.start` — typed as `PositionOffset`; inline-start offset from horizontal MIN, STRETCH, or SCALE constraint
- `Styles.end` — typed as `PositionOffset`; inline-end offset from horizontal MAX or STRETCH constraint
- `Styles.centerHorizontalOffset` — typed as `PositionOffset`; horizontal offset from center (CENTER constraint)
- `Styles.centerVerticalOffset` — typed as `PositionOffset`; vertical offset from center (CENTER constraint)

### Removed

- `Styles.x` — replaced by `Styles.start`, `Styles.end`, or `Styles.centerHorizontalOffset` depending on constraint
- `Styles.y` — replaced by `Styles.top`, `Styles.bottom`, or `Styles.centerVerticalOffset` depending on constraint
- `Styles.layoutPositioning` — replaced by `Styles.position`

### Migration

- `Styles.x` → `Styles.start` / `Styles.end` / `Styles.centerHorizontalOffset`: determine which property to read based on the node's horizontal constraint; SCALE values are percentage strings (e.g. `"25%"`)
- `Styles.y` → `Styles.top` / `Styles.bottom` / `Styles.centerVerticalOffset`: same constraint-based mapping for the vertical axis
- `Styles.layoutPositioning` → `Styles.position`: rename and narrow type — replace generic `Style` handling with exhaustive match on `'AUTO' | 'ABSOLUTE'`


## [0.18.0] - 2026-04-24

Replaces Figma-native layout property names with semantic equivalents for auto-layout alignment and wrapping. Introduces a bi-axial `itemSpacing` model that consolidates `counterAxisSpacing` into a single property, and narrows `layoutMode` from a generic `Style` to a strict enum. Five renamed alignment/wrap fields use plain-language names (`mainAxisAlignment`, `crossAxisAlignment`, `wrapAlignment`, `wrap`) instead of Figma axis terminology. The documentation site was considerably rearchitected with updated content and navigation.

### Added

- `Styles.itemSpacing` — widened from `Style` to `Style | ItemSpacing` (scalar when uniform, `ItemSpacing` object with `horizontal`/`vertical` when axes differ)
- `Styles.wrap` — boolean toggle for auto-layout wrapping (replaces `layoutWrap`)
- `Styles.wrapAlignment` — typed as `WrapAlignment` (`'START' | 'SPACE_BETWEEN'`) or `null`; structural property, not token-bindable (replaces `counterAxisAlignContent`)
- `Styles.mainAxisAlignment` — typed as `MainAxisAlignment` (`'START' | 'END' | 'CENTER' | 'SPACE_BETWEEN'`) or `null`; structural property, not token-bindable (replaces `primaryAxisAlignItems`)
- `Styles.crossAxisAlignment` — typed as `CrossAxisAlignment` (`'START' | 'END' | 'CENTER' | 'STRETCH' | 'BASELINE'`) or `null`; structural property, not token-bindable (replaces `counterAxisAlignItems`)

### Changed

- `Styles.layoutMode` — narrowed from `Style` to `LayoutMode` (`'NONE' | 'HORIZONTAL' | 'VERTICAL'`) or `null`; enum constraint, no TokenReference

### Removed

- `Styles.counterAxisSpacing` — consolidated into `Styles.itemSpacing` bi-axial model
- `Styles.layoutWrap` — replaced by `Styles.wrap`
- `Styles.counterAxisAlignContent` — replaced by `Styles.wrapAlignment`
- `Styles.primaryAxisAlignItems` — replaced by `Styles.mainAxisAlignment`
- `Styles.counterAxisAlignItems` — replaced by `Styles.crossAxisAlignment`

### Migration

- `Styles.counterAxisSpacing` → `Styles.itemSpacing.vertical`: read the `vertical` sub-field of the `ItemSpacing` object when axes differ; scalar `itemSpacing` applies uniformly
- `Styles.layoutMode` → `LayoutMode | null`: replace generic `Style` handling with exhaustive match on `'NONE' | 'HORIZONTAL' | 'VERTICAL'`
- `Styles.layoutWrap` → `Styles.wrap`: rename only; same boolean semantics
- `Styles.counterAxisAlignContent` → `Styles.wrapAlignment`: rename and remap values — `'AUTO'` → `'START'`, `'SPACE_BETWEEN'` → `'SPACE_BETWEEN'`
- `Styles.primaryAxisAlignItems` → `Styles.mainAxisAlignment`: rename and narrow type — replace generic `Style` handling with exhaustive match on `'START' | 'END' | 'CENTER' | 'SPACE_BETWEEN'`; remap Figma values `'MIN'` → `'START'`, `'MAX'` → `'END'`
- `Styles.counterAxisAlignItems` → `Styles.crossAxisAlignment`: rename and narrow type — replace generic `Style` handling with exhaustive match on `'START' | 'END' | 'CENTER' | 'STRETCH' | 'BASELINE'`; remap Figma values `'MIN'` → `'START'`, `'MAX'` → `'END'`


## [0.17.0] - 2026-04-13

Introduces `ResolvedConfig` as the fully-resolved counterpart to `Config`, where every property with a default is guaranteed present. `Config` properties with defaults are now optional, making input configs more tolerant of omissions. Removes the unused `Variant.name` and `Variant.baseline` fields.

### Added

- `ResolvedConfig` — fully-resolved config type where every property with a default is required; only true feature toggles (`subcomponents`, `glyphNamePattern`, `codeOnlyPropsPattern`) remain optional

### Changed

- `Config` — all properties with defaults are now optional (input type tolerant of omissions):
  - `processing.variantDepth` — optional; defaults to 9999
  - `processing.details` — optional; defaults to LAYERED
  - `format.output` — optional; defaults to JSON
  - `format.keys` — optional; defaults to SAFE
  - `format.layout` — optional; defaults to LAYOUT
- `ResolvedConfig` — all properties with defaults are required (post-merge guarantee):
  - `processing.slotConstraints` — required (default `false`)
  - `processing.inferNumberProps` — required (default `false`)
  - `format.tokens` — required (default `TOKEN`)
  - `include.invalidVariants` — required (default `false`)
  - `include.invalidCombinations` — required (default `true`)
  - `include.emptyVariants` — required (default `false`)
  - `subcomponents.scope` — required when subcomponents is present (default `NESTED`)
- `DEFAULT_CONFIG` — typed as `ResolvedConfig`; now explicitly includes `slotConstraints: false`, `inferNumberProps: false`; removed `subcomponents` (feature toggle — off by default, matching the Figma plugin)

### Removed

- `Variant.name` — unused optional label; variant identity is fully described by `configuration`
- `Variant.baseline` — never populated in output; baseline determination is an internal processing concern

### Migration

- `Variant.name` → removed: delete any references; use `Variant.configuration` to identify variants
- `Variant.baseline` → removed: delete any references; no replacement needed (field was never populated)


## [0.16.0] - 2026-04-05

Adds `Config.include.emptyVariants` for controlling inclusion of layered variants with no elements. Makes `invalidVariants` and `invalidCombinations` optional with sensible defaults, and removes the unused `variantNames` field.

### Added

- `Config.include.emptyVariants` — optional boolean to control inclusion of layered variants that contain no elements; defaults to false

### Changed

- `Config.include.invalidVariants` — now optional; defaults to false when absent
- `Config.include.invalidCombinations` — now optional; defaults to true when absent

### Removed

- `Config.include.variantNames` — unused field removed from the API

### Migration

- `Config.include.variantNames` → removed: delete any references to this field from config construction code; regenerate cached specs to remove the field from serialized output


## [0.15.0] - 2026-03-25

Adds structured subcomponent discovery via a new `Config.processing.subcomponents` object with `scope`, `match`, and `exclude` settings, replacing the flat `subcomponentNamePattern` string. Introduces `SubcomponentRef` for referencing subcomponent definitions and widens `instanceOf` on both `AnatomyElement` and `Element` to accept it. Corrects `Typography` field types for `leadingTrim`, `fontFamily`, and `fontStyle` to match actual Figma API values.

### Added

- `SubcomponentRef` — reference to a subcomponent definition via `{ $ref: "#/subcomponents/{key}" }`
- `AnatomyElement.instanceOf` — widened to accept `string | SubcomponentRef`
- `Element.instanceOf` — widened to accept `string | PropBinding | SubcomponentRef`
- `Config.processing.subcomponents` — optional nested object grouping subcomponent discovery settings: `scope`, `match`, and `exclude`. Absence means no subcomponent detection
- `Config.processing.subcomponents.scope` — optional enum (`NESTED` | `PAGE`) controlling where the transformer searches for subcomponents
- `Config.processing.subcomponents.match` — required array of `{C}`/`{S}` template patterns defining which assets are subcomponents
- `Config.processing.subcomponents.exclude` — optional array of `{C}`/`{S}` template patterns defining which matched assets to exclude

### Changed

- `Typography.leadingTrim` — corrected from `number | 'mixed' | TokenReference` to `'NONE' | 'CAP_HEIGHT' | 'mixed'` per Figma API
- `Typography.fontFamily` — corrected from `string | number | 'mixed'` to `string | 'mixed' | TokenReference`; removed impossible `number`, added `TokenReference` for variable-bound fonts
- `Typography.fontStyle` — corrected from `string | number | 'mixed'` to `string | 'mixed' | TokenReference`; removed impossible `number`, added `TokenReference` for variable-bound fonts

### Removed

- `Config.processing.subcomponentNamePattern` — replaced by `Config.processing.subcomponents.match`
- `Config.include.subcomponents` — subcomponent inclusion is now implied by the presence of `match` patterns

### Migration

- `Config.processing.subcomponentNamePattern` → `Config.processing.subcomponents.match`: wrap the single pattern string in a one-element array
- `Config.include.subcomponents` → removed: remove the field; subcomponents are included when `processing.subcomponents` is defined with `match` patterns. Omit `processing.subcomponents` entirely to disable detection


## [0.14.0] - 2026-03-18

Introduces code-only props support with `FigmaCodeOnlySource` provenance metadata and a configurable container-layer naming pattern, plus a new `NumberProp` type for numeric property values. Adds DTCG-aligned `$extensions` for platform-specific metadata across all prop types, replacing the prior `x-platform` convention on `BooleanProp`. Expands `SlotProp` with `minItems`, `maxItems`, and `anyOf` constraints consolidatable via the new `slotConstraints` processing flag.

### Added

- `FigmaCodeOnlySource` — provenance metadata for props extracted from a Figma code-only container layer (`kind`, `layer`, `instanceOf?`)
- `FigmaPropExtension.source` — optional `FigmaCodeOnlySource` on the Figma extension, present only for code-only props
- `Config.processing.codeOnlyPropsPattern` — optional naming pattern for detecting the code-only props container layer
- `Config.processing.inferNumberProps` — opt-in flag to infer `NumberProp` from TEXT code-only props
- `NumberProp` — numeric property type for number-valued component props
- `AnyProp` — `NumberProp` added as a fifth union member (`type: 'number'`)
- `FigmaPropExtension` — Figma-specific metadata for prop definitions (native prop type)
- `PropExtensions` — DTCG §5.2.3 platform-specific extensions container, keyed by reverse-domain notation
- `BooleanProp.$extensions` — optional platform metadata on boolean props
- `StringProp.$extensions` — optional platform metadata on string props
- `EnumProp.$extensions` — optional platform metadata on enum props
- `SlotProp.$extensions` — optional platform metadata on slot props
- `SlotProp.minItems` — minimum number of items the slot accepts
- `SlotProp.maxItems` — maximum number of items the slot accepts
- `SlotProp.anyOf` — component type names permitted in the slot
- `Config.processing.slotConstraints` — opt-in flag to consolidate slot constraint code-only props into slot properties

### Changed

- `BooleanProp` — `x-platform` replaced by `$extensions` to align with DTCG convention used on `TokenReference`


## [0.13.0] - 2026-03-13

### Added

- `Metadata.schema.latest` — optional stable URL pointing to the latest schema on main for discovery
- `Metadata.generator.license` — optional resolved license state: `status` and `level` nested inside generator
- `Styles.fillColor` — glyph fill color for GLYPH element type
- `StringProp.examples` — sample values demonstrating typical content for string props
- `Element.content` — unified content for text strings and glyph names
- `SlotProp.nullable` — optional flag indicating the slot prop accepts null
- `Conditional` — conditional binding with `if`/`condition`/`then`/`else` for derived values
- `ConditionExpression` — declarative condition pairing an `operation` (string) with `args`
- `ConditionArgs` — condition arguments: `value` (PropBinding) and optional `compareTo`

### Changed

- `SlotProp.default` — now optional; omitted when no meaningful default exists
- `ColorStyleValue` — accepts bare hex strings (e.g. `#666E74`) matching the existing `ColorStyle` type
- `BooleanProp`, `StringProp`, `EnumProp`, `SlotProp` — allow `$`-prefixed metadata fields via `patternProperties`
- `Metadata.schema.url` — clarified as versioned schema URL pinned to a git tag
- `ElementType` — `'icon'` renamed to `'glyph'` to distinguish raw visual assets from composed Icon components
- `Config.processing.iconNamePattern` → `Config.processing.glyphNamePattern` — glyph detection pattern
- `StringProp.default` — now optional; use `examples` for demo content
- `StringProp.default` — widened to `string | null` for nullable props
- `SlotProp.default` — widened to `string | null` for nullable slot props
- `BindingKey` — `'text'` replaced by `'content'`

### Removed

- `TextProp` — merged into `StringProp`
- `IconProp` — merged into `StringProp`
- `Element.text` — use `Element.content` instead

### Migration

- `TextProp` / `IconProp` → `StringProp`: replace all type imports and references with `StringProp`; the shape is identical
- `Element.text` → `Element.content`: read element content from `content` instead of `text`; applies to both text strings and glyph names
- `ElementType` `'icon'` → `'glyph'`: update all references to the `'icon'` literal in element type checks
- `Config.processing.iconNamePattern` → `Config.processing.glyphNamePattern`: update config objects and any code referencing this field

## [0.12.0] - 2026-03-05

### Added

- `ElementTypeRef` — reference to an external element type definition via `$ref` URI
- `Config.processing.iconNamePattern` — optional naming pattern for detecting icon content assets
- `Sides` — per-side composite object with logical directions: `top`, `end`, `bottom`, `start`
- `Corners` — per-corner composite object with logical directions: `topStart`, `topEnd`, `bottomEnd`, `bottomStart`
- `Styles.padding` — scalar when uniform, `Sides` object when per-side values differ

### Changed

- `AnatomyElement.type` — widened from `string` to `string | ElementTypeRef`
- `Styles.strokeWeight` — accepts `Style | Sides` instead of `Style`; scalar when uniform, `Sides` object when per-side values differ
- `Styles.cornerRadius` — accepts `Style | Corners` instead of `Style`; scalar when uniform, `Corners` object when per-corner values differ

### Removed

- `Styles.paddingLeft` — use `Styles.padding` with `Sides.start` instead
- `Styles.paddingRight` — use `Styles.padding` with `Sides.end` instead
- `Styles.paddingTop` — use `Styles.padding` with `Sides.top` instead
- `Styles.paddingBottom` — use `Styles.padding` with `Sides.bottom` instead
- `Styles.strokeTopWeight` — use `Styles.strokeWeight` with `Sides.top` instead
- `Styles.strokeBottomWeight` — use `Styles.strokeWeight` with `Sides.bottom` instead
- `Styles.strokeLeftWeight` — use `Styles.strokeWeight` with `Sides.start` instead
- `Styles.strokeRightWeight` — use `Styles.strokeWeight` with `Sides.end` instead
- `Styles.topLeftRadius` — use `Styles.cornerRadius` with `Corners.topStart` instead
- `Styles.topRightRadius` — use `Styles.cornerRadius` with `Corners.topEnd` instead
- `Styles.bottomLeftRadius` — use `Styles.cornerRadius` with `Corners.bottomStart` instead
- `Styles.bottomRightRadius` — use `Styles.cornerRadius` with `Corners.bottomEnd` instead

### Migration

- `Styles.paddingLeft` / `paddingRight` / `paddingTop` / `paddingBottom` → `Styles.padding`: when all sides are equal, read `padding` as a number; when sides differ, read `padding` as a `Sides` object with `top`, `end`, `bottom`, `start` using logical directions (`start` = left in LTR)
- `Styles.strokeTopWeight` / `strokeBottomWeight` / `strokeLeftWeight` / `strokeRightWeight` → `Styles.strokeWeight`: same scalar-or-`Sides` pattern; individual per-side stroke weights now live under `Sides.top`, `Sides.end`, `Sides.bottom`, `Sides.start`
- `Styles.topLeftRadius` / `topRightRadius` / `bottomLeftRadius` / `bottomRightRadius` → `Styles.cornerRadius`: same scalar-or-`Corners` pattern; per-corner values use `Corners.topStart`, `Corners.topEnd`, `Corners.bottomEnd`, `Corners.bottomStart`

## [0.11.0] - 2026-03-04

### Added

- `PropBinding` — component-prop binding type; discriminated by `$binding` key; replaces `ReferenceValue`
- `TokenReference` — unified DTCG-aligned token reference; replaces `VariableStyle` and `FigmaStyle`; `$token` and `$type` are the complete platform-facing API
- `TokenReference.$token` — DTCG dot-separated token path, usable directly as a DTCG alias
- `TokenReference.$type` — DTCG token type discriminator: `color`, `dimension`, `string`, `number`, `boolean`, `shadow`, `gradient`, `typography`, `effects`
- `TokenReference.$extensions["com.figma"]` — optional Figma extraction metadata: `id`, `name`, `collectionName`, `rawValue`
- `Styles.typography` — composite typography; value is `TokenReference`, `Typography`, or omitted
- `Typography` — 13 optional inline text properties: `fontSize`, `fontFamily`, `fontStyle`, `lineHeight`, `letterSpacing`, `textCase`, `textDecoration`, `paragraphIndent`, `paragraphSpacing`, `leadingTrim`, `listSpacing`, `hangingPunctuation`, `hangingList`
- `Styles.aspectRatio` — aspect ratio constraint; `AspectRatioValue` pair or `null` when unconstrained
- `AspectRatioValue` — required `x` (numerator) and `y` (denominator) number fields
- `AspectRatioStyle` — type alias `AspectRatioValue | null`
- `Config.format.tokens` — token reference serialization profile; five options: `TOKEN` (default, `$token` + `$type`), `TOKEN_NAME` (dot-delimited path string only), `TOKEN_FIGMA_EXTENSIONS` (`$token` + `$type` + `$extensions["com.figma"]`), `FIGMA_NAME` (slash-delimited path string only), `CUSTOM` (same as `TOKEN`, signals custom post-processing)
- `Metadata.license?` — optional `{ status: string; description: string }` field
- `styles.textColor` — style key for text colour
- `styles.cornerSmoothing` — style key for corner smoothing (Figma squircle factor)
- `styles.effects` — style key replacing `effectStyleId`; `TokenReference` or inline `Effects`
- `Shadow` — fields: `visible`, `inset?`, `offsetX`, `offsetY`, `blur`, `spread`, `color`
- `Blur` — fields: `visible`, `radius`
- `Effects` — fields: `shadows?`, `layerBlur?`, `backgroundBlur?`
- `GradientStop` — fields: `position` (0–1), `color`
- `GradientCenter` — fields: `x`, `y` (0–1)
- `LinearGradient` — discriminated by `type: 'LINEAR'`; fields: `angle`, `stops`
- `RadialGradient` — discriminated by `type: 'RADIAL'`; fields: `center`, `stops`
- `AngularGradient` — discriminated by `type: 'ANGULAR'`; fields: `center`, `stops`
- `GradientValue` — discriminated union `LinearGradient | RadialGradient | AngularGradient`

### Changed

- `Element.instanceOf` — accepts `string | PropBinding`; bound form is `{ $binding: "#/props/..." }`
- `Element.text` — accepts `string | PropBinding`; bound form is `{ $binding: "#/props/..." }`
- `Style` — `PropBinding` replaces `ReferenceValue`; `TokenReference` replaces `VariableStyle` and `FigmaStyle`
- `Config.format` — `variables`, `simplifyVariables`, and `simplifyStyles` replaced by single `tokens` field; token output shape is now controlled entirely by the `tokens` profile
- `Styles.backgroundColor` — narrowed to `ColorStyle`; inline gradients representable
- `Styles.textColor` — narrowed to `ColorStyle`; inline gradients representable
- `Styles.strokes` — narrowed to `ColorStyle`; inline gradients representable
- `styles.fills` renamed to `styles.backgroundColor`

### Removed

- `Config.format.variables` — removed; use `Config.format.tokens` instead
- `Config.format.simplifyVariables` — removed; use `Config.format.tokens` profile instead
- `Config.format.simplifyStyles` — removed; use `Config.format.tokens` profile instead
- `ReferenceValue` — removed; use `PropBinding` instead
- `isReferenceValue` — removed; no replacement; prop-binding guards are upstream consumer responsibility
- `VariableStyle` — removed; use `TokenReference` instead
- `FigmaStyle` — removed; use `TokenReference` instead
- `Styles.fontSize` — removed; use `typography.fontSize` instead
- `Styles.fontFamily` — removed; use `typography.fontFamily` instead
- `Styles.fontStyle` — removed; use `typography.fontStyle` instead
- `Styles.lineHeight` — removed; use `typography.lineHeight` instead
- `Styles.letterSpacing` — removed; use `typography.letterSpacing` instead
- `Styles.textCase` — removed; use `typography.textCase` instead
- `Styles.textDecoration` — removed; use `typography.textDecoration` instead
- `Styles.paragraphIndent` — removed; use `typography.paragraphIndent` instead
- `Styles.paragraphSpacing` — removed; use `typography.paragraphSpacing` instead
- `Styles.leadingTrim` — removed; use `typography.leadingTrim` instead
- `Styles.listSpacing` — removed; use `typography.listSpacing` instead
- `Styles.hangingPunctuation` — removed; use `typography.hangingPunctuation` instead
- `Styles.hangingList` — removed; use `typography.hangingList` instead
- `Styles.textStyleId` — removed; use `typography` with a `TokenReference` instead
- `styles.effectStyleId` — removed with no deprecation period; consumers must migrate to `styles.effects`

### Migration

- `config.format.variables` / `simplifyVariables` / `simplifyStyles` → `config.format.tokens`: set `tokens` to a profile — `TOKEN` (default) for `$token` + `$type`; `TOKEN_NAME` for dot-delimited string; `TOKEN_FIGMA_EXTENSIONS` for full object with Figma metadata; `FIGMA_NAME` for slash-delimited string; `CUSTOM` for custom post-processing
- `Element.instanceOf` → `Element.instanceOf`: replace `{ $ref: "#/props/..." }` with `{ $binding: "#/props/..." }`; update any `isReferenceValue` guards to narrow against `$binding` directly
- `Element.text` → `Element.text`: same key rename from `$ref` to `$binding`
- `Styles.visible` → `Styles.visible`: same key rename from `$ref` to `$binding`
- `VariableStyle` → `TokenReference`: replace `{ id, variableName, collectionName }` with `{ $token: "<Collection>.<name>", $type: "<type>", $extensions: { "com.figma": { id, name, collectionName } } }`; read token path from `$token` and token category from `$type`
- `FigmaStyle` → `TokenReference`: replace `{ id, name }` with `{ $token: "<dot.path>", $type: "typography" | "effects" | ... }` and move the Figma UUID to `$extensions["com.figma"].id`
- `Styles.<typographyProperty>` → `Styles.typography.<property>`: all 14 flat typography properties replaced with single composite `typography` field; when `typography` is a `TokenReference`, read `$token` for the style path; when `typography` is a `Typography` object, read individual fields
- `fills` → `backgroundColor`: any consumer reading `component.styles.fills` must update to `component.styles.backgroundColor`
- `effectStyleId` → `effects`: any consumer reading `styles.effectStyleId` must update to `styles.effects`; when `effects` is a `TokenReference`, read `$token` and `$type`; when `effects` is an `Effects`, read from `shadows`, `layerBlur`, or `backgroundBlur` by role

## [0.9.0] - 2026-02-12

### Added

- **DEFAULT_CONFIG** - Default configuration constant for transformer setup
  - Provides sensible defaults for all Config fields
  - Ensures consistent behavior across CLI, MCP, and Plugin environments
  - Co-located with Config type definition for easy maintenance

## [0.10.0] - 2026-02-16

### Added

- **Runtime JS build** - Compile TypeScript types to `dist/index.js` for ESM consumers
  - Enables ESM runtime imports without loading `.ts` files
  - Keeps type definitions in `types/` for TypeScript tooling

## [0.8.0] - 2026-02-10

### Added

- **TypeScript type definitions** (`types/` package): Complete type definitions for all schema entities
  - Core types: Component, Anatomy, Props, Variant, Metadata, Config, Styles, Element, Layout
  - Property types with proper discriminators: BooleanProp, TextProp, IconProp, EnumProp, SlotProp
  - Style types supporting all 59 properties with specific value types
  - Reference value types for prop bindings and style references

### Changed

- **Component.metadata** - Now optional to support components without full metadata
- **Variant.layout** - Changed from single LayoutNode to array of LayoutNode for proper hierarchical representation
- **Props type values** - TextProp, IconProp, and EnumProp now use `type: 'string'` with discriminators (matching schema)
- **Style properties** - Changed from generic `Record<string, Style>` to specific Partial interface with all 59 style properties
- **VariableStyle** - Now includes all properties from schema: id (required), rawValue, name, variableName, collectionName, collectionId (all optional)
- **FigmaStyle** - Simplified to match schema: id (required), name (optional)

### Fixed

- **SlotProp.default** - Now accepts both `null` and `string` types
- **TextProp/IconProp nullable** - Made nullable field optional (was incorrectly required)
- **Metadata.source** - Added missing nodeType field with enum: COMPONENT | COMPONENT_SET | FRAME
- **Metadata.config** - Added complete Config definition with processing, format, and include options
- **StyleKey type** - Expanded from incomplete list to all 59 valid style properties matching schema

## [0.7.0]

### Changed

- Added distinct `anatomy` types for line, ellipse, star, polygon and rectange, all which were previously vector
- Removed autodetecion of icon assets based on `isAsset` plugin since this function is unavailable in the REST API

## [0.6.0] - 2026-01-27

### Added

- **Styles schema**: New `styles.schema.json` providing complete validation for style properties
  - Defines 60+ style properties (fills, opacity, cornerRadius, fontSize, etc.)
  - Type-specific validation for each property based on Style processor classes
  - Supports all style value types: primitives, variables, Figma styles, and prop bindings
  - Documents which value shapes depend on config.format settings (simplifyVariables, simplifyStyles)
  
- **Style value types**: Precise type definitions for style property values
  - `NumberStyleValue`: number | VariableStyle | null
  - `BooleanStyleValue`: boolean | VariableStyle | null
  - `BooleanBindableStyleValue`: boolean | VariableStyle | ReferenceValue | null (for `visible` only)
  - `ColorStyleValue`: string | VariableStyle | FigmaStyle | null
  - `StringStyleValue`: string | VariableStyle | null
  - `MixedNumberStyleValue`: number | "mixed" | VariableStyle | null
  - `MixedStringStyleValue`: string | VariableStyle | null
  - `StrokeStyleValue`: number | "mixed" | VariableStyle | null
  - `CornerStyleValue`: number | "mixed" | VariableStyle | null
  - `FontStyleValue`: string | number | "mixed" | null
  - `LineHeightStyleValue`: string | number | VariableStyle | null
  - `StyleIdValue`: string | FigmaStyle | null

- **Styles reference documentation**: New `reference/styles.yaml` providing human-readable documentation
  - Maps style properties to their applicable element types (COMPONENT, FRAME, TEXT, etc.)
  - Documents style processing categories from RAW_STYLES_LOOKUP
  - Lists all 60+ style properties with descriptions and value types
  - Generated from StyleKeys.ts and RawStyles.ts constants

### Changed

- **VariableStyle definition**: Removed internal-only `rawValue` property
  - Only includes properties emitted by Style.data(): id, name, variableName, collectionName, collectionId
  - `rawValue` is used internally for rendering but never serialized

- **FigmaStyle definition**: Improved descriptions
  - Documents simplified vs full object output based on config.format.simplifyStyles

- **Styles property**: Now references `styles.schema.json#/definitions/Styles`
  - Replaces generic `additionalProperties: Style` with precise property-level validation
  - Each style property validates against its specific value type union

## [0.5.0] - 2025-12-29

### Added

- **Instance of attribute**: Added optional `instanceOf` property to element definitions
  - Indicates the component or component set name that an instance element references
  - Only present for instance elements (Figma INSTANCE nodes)
  - Shows ComponentSet name for variant instances, or Component name for standalone instances
  - Also added to anatomy element definitions

- **Text property**: Added optional `text` property to element definitions
  - Contains the text content for text elements
  - Can be a string value or a `ReferenceValue` when bound to a text prop

- **Unified property bindings**: Property bindings now appear as `$ref` values on their natural properties
  - `children` can now be a `ReferenceValue` (for slot content bindings)
  - `instanceOf` can now be a `ReferenceValue` (for instance swap bindings)
  - `visible` style can now be a `ReferenceValue` (for boolean prop bindings)
  - `text` can be a `ReferenceValue` (for text prop bindings)
  - Added `ReferenceValue` definition with `$ref` JSON pointer to props

### Removed

- **propBindings section**: Removed separate `propBindings` property from elements
  - Bindings are now represented directly on their target properties using `$ref`

## [0.4.0] - 2025-12-27

### Added

- **Layout structure**: Added optional `layout` property to variant definitions that provides hierarchical element structure as a nested tree
  - Layout represents element nesting relationships in a recursive format
  - Leaf nodes are strings (element names)
  - Parent nodes are objects with element name as key and children array as value
  - Example: `{ "parentElement": ["childA", { "childB": ["grandchild"] }] }`
  
### Changed

- Schema now supports both structure representations:
  - New: `layout` at variant level (hierarchical tree)
  - Existing: `parent` and `children` properties in each element (maintained for backward compatibility)
  
### Deprecated

- `included` property has been removed from element definitions
  - Element inclusion is now determined by presence in the `layout` tree
  - Elements not present in `layout` are considered excluded from that variant

## [0.3.0] - Previous release