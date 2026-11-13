---
title: "Analyze"
description: "Run analysis passes over component specs and write aggregate reports to analysis/"
---

Analyzers read component specs and produce aggregate snapshots for governance, auditing, and LLM-assisted analysis. Unlike transforms — which produce build artifacts your codebase consumes — analyzers produce one-time snapshots you read, diff, or hand to a language model.

This section is what each report contains. How to run them — arguments, options, exit codes — is the [`analyze` command reference](/cli/commands/analyze/).

Output lands in `specs/analysis/`, beside the `components/` and `compositions/` directories a spec run writes, or in a custom path via `--analysis`.

A catalogue with no specs in it is a state, not an error. Every analyzer still writes its report, with zero counts and empty collections, so a workspace you are authoring from scratch has an analysis surface from its first run — and the reports fill in as you add specs rather than appearing partway through.

Compositions are read by the analyzers that have something to say about them. `dependencies` includes them — which components a screen is built from is the clearest blast-radius data a library has — and so does `styling`, since a composition carries real styling. `props`, `keys` and `roles` stay component-only: a composition declares no props and no anatomy of its own, so rows for it would be empty by construction and would dilute every per-component figure.

## Available Analyzers

| Analyzer | Output | What it produces |
|----------|--------|-----------------|
| [`foundations`](/cli/analyze/foundations/) | `analysis/foundations.yaml` index + `analysis/foundations/<type>.yaml` per token type + `foundations/icons.yaml` | The token language from fetched data — variables and named styles as ready-to-paste `{$token, $type}` objects, plus icon glyphs with their formatted key spellings. Runs on an empty catalogue |
| [`props`](/cli/analyze/props/) | `analysis/props.yaml` | Cross-library prop inventory — frequency, enum discordance, API surface, slots |
| [`styling`](/cli/analyze/styling/) | `analysis/styling.byComponent.json`, `analysis/styling.byToken.json`, `analysis/styling.unused.json` | Token usage indexed by component and by token name, plus tokens no spec references |
| [`dependencies`](/cli/analyze/dependencies/) | `analysis/dependencies.graph.json`, `analysis/dependencies.byComponent.json` | Component dependency graph — blast radius of a change, and which props consumers configure |
| [`keys`](/cli/analyze/keys/) | `analysis/keys.yaml` | Figma names a formatted key cannot reconstruct, as a per-component checklist. Requires `figma.naming` |
| [`roles`](/cli/analyze/roles/) | `analysis/roles.yaml` | Role coverage — which elements declare one, which are bare, which concepts are unused, and declarations that disagree |

## Output Directory

```
specs/
  analysis/
    props.yaml                    # from specs analyze props
    styling.byComponent.json      # from specs analyze styling
    styling.byToken.json          # from specs analyze styling
    styling.unused.json           # from specs analyze styling
    dependencies.graph.json       # from specs analyze dependencies
    dependencies.byComponent.json # from specs analyze dependencies
    keys.yaml                     # from specs analyze keys
  ds-button/
    api.yaml
    contract.ts
    styles.css
    styling.yaml                  # from specs analyze styling — per component
```

Most analyzers write only into `analysis/`. `styling` also writes a `styling.yaml`
into **each component's own folder**, holding that component's token-usage index;
the completion output names it so the file is not a surprise.

## See Also

- [`analyze`](/cli/commands/analyze/) — the command reference: arguments, options, exit codes
- [`react`](/cli/commands/react/) and [`webcomponents`](/cli/commands/webcomponents/) — the sibling commands that emit code artifacts
- [What gets emitted](/code/) — the files `specs react` and `specs webcomponents` write
