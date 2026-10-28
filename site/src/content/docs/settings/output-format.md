---
title: "format"
description: "Control the serialization format for generated specs"
---

Output serialization format. A different team could pick the other format and still be correct, and the CLI `--format` flag overrides this setting for individual commands.

| | |
|---|---|
| **File** | `config/settings.yaml` |
| **Path** | `spec.format` |
| **Type** | enum |
| **Default** | `YAML` |

## Options

| Value | Description |
|---|---|
| `YAML` | Human-readable YAML. Default — a spec is read and hand-edited far more often than it is parsed |
| `JSON` | JavaScript Object Notation |

## Example

```yaml
spec:
  format: JSON  # Generate JSON instead
```
