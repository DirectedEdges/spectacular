---
title: "Tokens"
description: "The foundations/<concern>/tokens.yaml contract for what each token is for — TokensDocument"
---

`tokens.yaml` records what each token in a foundation is for. `useWhen` says what to reach for it; `dontUseWhen` says which tokens are off-limits, why, and what replaces them.

It is a reference table, not a rulebook. A rule binds a reader — disregard it and the usage is wrong. A description constrains nobody: it says what a thing is for and leaves the decision alone. That difference is why this is its own document rather than a section of [Guidelines](/schema/documents/guidelines/), whose subject at a foundation's scope is how tokens, themes and raw values are *applied* across the catalogue.

The separation came from reading a real file: thirty-six token descriptions sat above eleven rules, so the rules were the part nobody reached.

## Scope

Foundation only. A token belongs to a foundation rather than to any component, so there is no component-level or catalogue-level form.

| Scope | Path |
|---|---|
| One foundation | `foundations/<concern>/tokens.yaml` |

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `meta` | `TokensMeta` | No | Authorship and review status for the document |
| `useWhen` | `TokenSubject[]` | No | What each token is for |
| `dontUseWhen` | `TokenSubject[]` | No | Which tokens are off-limits, why, and what replaces them |

Both tables are flat lists, not keyed by subject kind — this document is tokens and nothing else.

### TokenSubject

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `$token` | `string` | Yes | The token, as a `<collection>/<group>/<name>` path |
| `$description` | `string` | Yes | What it is for, or why it is off-limits |
| `alternatives` | `TokenPointer[]` | No | What to reach for instead. Meaningful under `dontUseWhen` |
| `refs` | `TokenRef[]` | No | Related references, including `same-as` when this restates a token at another scope |

**An absent `alternatives` says something true:** nothing replaces this token. A raw ramp step has a semantic token that aliases it; Figma panel chrome has no product equivalent at all. Without the field that distinction is invisible.

### Token identity

A token is written as the library spells it — spaces and capitals included, the same form `analysis/foundations.yaml` and every spec's `$token` carry:

```yaml
$token: "DE Color/Action/Hover background"
```

A DSDS-legal identifier is derived at export, never authored here, because an identifier there may carry capitals and slashes but not spaces. The original path is preserved as `name` alongside it, since the derived form folds case and cannot be reversed.

## Example

```yaml
# foundations/color/tokens.yaml
meta:
  concern: color
  status: proposed
  author: Nathan Curtis
  updated: 2026-11-06
  sources:
    - analysis/foundations.yaml
    - analysis/styling.byToken.yaml

useWhen:
  - { $token: "DE Color/Text/Primary", $description: "default body and label text on any light surface" }
  - { $token: "DE Color/Text/Secondary", $description: "supporting text subordinate to adjacent primary text" }
  - { $token: "DE Color/Surface/Primary", $description: "the default page and card ground" }

dontUseWhen:
  - $token: "DE Palette/*"
    $description: "a raw ramp step — every semantic colour aliases one, so styling from a ramp bypasses the layer that carries intent and theming"
    alternatives: [{ to: "DE Color/Alert/Error/Background" }]
  - $token: "DE Color/Utility/Figma/*"
    $description: "Figma plugin and panel chrome, not product surfaces"
```

## See Also

- [Guidelines](/schema/documents/guidelines/) — the rules about applying a foundation, which this document does not carry
- [Supplemental](/schema/documents/supplemental/) — the requirements whoever builds a component must implement
- [`tokens` setting](/settings/tokens/) — the profile a DSDS export derives a token identifier from
- [Specification](/schema/specification/) — document kinds, and the rules a validator applies
