---
title: "CLI Overview"
---

The Spectacular command-line interface (CLI) generates design system specifications from Figma REST API data without requiring the Figma Plugin UI. It enables automation, batch processing, and CI/CD integration.

## Commands

Most commands below do one job. Two do all of them in order.

| Command | Purpose | Output |
|---------|---------|--------|
| [`build`](/cli/commands/build/) *(experimental)* | Run every step below, in order, once | Everything the individual steps write |
| [`run`](/cli/commands/run/) *(experimental)* | The same, then watch and redo what a change affects | As above, kept current until Ctrl-C |
| [`init`](/cli/commands/init/) | Initialize config files with defaults | `config/conventions/` (one file per platform), `config/settings.yaml` |
| [`fetch`](/cli/commands/fetch/) | Download raw REST payloads from Figma | JSON files in `data.directory` |
| [`scan`](/cli/commands/scan/) | List all components in file | Markdown manifest |
| [`applyCustomTokens`](/cli/commands/apply-custom-tokens/) | Inject `$custom` objects into fetched data | Modified variables/styles JSON |
| [`generate`](/cli/commands/generate/) | Generate specs from a manifest or single component | YAML/JSON spec file(s) |
| [`analyze`](/cli/analyze/) | Run analyzers over generated specs | Reports in `analysis/` |
| [`migrate`](/cli/commands/migrate/) | Convert older workspace layouts to the current one | Rewritten `config/` files |
| [`version`](/cli/commands/version/) | Version the workspace: diffs, semver bumps, reports, changelogs | `versions/` folders, ledgers, reports |
| [`skills`](/cli/commands/skills/) | Install the premerge and release orchestration skills | Skill files in `.claude/skills/` |
| [`react`](/cli/commands/react/) *(experimental)* | Emit the React target | Components, contracts, stylesheets, stories in `react/` |
| [`webcomponents`](/cli/commands/webcomponents/) *(experimental)* | Emit the Web Components target | Elements, contracts, stylesheets, stories in `webcomponents/` |
| [`bridge`](/cli/commands/bridge/) *(experimental)* | Start/stop/check the local bridge `render` talks to | Background process |
| [`cache`](/cli/commands/cache/) *(experimental)* | Build the lookup tables `render` resolves specs against | YAML files in `{data.directory}/cache` |
| [`render`](/cli/commands/render/) *(experimental)* | Send a spec to the CLI bridge to render it live in Figma | Live Figma component |

### Global Options

- `--help` - Show command help (all commands)
- `--version` - Show CLI version
- `--verbose` - Enable detailed logging (build, run, fetch, scan, generate, react, webcomponents, analyze, render)

### The chain `build` and `run` perform

Each step reads what the one before it wrote:

```
data/ ──► data/<alias>.manifest.md ──► specs/ ──┬──► react/src/
  ▲              ▲                               ├──► webcomponents/src/
  │              │                               └──► storybook/content/
specs fetch    you tick the boxes
```

`specs fetch` is not part of it — its input is the Figma file, which the CLI cannot watch, so it is something you run when you mean to. `specs render` joins the end of the chain only on `--render`, because it writes to a live Figma file rather than to disk.

## Free vs. Pro

Spectacular CLI works without a license key. At the **free tier**, specs include full component structure: anatomy, props, variants, and raw style values.

With a **Pro license**, specs also include design token references, variable bindings, and visibility bindings — connecting your specs directly to your design token system.

| Feature | Free | Pro |
|---------|------|-----|
| Anatomy, props, variants | Yes | Yes |
| Layout and raw style values | Yes | Yes |
| Design token references | — | Yes |
| Variable and visibility bindings | — | Yes |

Set up your license key in your environment to unlock Pro features. See [Getting Started — environment setup](/cli/getting-started/#step-2-set-up-your-environment) and [Licensing](/overview/licensing/).

## Output Format

The CLI generates the same specification format as the Figma Plugin:

```yaml
components:
  dsButton:
    title: DS Button
    props:
      size:
        type: variant
        values: [small, medium, large]
      variant:
        type: variant
        values: [primary, secondary]
    anatomy:
      - id: container
        name: Container
        type: FRAME
      - id: label
        name: Label
        type: TEXT
    variants:
      - props:
          size: small
          variant: primary
        anatomy:
          container:
            styles:
              paddingLeft: { value: 12, type: ABSOLUTE }
```

## File Outputs

`specs fetch` writes deterministic filenames based on your config aliases.

Example (with `data.directory: ./data` in `config/settings.yaml`):

```
data/
├── library.file/            # page-split file payload
│   ├── manifest.json        #   page index
│   ├── root.json            #   component/style tables
│   └── page-000.json …      #   one file per Figma page
├── library.variables.json
├── library.styles.json
├── foundations.variables.json
└── foundations.styles.json
```

`generate` uses these files by default when `data.sources` in `config/settings.yaml` declares the corresponding aliases and fetch kinds.

## Requirements

- **Node.js** 18 or higher
- **Figma access token** (for `fetch`) via `FIGMA_TOKEN`
- **Figma REST API data** (JSON files from Figma API endpoints, produced by `fetch`):
  - `file` / `styles` — any Figma plan with REST API access
  - `variables` — Figma restricts the variables REST endpoints to organizations on an **Enterprise** plan, regardless of your Spectacular license; on any other plan, fetch variables through the plugin with [`--from-bridge`](/cli/commands/fetch/#fetching-variables-via-the-bridge)
- **License key** (optional) via `SPECS_LICENSE_KEY` for Pro features
- **A running CLI bridge and open Figma session** (for `render` only) — see the [Render to Figma guide](/guides/render-to-figma/)

See [Getting Started](/cli/getting-started/) for installation instructions.

## See Also

- [Getting Started](/cli/getting-started/) - Installation, license, and quick start
- [Workflows](/cli/workflows/) - Real-world usage patterns and CI/CD
- [Configuration](/settings/) - Config file reference
