---
name: specs-cli.guidelines.propose
description: Synthesize or revise one system foundations guidance file from the analysis reports and caches — specs/foundations/<concern>.yaml, modality-keyed rules with a structured meta header. Runs only when explicitly asked, never self-initiated inside an authoring round. Args: <concern>, e.g. color, typography, space, shape, layout, props, motion, elevation.
---
<!--
  Canonical skill emitted by `specs skills install` — overwritten on every
  refresh; do not edit in place. Local customizations belong in your own
  separate skill.
-->

# Propose foundations guidance

**Prerequisites:** `specs-cli.primer`, `specs-cli.authoring.primer`. Run `specs analyze` first if `analysis/` is missing or stale.

**Invocation guard: this skill runs only when a person explicitly asks for it.** Inside a component round, wanted-but-absent guidance is a gap for the report's Suggestions, never something to synthesize mid-round.

Per-system rules are the second rules layer. The shipped `rules/*.yaml` beside the author primer argue from the **contract** — the schema and its ADRs, identical in every workspace. Foundations guidance argues from the **library** — this system's own tokens, styles, and conventions — so it lives in the authored corpus, one file per concern: `specs/foundations/<concern>.yaml`. Under `specs/`, the path is config-resolved with everything else and the files version with the catalogue.

**The scope split this skill never crosses:** guidance about *using one component* (fill rules, accessibility expectations, anti-patterns) belongs in that component's `supplemental.yaml` `guidelines:` section, beside its spec. Foundations files carry only system-level guidance — token usage maps, cross-component conventions. There are no per-component foundations files.

## File format

Copy `templates/guidelinesRules.yaml` beside this skill. Every file opens with a structured `meta` header (concern, status, author, updated, sources), then up to three node kinds:

- **`useWhen`** — positive usage mappings: the thing, and when to use it, grouped by referent kind (`tokens` as `{$token, $description}` entries, `name`/`type` as `{$prop, $description}` entries, or another kind the concern calls for). `dontUseWhen` is the same shape for explicit negative cases.
- **`guidelines`** — a list of modality-keyed items:

| Modality | Weight |
|---|---|
| `must` / `never` | hard — violating it is a defect |
| `should` / `avoid` | strong convention — deviation needs a stated reason |
| `could` / `warn` | option or caution — judgment applies |

An item may pair a positive with its counter-balancing negative — the do/don't form with calibrated weights:

```yaml
guidelines:
  - never: "prefix `is`, `has`, `show`, `can`, or another verb before a state name (`isSelected`)"
    should: "name boolean states bare (`selected`, `disabled`)"
```

Statement style: one line; terms, tokens, and props in backticks; a very brief example in parentheses at the end. **No computed data** — never counts, totals, or percentages; they go stale the day the library changes. Compute numbers to *decide* a rule, then publish only the rule.

## Synthesis notes for the ratifier

Follow the primer's reports convention: `reports/<YYYY-MM-DD>.guidelines.<concern>.md`. Brief — a status line (`**Status: proposed** · author · date · sources`), one paragraph of what the synthesis found as statements, and a **For the ratifier** list naming the judgment calls and ambiguities that need a human decision. The specific-over-general question is settled: the dated reports convention wins; nothing co-locates beside the foundations file.

## Evidence sources by concern

| Concern | Read |
|---|---|
| `color` | `analysis/foundations.yaml`, `analysis/styling.byToken.yaml`, `config/conventions/<platform>.primitives.yaml` |
| `typography` | `foundations.yaml` typography tokens, `data/cache/styles.yaml`, the primitives map |
| `space`, `shape` | `foundations.yaml` dimension tokens, `analysis/styling.byComponent.yaml` |
| `layout` | `styling.byComponent.yaml` flow/positioning usage (the concern covers layout *styling*; `layout` names the AST inside a spec) |
| `props` | `analysis/props.yaml` |
| `motion`, `elevation` | `foundations.yaml` and `data/cache/styles.yaml` effects; absence of tokens is itself a finding for the ratifier |

A concern not in the table follows the same pattern: name the reports that evidence it, read only those.

## Procedure

1. **Read what exists.** If `specs/foundations/<concern>.yaml` exists, this run is a revision: existing rules are the baseline, not under re-validation.
2. **Gather** the concern's evidence sources and compute what you need to decide — a rule you cannot support from the data does not go in.
3. **Propose as a diff.** New rules, changed rules (with what changes and why the data moved), and **removals** — rules the current catalog contradicts or no longer evidences. Check only new and changed rules for inconsistency with the existing set; never re-litigate untouched rules.
4. **Write the files.** A first proposal writes `specs/foundations/<concern>.yaml` directly, `status: proposed`, plus the ratifier notes under `reports/`. A revision against a *ratified* file never overwrites it — write `<concern>.proposed.yaml` beside it and say so.
5. **Report** the locations and, for a revision, the add/change/remove table; lead with removals and changes, since additions are the easy part.

## Rules

- Statistics are not semantics: usage supports a rule, it does not decide one. A low-evidence judgment is a `could`/`warn`, not a `should` with false confidence.
- Never fabricate vocabulary — every token, style, or prop cited must exist in the cache or report you read.
- A rule true in every workspace because the schema says so belongs in the shipped rules files, not here; a rule true only of this library belongs here, never there; a rule about using one component belongs in its `supplemental.yaml`, never here.
