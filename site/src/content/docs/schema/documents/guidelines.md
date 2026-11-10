---
title: "Guidelines"
description: "The guidelines.yaml file contract for what a component's user must observe — GuidelinesDocument"
---

`guidelines.yaml` records what whoever uses a component must observe when arranging it — never use a badge for a value that changes on screen, keep its label short enough to read at a glance. Its audience is a consumer, not a builder; what a builder must implement is [Supplemental](/schema/documents/supplemental/)'s subject.

An entry carries an obligation level and no schema gap, which is the reverse of a supplemental entry. That is why the two are separate documents rather than one shape with everything optional.

## Relationship to DSDS

An entry is a guideline item as the [Design System Documentation Specification](https://designsystemdocspec.org/specification) (DSDS) 0.23.1 defines one. `statement`, `level`, `checkedBy`, `checks`, `evidence`, `alternatives` and `refines` are its field names, used as it defines them.

The *document* is not a DSDS document. DSDS requires `kind` and `for` on every section and this carries neither, so an exporter wraps a concern's entries in a DSDS section rather than emitting the file as-is.

Two members depart from DSDS deliberately:

- **`may`** is RFC 2119's fifth level and absent from DSDS's four. A permission recorded as `should` asserts an obligation the system does not hold.
- **`instead`** carries a remedy no pointer can hold. An exporter appends it to `statement` rather than dropping it, so no consumer receives a prohibition without its fix.

## Scopes

As with the supplemental sidecar, the same shape is written at three scopes, and entries across scopes are additive rather than overriding.

| Scope | Path |
|---|---|
| One component | `components/<component>/guidelines.yaml` |
| Every component | `components/guidelines.yaml` |
| One foundation | `foundations/<concern>/guidelines.yaml` |

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `meta` | `SidecarMeta` | No | Authorship and review status for the document |
| `useWhen` | `SelectionGuidance` | No | What each subject in a set is for |
| `dontUseWhen` | `SelectionGuidance` | No | Which subjects are off-limits, why, and what replaces them |
| *concern key* | `GuidelineEntry[]` | No | One list of rules per concern — the same eleven concerns the supplemental sidecar uses |

### GuidelineEntry

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `statement` | `string` | Yes | The rule, as a sentence a reader can act on |
| `level` | [`ObligationLevel`](#obligationlevel) | Yes | How strongly it binds |
| `alternatives` | `Pointer[]` | No | What to use instead, when the remedy is a thing this can point at |
| `instead` | `string` | No | What to do instead, when the remedy is a rule rather than a thing |
| `refines` | `Pointer` | No | A broader guideline this one elaborates |
| `evidence` | `Pointer[]` | No | Source material supporting the rule |
| `checkedBy` | `'automated' \| 'assisted' \| 'manual'` | No | How this is checked |
| `checks` | `Pointer[]` | No | What does the checking. Required when `checkedBy` is `automated` |

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

### SelectionGuidance

Subjects grouped by what kind of thing they are: `tokens`, `props`, `variants`, `slotFills`. Thirty tokens are a table a reader scans, not thirty rules a reader works through, which is why selection guidance is its own shape.

Each subject carries exactly one of `$token` or `$name`, plus a required `$description`. Under `dontUseWhen`, an optional `alternatives` names the replacement — and its absence says something true: nothing replaces this subject.

A token is identified by the path the rest of the system spells it with, spaces and capitals included. A DSDS-legal identifier is derived at export, never authored here.

## Example

```yaml
meta:
  concern: color
  status: proposed
  updated: 2026-11-06
  sources:
    - analysis/foundations.yaml
useWhen:
  tokens:
    - { $token: "DE Color/Text/Primary", $description: "default body and label text on any light surface" }
dontUseWhen:
  tokens:
    - $token: "DE Palette/*"
      $description: "a raw ramp step — styling from a ramp bypasses the layer that carries intent and theming"
      alternatives: [{ to: "DE Color/Alert/Error/Background" }]
    - $token: "DE Color/Utility/Figma/*"
      $description: "Figma plugin and panel chrome, not product surfaces"
styles:
  - statement: "Style any property from a `DE Palette/*` ramp step."
    level: must-not
    instead: "Style from the semantic token that aliases the ramp step."
  - statement: "Use `Text/Primary Inverse`, `Icon/Primary inverse` and `Line/Primary inverse` together on a dark or saturated surface."
    level: may
```

## See Also

- [Supplemental](/schema/documents/supplemental/) — the other sidecar, for whoever builds a component
- [Component](/schema/component/) — the spec a sidecar sits beside
- [Specification](/schema/specification/) — document kinds, and the rules a validator applies
