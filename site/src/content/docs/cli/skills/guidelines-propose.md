---
title: "guidelines.propose"
description: "Synthesize one foundations guidance file from your library's own analysis data"
---

A skill that proposes `specs/foundations/<concern>/guidelines.yaml` for one concern — color, typography, space, shape, layout, motion, elevation or brand — as rules carrying an obligation level, each supported by the library's own analysis reports.

Installed by [`specs skills install`](/cli/commands/skills/) as `.claude/skills/specs-cli.guidelines.propose/`, then invoked in Claude Code with the concern as its argument.

## Prerequisites

- [`specs-cli.primer`](/cli/commands/skills/) and [`specs-cli.authoring.primer`](/cli/skills/authoring-primer/).
- Current [`analysis/`](/cli/analyze/) reports — run [`specs analyze`](/cli/commands/analyze/) first if they are missing or stale.

## Rationale

Rules come in two layers, split by where their authority comes from. The shipped `rules/*.yaml` files argue from the contract — the schema and its ADRs, identical in every workspace. Foundations guidance argues from *this* library: its tokens, its styles, its conventions. So it lives in the authored corpus under `specs/`, config-resolved with everything else and versioned with the catalogue.

## Outline

- Reads an existing file for the concern first, which makes the run a revision rather than a first proposal.
- Gathers only that concern's evidence sources — for `color`, `analysis/foundations/color.yaml`, `analysis/styling.byToken.yaml` and the primitives map.
- Proposes as a diff: new rules, changed rules with what moved in the data, and removals the catalogue no longer evidences.
- Writes `guidelines.yaml` at `status: proposed`, plus dated ratifier notes under `reports/`.
- Never overwrites a ratified file — a revision lands as `guidelines.proposed.yaml` beside it.

## Scope it never crosses

Guidance about using *one component* belongs in that component's own [`guidelines.yaml`](/schema/documents/guidelines/), beside its spec. A foundations file carries only system-level guidance: cross-component conventions about how a concern's values are applied.

A foundations file is also not a token registry. A rule binds a reader — disregard it and the usage is wrong. What one token is *for* describes a thing and binds nobody, and the schema rejects `useWhen` and `dontUseWhen` at this scope.

## Invocation guard

It runs only when a person asks for it. Inside an authoring round, absent guidance is a gap for the report's Suggestions, never something to synthesize mid-round.

## Related

- [`guidelines` document](/schema/documents/guidelines/) — the contract it writes against
- [`authoring.primer`](/cli/skills/authoring-primer/) — the first rules layer
- [`analyze`](/cli/analyze/) — the reports it reads
