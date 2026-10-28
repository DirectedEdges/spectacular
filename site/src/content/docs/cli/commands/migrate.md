---
title: "migrate"
---
Run a versioned migration over the workspace — converting artifacts written for an older version of Spectacular into the current layout.

## Usage

```bash
specs migrate <subject> [options]
```

## Purpose

Migrations are named by *subject* — what they convert — and registered per source version, so `migrate` stays meaningful as new migrations arrive. Two migrations are registered today:

- **`specs migrate config`** (v1 → v2) — converts a pre-split `specs.config.yaml` / `specs.config.json` into the split `config/` directory introduced by ADR-071 and ADR-078.
- **`specs migrate config --from pipeline`** — renames a leftover `config/pipeline.yaml` out of discovery. The file is retired (ADR-071 amendment): transformers became the [`react`](/cli/commands/react/) and [`webcomponents`](/cli/commands/webcomponents/) commands, and [`analyze`](/cli/analyze/) has always taken its analyzers as arguments.

With no `--from`, `migrate` runs the first migration whose source it detects in the workspace.

Migrations write to the workspace, which is why they are a command you run deliberately rather than something the config loader does on your behalf: config loading happens inside read-only commands and in CI, and a read path must not mutate a checkout.

## `specs migrate config`

Converts the pre-split single file into the current split layout. The CLI no longer reads `specs.config.yaml` — every command stops with an error until the file is converted:

```
specs.config.yaml is no longer read (ADR-071).
  Run `specs migrate config` to write config/conventions/ and config/settings.yaml from it.
  Docs: https://specs.directededges.com/settings/
```

Running the migration:

1. Reads `specs.config.yaml` (or `specs.config.json`) from the current directory.
2. Writes each shape the file declares to its home: the Figma facts to `config/conventions/figma.yaml`, the states classification to `config/conventions/specs.yaml`, and the run choices to `config/settings.yaml`. Commented stubs are written for the code platforms (`react.yaml`, `web-components.yaml`). A shape the file never configured is skipped rather than written empty.
3. Renames the source to `specs.config.yaml.migrated` so config discovery stops finding it. The rename preserves the only record of what the workspace declared — the file is safe to delete once you have reviewed the generated files.

```bash
specs migrate config

# Output:
# config v1 → v2
#   Wrote: config/conventions/figma.yaml
#   Wrote: config/conventions/specs.yaml
#   Wrote: config/conventions/react.yaml
#   Wrote: config/conventions/web-components.yaml
#   Wrote: config/settings.yaml
#   Renamed: specs.config.yaml → specs.config.yaml.migrated  (safe to delete once you have reviewed the new files)
#
# Review the generated files before committing.
```

### When it refuses

If `config/` already contains authored files — `conventions.yaml`, `settings.yaml`, or anything inside `config/conventions/` — the migration refuses rather than overwrite them:

```
Error: config/ already contains settings.yaml — migrating would overwrite authored files. Move or delete them first.
```

If no pre-split file exists in the current directory, there is nothing to do:

```
Nothing to migrate — no v1 config found in this directory.
```

## `specs migrate config --from pipeline`

Renames a leftover `config/pipeline.yaml` (or `.json`) to `pipeline.yaml.migrated`. Nothing reads the file any more, and the config loader warns on every run while it is present. Detection also picks this migration automatically when no pre-split file exists:

```bash
specs migrate config

# Output:
# config pipeline → retired
#   Renamed: config/pipeline.yaml → config/pipeline.yaml.migrated  (safe to delete once you have reviewed the new files)
```

## Options

### `--dry-run`
Report what the migration would write and rename, without touching any file.

```bash
specs migrate config --dry-run

# Output:
# config v1 → v2
#   Would write: config/conventions/figma.yaml
#   Would write: config/conventions/specs.yaml
#   Would write: config/conventions/react.yaml
#   Would write: config/conventions/web-components.yaml
#   Would write: config/settings.yaml
#   Would rename: specs.config.yaml → specs.config.yaml.migrated
```

### `--source <path>`
Convert a file discovery would not find — a custom name, or one passed to other commands via `--config`. The loader's own refusal names this flag when it meets such a file:

```bash
specs migrate config --source ./legacy/my-config.yaml
```

### `--from <version>`
Choose the source version to migrate from (`v1` or `pipeline`). By default, `migrate` picks the first registered migration whose source it detects in the current directory.

### `--list`
List every registered migration and exit.

```bash
specs migrate --list

# Output:
# Available migrations:
#
#   specs migrate config --from v1
#       v1 → v2: single specs.config.yaml → config/conventions/<platform>.yaml + config/settings.yaml (ADR-071, ADR-078)
#
#   specs migrate config --from pipeline
#       pipeline → retired: config/pipeline.yaml retired — transformers became `specs react` / `specs webcomponents`, and `specs analyze` takes its analyzers as arguments (ADR-071 amendment)
```

## Examples

### Example 1: Upgrade a pre-split workspace

```bash
cd my-design-system
specs migrate config
# Review config/conventions/*.yaml and config/settings.yaml, then:
rm specs.config.yaml.migrated
```

### Example 2: Preview before converting

```bash
specs migrate config --dry-run
```

### Example 3: Clean up a retired pipeline file

```bash
specs migrate config --from pipeline
rm config/pipeline.yaml.migrated
```

---

**See Also:**
- [Configuration Reference](/settings/) - The split `config/` layout and every option
- [init Command](/cli/commands/init/) - Scaffolding `config/` in a workspace with no existing configuration
