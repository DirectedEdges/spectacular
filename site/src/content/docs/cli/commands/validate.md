---
title: "validate"
description: "Check specs against the schema and resolve every cross-file reference."
---

Checks spec folders against the schema package: each concern file against its JSON Schema definition, then the references JSON Schema cannot express because they cross nodes, files, or spec folders.

It reads only. Nothing here writes, and no license is needed.

`validate` is the referee of a hand-authoring round — [`author start`](/cli/commands/author/) writes a folder that passes it at zero edits, and you run it after each concern file so that every error you see is one you just introduced. It is equally useful over a generated catalogue, where it catches the stale references a re-generate leaves behind.

## Usage

```bash
specs validate [components...] [options]
```

With no arguments it validates the whole catalogue — components and compositions. Naming one or more spec folder keys narrows it. A name that matches no folder is a warning and is skipped, not an error.

| Option | Description |
|--------|-------------|
| [`--authored`](#authored) | Authored spec: a missing `metadata.source` is expected and not reported |
| [`--format <format>`](#format) | Output format: `text` (default) or `json` |
| `--config <path>` | Path to a `config/` directory |
| `-o, --output <dir>` | Specs directory (default: `spec.directory` from settings) |

## What it checks

Two layers, in order.

**Schema conformance.** Each of `api`, `variants` and `examples` is validated against its own definition in `@directededges/specs-schema`. The two authored documents beside a spec — [`supplemental.yaml`](/schema/documents/supplemental/) and [`guidelines.yaml`](/schema/documents/guidelines/) — are shape-checked against their published contracts too.

**Reference integrity.** The errors a JSON Schema cannot catch, because they cross a node, a file, or a spec folder:

| Reference | Must resolve to |
|-----------|-----------------|
| [`$binding`](/schema/prop-binding/) | A prop declared in the owning scope's `props` |
| [`$slotContent`](/schema/slot-content-ref/) | A `slotContentExamples` entry, here or in another spec |
| [`$image`](/guides/images/) | An entry in an `images` registry, here or in another spec |
| [`$token`](/schema/token-reference/) | A name present in the render caches, when a cache can answer |
| `instanceOf` | A component folder in the workspace, or an in-file subcomponent |
| `layout` | Element names declared in the anatomy the tree belongs to |
| `elements` | Keys declared in that same anatomy |
| `configuration` | Declared props, with legal values for boolean and enum props |

A spec has one scope for itself and one per [subcomponent](/guides/subcomponent-scoping/). A `#/props/<name>` pointer written inside `subcomponents.<name>` resolves against that subcomponent's own props, never the parent component's.

`instanceExamples` are held to the same contract as a variant's `configuration`. Unchecked, a stale example — `size: Large` after the enum dropped `Large` — validates clean and reaches Storybook as a silently wrong story.

### Token checking has a declared blind spot

`$token` names are checked against the lookup tables under `{data.directory}/cache/`. An empty cache cannot distinguish "the library has no tokens of this kind" from "this was never fetched", so that class of token is skipped and the skip is reported as a note rather than passed silently.

## Output

Findings are deterministic — sorted by spec, file, then path — so two runs over the same tree print the same lines.

```
✗ components/pageHeader/variants.yaml /default/elements/title/content — $binding "#/props/heading" names no declared prop
⚠ components/pageHeader/api.yaml /metadata — source is missing
✗ 1 error, 1 warning across 2 specs (components 2, compositions 0)
```

A clean run prints one line:

```
✓ 164 specs (components 158, compositions 6) valid
```

The exit code is non-zero when there is at least one error. Warnings alone exit zero.

### Resolved dimension tokens

After the findings, a run prints what each dimension token resolves to in the library's default mode:

```
ℹ dimension tokens resolve to (default mode — themed, orientation only):
    pageHeader padding: space/400 → 16
```

These are an orientation aid for whoever is authoring. They are one mode's resolution of a themed value, and they never pass or fail anything.

## Options

### `--authored`

An authored spec has no `metadata.source` — that block records which Figma page and node a spec was captured from, and a spec written by hand was captured from nothing. `--authored` downgrades exactly that omission to a warning, and changes nothing else.

Never fabricate a `pageId` or `nodeId` to silence it.

```bash
specs validate pageHeader --authored
```

### `--format`

`json` prints the findings as structured data — spec counts, errors, warnings, and the resolved token report — for a CI step or another tool to read.

```bash
specs validate --format json
```

## Examples

```bash
# The whole catalogue
specs validate

# One spec, mid-authoring
specs validate pageHeader --authored

# Several, after a prop rename
specs validate button buttonGroup toolbar
```

## Related

- [Authoring a component](/guides/authoring-a-component/) — the round this command gates
- [`author`](/cli/commands/author/) — writes a folder that starts valid
- [supplemental](/schema/documents/supplemental/) and [guidelines](/schema/documents/guidelines/) — the two authored documents it shape-checks
- [`cache`](/cli/commands/cache/) — builds the lookup tables the `$token` check reads
