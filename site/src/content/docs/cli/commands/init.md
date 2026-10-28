---
title: "init"
---
Initialize the `config/` directory — one conventions file per platform plus `settings.yaml` — with production-ready defaults.

## Usage

```bash
specs init [options]
```

## Purpose

The `init` command scaffolds the split configuration (ADR-071, ADR-078), each file answering one question:

- **`config/conventions/figma.yaml`** — facts about the Figma library: naming patterns, glyph and subcomponent matching, how images are expressed. See [Conventions](/schema/conventions/).
- **`config/conventions/specs.yaml`** — conventions about the spec itself: the states classification and the props carrying accessibility and value semantics. See [Conventions](/schema/conventions/).
- **`config/conventions/react.yaml`** and **`config/conventions/web-components.yaml`** — commented stubs for the code platforms; a file of pure comments declares nothing until you opt in.
- **`config/settings.yaml`** — choices about this run: sources, spec output, assets. See [Settings](/schema/settings/).

Each file ships with sensible defaults and inline documentation with links to the full configuration reference. `settings.yaml` includes an empty `data.sources` object ready for your Figma file keys.

This is the recommended way to get started with Spectacular in a new project.

## What Gets Created

```
config/
  conventions/
    figma.yaml           # what the Figma library is
    specs.yaml           # what the spec declares about itself
    react.yaml           # code-platform stub, commented out
    web-components.yaml  # code-platform stub, commented out
  settings.yaml          # how output behaves, and where it goes
```

`config/conventions/figma.yaml` declares how the library is authored — most conventions start commented out, since absence means the library declares no such convention:

```yaml
# Facts about the Figma library — every consumer of that library declares the same values.
# naming: SENTENCE

# glyphs:
#   match: 'DS Icon Glyph / {i}'

subcomponents:
  # scope: PAGE
  match:
    - '{C} / _ / {S}'
  # exclude:
  #   - '{C} / Examples / {S}'

# slotConstraints: true
```

`config/conventions/specs.yaml` declares conventions about the spec itself — every member names a prop or enum value the spec declares:

```yaml
# states:
#   hover:
#     prop: state
#     value: hover
#   disabled:
#     prop: disabled   # boolean prop — value defaults to "true"
```

`config/settings.yaml` declares run choices, grouped by concern:

```yaml
# Choices about this run — curation, sources, spec output, assets.
author: <Your Name Here>

curation:
  # defaultSelection: ALL
  # preserveManualSelections: true
  # includeDependencies: false

data:
  directory: ./data
  sources:
    library:
      key: YOUR_FIGMA_FILE_KEY
      fetch: [file, variables, styles, icons]

assets:
  directory: ./assets

spec:
  directory: ./specs
  format: YAML
  keys: CAMEL
  layout: LAYOUT
  tokens: TOKEN
  color: HEXA
  variantDepth: 9999
  details: LAYERED
  # roles: true
  # roleValidation: error
  # collapsePrimitiveWrapper: true
  # promotePrimitives: true
  # invalidVariants: true
  # invalidCombinations: false
  # emptyVariants: true
  # defaultSlotContent: true
  # splitComponents: false
  # splitConcerns: false
  # useSubfolders: false
```

Every commented line is the opposite of its default, so uncommenting one always changes behaviour. Each carries a link to its reference page in the generated file. The full table is in [Settings](/schema/settings/).

The scaffolded source is a placeholder: replace `YOUR_FIGMA_FILE_KEY` with your file's key before running `specs fetch`.

Each section includes inline comments with references to the full documentation.

## Options

### `--force`
Overwrite existing config files without prompting.

By default, if any of the files exists, `init` prompts before overwriting. Use `--force` to skip the prompt.

```bash
# Prompt before overwrite (default)
specs init

# Overwrite without prompting
specs init --force
```

### `--config <path>` / `-c <path>`
Custom directory to write the `config/` folder into (default: current directory).

```bash
# Scaffold config/ inside a workspace subdirectory
specs init --config ./workspaces/library
# Creates ./workspaces/library/config/conventions/*.yaml and settings.yaml
```

## Examples

### Example 1: Basic Initialization

```bash
cd my-design-system
specs init

# Output:
# ✓ Created config/conventions/figma.yaml
# ✓ Created config/conventions/specs.yaml
# ✓ Created config/conventions/react.yaml
# ✓ Created config/conventions/web-components.yaml
# ✓ Created config/settings.yaml
# 📚 Next steps:
#    1. Edit the config file to add your Figma file keys
#    2. Run: specs fetch
#    3. Run: specs scan
#    4. Run: specs generate
```

### Example 2: Multiple Workspaces

```bash
# One config/ directory per workspace
specs init --config ./workspaces/dev --force
specs init --config ./workspaces/prod --force

# Use with --config flag on other commands
specs fetch --config ./workspaces/dev/config
specs generate data/library.file -c "Button" --config ./workspaces/prod/config
```

### Example 3: Force Overwrite

```bash
# If you accidentally delete your config, recreate it
specs init --force
```

## Upgrading from a single config file

A pre-split `specs.config.yaml` (or `.json`) is no longer read (ADR-071), and `init` refuses to run while one is present — scaffolding defaults over it would quietly replace whatever the workspace actually declared:

```
Error: found specs.config.yaml — a pre-split configuration (ADR-071).
  Run `specs migrate config` to convert it, keeping what this workspace declares.
  To scaffold fresh defaults instead, remove specs.config.yaml first.
```

Run [`specs migrate config`](/cli/commands/migrate/) to convert the file into the split layout — the [Settings](/schema/settings/) and [Conventions](/schema/conventions/) references show where each former member now lives. Use `init` only for a workspace with no existing configuration.

---

**See Also:**
- [Configuration Reference](/settings/) - Config file options
- [Getting Started](/cli/getting-started/) - Quick start guide
