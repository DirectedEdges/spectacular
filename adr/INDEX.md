# ADR Index

## Draft

| # | Title | Highlights |
|---|-------|------------|
| 111 | Object-Typed Props | |
| 108 | The `$slotContent` Pointer Namespace | (reserved, draft in PR #767) |
| 107 | Schema File Identity and Packaging | (reserved, draft in PR #767) |
| 106 | Spec Provenance Beyond Figma Capture | (reserved, draft in PR #767) |
| 105 | Type–Schema Parity for Overlapping Prop Unions | (reserved, draft in PR #767) |
| 104 | Roles on a Collapsed Root — `childRole` Says Which Layer Was Annotated | (reserved, draft on `feat/states-setup-skill`) |
| 102 | A Default Slot That Accepts a String — Figma TEXT Properties as Composable Children | (reserved, draft on `102-default-text-slots`) |
| 093 | Composed Dependency Selection Is a Setting | |
| 092 | `invalidPropCombinations` — Renamed and Relocated to the Api Concern | |
| 082 | `Component.description` — The Authored Figma Description, Plain Text and Opt-In | (reserved, draft in PR #375) |
| 045 | Processing Provenance Signals | (reserved, draft in PR #60) |
| 044 | Duplicate Layer Name Disambiguation | (reserved, draft in PR #60) |
| 024 | Component Extends Relationship | Add `extends` field to express base/derived component relationships and prop/variant inheritance |
| 021 | Rename `invalidVariantCombinations` to `invalidPropConfigurations` | Shorten verbose field name and fix misleading "Variant" terminology — it describes prop configs, not variants |
| 020 | Classify Props by External vs Internal Ownership | Add ownership metadata to props distinguishing public API, dual-purpose, and interaction-driven properties |

## Accepted

| # | Title | Highlights |
|---|-------|------------|
| 112 | Settings Defaults Adopt Their Scaffolded Values | `format`, `keys`, `color`, `preserveManualSelections` and `collapsePrimitiveWrapper` default to the values every scaffolded workspace writes |
| 110 | Rename `Spec*Document` to `Component*Document` | `Spec*Document` renamed to `Component*Document`, matching `CompositionApiDocument`'s naming now that a second spec kind exists |
| 109 | Composition Concern Documents | Compositions get their own exact `splitConcerns` documents — never a loosened form of a component's, since a composition has no props to vary by |
| 104 | Roles on a Collapsed Root — `childRole` Says Which Layer Was Annotated | A collapsed element records which of its two Figma layers carried a role: `role` the component node, `childRole` the collapsed child, both means both |
| 103 | Structural Glyph Membership — `glyphs.structure` Convention | `glyphs` gains a structural membership form — child shapes + stored fill, named from the component name; a glyph cannot have properties |
| 101 | The Workspace Stage Graph | `specs build` runs the chain once; `specs run` watches and re-runs from what changed. One process, so one license check per run, not four |
| 100 | `PrimitiveEntry.match` — Promoting a Layer by Its Name, Short-Circuiting Style Scoring | Adds `PrimitiveEntry.match` — layer-name prefixes selecting a promotion entry ahead of style scoring; longest prefix wins |
| 099 | `slots.default.match` — Naming the Default Slot, and Flattened Instance Nesting | Adds `SpecsConventions.slots.default.match`, `MetadataConventions.specs` and `SlotProp.defaultSlot`, naming a component's always-composed slot so a filling instance can nest as a plain child instead of an explicit slot binding |
| 098 | Storybook Conventions — `config/conventions/storybook.yaml` | A `storybook` conventions member maps publish concerns to open feature settings, loaded from `conventions/storybook.yaml` beside `specs` and `figma.primitives` |
| 097 | A Composition Emits One Story in Its Own Nav Group, and Only Under Pro | One `Default` story in a `Compositions` group positioned as each target positions its own components; sticker sheet suppressed by kind; skipped on free with a note |
| 096 | The `specs/` Directory Names What Kind of Thing Each Folder Is | `specs/components/`, `specs/compositions/`, `specs/analysis/`; one resolver owns the layout and reads the legacy flat shape; `TransformerContext` gains `specsRoot` and `kind` |
| 095 | Compositions Are Curated Like Components, From a Smaller Eligible Set | A third `## Compositions` section curated by checkbox exactly as components are; the `READY_FOR_DEV` marking decides eligibility, not inclusion |
| 094 | Subcomponent Pattern Matching Rules | Fixes how `{C}` and `{S}` match a name, so one `subcomponents` pattern means the same thing in every consumer (amends ADR-031) |
| 093 | Curation Is a Settings Concern | `curation.defaultSelection`, `preserveManualSelections` and `includeDependencies` state which components a run specs |
| 092 | `invalidPropCombinations` — Renamed and Relocated to the Api Concern | Renames `invalidVariantCombinations` and moves it to the api concern — legality of prop combinations is contract, not manifestation |
| 091 | Each Concern Document Is Its Own Type | Adds `SpecApiDocument`, `SpecVariantsDocument`, `SpecExamplesDocument` and `Metadata.concern`; a key in the wrong file is an error |
| 090 | Container Promotion Sources Opened to Closed-Value Layout Properties | Adds `FigmaElementExtension.children` (`SlotContentRef`) and widens container sources to all closed-value layout members |
| 089 | Run Metadata Factored Out of the Component Spec | Adds `RunMetadata` — the run's facts as a document of its own — and narrows the required set on `Metadata` to `source` |
| 088 | Authoring-default images on `ImageProp` | Adds `ImageProp.examples` (`ImageValue[]`) — the image a component was authored with, recorded on the prop; `default` stays contractual |
| 087 | Behavior Actions via `anatomy.action` | Adds `AnatomyElement.actions` (`ActionEntry[]`) — a second annotation key for what a control *does*, alongside `role` for what it *is* |
| 086 | Interactive Root and Announcement Role Concepts | Vocabulary for `button`, `togglebutton`, `link`, `disclosure`, `alert`, `status`, `progressbar`; all non-structural — sequence first. Same docs-governed rule as 068 |
| 085 | `promotePrimitives` — the Switch for Capture-Time Promotion | Adds `Settings.spec.promotePrimitives` (default false) — the opt-in that turns capture-time primitive promotion on |
| 084 | `Element.$extensions` — Figma Provenance for a Promoted Element | Adds `Element.$extensions` with `com.figma` provenance, so a promoted element records that it was promoted, whether several entries matched, and the content and styles the promotion consumed |
| 083 | Collapsing a Slot-Only Wrapper | `collapsePrimitiveWrapper` also collapses a root wrapping one slot; both nodes are containers so no style is tested, and the slot's value wins |
| 081 | `defaultFillWidth` — the Width a Fill-Width Root Fills | Each platform states, in its own `config/conventions/` file, the width of the container it places a fill-width root in; fixed and hugging roots are untouched, and absent a declaration the rendering tool falls back to 375 |
| 080 | `null` as a Prop Configuration Value | Adds a `null` arm to `PropConfigurationValue` and to `InstanceExample.propConfigurations`; absent inherits, `null` overrides with unset |
| 079 | `metadata.conventions` Carries Only the Producing Platform | A spec records the one platform entry that produced it, not every platform in the workspace — fixing a drift check that fires on unrelated changes, and stopping internal vocabulary leaking into published specs |
| 078 | One Conventions File per Platform, in `config/conventions/` | `config/conventions/<platform>.yaml` composes into one `Conventions`; the filename is the platform id so no merge rule is needed, and it is the only layout — the single-file form is unreleased and does not survive |
| 077 | The Image Component's Code Name, and the Encoding / Vocabulary Boundary | Text, glyph and container are node kinds; an image is an attribute, so it gets `images.component` rather than a place in the primitive vocabulary. A container's `backgroundImage` always stays styling |
| 076 | Promoting a Container, and a Platform-Level `stylesProp` | Promotion extends to containers, and `stylesProp` names the platform prop that carries a promoted element's styles |
| 075 | `conventions.primitives` — a Declared Table from Styles to a Component's Props | |
| 074 | Primitives Promote to Component Instances During Capture, in Composed Content | During capture, an element matching a `conventions.primitives` entry emits as an instance of that component, in composed content |
| 073 | `conventions.platforms`, with Figma as One Platform Among Them | Platform-keyed `conventions.platforms`; `figma` one key among implementations. `conventions.specs` holds spec-side facts like `states` |
| 072 | Numeric Enum on `NumberProp` | Adds optional `enum?: number[]` so a VARIANT whose options are all numbers emits as a number with its closed option set preserved |
| 071 | Separate Library Conventions from Tooling Settings | `Conventions`, `Settings` and `Pipeline` replace `Config`, separating library facts from run choices and declared work |
| 070 | Explicit `position: ABSOLUTE` for Children of Non-Auto-Layout Parents | `position: ABSOLUTE` pairs with every emitted offset, children of plain containers included — documentation-only presence contract |
| 069 | Rename `clipContent` to `clipsContent` | Renames the clip flag to the key the data carries, so container clipping and CSS `overflow` resolve for the first time |
| 068 | Form Control and Field Plumbing Role Concepts | Vocabulary for `textbox`…`switch` plus the `label`/`description`/`errormessage`/`value`/`placeholder` parts and `group`; establishes that the vocabulary is docs-governed and changes without an ADR |
| 067 | Element Behavior Roles via `anatomy.role` | Add `AnatomyElement.role` (open `RoleConceptName` string), the Dev Mode annotation that generates it, control-vs-part role resolution, role obligations, `Conventions.specs` prop conventions, and `Settings.spec.roleValidation` |
| 066 | Lossless Key Formatting — Safe Key Grammar and Figma Name Preservation | Adds opt-in `format.figmaKeys` (`NONE` default), a safe key grammar, and `com.figma.name` on anatomy and props; renames `originalName` |
| 065 | Document the `nullable` Default and Add `NumberProp.nullable` | Absent `nullable` means true for `StringProp`/`NumberProp`/`SlotProp`/`ImageProp`, false for `EnumProp`; adds `NumberProp.nullable` |
| 064 | Tighten `textAlignHorizontal` to a Logical-Direction String Enum | Narrow from `Style` to `TextAlignHorizontal \| null` (`'START' \| 'CENTER' \| 'END' \| 'JUSTIFY'`); Figma `LEFT`/`RIGHT`/`JUSTIFIED` remapped |
| 063 | Image Content — `backgroundImage` fill, an `images` registry, `ImageProp`, and `ImageBinding` | Add `backgroundImage` fills, a `Component.images` registry (Figma identity + optional `src`), `ImageProp`/`ImageBinding`, and presence-switched `processing.images` |
| 062 | Text Overflow & Max Lines — `textOverflow` and `maxLines` on `Styles` | Add `textOverflow` (`TextOverflow \| null`) and `maxLines` to `Styles`; not token-bindable |
| 061 | Schema Entry Points for Concern-Split Output | Split output across `root`, `components`, `component`, and `styles` schema entry points |
| 060 | Subcomponent Figma Source Identity — `Subcomponent.source` | Add optional `SubcomponentSource` (`pageId`, `nodeId`, `nodeType`) to `Subcomponent`; enables reverse-direction tools to resolve `SubcomponentRef` to Figma nodes |
| 059 | Stroke Dash Pattern — `strokeDashPattern` on `Styles` | Add `StrokeDashPattern { dash, gap }` structural type; presence = dashed stroke, null/absent = solid; not token-bindable |
| 058 | Collapsing Wrapped Primitives — `processing.collapsePrimitiveWrapper` | Add optional boolean to `Config.processing` (default false); strips plain container wrappers around a single text/glyph child and promotes the leaf to spec root |
| 057 | Fix `Metadata.generator.version` type: `number` → `string` | Corrects type mismatch — field holds semver strings (e.g. `"1.10.0"`) in all producers; was incorrectly typed as `number` |
| 056 | Rename `SlotProp.minItems`/`maxItems` → `minChildren`/`maxChildren` | Align with Figma-native `slotSettings` field names; `anyOf` populated from `preferredValues` when `allowPreferredValuesOnly` is true |
| 055 | Variant State Classification via `processing.states` | Add `VariantStateEntry` type; add `Config.processing.states` — classifies Figma variant props as browser-driven or consumer-controlled for CSS selector and contract output |
| 054 | Workspace Schema File | Add `workspace.schema.json` describing `specs.config.yaml` — sources, output, and the `config` block |
| 053 | Transform Command and Configuration | Add `config.transformers` and the `specs transform` command for generating code artifacts from specs |
| 052 | Deeply-Nested Slot Content — Path-Anchored Overrides Across Non-Slot Instance Boundaries | Add the reserved `$nested` key on `PropConfigurations` for path-addressed overrides across instance boundaries |
| 051 | Platform Code-Syntax Token Profiles | Add `FIGMA_SYNTAX_WEB`/`_IOS`/`_ANDROID` to `Config.format.tokens`, emitting per-platform Figma code syntax with fallback to `TOKEN` |
| 050 | Examples Config | Add `include.defaultSlotContent` (default false); add `processing.instanceExamples` with scope, match, exclude, parentNames |
| 049 | Nested Slot Compositions | Fill nested instances’ slots from a parent context; `PropConfigurationValue` accepts `SlotContentRef` under slot-prop keys |
| 048 | PropConfigurations PropBinding | Widen `PropConfigurationValue` to accept `PropBinding`, so a nested prop can pass through to a parent prop |
| 047 | Slot Content — Component.slotContentExamples and SlotBinding | Add `Component.slotContentExamples` and `SlotBinding` with `examples?: SlotContentRef[]`; widen `Children` |
| 046 | Component Instance Examples — InstanceExample and Component.instanceExamples | Add `InstanceExample`/`InstanceExamples` and `Component.instanceExamples` for documented whole-component usages |
| 043 | Custom Color Format Configuration | Add `Config.format.color` with 9-format enum (HEX default); rename `ColorValue` → `ColorObject`; widen color types with `string` arm |
| 042 | Composition as a First-Class Type | Add `Composition` and `SlotContent` as first-class types carrying their own anatomy, elements, and layout |
| 041 | Layout Positioning — Constraint-Based Naming | Replace `x`/`y`/`layoutPositioning` with constraint-based `position`, `start`, `end`, `top`, `bottom`, center offsets |
| 040 | Replace `primaryAxisAlignItems` and `counterAxisAlignItems` with `mainAxisAlignment` and `crossAxisAlignment` | Rename to platform-neutral names; add `MainAxisAlignment` and `CrossAxisAlignment` enums; not token-bindable |
| 039 | Replace `layoutWrap` and `counterAxisAlignContent` with `wrap` and `wrapAlignment` | Rename to platform-neutral names; add `WrapAlignment` enum (`START \| SPACE_BETWEEN`); not token-bindable |
| 038 | Tighten layoutMode to String Literal Enum | Narrow `layoutMode` from `Style` to `LayoutMode \| null` (`'NONE' \| 'HORIZONTAL' \| 'VERTICAL'`); exclude TokenReference |
| 037 | Consolidate Item Spacing into a Bi-Axial Model | Replace `itemSpacing` + `counterAxisSpacing` with single `itemSpacing: Style \| ItemSpacing` using `{ horizontal, vertical }` |
| 036 | Remove `name` and `baseline` from `Variant` | Remove unused `name` and `baseline` optional fields from `Variant` type and schema (breaking) |
| 035 | Make Config Properties with Defaults Optional | Make 5 required Config properties optional with defaults; add `ResolvedConfig` type for fully-resolved shape |
| 034 | Remove variantNames, add emptyVariants, make Config.include fields optional | Remove unused `variantNames` (breaking); add `emptyVariants` for filtering; make remaining fields optional |
| 033 | Typography fontFamily/fontStyle — Remove Number, Add TokenReference | Fix font fields: remove impossible `number` branch, add `TokenReference` for variable-bound font properties |
| 032 | Typography leadingTrim — Correct to String Enum | Fix `leadingTrim` from incorrect `number \| "mixed"` to correct `"NONE" \| "CAP_HEIGHT" \| "mixed"` string enum |
| 031 | Subcomponent Search Scope Config | Replace `subcomponentNamePattern` with structured `processing.subcomponents` object (`scope`, `match[]`, `exclude[]`) |
| 030 | Subcomponent `$ref` for `instanceOf` | Add `SubcomponentRef` (`{ $ref: "#/subcomponents/{key}" }`) to `instanceOf` on AnatomyElement and Element |
| 029 | NumberProp — Numeric Property Type | Add `NumberProp` (`type: "number"`) to `AnyProp` union with opt-in `inferNumberProps` config for numeric props |
| 028 | Slot Quantity and Content Constraints | Add optional `minItems`, `maxItems`, `anyOf` fields to `SlotProp` for slot quantity and permitted content types |
| 027 | Code-Only Props | Surface Figma code-only props (a11y, semantics) in `props` with `$extensions` source kind `codeOnlyProp` |
| 026 | Unify Platform-Specific Properties Under `$extensions` | Standardize on DTCG `$extensions` with reverse-domain keys for all platform metadata; remove `x-platform` |
| 023 | Fix Schema Compliance Gaps | Fix 58 schema violations: optional SlotProp.default, `$`-prefix patternProperties, hex in ColorStyleValue, schema URL |
| 022 | Add Nullable Support to SlotProp | Fix type-schema drift: add `nullable?: boolean` and widen `default` to `string \| null` on SlotProp |
| 019 | Allow null in StringProp.default | Widen `StringProp.default` from `string` to `string \| null` so nullable props can express `null` as their default |
| 018 | Conditional Visible Binding | Add `Conditional` type with `if`/`condition`/`then`/`else` for declarative visibility derived from nullable props |
| 017 | Rename `icon` Element Type to `glyph` | Rename `icon` to `glyph` in ElementType, `IconProp` to `GlyphProp`, `iconNamePattern` to `glyphNamePattern` |
| 016 | Element Content Identification | Replace `Element.text` with unified `Element.content` field for text strings and icon glyph names |
| 015 | Resolve `AnyProp` `oneOf` Schema Violation | Merge identical `TextProp`/`IconProp` into single `StringProp` to fix `oneOf` schema validation failure |
| 014 | Add `examples` to TextProp and IconProp | Add optional `examples: string[]` to TextProp/IconProp; make `default` optional. Demo content is not a default |
| 013 | Add `fillColor` Style Property for Icon Elements | Add optional `fillColor: ColorStyle` to `Styles` for dedicated icon glyph fill color, distinct from background |
| 012 | Element Type References | Widen `AnatomyElement.type` to `string \| ElementTypeRef` for `$ref`-based external element type definitions |
| 011 | Icon Element Type Support and Detection Config | Add `iconNamePattern` config and constrain `AnatomyElement.type` to `ElementType` enum. Activates `icon` detection |
| 010 | Sides and Corners Composite Types | Replace 13 flat padding/stroke/corner fields with `Sides`/`Corners` composites using logical directions |
| 009 | Replace Hex String with DTCG Color Object | Replace bare hex string in `ColorStyle` with `ColorValue` object (`colorSpace`, `components`, `alpha?`, `hex?`) |
| 008 | Introduce `PropBinding` to Replace `ReferenceValue` | Replace `ReferenceValue` (`$ref`) with `PropBinding` (`$binding`) to avoid JSON Schema key collision |
| 007 | Consolidate Token Format Configuration into `tokens` | Replace `variables`/`simplifyVariables`/`simplifyStyles` config fields with single `format.tokens` enum |
| 006 | Unified Token Reference Type | Replace `VariableStyle`/`FigmaStyle` with DTCG-aligned `TokenReference` (`$token`, `$type`, `$extensions`) |
| 005 | Replace Typography Flat Properties with Composite | Consolidate 14 flat typography keys into single `typography?: FigmaStyle \| Typography` composite |
| 004 | Add `aspectRatio` to Styles | Add optional `aspectRatio` as `{ x, y }` object to Styles for locked ratio constraints |
| 003 | Gradient Support for Color Style Properties | Add `GradientValue` (LINEAR/RADIAL/ANGULAR) discriminated union and `ColorStyle` type for gradient fills |
| 002 | Replace `effectStyleId` with `effects` | Remove `effectStyleId`; add grouped `effects` key with `Shadow`, `Blur`, `Effects` types |
| 001 | Surface License State in Component Output | Add optional `generator.license` (`status`, `level`) to Metadata for downstream entitlement gating |

## Superseded

| # | Title | Superseded by |
|---|-------|---------------|
| 025 | Flowing Content into a Nested Instance's Slot | ADR-042 composition and ADR-047 slot content, which model nested fills as first-class content rather than per-element flow |
