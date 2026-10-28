---
title: "Folders"
description: "Configure input and output directories for fetched data and generated specs"
---

Each concern in `config/settings.yaml` — `data`, `spec`, and `assets` — carries its own `directory`. All are run choices: a different team could point them anywhere and still be correct.

| | |
|---|---|
| **File** | `config/settings.yaml` |
| **Path** | `data.directory`, `spec.directory`, `assets.directory` |
| **Type** | string (each) |
| **Default** | `./data`, `./specs`, `./assets` |

## Options

| Path | Description |
|---|---|
| `data.directory` | Where `fetch` writes downloaded payloads, and where `generate` loads them from. Override per run with `--data-dir` on `fetch`, `scan`, and `generate` |
| `spec.directory` | Where `generate` commands write their output files. Override per run with `-o` on individual commands |
| `assets.directory` | Shared resources every code output points at, whatever the platform — icons, images, generated CSS, fonts |

The `generate` command's `--format` flag still controls output format (YAML vs JSON); these control directories only.

## Example

```yaml
data:
  directory: ./data
spec:
  directory: ./specs
assets:
  directory: ./assets
```

## Legacy names

In the pre-split `specs.config.yaml`, these were the root-level `dataDirectory` and `outputDirectory` members (and, before that, `sourceDirectory` as a deprecated alias for `dataDirectory`). That file is no longer read — [`specs migrate config`](/cli/commands/migrate/) converts it, moving both to `data.directory` and `spec.directory`.
