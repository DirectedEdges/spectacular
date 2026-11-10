---
title: "overrides"
description: "Whether a run produces and honours the style patches a placed instance applies inside the component it instances"
---

When `true`, instance elements carry [`overrides`](/schema/elements/#overrides) — the style patches a placed instance applies inside the component it instances. One choice read at every boundary: generation emits them, render applies them to the canvas, and the code emitters honour them. Setting `false` states that this workspace does not use overrides, and each direction skips them rather than deciding separately.

| | |
|---|---|
| **File** | `config/settings.yaml` |
| **Path** | `spec.overrides` |
| **Type** | boolean |
| **Default** | `true` |

## Example

```yaml
spec:
  overrides: false   # this workspace keeps its specs free of per-instance patches
```

## Behavior

| Setting | Generate | Render | Emit code |
|---|---|---|---|
| `true` | Overridden fields on a placed instance become `overrides` entries | Entries are applied as nested-layer overrides | Patches reach the part each entry names |
| `false` | No `overrides` are written | Entries in an existing spec are not applied | Patches are not emitted |

It governs behavior, not validity. A spec authored with `overrides` stays valid under `overrides: false` — the run simply does not act on them. Nothing in the JSON Schema changes with the setting.

The value is recorded in each spec's `metadata.settings.spec`, so a spec with no override blocks tells you which case it is: a library that has none, or a run that was told not to look.

## Not the same as `overridable`

Two things one letter apart, and they answer different questions.

| | `overrides` | `overridable` |
|---|---|---|
| **What it answers** | Does this run deal in overrides at all? | May this style property be patched? |
| **Where it lives** | `config/settings.yaml`, `spec.overrides` | `styles.schema.json`, per `Styles` property |
| **Who sets it** | You, per workspace | The schema — the same everywhere |

`overrides: true` does not widen what an override may set. The property-level grant still applies, and [41 of the 46 style properties carry it](/schema/styles/#overridable).

## Upgrading

The default is `true`, so the first run after adopting this release emits override blocks that were not there before. The data was always in your Figma file and was previously discarded, so this is the feature arriving rather than a change in what your file means — but it is a diff on specs you did not edit. Set `overrides: false` to keep the previous output.

## Further reading

- [`Element.overrides`](/schema/elements/#overrides) — the shape, and what an entry may reach
- [`overridable`](/schema/styles/#overridable) — which style properties an override may set
