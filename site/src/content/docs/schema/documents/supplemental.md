---
title: "Supplemental"
description: "The supplemental.yaml file contract for what a component needs beyond the spec — SupplementalDocument"
---

`supplemental.yaml` records what a component needs that the spec cannot carry — a press-scale transform, an `IntersectionObserver`, a conditional `aria-hidden`. Its audience is whoever builds the component.

Every entry names the schema path that cannot carry it. That is what keeps the file small: anything the schema *can* carry belongs in the spec, and an entry that cannot name its gap is an entry in the wrong place. What a component's *user* must observe is [Guidelines](/schema/documents/guidelines/)'s subject, and what each token in a foundation is for is [Tokens](/schema/documents/tokens/)'s.

All three are authored by hand. No run writes any of them, so none carries `metadata.source`; they carry `meta` instead, which records authorship and review status rather than Figma provenance. They are siblings with no parent kind above them, so each schema is self-contained and repeats the definitions the others declare.

## Scopes

The same shape is written at three scopes. An entry at a broader scope and one at a narrower scope both apply — neither overrides the other, because an entry is a statement about a subject rather than a value at a key.

| Scope | Path |
|---|---|
| One component | `components/<component>/supplemental.yaml` |
| Every component | `components/supplemental.yaml` |
| One foundation | `foundations/<concern>/supplemental.yaml` |

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `meta` | `SupplementalMeta` | No | Authorship and review status for the document |
| *concern key* | `SupplementalEntry[]` | No | One list per concern — `anatomy`, `props`, `styles`, `slotComposition`, `events`, `accessibility`, `behavior`, `motion`, `layout`, `overrides`, `naming` |

A document carrying only a `meta` block is valid, and so is an empty one.

### SupplementalEntry

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `intent` | `string` | Yes | A testable statement of what the component must do, written to transfer to a test criterion. No rationale prose |
| `schemaGap` | `SchemaGap` | Yes | The surface that would carry this, and why it does not |
| `platforms` | [`Platform[]`](#platform) | No | The platforms this applies to. Absent means every platform |
| `checkedBy` | `'automated' \| 'assisted' \| 'manual'` | No | How this is checked |
| `checks` | `Pointer[]` | No | What does the checking. Required when `checkedBy` is `automated` |

### SchemaGap

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | `string` | Yes | A JSON Schema pointer, or any workspace-relative target |
| `need` | `string` | Yes | What that target cannot express, and why |

`path` admits more than a schema pointer because a gap is sometimes in the library's own data. A motion token that does not exist is a gap in `analysis/foundations.yaml`, not in `styles.schema.json`.

### Platform

Each value names an emission target. `web` is a group covering both web targets, and naming it beside either leaf states one thing twice, so the schema rejects it.

| Value | Target |
|---|---|
| `react` | React, emitted by `react-from-specs` |
| `webcomponents` | Lit web components, emitted by `webcomponents-from-specs` |
| `web` | Both web targets; expands to `react` and `webcomponents` |
| `ios` | iOS, as Swift with SwiftUI |
| `android` | Android, as Kotlin with Jetpack Compose |

## Example

```yaml
meta:
  concern: button
  status: proposed
  author: Nathan Curtis
  updated: 2026-11-09
  sources:
    - analysis/foundations.yaml
motion:
  - intent: "The hover background fades from transparent to opaque over 160ms, and back out over the same duration."
    schemaGap:
      path: styles.schema.json#/definitions/Styles
      need: "the property set carries no transition, duration or easing key, so no variant delta can state how a style change is traversed"
    platforms: [web]
    checkedBy: manual
  - intent: "Durations and easings resolve from library motion tokens rather than literals."
    schemaGap:
      path: analysis/foundations.yaml
      need: "the library publishes colour, dimension, string and typography tokens only; no duration or easing token exists to reference"
```

## See Also

- [Guidelines](/schema/documents/guidelines/) — the rules whoever uses a component or foundation must observe
- [Tokens](/schema/documents/tokens/) — what each token in a foundation is for
- [Component](/schema/component/) — the spec these sit beside
- [Specification](/schema/specification/) — document kinds, and the rules a validator applies
