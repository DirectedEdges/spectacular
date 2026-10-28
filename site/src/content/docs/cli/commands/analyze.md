---
title: "analyze"
description: "Run analysis passes over component specs and write aggregate reports to analysis/."
---

Reads your component specs and writes aggregate reports — a prop inventory, a token-usage index, a dependency graph, a list of names a formatted key cannot reconstruct. What each report contains is covered in the [Analyze](/cli/analyze/) section; this page is the command reference.

## Usage

```bash
specs analyze [analyzers...] [options]
```

Analyzer names are positional. There is no config key for them — analysis runs on demand.

## Naming analyzers

**With no analyzer named, every analyzer runs**, and the run says which:

```
[analyze] no analyzer named — running all: props, styling, dependencies, keys, roles
```

Name a subset when you want one report quickly, or when a slower analyzer has nothing to tell you about the change you just made.

```bash
specs analyze                              # every analyzer
specs analyze props
specs analyze props styling dependencies
specs analyze props --analysis ./reports
```

An unknown name is a **warning, not a failure**. The run continues with whichever names it recognised:

```bash
specs analyze props bogus
# Warning: unknown analyzer "bogus" — skipping
# …props still runs
```

The run only fails if *nothing* is left to do — every name given was unknown — and the error lists the names that exist.

## As a step of the chain

[`specs build`](/cli/commands/build/) and [`specs run`](/cli/commands/run/) include `analyze` between `generate` and the platform steps, so the reports stay current without being asked for. The chain always runs every analyzer: naming a subset is a command-line convenience, not something a workspace configures.

Two differences from running it yourself:

- **It is never narrowed.** `--components Alert` limits the rest of the pass to Alert and still analyses the whole catalogue, because every report here aggregates across it. A one-component report would overwrite a catalogue-wide one.
- **A fetch is an input.** Refreshing variables or styles changes what `styling.unused` should say with no spec having changed, so `specs run` re-analyses when `data/<alias>.variables.json` or `<alias>.styles.json` moves.

`--skip analyze` leaves the reports as they are. Nothing downstream reads them — the platform code does not consult an analysis, and Storybook publishes whatever reports are on disk.

## Arguments

### `[analyzers...]` (optional)

Any of `props`, `styling`, `dependencies`, `keys`, `roles`, in any order. Omit to run all five.

## Options

### `-o, --output <path>`

The specs directory to read. Defaults to `spec.directory` from `config/settings.yaml`, then the current directory.

A directory written before the `components/` layout is read as a flat set of components, and the run says so once.

### `--analysis <path>`

Where to write the reports. Defaults to `analysis/` inside the specs directory.

Use it to keep a report set outside the workspace — a CI artifact, or a snapshot you intend to diff against a later one.

### `--config <path>`

Path to a `config/` directory. Defaults to discovery from the current directory.

### `--verbose`

Name each spec as it is processed. Useful when one of them is failing and you want to know which.

## Examples

### Every report, default locations

```bash
specs analyze
```

### One report, into a directory you diff

```bash
specs analyze dependencies --analysis ./reports/before
```

### A specs directory that is not the configured one

```bash
specs analyze --output ./packages/tokens/specs
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Every spec analysed |
| `1` | One or more specs failed to analyse — each is named by itself, above the summary |
| `2` | The specs directory does not exist, or every analyzer named was unknown |
| `3` | No component directories with an `api.yaml` were found |

A failed spec does not stop the pass. The run analyses the rest, reports `N succeeded, M failed`, and exits non-zero.

## See Also

- [Analyze](/cli/analyze/) — what each of the five reports contains
- [`generate`](/cli/commands/generate/) — writes the specs this reads
- [`build`](/cli/commands/build/) and [`run`](/cli/commands/run/) — run this as a step of the chain
