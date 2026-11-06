---
title: "Output"
description: "Control where and how generated specifications are written"
---

Controls where and how to write generated specifications. Run choices — any split arrangement carries the same spec data. The split layout is the default: one folder per component, holding one file per concern; downstream commands — `transform`, `analyze`, `render` — read that layout, so most workspaces never set these at all.

| | |
|---|---|
| **File** | `config/settings.yaml` |
| **Path** | `spec.splitComponents`, `spec.splitConcerns`, `spec.useSubfolders` |
| **Type** | boolean (each) |
| **Default** | `true` (each) |

## Options

Four output modes, reached by turning parts of the default split off:

| Mode | `splitComponents` | `splitConcerns` | Output Structure |
|------|-------------------|-----------------|------------------|
| **Combined** (default) | true | true | `button/api.yaml`, `button/variants.yaml` (+ `button/examples.yaml` if examples), ... |
| **Per-component** | true | false | `button.yaml`, `alert.yaml`, ... |
| **Per-concern** | false | true | `api.yaml` + `variants.yaml` (+ `examples.yaml` if any examples) |
| **Single-file** | false | false | `library.yaml` (all components) |

## Example

```yaml
spec:
  splitComponents: true    # One file per component (default)
  splitConcerns: true      # Separate API, variants, and examples (default)
  useSubfolders: true      # Nest each component in its own folder (default)
```

## `splitComponents`

Write one file per component rather than a single combined library file. The CLI flag `--combine-as-library` turns it off.

```yaml
spec:
  splitComponents: true
  useSubfolders: false  # button.yaml, alert.yaml (flat)
```

```yaml
spec:
  splitComponents: true
  useSubfolders: true   # button/button.yaml, alert/alert.yaml
```

File naming converts display names to camelCase (e.g., `"DS Alert"` → `dsAlert.yaml`).

## `splitConcerns`

Separate API specification, variant configuration, and examples. The CLI flag `--combine-concerns` turns it off.

```yaml
spec:
  splitConcerns: false
```

**API file** (`api.yaml`):
```yaml
components:
  - name: Button
    anatomy: ...
    props: ...
```

**Variants file** (`variants.yaml`):
```yaml
components:
  - name: Button
    default: ...
    variants: ...
```

**Examples file** (`examples.yaml`):
```yaml
components:
  - name: Alert
    slotContentExamples: ...
    instanceExamples: ...
```

`examples.yaml` is written only when at least one component has `slotContentExamples`
or `instanceExamples`; components without examples are omitted from it. Without this
file the `$slotContent` references in `default`/`variants` would have no target.

Example output is a [Pro feature](/settings/default-slot-content/) — on the free tier no example data is produced, so `examples.yaml` is never written.

## `useSubfolders`

Nest each component's files in a subfolder named for the component. Only applies when `splitComponents: true`. The CLI flag `--no-subfolders` turns it off.

**With subfolders** (default):
```
specs/
├── button/
│   └── button.yaml
├── alert/
│   └── alert.yaml
└── card/
    └── card.yaml
```

**Without subfolders** (flat):
```
specs/
├── button.yaml
├── alert.yaml
└── card.yaml
```

## CLI Flag Priority

Output configuration follows the standard [priority system](/settings/#priority-system):

1. **CLI flags** (highest): `--combine-as-library`, `--combine-concerns`, `--no-subfolders`
2. **Config file**: `spec` block in `config/settings.yaml`
3. **Defaults** (lowest): the full split layout, YAML format

Each flag only ever turns a split off, so an absent flag defers to the configured value rather than overriding it.

```bash
# Config leaves splitConcerns at its default of true
# CLI overrides to false for this run
specs generate --combine-concerns
```

## Legacy names

In the pre-split `specs.config.yaml`, these flags lived in a root-level `output` block and defaulted to `false`. That file is no longer read — [`specs migrate config`](/cli/commands/migrate/) converts it, moving them to `spec`. Because the defaults inverted, the migration writes all three out explicitly so a migrated workspace keeps emitting what it emits today; delete those three lines to adopt the new default.
