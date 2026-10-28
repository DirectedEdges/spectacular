---
title: "Getting Started"
---
Spectacular CLI generates component specifications from your Figma design system. This guide walks you through setup and your first spec generation.

:::tip[Using Claude Code?]
Skip the manual walkthrough. Install the CLI and its skills:

```bash
npm install -g @directededges/specs-cli
specs skills install
```

Then paste this into Claude Code:

```
Follow the specs-cli.workspace.setup skill to set up a Spectacular workspace here.
```

It handles install, config, token setup, fetch, curation, the first build, and a running Storybook — asking only the decisions that actually need you. See [`skills install`](/cli/commands/skills/) for what else it writes.
:::

**Quick nav:**
1. [Install](#step-1-install)
2. [Set up your environment](#step-2-set-up-your-environment)
3. [Fetch the Figma file](#step-3-fetch-the-figma-file)
4. [Scan and select components](#step-4-scan-and-select-components)
5. [Generate specs](#step-5-generate-specs)
6. [Generate code (optional)](#step-6-generate-code-optional)

---

## Step 1: Install

Spectacular CLI requires **[Node.js 20.19+](https://nodejs.org/)** (Node 22 LTS recommended — the Storybook host `specs storybook init` scaffolds will not start on anything older). Install it if you haven't already, then install Spectacular CLI globally:

```bash
npm install -g @directededges/specs-cli
specs --version
```

## Step 2: Set up your environment

Three things to configure: config files, your Figma file key, and a Figma access token.

### Initialize config

Scaffold the `config/` directory with sensible defaults:

```bash
specs init
```

This creates the split configuration, each file answering one question:

- **`config/conventions/figma.yaml`** — facts about the Figma library: naming patterns, glyph and subcomponent matching, how images are expressed. See [Conventions](/schema/conventions/).
- **`config/conventions/specs.yaml`** — conventions about the spec itself, like the [states](/settings/states/) classification.
- **`config/conventions/react.yaml`** and **`config/conventions/web-components.yaml`** — what each code platform calls the things the spec models. Scaffolded fully commented, so they're inert until you uncomment a binding. See [Conventions](/schema/conventions/).
- **`config/settings.yaml`** — choices about the run: sources, spec output, assets. See [Settings](/schema/settings/).

### Add your Figma file key

Open `config/settings.yaml` and add your Figma file key. Find it by copying your Figma file's URL — the key is the string between `/design/` (or `/file/`) and the file name:

```
https://www.figma.com/design/AbCdEfGhIjKlMnOpQr/My-Design-System
                             ^^^^^^^^^^^^^^^^^^
                             This is your file key
```

Add it under `data.sources`, which should be uncommented:

```yaml
data:
  directory: ./data
  sources:
    library:
      key: AbCdEfGhIjKlMnOpQr
      fetch: [file, variables, styles]
```

### Add your Figma access token

Create a `.env` file in your project directory (and add it to `.gitignore`):

```
FIGMA_TOKEN=your_figma_token_here
```

To create a token, go to [Figma Settings → Tokens](https://www.figma.com/settings/tokens), click **Create a new token**, and select these scopes: `file_metadata:read`, `file_content:read`, `library_assets:read`, `library_content:read`, and `file_variables:read`.

A **license key** is optional — Spectacular CLI works at a free tier without one. To unlock Pro features, add `SPECS_LICENSE_KEY` to your `.env` file. See [Licensing](/overview/licensing/) for details.

### Other configuration (optional)

The defaults from `specs init` work well for most setups. When you're ready to customize:

- **`data.directory` / `spec.directory`** in `config/settings.yaml` — where fetched data is stored and specs are written. Defaults: `./data` and `./specs`.
- **`spec.splitComponents` / `spec.splitConcerns` / `spec.useSubfolders`** in `config/settings.yaml` — controls file organization: split per component, split by concern, use subfolders. All default to `true`, which is the layout [`react`](/cli/commands/react/), [`webcomponents`](/cli/commands/webcomponents/) and [`analyze`](/cli/analyze/) read.
- **`config/conventions/figma.yaml`** — declare how your library names glyphs, subcomponents, and images. See [Conventions](/schema/conventions/).
- **`config/conventions/specs.yaml`** — classify variant props as [states](/settings/states/).

:::note[Upgrading from a single config file?]
A pre-split `specs.config.yaml` is no longer read — every command stops with an error until it's converted, and `specs init` refuses to scaffold over it. Run one command to convert it:

```bash
specs migrate config
```

It writes `config/conventions/` and `config/settings.yaml` from your file, then renames the original to `specs.config.yaml.migrated`. See [`migrate`](/cli/commands/migrate/).
:::

## Step 3: Fetch the Figma file

Download raw data from your configured Figma sources:

```bash
specs fetch
```

## Step 4: Scan and select components

Scan your fetched data to build a manifest of available components:

```bash
specs scan
```

Then open the generated manifest (e.g., `data/library.manifest.md`) and adjust the `✓` column for the components you want:

```md
| ✓ | Name | ID | Type | Dev Status |
|------|------|------|------|------------|
| [ ] | _random Test experiment | 12:1 | COMPONENT | NONE |
| [x] | Button | 12:2 | COMPONENT_SET | READY_FOR_DEV |
| [x] | Card | 12:3 | COMPONENT_SET | READY_FOR_DEV |
| [ ] | InternalHelper | 12:4 | COMPONENT | NONE |
| [ ] | Slot utility | 12:5 | COMPONENT | NONE |
```

By default, `scan` checks only components marked **Ready for Dev** in Figma. If your file has no Dev Mode status set anywhere, it falls back to including every `COMPONENT_SET` and standalone `COMPONENT`. Re-running `scan` preserves your manual edits and only flips checkboxes when a component's `Dev Status` actually changes — pass `--keep-checks` to preserve them even then. See the [`scan`](/cli/commands/scan/) reference for full merge behavior.

## Step 5: Generate specs

By default, the `generate` command creates specs for all selected components.

```bash
specs generate
```

Once generated, open the specs file to review the results!

### Single component

Alternatively, generate a spec for one component directly from fetched data — useful when setting up or iterating:

```bash
specs generate data/library.file \
  -c "Button" \
  -o specs/
```

`-c` takes a single component. To generate a small subset without editing the manifest, run the command once per component.

## Step 6: Generate code (optional)

Specs are also the input to the experimental code generators. Each command emits a working component for every spec — its contract, stylesheet, and Storybook stories — into a directory shaped like the package it could become:

```bash
specs react            # React components into react/
specs webcomponents    # Lit custom elements into webcomponents/
```

No arguments — the target is the command. Both read the default file layout `generate` writes (the split flags at their `true` defaults), and both write the same platform-neutral `assets/cssvars/` tree, so running both is not a conflict. See [`react`](/cli/commands/react/) and [`webcomponents`](/cli/commands/webcomponents/) for what each file carries.

## Once you have done it the long way

Steps 4 to 6 are the same chain every time: scan, generate, emit each platform, publish Storybook. Two experimental commands do all of it in order, working out what your workspace has from what is on disk:

```bash
specs build    # run the chain once
specs run      # run it, then watch and redo whatever a change affects
```

`specs fetch` stays separate on purpose — it is the step that spends an API call, so you decide when. Everything after it follows from what lands in `data/`.

Learning the individual commands first is worth it: they are what the chain runs, and what you reach for when only one of them needs to happen. See [`build`](/cli/commands/build/) and [`run`](/cli/commands/run/).

##  Operationalize: CI/CD pipeline

To operationalize spec generation, teams use a github action script that runs at a specific cadence.

```yaml
# .github/workflows/generate-specs.yml
name: Generate Component Specs
on:
  schedule:
    - cron: '0 0 * * *'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'

      - run: npm install -g @directededges/specs-cli

      - run: specs fetch
        env:
          FIGMA_TOKEN: ${{ secrets.FIGMA_TOKEN }}

      - run: specs generate
        env:
          SPECS_LICENSE_KEY: ${{ secrets.SPECS_LICENSE_KEY }}

      - run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add specs/
          git commit -m "Update specs" || true
          git push
```
