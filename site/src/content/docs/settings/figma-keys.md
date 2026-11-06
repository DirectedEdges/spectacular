---
title: "naming"
description: "Declare the naming convention your Figma file uses, so formatted keys stay reversible"
---

The naming convention your Figma file uses for layer names and component property names. A fact about the library — a wrong declaration makes name reversal undefined, not merely different — and declaring it gives every formatted key a defined name to reverse back into when a spec is rendered into Figma.

| | |
|---|---|
| **File** | `config/conventions/figma.yaml` |
| **Path** | `naming` |
| **Type** | enum |
| **Default** | `NONE` |

## Options

| Value | Description |
|---|---|
| `NONE` | No convention declared. Names are not checked, and nothing is preserved |
| `SENTENCE` | First word capitalized, rest lowercase (`Icon leading`) |
| `TITLE` | Every word capitalized (`Icon Leading`) |

Only the two conventions observed in real Figma files are accepted as declarations. This is deliberately narrower than `keys`.

## Example

```yaml
# config/conventions/figma.yaml
naming: TITLE   # Figma layer names are Title Case
```

```yaml
# config/settings.yaml
spec:
  keys: CAMEL     # spec emits camelCase
```

## Convention vs setting

Where [`keys`](/settings/keys/) controls what the spec *emits*, `naming` describes what the Figma file *contains*. That is why the two live in different files: `keys` is a run choice in `config/settings.yaml`, while `naming` is a fact about the library, declared in `config/conventions/figma.yaml`.

## Opting in

`NONE` is the default, and it means your specs behave exactly as they always have: names are formatted per [`keys`](/settings/keys/), nothing is checked, and no Figma names are preserved.

Declaring `SENTENCE` or `TITLE` turns on three things at once:

- Every layer and property name is checked against the safe key grammar.
- Any name that cannot survive formatting has its Figma name recorded in `$extensions.com.figma.name`.
- Rendering a spec back into Figma has a defined name to reverse into.

This is a trade, not a free upgrade. You gain round-trip fidelity and pay for it in spec size — every name outside the grammar grows an extension block. On a file with inconsistent layer naming, that can be a lot of new output. Declare a convention when you intend to render specs back into Figma, or when you want the divergences surfaced.

Declaring the convention your file actually uses keeps specs quiet. A file authored in Title Case but read as sentence case treats every name as divergent, so each anatomy element and prop carries a preserved copy of its Figma name — noise that buries the names genuinely worth fixing.

## Preserved names

Names that fall outside the declared convention, or outside the safe character set, are still fully supported. Their Figma name is recorded in `$extensions.com.figma.name` on the definition.

Names already written as keys are handled too. If your file is mostly sentence case but a few properties are named `isDisabled` for the engineers reading them, those are kept exactly as authored — provided they match the convention you emit — and never rewritten to `Is disabled` when the spec is rendered back.

## Legacy name

In the pre-split `specs.config.yaml`, this option was `config.format.figmaKeys`. That file is no longer read — [`specs migrate config`](/cli/commands/migrate/) converts it, moving that member to `figma.naming`.

## Further reading

- [Keys](/settings/keys/) for the output naming convention.
- [Key Formatting guide](/guides/key-formatting/) for the safe key grammar and round-trip behavior.
