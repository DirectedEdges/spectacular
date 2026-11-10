---
name: specs-cli.guidelines.propose
description: Synthesize or revise one system foundations guidance file from the analysis reports and caches — specs/foundations/<concern>/guidelines.yaml, rules carrying an RFC 2119 obligation level under an optional meta header. Runs only when explicitly asked, never self-initiated inside an authoring round. Args: <concern>, e.g. color, typography, space, shape, layout, motion, elevation, brand.
---
<!--
  Canonical skill emitted by `specs skills install` — overwritten on every
  refresh; do not edit in place. Local customizations belong in your own
  separate skill.
-->

# Propose foundations guidance

**Prerequisites:** `specs-cli.primer`, `specs-cli.authoring.primer`. Run `specs analyze` first if `analysis/` is missing or stale.

**Invocation guard: this skill runs only when a person explicitly asks for it.** Inside a component round, wanted-but-absent guidance is a gap for the report's Suggestions, never something to synthesize mid-round.

Per-system rules are the second rules layer. The shipped `rules/*.yaml` beside the author primer argue from the **contract** — the schema and its ADRs, identical in every workspace. Foundations guidance argues from the **library** — this system's own tokens, styles, and conventions — so it lives in the authored corpus, one directory per concern: `specs/foundations/<concern>/guidelines.yaml`. Under `specs/`, the path is config-resolved with everything else and the files version with the catalogue.

**The scope split this skill never crosses:** guidance about *using one component* (fill rules, accessibility expectations, anti-patterns) belongs in that component's own `guidelines.yaml`, beside its spec. Foundations files carry only system-level guidance — cross-component conventions about how a concern's values are applied.

**A foundation's guidelines file carries rules, not a token registry.** A rule binds a reader: disregard it and the usage is wrong. What one token is *for* describes a thing and binds nobody, and the schema rejects `useWhen` / `dontUseWhen` here (ADR-118, DSPEC-63). Where per-token description belongs is not yet settled. If you find such tables in an existing file, leave them — they are content awaiting a home, and this skill neither extends nor relocates them. Say so in the ratifier notes.

## File format

Copy `templates/guidelines.yaml` from the component-author skill's templates. An optional `meta` header (concern, status, author, updated, sources), then one list of rules per concern key.

**At this scope the section keys are what `guidelines.schema.json` accepts**, not the component ones: the foundation concerns (`color`, `typography`, `layout`, `space`, `shape`, `elevation`, `motion`, `brand`) plus the cross-cutting keys the schema also allows (`behavior`, `accessibility`, `events`, and the rest it lists — the schema is the authority). A rule about applying colour goes under `color`, not `styles` — `styles` belongs to the component vocabulary and the schema rejects it here. A document mixing the two vocabularies is rejected.

Each rule is a DSDS 0.23.1 guideline item: a `statement` and a `level`.

| `level` | Weight | Often written as |
|---|---|---|
| `must` | hard requirement — violating it is a defect | required, always |
| `must-not` | hard prohibition — doing it is a defect | never |
| `should` | strong convention — deviation needs a stated reason | recommended, prefer |
| `should-not` | strong convention against — doing it needs a reason | avoid |
| `may` | a permission the system grants and neither requires nor discourages | optional, could |

The right-hand column is the translation step: the words you reach for naturally are labels for these five, not five more strengths. A caution — the old `warn` — is a `should-not` whose statement explains the hazard.

A prohibition carries its remedy in the same entry. Use `alternatives` when the remedy is a *thing* you can point at, and `instead` only when it is a rule:

```yaml
# foundations/color/guidelines.yaml — foundation concern keys
color:
  - statement: "Style any property from a `DE Palette/*` ramp step."
    level: must-not
    alternatives: [{ to: "DE Color/Alert/Error/Background" }]
elevation:
  - statement: "Assemble an elevation shadow inline from the four shadow tokens."
    level: must
```

A reference's `to` may name a token, a component, or a workspace file. Nothing resolves it today, so a wrong target is not caught — write it carefully.

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

1. **Read what exists.** If `specs/foundations/<concern>/guidelines.yaml` exists, this run is a revision: existing rules are the baseline, not under re-validation. A pre-ADR-118 file at `specs/foundations/<concern>.yaml` is also a revision — note the relocation in your report rather than performing it silently.
2. **Gather** the concern's evidence sources and compute what you need to decide — a rule you cannot support from the data does not go in.
3. **Propose as a diff.** New rules, changed rules (with what changes and why the data moved), and **removals** — rules the current catalog contradicts or no longer evidences. Check only new and changed rules for inconsistency with the existing set; never re-litigate untouched rules.
4. **Write the files.** A first proposal writes `specs/foundations/<concern>/guidelines.yaml` directly, `status: proposed`, plus the ratifier notes under `reports/`. A revision against a *ratified* file never overwrites it — write `guidelines.proposed.yaml` beside it and say so.
5. **Report** the locations and, for a revision, the add/change/remove table; lead with removals and changes, since additions are the easy part.

## Rules

- Statistics are not semantics: usage supports a rule, it does not decide one. A low-evidence judgment is a `may`, not a `should` with false confidence.
- Never fabricate vocabulary — every token, style, or prop cited must exist in the cache or report you read.
- A rule true in every workspace because the schema says so belongs in the shipped rules files, not here; a rule true only of this library belongs here, never there; a rule about using one component belongs in that component's own `guidelines.yaml`, never here.
- A statement that describes rather than binds is not a rule. "`Text/Primary` is the default body colour" describes; "style body text from `Text/Primary`" binds. Only the second belongs here.
