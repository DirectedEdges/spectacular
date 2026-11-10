---
title: "Guidelines"
description: "The guidelines.yaml file contract for what a component's user must observe — GuidelinesDocument"
---

`guidelines.yaml` records the rules whoever uses a component or a foundation must observe — never use a badge for a value that changes on screen, never style from a raw ramp step. Its audience is a consumer, not a builder; what a builder must implement is [Supplemental](/schema/documents/supplemental/)'s subject.

An entry carries an obligation level and no schema gap, which is the reverse of a supplemental entry. That is why the two are separate documents rather than one shape with everything optional.

**Rules only.** At a foundation's scope that means how tokens, themes and raw values are applied across the catalogue. What any one token is *for* belongs in [Tokens](/schema/documents/tokens/), because a description is not a rule: it binds nobody. The two lived in one document and were separated when thirty-six token descriptions were found sitting above eleven rules, which is the order nobody reads them in.

## Relationship to DSDS

An entry is a guideline item as the [Design System Documentation Specification](https://designsystemdocspec.org/specification) (DSDS) 0.23.1 defines one. `statement`, `level`, `checkedBy`, `checks`, `evidence`, `alternatives` and `refines` are its field names, used as it defines them.

The *document* is not a DSDS document. DSDS requires `kind` and `for` on every section and this carries neither, so an exporter wraps a concern's entries in a DSDS section rather than emitting the file as-is.

Two members depart from DSDS deliberately:

- **`may`** is RFC 2119's fifth level and absent from DSDS's four. A permission recorded as `should` asserts an obligation the system does not hold.
- **`instead`** carries a remedy no pointer can hold. An exporter appends it to `statement` rather than dropping it, so no consumer receives a prohibition without its fix.

## Scopes

As with the supplemental document, the same shape is written at three scopes, and entries across scopes are additive rather than overriding.

| Scope | Path |
|---|---|
| One component | `components/<component>/guidelines.yaml` |
| Every component | `components/guidelines.yaml` |
| One foundation | `foundations/<concern>/guidelines.yaml` |

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `meta` | `GuidelinesMeta` | No | Authorship and review status for the document |
| *concern key* | `GuidelineEntry[]` | No | One list of rules per concern — the same eleven concerns the supplemental document uses |

Nothing else. `useWhen` and `dontUseWhen` are [Tokens](/schema/documents/tokens/)'s, and the schema rejects them here.

### GuidelineEntry

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `statement` | `string` | Yes | The rule, as a sentence a reader can act on |
| `level` | [`ObligationLevel`](#obligationlevel) | Yes | How strongly it binds |
| `alternatives` | `GuidelineReference[]` | No | What to use instead, when the remedy is a thing this can point at |
| `instead` | `string` | No | What to do instead, when the remedy is a rule rather than a thing |
| `refines` | `GuidelineReference` | No | A broader guideline this one elaborates |
| `evidence` | `GuidelineReference[]` | No | Source material supporting the rule |
| `checkedBy` | `'automated' \| 'assisted' \| 'manual'` | No | How this is checked |
| `checks` | `GuidelineReference[]` | No | What does the checking. Required when `checkedBy` is `automated` |

A `GuidelineReference` carries either `to`, naming something inside the workspace, or `href`, naming something outside it — never both.

Prefer `alternatives` over `instead` whenever the remedy can be named. A pointer resolves and a validator can check it; a sentence cannot.

### ObligationLevel

RFC 2119 semantics.

| Value | Meaning | Often written instead as |
|---|---|---|
| `must` | An absolute requirement; a usage that disregards it is wrong | required, always |
| `should` | A strong recommendation; disregard it only with a considered reason | recommended, prefer |
| `should-not` | A strong recommendation against; do it only with a considered reason | avoid |
| `must-not` | An absolute prohibition; a usage that does it is wrong | never |
| `may` | A permission the system grants, and neither requires nor discourages | optional, could |

The right-hand column is why the five values are worth learning: the words an author reaches for naturally — *always*, *never*, *avoid* — are not five distinct strengths but five labels for these. Recording the level means a reader never has to infer strength from how emphatically a sentence was written.

## Example

A foundation's rules, which generalise over the whole catalogue rather than naming one token:

```yaml
# foundations/color/guidelines.yaml
meta:
  concern: color
  status: proposed
  updated: 2026-11-06
  sources:
    - analysis/foundations.yaml
styles:
  - statement: "Style any property from a `DE Palette/*` ramp step."
    level: must-not
    instead: "Style from the semantic token that aliases the ramp step."
  - statement: "Pair an `Alert/<family>/Background` with that same family's `Element` for every text and glyph on it."
    level: must
  - statement: "Use `Text/Primary Inverse`, `Icon/Primary inverse` and `Line/Primary inverse` together on a dark or saturated surface."
    level: may
```

And a component's, where a prohibition points at what to use instead:

```yaml
# components/badge/guidelines.yaml
meta:
  concern: badge
  status: ratified
slotComposition:
  - statement: "Use a badge for a value that changes while on screen."
    level: must-not
    alternatives: [{ to: "liveRegion" }]
accessibility:
  - statement: "Set accessibilityLabel on a badge whose slot holds no text child."
    level: must
    checkedBy: automated
    checks: [{ to: "react/src/components/Badge/a11y.test.tsx" }]
```

## See Also

- [Tokens](/schema/documents/tokens/) — what each token in a foundation is for, which this document does not carry
- [Supplemental](/schema/documents/supplemental/) — the requirements whoever builds a component must implement
- [Component](/schema/component/) — the spec these sit beside
- [Specification](/schema/specification/) — document kinds, and the rules a validator applies
