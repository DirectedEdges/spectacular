# Spectacular

Spectacular turns a Figma component into a compact, schema-valid specification — and then turns that specification into working code, Figma canvas documentation, analysis reports, and a versioned record of how the component changed. A Figma plugin and a command-line interface produce the same output, from the same schema.

Evaluating styles and layers across variants is a differencing problem, not a judgment call, so a script does it in about a second per component for zero AI tokens. What a spec deliberately leaves out — behavior, accessibility nuance, motion, naming taste — is where agents and engineers are good, and that work happens downstream against a record they can trust.

The record is the point. When Figma, agents, engineers, and CI all read from the same spec, change stops being a handoff and starts being a sync.

[Open the plugin](https://www.figma.com/community/plugin/1549454283615386215/specs-2) · [Set up the CLI](https://spectacular.systems/cli/getting-started/) · [Explore the schema](https://spectacular.systems/schema/) · [Docs](https://spectacular.systems)

Background reading: [Components as data](https://nathanacurtis.substack.com/p/components-as-data-2be178777f21) · [Spec-driven UI component development](https://nathanacurtis.substack.com/p/spec-driven-ui-component-development)

## The ecosystem

The CLI installs some dependencies and the private transform packages for you (but not storybook, you do that); the plugin compiles `specs-from-figma` and `figma-from-specs` from source.

| Surface | What it is | Where it lives |
|---|---|---|
| [**Spectacular**](https://www.figma.com/community/plugin/1549454283615386215/specs-2) | Figma plugin — specs on canvas, spec data on the document | Figma Community |
| [**`@directededges/specs-cli`**](https://www.npmjs.com/package/@directededges/specs-cli) | 18 commands running the ecosystem plus source for analysis, versions, css, storybook, testing | [`packages/cli/`](https://github.com/DirectedEdges/spectacular/tree/main/packages/cli/) |
| [**`@directededges/specs-schema`**](https://www.npmjs.com/package/@directededges/specs-schema) | The contract — TypeScript types and JSON Schema | [`packages/schema/`](https://github.com/DirectedEdges/spectacular/tree/main/packages/schema/) |
| [**Documentation site**](https://spectacular.systems) | ~150 pages | Source in [`site/`](https://github.com/DirectedEdges/spectacular/tree/main/site/) |
| [**`@directededges/specs-from-figma`**](https://www.npmjs.com/package/@directededges/specs-from-figma) | Transform Figma → spec, with Plugin API and REST runtimes | Private, published to npm |
| [**`@directededges/react-from-specs`**](https://www.npmjs.com/package/@directededges/react-from-specs) | Transform spec → React | Private, published to npm |
| [**`@directededges/webcomponents-from-specs`**](https://www.npmjs.com/package/@directededges/webcomponents-from-specs) | Transform spec → Web Components (Lit) | Private, published to npm |
| [**`@directededges/figma-from-specs`**](https://www.npmjs.com/package/@directededges/figma-from-specs) | Transform spec → Figma canvas | Private, published to npm |
| **`from-specs`** | Shared spec-reading core for the emitters | Private, never published |

### Why computation over inference?

|  | Spectacular | Agentic Figma extraction |
|---|---|---|
| **Speed** | ~1 sec (CLI) / ~10 sec (plugin) per component | ~5–10 minutes per component |
| **AI cost** | Scripted — 0 tokens per component | 25/50/100,000+ tokens per component |
| **Repeatability** | Deterministic and mechanical | Inference errors, gaps, and overconfidence |
| **Output** | Schema-valid YAML/MD, ready for testing and versioning | Unstructured Markdown, unpredictable to verify |
| **Platforms** | Schema-based and cross-platform | Guessing your intents |

## Schema: what Specs record

`@directededges/specs-schema` is the contract. TypeScript types and JSON Schema describe the same structure at all times, the package carries no logic, and both the CLI and the Figma plugin consume it rather than defining their own shapes. One spec accounts for every layer and property of a component, consistently across its variants.

```sh
npm install @directededges/specs-schema
```

| Part | Types | Pro |
|---|---|---|
| [Component](https://spectacular.systems/schema/component/) | `Component`, `Variant`, `Variants`, `Metadata`, `RunMetadata`, concern documents | |
| [Anatomy](https://spectacular.systems/schema/anatomy/) | `Anatomy`, `AnatomyElement`, `ElementTypeRef`, `RoleConceptName`, `ActionEntry` | |
| [Props](https://spectacular.systems/schema/props/) | `Props`, `BooleanProp`, `StringProp`, `EnumProp`, `SlotProp`, `NumberProp`, `PropConfigurations` | |
| [Elements](https://spectacular.systems/schema/elements/) | `Element`, `Elements`, `ElementType`, `ElementExtensions` | |
| [Layout](https://spectacular.systems/schema/layout/) | `Layout`, `LayoutNode`, `Sides`, `Corners`, `Position`, `ItemSpacing` | |
| [Styling](https://spectacular.systems/schema/styles/) | `Styles`, `Style`, `ColorStyle`, `Typography`, `Effects`, `GradientValue`, `TokenReference` | `TokenReference` |
| [Images](https://spectacular.systems/guides/images/) | `ImageValue`, `ImageData`, `ImageProp`, `ImageBinding`, `ObjectFit` | |
| [Slots](https://spectacular.systems/schema/slot-content/) | `Children`, `SlotBinding`, `SlotContent`, `SlotContentRef`, `Composition` | all |
| [Bindings](https://spectacular.systems/schema/prop-binding/) | `PropBinding`, `Conditional`, `ConditionExpression` | `PropBinding` |
| [Subcomponents](https://spectacular.systems/schema/subcomponents/) | `Subcomponent`, `Subcomponents`, `SubcomponentSource` | all |
| [Instance examples](https://spectacular.systems/schema/instance-examples/) | `InstanceExample`, `InstanceExamples` | all |
| [Assets](https://spectacular.systems/guides/glyph-name-pattern/) | `GlyphStructure`, `GlyphStructureNode` | |
| [Conventions](https://spectacular.systems/schema/conventions/) | `Conventions`, `PlatformConventions`, `SpecsConventions`, `ValueConvention` | |
| [Settings](https://spectacular.systems/schema/settings/) | `Settings`, `ResolvedSettings`, `ColorFormat`, `SourceEntry` | |

Exports are type-only but for two runtime constants, `DEFAULT_CONVENTIONS` and `DEFAULT_SETTINGS`. [JSON Schema](https://github.com/DirectedEdges/spectacular/tree/main/packages/schema/schema/) ships five addressable subpaths — `component`, `concern`, `metadata`, `conventions`, `settings` — alongside the [TypeScript types](https://github.com/DirectedEdges/spectacular/tree/main/packages/schema/types/). Every type has a page under [Schema](https://spectacular.systems/schema/), and [`CONSTITUTION.md`](https://github.com/DirectedEdges/spectacular/blob/main/packages/schema/CONSTITUTION.md) governs what may change and how.

*Further reading: [Component contracts and schemas](https://nathanacurtis.substack.com/p/component-contracts-and-schemas).*

### Decision records

Schema changes are proposed and tracked through Architecture Decision Records in [`adr/`](https://github.com/DirectedEdges/spectacular/tree/main/adr/). Each one records the context, the options considered, and the decision; accepted ADRs publish to the docs site automatically.

Contributions are welcome. Clone the repo, run `npm install` at the root, and use `npm run build` and `npm test` to validate changes. All packages use Vitest with globals enabled. This repo ships Claude Code skills for the full ADR lifecycle:

| Skill | Purpose |
|---|---|
| `/specs.adr.create` | Draft a new ADR, claim the next number, and reserve it in the index |
| `/specs.adr.implement` | Apply an ADR's type and schema changes to types, schema, tests, and changelog |
| `/specs.adr.accept` | Validate the implementation, mark the ADR accepted, and update the index |

## Setting up a workspace

Two paths to the same workspace. Neither is a lesser version of the other — the CLI is a command-line tool first, and the agent path drives those same commands.

**Command by command**, following [Getting Started](https://spectacular.systems/cli/getting-started/):

```sh
npm install -g @directededges/specs-cli
specs init       # write config/conventions/<platform>.yaml and config/settings.yaml
# add your Figma file key to config/settings.yaml, and FIGMA_TOKEN to .env
specs fetch      # pull the file, variables, and styles
specs scan       # write the manifest, then tick the components you want
specs build      # generate, analyze, emit every platform, publish Storybook — once
```

The first `build` emits every platform, because nothing has said otherwise yet. The trees it creates are then the standing answer: delete `webcomponents/` and later runs stop emitting there. Naming steps explicitly — `--only react` — also counts as saying otherwise.

**With an agent**, three steps:

```sh
npm install -g @directededges/specs-cli
specs skills install    # writes the procedures into .claude/skills/
```

Then tell Claude Code:

```
Follow the specs-cli.workspace.setup skill to set up a Spectacular workspace here.
```

It handles install, config, token setup, fetch, curation, the first build, and a running Storybook — stopping twice: once for which components to spec, once for which of the icon, state and role passes to run. The only prerequisites are Node 20.19+, a Figma file URL, and a Figma personal access token.

## Commands

Two commands do everything in order. The rest are the steps they run, and each reads what the one before it wrote.

```
data/ ──► data/<alias>.manifest.md ──► specs/ ──┬──► react/src/
  ▲              ▲                               ├──► webcomponents/src/
  │              │                               └──► storybook/content/
specs fetch    you tick the boxes
```

`Exp` marks an experimental command — usable, but its flags and output may still change.

### Whole workspace

| Command | What it does | Tier | |
|---|---|---|---|
| [`specs build`](https://spectacular.systems/cli/commands/build/) | Bring the workspace up to date once, then exit with the chain's code — the CI shape | Free | Exp |
| [`specs run`](https://spectacular.systems/cli/commands/run/) | The same, then watch specs, data, and config and redo only what a change affects | Free | Exp |

### Setup

| Command | What it does | Tier | |
|---|---|---|---|
| [`specs init`](https://spectacular.systems/cli/commands/init/) | Write `config/conventions/<platform>.yaml` and `config/settings.yaml` with production defaults | Free | |
| [`specs skills install`](https://spectacular.systems/cli/commands/skills/) | Install the premerge and release orchestration skills into `.claude/skills/` | Free | |
| [`specs migrate`](https://spectacular.systems/cli/commands/migrate/) | Convert an older workspace layout to the current one | Free | |

### Data in

| Command | What it does | Tier | |
|---|---|---|---|
| [`specs fetch`](https://spectacular.systems/cli/commands/fetch/) | Download raw REST payloads — file, variables, styles — for every configured Figma source | Free | |
| [`specs scan`](https://spectacular.systems/cli/commands/scan/) | Discover components and write a manifest you curate by ticking boxes | Free | |
| [`specs applyCustomTokens`](https://spectacular.systems/cli/commands/apply-custom-tokens/) | Inject `$custom` token objects from a mapping file into fetched data | Free | |
| [`specs cache`](https://spectacular.systems/cli/commands/cache/) | Build the lookup tables `render` resolves specs against | Free | Exp |

### Specs out

| Command | What it does | Tier | |
|---|---|---|---|
| [`specs generate`](https://spectacular.systems/cli/commands/generate/) | Generate specs from fetched data, a curated manifest, or the live Figma selection with `--from-bridge` | Free + Pro | |

This is the one command a license changes. Free output carries full component structure; Pro output adds token references, prop and visibility bindings, composition, and invalid variant combinations.

*Further reading: [Figma component specs on command](https://nathanacurtis.substack.com/p/figma-component-specs-on-command).*

### Code out

| Command | What it does | Tier | |
|---|---|---|---|
| [`specs react`](https://spectacular.systems/cli/commands/react/) | Emit the React target into `react/` | Free + Pro | Exp |
| [`specs webcomponents`](https://spectacular.systems/cli/commands/webcomponents/) | Emit the Web Components (Lit) target into `webcomponents/` | Free + Pro | Exp |

Both targets write the same five artifacts, documented one page each under [Code](https://spectacular.systems/code/): the [contract](https://spectacular.systems/code/contract/), the [scaffold](https://spectacular.systems/code/scaffold/), the [stylesheet](https://spectacular.systems/code/styles/), its [CSS variables](https://spectacular.systems/code/cssvars/), and [Storybook stories](https://spectacular.systems/code/stories/). Behavior comes from [role concepts](https://spectacular.systems/roles/) declared in the spec rather than from per-component code.

*Further reading: [Generating code from specs](https://nathanacurtis.substack.com/p/generating-code-from-specs).*

### Analysis

| Command | What it does | Tier | |
|---|---|---|---|
| [`specs analyze`](https://spectacular.systems/cli/analyze/) | Run analyzers over the spec tree and write aggregate reports to `analysis/` | Free | Exp |

- [`props`](https://spectacular.systems/cli/analyze/props/) — every prop across the library, and which components share one
- [`styling`](https://spectacular.systems/cli/analyze/styling/) — token and raw-value usage across the spec tree
- [`dependencies`](https://spectacular.systems/cli/analyze/dependencies/) — what composes what, and the blast radius of a change
- [`keys`](https://spectacular.systems/cli/analyze/keys/) — naming consistency across properties and elements
- [`roles`](https://spectacular.systems/cli/analyze/roles/) — which role concepts are declared, and where they are missing

### Versioning

| Command | What it does | Tier | |
|---|---|---|---|
| [`specs version`](https://spectacular.systems/cli/commands/version/) | Version the spec workspace: `diff`, `history`, `cut`, `tag`, `restore`, `figmapremerge`, `report` | Free | Exp |

Versioning classifies a workspace diff, cuts a version folder, writes ledger entries, and produces an itemized changelog — including a [pre-merge report](https://spectacular.systems/versioning/) for a Figma branch before anyone merges it.

### Figma, Storybook, and visual testing

| Command | What it does | Tier | |
|---|---|---|---|
| [`specs bridge`](https://spectacular.systems/cli/commands/bridge/) | `start`, `stop`, `status` for the local bridge that reaches a running plugin | Free | Exp |
| [`specs render`](https://spectacular.systems/cli/commands/render/) | Send a spec back into Figma and build the component on canvas | Free | Exp |
| [`specs storybook`](https://spectacular.systems/cli/commands/storybook/) | `init`, `dev`, `publish` — a portable Storybook over the emitted trees | Free | Exp |
| [`specs testing visual`](https://spectacular.systems/cli/commands/testing/) | Pixel-diff the Storybook render against Figma exports, in eight explicit stages | Free | Exp |

`render` closes the loop: a spec authored or edited outside Figma becomes a real component on the canvas. See [Render to Figma](https://spectacular.systems/guides/render-to-figma/), [Storybook](https://spectacular.systems/storybook/), and [Testing](https://spectacular.systems/testing/).

## The Figma plugin

[Spectacular](https://www.figma.com/community/plugin/1549454283615386215/specs-2) selects a component or component set, draws a visual specification onto the canvas, and caches the machine-readable spec data on the document — ready to copy into an LLM or read over the bridge.

Six output sections are drawn on canvas: [Anatomy](https://spectacular.systems/plugin/anatomy/), [Props](https://spectacular.systems/plugin/props/), styling inventory, [Modes](https://spectacular.systems/plugin/modes/), [Layout](https://spectacular.systems/plugin/layout/), and [Data](https://spectacular.systems/plugin/data/). Seven panes control them:

- **Specs** — every spec already generated in the document, to re-run, inspect, or copy as YAML or JSON.
- **Create** — generate a spec from the current selection, with progress as it goes.
- **Canvas Output** — control the spec frames drawn on the canvas.
- **Settings** — sections, format, detail level, props, variants, elements, examples, foundations, [layout and multi-column layout](https://spectacular.systems/plugin/multi-column-layout/), and [custom styling](https://spectacular.systems/plugin/color/).
- **Bridge** — an opt-in local WebSocket on port 9001 that lets the CLI read the current selection, or build a component from a spec.
- **Account** — license activation and tier state.
- **About** — version and links.

[Figma best practices](https://spectacular.systems/plugin/best-practices/) covers what the plugin expects of a well-built library.

## Documentation

[spectacular.systems](https://spectacular.systems) is authoritative for how Spectacular is *intended* to work; this repository is authoritative for what the code *does*.

- [Command line](https://spectacular.systems/cli/) — overview, workflows, and one page per command with its flags
- [Schema](https://spectacular.systems/schema/) — one page per type, plus the deep style, typography, and effects property trees
- [Figma](https://spectacular.systems/plugin/) — plugin output sections and formatting
- [Code](https://spectacular.systems/code/) — what `specs react` and `specs webcomponents` emit, artifact by artifact
- [Storybook](https://spectacular.systems/storybook/) — the portable Storybook over the emitted trees
- [Versioning](https://spectacular.systems/versioning/) — change classification, history, identity, reports
- Guides — 19 how-tos for specific features, from [variant layering](https://spectacular.systems/guides/variant-layering/) to [code-only props](https://spectacular.systems/guides/code-only-props/)
- [Settings](https://spectacular.systems/settings/) — one page per convention and setting
- [Roles](https://spectacular.systems/roles/) — role concepts, inventory, and precedence
- [Releases](https://spectacular.systems/overview/releases/) — merged schema and CLI changelogs

The site's Decision Records section is generated from [`adr/`](https://github.com/DirectedEdges/spectacular/tree/main/adr/) at build time, so an accepted ADR publishes itself.

## Further reading

- [Components as data](https://nathanacurtis.substack.com/p/components-as-data-2be178777f21) — why a component is better held as a record than as a drawing
- [Spec-driven UI component development](https://nathanacurtis.substack.com/p/spec-driven-ui-component-development) — the loop this ecosystem is built around
- [Component contracts and schemas](https://nathanacurtis.substack.com/p/component-contracts-and-schemas) — what belongs in a contract, and what does not
- [Figma component specs on command](https://nathanacurtis.substack.com/p/figma-component-specs-on-command) — generating specs from the command line
- [Generating code from specs](https://nathanacurtis.substack.com/p/generating-code-from-specs) — React and Web Components from a spec

## Free and Pro

Everything is usable free. Nothing is time-limited, watermarked, or withheld — a free spec is a complete, valid spec, and a free React component renders. Pro connects a component to your token system, its other components, and every state it can be in.

| | Free | Pro adds |
|---|---|---|
| **Data** | Component structure, variant evaluation, metadata | Token and style references, prop bindings, invalid combinations |
| **Figma canvas output** | Every output section, multi-column layout, all settings | Custom styling, the Examples settings, the Bridge pane |
| **Code** | The component, its contract, its stylesheet, one story per variant axis | Composition, glyphs, background images, compound stories, sticker sheets |

Pro is $10/month. [Purchase a license](https://buy.polar.sh/polar_cl_xnq7zeKLXunrhOIpfNwA56F4wIq2Y0lLNCKmb0hhYJH), or read [Licensing](https://spectacular.systems/overview/licensing/) for keys, metering, and the full gating detail.

## Issues

Check the [existing issues](https://github.com/DirectedEdges/spectacular/issues) before opening a new one. For a bug, include:

- Figma version and operating system
- Steps to reproduce
- Expected versus actual behavior
- Screenshots, if they help

For a feature request, include a clear description, the use case, and any relevant mockups.

Questions are welcome in the [Slack community](https://join.slack.com/t/directededges-plugins/shared_invite/zt-3e3nhx1zp-4uUjRCA7y2QAEPZdVNJi6A).

## Licensing

| Package | License |
|---|---|
| [`packages/schema/`](https://github.com/DirectedEdges/spectacular/tree/main/packages/schema/) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [`packages/cli/`](https://github.com/DirectedEdges/spectacular/tree/main/packages/cli/) | [MIT](https://github.com/DirectedEdges/spectacular/blob/main/packages/cli/LICENSE) |

When extending or reusing the schema, credit **Nathan Curtis**, link to this repository and to the license, and indicate any modifications you made.

> "This project uses the [Spectacular UI Component Schema](https://github.com/DirectedEdges/spectacular) by Nathan Curtis of Directed Edges, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)."

---

**Disclaimer**: This is an independent project and is not officially affiliated with Figma Inc.
