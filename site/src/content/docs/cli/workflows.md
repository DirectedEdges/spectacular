---
title: "Workflows"
description: "Real-world usage patterns for single components, batch processing, and CI/CD integration"
---

Three ways to generate specs, depending on how many components you need:

- [**Single Component**](#single-component) — fetch and generate one component at a time
- [**Many Components**](#many-components) — curate a manifest and generate in batch
- [**CI/CD Integration**](#cicd-integration) — automate generation in a pipeline

There's also a reverse direction — turning a spec back into a live Figma component with [`render`](#render-to-figma). Unlike the workflows above, it's inherently interactive (it needs an open Figma session) and isn't a fit for CI/CD.

## Many Components

Process multiple components from a design system using a curated manifest.

### Step 1: Create Manifest

```bash
# Auto-resolves configured source; writes to data/{alias}.manifest.md by default
specs scan

# Or pass an explicit path:
specs scan data/design-system.file
```

### Step 2: Review and Edit

Open `data/design-system.manifest.md`:

```markdown
# Component Manifest

**Scan format version:** 2  
**Generated:** 2026-05-08T20:45:00Z  
**File:** data/design-system.file
**Variables:** data/design-system.variables.json
**File last modified:** 2026-05-08T17:48:26Z

## Components

| ✓ | Name | ID | Type | Dev Status |
|------|------|------|------|------------|
| [x] | DS Accordion | 5507:24 | COMPONENT_SET | READY_FOR_DEV |
| [x] | DS Alert | 5507:26 | COMPONENT_SET | READY_FOR_DEV |
| [x] | DS Avatar | 5507:30 | COMPONENT_SET | READY_FOR_DEV |
| [x] | DS Badge | 5507:32 | COMPONENT_SET | READY_FOR_DEV |
| [ ] | DS Divider OLD | 5507:44 | COMPONENT_SET | NONE |
| [x] | DS Dropdown | 5507:46 | COMPONENT_SET | READY_FOR_DEV |
```

Change `[x]` to `[ ]` (or vice versa) in the first column for components to exclude or include. The `Dev Status` column reflects what designers have flagged in Figma Dev Mode and is read-only on each scan.

### Step 3: Generate

```bash
# Zero-config: reads default manifest and writes to spec.directory
specs generate --verbose

# Or with explicit paths:
specs generate components.md \
  -o specs/ \
  --verbose
```

Split output into per-component files, subfolders, or separate API and variant files using [output mode flags](/settings/output/).

---

## Single Component

Generate a spec for one component:

```bash
specs fetch

specs generate data/library.file \
  -c "DS Alert"
```

### Using Node IDs

If component names have special characters or duplicates, use node IDs:

```bash
# Find the node ID from a manifest
specs scan -o manifest.md
# Look in the table for the row whose Name matches:
# | [x] | DS Button/Icon | 5507:123 | COMPONENT_SET | READY_FOR_DEV |

# Generate by ID
specs generate data/library.file \
  -c "5507:123" \
  -o specs/
```

Use `--format json` to output JSON instead of YAML. See [Output configuration](/settings/output/) for all output modes and format options.

---


## Fetch and build

The workflows below type each step. [`specs build`](/cli/commands/build/) *(experimental)* runs all of them in order instead, and [`specs run`](/cli/commands/run/) *(experimental)* keeps doing it as you work:

```bash
specs fetch     # you choose when to spend an API call
specs build     # scan → generate → analyze → react, webcomponents → storybook
```

Both work out what your workspace has from what is on disk, so there is nothing to configure. They are worth reading first if you keep forgetting which command comes next — that is the problem they exist to remove. The steps below are still the reference for what each one does, and still what you reach for when you want to run just one.

---
## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/generate-specs.yml
name: Generate Component Specs

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:  # Manual trigger
  push:
    paths:
      - 'manifests/**'
      - 'config/**'

jobs:
  generate-specs:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install Spectacular CLI
        run: npm install -g @directededges/specs-cli

      - name: Fetch Figma data
        run: specs fetch
        env:
          FIGMA_TOKEN: ${{ secrets.FIGMA_TOKEN }}

      - name: Generate component specs
        run: specs generate
        env:
          SPECS_LICENSE_KEY: ${{ secrets.SPECS_LICENSE_KEY }}

      - name: Commit updated specs
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add specs/ data/
          git diff --staged --quiet || git commit -m "chore: update component specs"
          git push
```

**Secrets Required:**
- `FIGMA_TOKEN` - Figma Personal Access Token
- `SPECS_LICENSE_KEY` - Spectacular license key (optional, for Pro features)

To bring the emitted platform trees and Storybook up to date in the same run, replace the generate step with [`specs build`](/cli/commands/build/) *(experimental)*. It runs generate and everything downstream of it, and exits non-zero at the first step that fails:

```yaml
      - name: Build the workspace
        run: specs build
        env:
          SPECS_LICENSE_KEY: ${{ secrets.SPECS_LICENSE_KEY }}
```

Keep the fetch as its own step either way. `build` is deliberately local — it needs no `FIGMA_TOKEN` and cannot reach a live Figma file, which is what makes the network call visible in the log rather than buried inside a longer command.

### Shell Script for Daily Sync

```bash
#!/bin/bash
set -e

echo "Fetching Figma data..."
specs fetch

echo "Generating component specs..."
specs generate --verbose

echo "Sync complete!"
```

---

## Render to Figma

Turn a spec back into a live Figma component. This needs a running CLI bridge and an open Figma session — see the [Render to Figma guide](/guides/render-to-figma/) for full setup.

```bash
# One-time per session: start the bridge, then in Figma enable
# the CLI Bridge in the Specs 2 plugin and navigate to the target page.
specs bridge start
```

```bash
# Render one component
specs render specs/components/deButton.yaml

# Or render every component in a directory
specs render specs/
```

---

## Generate from the Current Selection

When the component you want is already open in Figma, skip the fetch entirely and generate from the live selection over the same bridge. See [Bridge Mode](/cli/commands/generate/#bridge-mode) for the full behavior.

```bash
# Bridge running, Specs 2 plugin open with CLI Bridge enabled,
# and the component selected in Figma.
specs generate --from-bridge -o specs/
```

The spec reflects the document as it stands right now, including unsaved edits — useful while iterating on a component rather than after a fetch.

```bash
# Pin the node instead of relying on a manual selection
specs generate --from-bridge --node 5507:123 -o specs/

# Pick a file when several are connected to one bridge
specs bridge status
specs generate --from-bridge --file abc123XYZ -o specs/
```

With 2+ files connected and no `--file`, an interactive terminal prompts you to choose; scripts and CI fail with the ambiguity error instead of hanging.

Pair it with `render` to round-trip a spec and diff the result:

```bash
specs render specs/components/dsButton/
specs generate --from-bridge -o roundtrip/
diff specs/components/dsButton/api.yaml roundtrip/components/dsButton/api.yaml
```

---

## Tips

### Pipe to Other Tools

```bash
# Extract just props
specs generate lib.json -c "Button" | yq '.props'

# Format and validate
specs generate lib.json -c "Button" --format yaml | yamllint -

# Convert YAML to JSON
specs generate lib.json -c "Button" --format yaml | yq -o json > button.json

# Check component metadata
specs generate lib.json -c "Button" | yq '.metadata'
```

### Verbose Mode for Debugging

```bash
specs generate data/library.json \
  -c "DS Button" \
  --verbose \
  -o specs/ 2>&1 | tee debug.log
```

### Check Manifest Before Generating

```bash
# Count selected components
grep -c "^| \[x\] |" data/library.manifest.md

# List selected component names (second column of the table)
grep "^| \[x\] |" data/library.manifest.md | awk -F '\\|' '{ gsub(/^ +| +$/, "", $3); print $3 }'
```

---

## Best Practices

### Version Control Manifests

Keep manifests in version control to track component selection:

```bash
git add data/library.manifest.md
git commit -m "feat: add Modal to component manifest"
```

### Curate Through Figma Dev Mode

The cleanest way to drive curation is to flag components as **Ready for Dev** in Figma. `scan` checks `READY_FOR_DEV` rows by default, so designers can signal what to include without anyone editing the manifest:

```bash
# Designer marks new component Ready for Dev in Figma
specs fetch
specs scan
# Merge: 1 updated by devStatus, 163 preserved
```

When designers haven't (or won't) adopt Dev Mode status, fall back to manual curation. Manual `[x]` / `[ ]` edits are preserved across rescans unless `devStatus` itself changes for that row — pass `--keep-checks` to lock manual choices regardless.

### Document Manual Overrides

For rows you've manually overridden against Figma's signal, leave a note above the table or alongside the row in your commit message. The table format doesn't accept inline comments, but git history makes the intent clear:

```bash
git commit -m "manifest: keep DS Tooltip NEW unchecked — pending API redesign"
```

## See Also

- [CLI Overview](/cli/) - Commands, Free vs Pro, output format
- [Settings](/settings/) - Config file reference
- [Render to Figma](/guides/render-to-figma/) - CLI bridge setup and usage
